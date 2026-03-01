import { useState, useEffect, useRef } from 'react';
import type { AttachmentInput, ChatSession, Message } from '../domain/models';
import { ChatService } from '../services/chatService';

interface UseChatOptions {
    onSessionLinked?: (sessionId: string) => void;
    onHistoryInvalidate?: () => void;
}

const MAX_MESSAGE_RETRIES = 5;

export function useChat(
    sessionId: string | null,
    resetVersion = 0,
    options: UseChatOptions = {},
) {
    const [session, setSession] = useState<ChatSession | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [typing, setTyping] = useState(false);
    const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
    const [awaitingStreamStart, setAwaitingStreamStart] = useState(false);
    const [retryCounts, setRetryCounts] = useState<Record<string, number>>({});
    const [responseTimes, setResponseTimes] = useState<Record<string, number>>({});
    const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
    const sessionRef = useRef<ChatSession | null>(null);
    const messagesRef = useRef<Message[]>([]);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        let isCancelled = false;

        async function loadSession() {
            if (!sessionId) {
                setSession(null);
                setMessages([]);
                return;
            }

            if (
                sessionRef.current?.id === sessionId &&
                messagesRef.current.length > 0
            ) {
                return;
            }

            setLoading(true);

            try {
                const data = await ChatService.getSession(sessionId);
                if (isCancelled) {
                    return;
                }
                if (data) {
                    setSession(data);
                    setMessages(data.messages);
                } else {
                    setSession(null);
                    setMessages([]);
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        }
        void loadSession();

        return () => {
            isCancelled = true;
        };
    }, [sessionId, resetVersion]);

    useEffect(() => {
        setRetryCounts({});
        setResponseTimes({});
        setRetryingMessageId(null);
        setStreamingAssistantId(null);
        setAwaitingStreamStart(false);
    }, [sessionId, resetVersion]);

    useEffect(() => {
        setSession((previous) => {
            if (!previous) {
                return previous;
            }
            return {
                ...previous,
                messages,
            };
        });
    }, [messages]);

    const setMessagesAndSync = (
        updater: Message[] | ((previous: Message[]) => Message[]),
    ) => {
        setMessages((previous) => {
            const next = typeof updater === 'function'
                ? (updater as (previous: Message[]) => Message[])(previous)
                : updater;
            messagesRef.current = next;
            return next;
        });
    };

    const sendMessage = async (content: string, attachments: AttachmentInput[] = []) => {
        const normalizedContent = content.trim();
        if (!normalizedContent || typing) {
            return;
        }

        const optimisticTimestamp = new Date().toISOString();

        const optimisticUserMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: normalizedContent,
            createdAt: optimisticTimestamp,
            attachments: attachments.map((attachment, index) => ({
                ...attachment,
                id: `optimistic-attachment-${attachment.fileId}-${index}`,
            })),
        };

        const optimisticAssistantMessage: Message = {
            id: `assistant-stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            createdAt: optimisticTimestamp,
            attachments: [],
        };

        setMessagesAndSync((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);
        setTyping(true);
        setStreamingAssistantId(optimisticAssistantMessage.id);
        setAwaitingStreamStart(true);
        const responseStartedAtMs = Date.now();

        try {
            const activeSessionId = sessionRef.current?.id ?? sessionId;
            const response = await ChatService.sendMessageStream(activeSessionId, normalizedContent, {
                onAssistantDelta: (_delta, fullText) => {
                    setAwaitingStreamStart(false);
                    setMessagesAndSync((prev) =>
                        prev.map((message) =>
                            message.id === optimisticAssistantMessage.id
                                ? { ...message, content: fullText }
                                : message,
                        ),
                    );
                },
            }, attachments);

            setMessagesAndSync((prev) => {
                const next = prev.map((message) =>
                    message.id === optimisticAssistantMessage.id
                        ? response.assistantMessage
                        : message,
                );
                return next;
            });
            setStreamingAssistantId(response.assistantMessage.id);
            setResponseTimes((previous) => ({
                ...previous,
                [response.assistantMessage.id]: Math.max(0, Date.now() - responseStartedAtMs),
            }));

            const nextSession: ChatSession = {
                id: response.sessionId,
                title: response.sessionTitle,
                titleLocked: response.titleLocked,
                contextSummary: response.contextSummary,
                updatedAt: response.assistantMessage.createdAt,
                messages: messagesRef.current,
            };

            sessionRef.current = nextSession;
            setSession(nextSession);

            if (response.sessionId !== activeSessionId) {
                options.onSessionLinked?.(response.sessionId);
            }
            options.onHistoryInvalidate?.();
        } catch (error) {
            console.error('Failed to send chat message:', error);
            setMessagesAndSync((prev) =>
                prev.filter(
                    (message) =>
                        message.id !== optimisticUserMessage.id &&
                        message.id !== optimisticAssistantMessage.id,
                ),
            );
        } finally {
            setTyping(false);
            setStreamingAssistantId(null);
            setAwaitingStreamStart(false);
        }
    };

    const retryLastAssistantMessage = async (assistantMessageId: string) => {
        const normalizedAssistantMessageId = assistantMessageId.trim();
        if (!normalizedAssistantMessageId || typing) {
            return;
        }

        const snapshot = messagesRef.current;
        const latestAssistantMessage = [...snapshot].reverse().find((message) => message.role === 'assistant');
        if (!latestAssistantMessage || latestAssistantMessage.id !== normalizedAssistantMessageId) {
            return;
        }

        const retriesUsed = retryCounts[normalizedAssistantMessageId] ?? 0;
        if (retriesUsed >= MAX_MESSAGE_RETRIES) {
            return;
        }

        const currentAssistantContent = latestAssistantMessage.content;
        setTyping(true);
        setRetryingMessageId(normalizedAssistantMessageId);
        setStreamingAssistantId(normalizedAssistantMessageId);
        setAwaitingStreamStart(true);
        const responseStartedAtMs = Date.now();
        setMessagesAndSync((previous) =>
            previous.map((message) =>
                message.id === normalizedAssistantMessageId
                    ? { ...message, content: '' }
                    : message,
            ),
        );

        try {
            const activeSessionId = sessionRef.current?.id ?? sessionId;
            if (!activeSessionId) {
                throw new Error('No active session to retry.');
            }

            const response = await ChatService.retryLastAssistantMessageStream(
                activeSessionId,
                normalizedAssistantMessageId,
                {
                    onAssistantDelta: (_delta, fullText) => {
                        setAwaitingStreamStart(false);
                        setMessagesAndSync((previous) =>
                            previous.map((message) =>
                                message.id === normalizedAssistantMessageId
                                    ? { ...message, content: fullText }
                                    : message,
                            ),
                        );
                    },
                },
            );

            setMessagesAndSync((previous) =>
                previous.map((message) =>
                    message.id === normalizedAssistantMessageId
                        ? response.assistantMessage
                        : message,
                ),
            );
            setRetryCounts((previous) => ({
                ...previous,
                [normalizedAssistantMessageId]: retriesUsed + 1,
            }));
            setResponseTimes((previous) => ({
                ...previous,
                [normalizedAssistantMessageId]: Math.max(0, Date.now() - responseStartedAtMs),
            }));

            const nextSession: ChatSession = {
                id: response.sessionId,
                title: response.sessionTitle,
                titleLocked: response.titleLocked,
                contextSummary: response.contextSummary,
                updatedAt: response.assistantMessage.createdAt,
                messages: messagesRef.current,
            };

            sessionRef.current = nextSession;
            setSession(nextSession);
            options.onHistoryInvalidate?.();
        } catch (error) {
            console.error('Failed to retry last assistant message:', error);
            setMessagesAndSync((previous) =>
                previous.map((message) =>
                    message.id === normalizedAssistantMessageId
                        ? { ...message, content: currentAssistantContent }
                        : message,
                ),
            );
        } finally {
            setTyping(false);
            setRetryingMessageId(null);
            setStreamingAssistantId(null);
            setAwaitingStreamStart(false);
        }
    };

    return {
        session,
        messages,
        loading,
        typing,
        sendMessage,
        retryLastAssistantMessage,
        retryCounts,
        responseTimes,
        retryingMessageId,
        streamingAssistantId,
        awaitingStreamStart,
        maxMessageRetries: MAX_MESSAGE_RETRIES,
    };
}
