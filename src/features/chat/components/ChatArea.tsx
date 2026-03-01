import React, { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import { Button } from '../../../shared/components/Button';
import { PanelLeftOpen } from 'lucide-react';

interface ChatAreaProps {
    sessionId: string | null;
    resetVersion: number;
    onSessionLinked: (sessionId: string) => void;
    onHistoryInvalidate: () => void;
    onToggleSidebar: () => void;
    isSidebarOpen: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
    sessionId,
    resetVersion,
    onSessionLinked,
    onHistoryInvalidate,
    onToggleSidebar,
    isSidebarOpen,
}) => {
    const {
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
        maxMessageRetries,
    } = useChat(sessionId, resetVersion, {
            onSessionLinked,
            onHistoryInvalidate,
        });
    const bottomRef = useRef<HTMLDivElement>(null);
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
    const latestAssistantMessageId = latestAssistantMessage?.id ?? null;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typing, streamingAssistantId, awaitingStreamStart]);

    return (
        <div className="flex h-full flex-1 flex-col bg-white dark:bg-black relative overflow-hidden">
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center px-4 w-full relative z-10 gap-2">
                <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
                    <PanelLeftOpen className="h-5 w-5" />
                </Button>
                <div className="flex-1 truncate font-semibold text-lg text-black/80 dark:text-white/80">
                    {session ? session.title : (
                        <span className={isSidebarOpen ? "lg:hidden" : ""}>Alphine</span>
                    )}
                </div>
            </header>

            {/* Message List Area */}
            <div className="flex-1 overflow-y-auto w-full">
                {loading ? (
                    <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-6 p-4 md:p-6 lg:px-8">
                        {[0, 1, 2].map((item) => (
                            <div key={item} className="flex w-full items-start gap-4">
                                <div className="shimmer-surface h-9 w-9 shrink-0 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <div className="shimmer-surface h-3 w-24 rounded-md" />
                                    <div className="shimmer-surface h-3 w-full rounded-md" />
                                    <div
                                        className="shimmer-surface h-3 rounded-md"
                                        style={{ width: `${84 - item * 12}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center p-8 text-center gap-4">
                        <h2 className="text-4xl font-medium tracking-tight text-black dark:text-white">
                            How can I help you today?
                        </h2>
                    </div>
                ) : (
                    <div className="flex flex-col pb-4 w-full">
                        {messages.map((msg) => (
                            <MessageItem
                                key={msg.id}
                                message={msg}
                                canRetry={
                                    msg.role === 'assistant' &&
                                    msg.id === latestAssistantMessageId &&
                                    !typing &&
                                    msg.content.trim().length > 0
                                }
                                retryCount={retryCounts[msg.id] ?? 0}
                                maxRetryCount={maxMessageRetries}
                                responseTimeMs={responseTimes[msg.id]}
                                isRetrying={retryingMessageId === msg.id}
                                isAwaitingStreamStart={
                                    msg.role === 'assistant' &&
                                    streamingAssistantId === msg.id &&
                                    awaitingStreamStart
                                }
                                onRetry={(messageId) => { void retryLastAssistantMessage(messageId); }}
                            />
                        ))}
                        <div ref={bottomRef} className="h-px w-full shrink-0" />
                    </div>
                )}
            </div>

            {/* Sticky Composer */}
            <div className="shrink-0 w-full relative z-10">
                <Composer onSend={sendMessage} disabled={loading || typing} />
            </div>
        </div >
    );
};
