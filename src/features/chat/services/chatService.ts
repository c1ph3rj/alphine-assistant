import { ID, Query, type Models } from 'appwrite';
import { appEnv } from '@/lib/env';
import { appwriteAccount, appwriteTablesDB } from '@/lib/appwrite';
import { getSyncedAiSettings } from '@/features/settings/services/userSettingsStorage';
import type {
    AttachmentInput,
    ChatHistoryItem,
    ChatSession,
    Message,
    MessageAttachment,
    Role,
    SendMessageResult,
} from '../domain/models';
import {
    generateProviderReply,
    generateProviderReplyStream,
    type ModelContextPayload,
} from './aiProviderService';
import {
    groupAttachmentsByMessageId,
    listSessionAttachments,
    persistMessageAttachments,
    resolveProviderShareAttachments,
} from './chatAttachmentService';

const NEW_CHAT_TITLE = 'New Chat';
const TITLE_EARLY_WORD_THRESHOLD = 5;
const TITLE_DELAYED_MIN_MESSAGES = 4;
const TITLE_MAX_WORDS = 10;
const TITLE_MAX_CHARS = 56;
const RECENT_CONTEXT_LIMIT = 8;
const MESSAGE_FETCH_LIMIT = 500;
const HISTORY_LIMIT = 100;
const SUMMARY_MAX_CHARS = 655;
const SNIPPET_MAX_CHARS = 180;

const CHAT_DATABASE_ID = appEnv.appwriteChatDatabaseId;
const CHAT_SESSIONS_TABLE_ID = appEnv.appwriteChatSessionsTableId;
const CHAT_MESSAGES_TABLE_ID = appEnv.appwriteChatMessagesTableId;

interface ChatSessionRow extends Models.Row {
    title: string;
    titleLocked: boolean;
    contextSummary: string;
    summaryUpdatedAt: string | null;
    lastSnippet: string;
    lastMessageAt: string;
    userId: string;
}

interface ChatMessageRow extends Models.Row {
    sessionId: string;
    userId: string;
    role: Role;
    content: string;
    createdAt: string;
}

export interface SendMessageStreamOptions {
    onAssistantDelta?: (delta: string, fullText: string) => void;
    signal?: AbortSignal;
}

type TitleDecision =
    | { shouldFinalize: false }
    | {
        shouldFinalize: true;
        mode: 'early' | 'delayed';
        candidateText: string;
    };

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function countWords(value: string): number {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
        return 0;
    }
    return normalized.split(' ').length;
}

function clampTail(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
        return value;
    }
    return value.slice(value.length - maxChars);
}

function clampHead(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
        return value;
    }
    return value.slice(0, maxChars).trimEnd();
}

function buildSnippet(content: string): string {
    const normalized = normalizeWhitespace(content);
    return clampHead(normalized, SNIPPET_MAX_CHARS);
}

function buildContextSummary(previousSummary: string, messages: Message[]): string {
    const normalizedPrevious = normalizeWhitespace(previousSummary);
    const recent = messages.slice(-RECENT_CONTEXT_LIMIT).map((message) => {
        const marker = message.role === 'user' ? 'U' : 'A';
        return `${marker}: ${clampHead(normalizeWhitespace(message.content), 180)}`;
    });
    const recentSummary = recent.join(' | ');
    const combined = normalizedPrevious
        ? `${normalizedPrevious} || ${recentSummary}`
        : recentSummary;
    return clampTail(combined, SUMMARY_MAX_CHARS);
}

function buildModelContextPayload(
    summary: string,
    recent: Message[],
    latestUserMessage: string,
    latestUserAttachments: AttachmentInput[] = [],
): ModelContextPayload {
    return {
        summary: normalizeWhitespace(summary),
        recent: recent.slice(-RECENT_CONTEXT_LIMIT),
        latestUserMessage: normalizeWhitespace(latestUserMessage),
        latestUserAttachments,
    };
}

function generateAssistantReply(payload: ModelContextPayload): string {
    const latest = normalizeWhitespace(payload.latestUserMessage).toLowerCase();

    if (
        latest.includes('your name') ||
        latest.includes('who are you') ||
        latest === 'hi' ||
        latest === 'hello'
    ) {
        return "I'm Alphine. I hit a provider issue for this message, but I'm here. Please retry once and I should respond normally.";
    }

    return 'I hit a temporary provider issue while generating this reply. Please check your model/API key in Settings and try again.';
}

export function buildTitleFromUserText(candidate: string): string {
    const normalized = normalizeWhitespace(candidate);
    if (!normalized) {
        return '';
    }

    const trimmedNoise = normalized
        .replace(/^[\p{P}\p{S}\s]+/gu, '')
        .replace(/[\p{P}\p{S}\s]+$/gu, '')
        .trim();

    if (!trimmedNoise) {
        return '';
    }

    const words = trimmedNoise.split(' ');
    const head = words.slice(0, TITLE_MAX_WORDS).join(' ');
    return clampHead(head, TITLE_MAX_CHARS);
}

export function shouldFinalizeTitle(params: {
    titleLocked: boolean;
    messages: Message[];
}): TitleDecision {
    if (params.titleLocked) {
        return { shouldFinalize: false };
    }

    const firstUserMessage = params.messages.find((message) => message.role === 'user');
    if (!firstUserMessage) {
        return { shouldFinalize: false };
    }

    const firstUserWordCount = countWords(firstUserMessage.content);
    if (firstUserWordCount > TITLE_EARLY_WORD_THRESHOLD) {
        return {
            shouldFinalize: true,
            mode: 'early',
            candidateText: firstUserMessage.content,
        };
    }

    if (params.messages.length < TITLE_DELAYED_MIN_MESSAGES) {
        return { shouldFinalize: false };
    }

    const delayedCandidate = params.messages
        .slice(0, TITLE_DELAYED_MIN_MESSAGES)
        .filter((message) => message.role === 'user')
        .map((message) => normalizeWhitespace(message.content))
        .join(' ');

    return {
        shouldFinalize: true,
        mode: 'delayed',
        candidateText: delayedCandidate,
    };
}

function mapMessageRowToMessage(row: ChatMessageRow): Message {
    return {
        id: row.$id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt ?? row.$createdAt,
        attachments: [],
    };
}

function mapSessionRowToSession(row: ChatSessionRow, messages: Message[]): ChatSession {
    return {
        id: row.$id,
        title: row.title || NEW_CHAT_TITLE,
        titleLocked: Boolean(row.titleLocked),
        contextSummary: row.contextSummary || '',
        updatedAt: row.lastMessageAt || row.$updatedAt,
        messages,
    };
}

function attachMessageAttachments(
    messages: Message[],
    attachmentsByMessageId: Map<string, MessageAttachment[]>,
): Message[] {
    return messages.map((message) => ({
        ...message,
        attachments: attachmentsByMessageId.get(message.id) ?? [],
    }));
}

function mapSessionRowsToHistory(rows: ChatSessionRow[]): ChatHistoryItem[] {
    return [...rows]
        .sort((a, b) => b.$updatedAt.localeCompare(a.$updatedAt))
        .map((row) => ({
            id: row.$id,
            title: row.title || NEW_CHAT_TITLE,
            updatedAt: row.lastMessageAt || row.$updatedAt,
            snippet: row.lastSnippet || '',
        }));
}

function mapAttachmentForProvider(attachment: MessageAttachment): AttachmentInput {
    return {
        fileId: attachment.fileId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        kind: attachment.kind,
        url: attachment.url,
    };
}

function isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const candidate = error as { code?: number; type?: string };
    return candidate.code === 404 || candidate.type === 'row_not_found';
}

async function getCurrentUserId(): Promise<string> {
    const user = await appwriteAccount.get();
    return user.$id;
}

async function findSessionRowById(sessionId: string, userId: string): Promise<ChatSessionRow | null> {
    try {
        const row = await appwriteTablesDB.getRow<ChatSessionRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_SESSIONS_TABLE_ID,
            rowId: sessionId,
        });

        if (row.userId !== userId) {
            return null;
        }

        return row;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }
        throw error;
    }
}

async function createSessionRow(userId: string, nowIso: string): Promise<ChatSessionRow> {
    return appwriteTablesDB.createRow<ChatSessionRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_SESSIONS_TABLE_ID,
        rowId: ID.unique(),
        data: {
            title: NEW_CHAT_TITLE,
            titleLocked: false,
            contextSummary: '',
            summaryUpdatedAt: nowIso,
            lastSnippet: '',
            lastMessageAt: nowIso,
            userId,
        },
    });
}

async function listSessionMessages(sessionId: string, userId: string): Promise<ChatMessageRow[]> {
    const response = await appwriteTablesDB.listRows<ChatMessageRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_MESSAGES_TABLE_ID,
        queries: [
            Query.equal('sessionId', sessionId),
            Query.equal('userId', userId),
            Query.orderAsc('$sequence'),
            Query.limit(MESSAGE_FETCH_LIMIT),
        ],
        total: false,
    });

    return response.rows;
}

async function listRecentSessionMessages(
    sessionId: string,
    userId: string,
    limit: number,
): Promise<Message[]> {
    const response = await appwriteTablesDB.listRows<ChatMessageRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_MESSAGES_TABLE_ID,
        queries: [
            Query.equal('sessionId', sessionId),
            Query.equal('userId', userId),
            Query.orderDesc('$sequence'),
            Query.limit(limit),
        ],
        total: false,
    });

    return response.rows.reverse().map(mapMessageRowToMessage);
}

async function listSessionRowsForHistory(userId: string): Promise<ChatSessionRow[]> {
    const response = await appwriteTablesDB.listRows<ChatSessionRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_SESSIONS_TABLE_ID,
        queries: [
            Query.equal('userId', userId),
            Query.orderDesc('$updatedAt'),
            Query.limit(HISTORY_LIMIT),
        ],
        total: false,
    });

    return response.rows;
}

async function searchSessionRowsByText(userId: string, searchTerm: string): Promise<ChatSessionRow[]> {
    const baseQueries = [Query.equal('userId', userId)];
    const trailingQueries = [Query.orderDesc('$updatedAt'), Query.limit(HISTORY_LIMIT)];

    try {
        const response = await appwriteTablesDB.listRows<ChatSessionRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_SESSIONS_TABLE_ID,
            queries: [
                ...baseQueries,
                Query.search('title', searchTerm),
                ...trailingQueries,
            ],
            total: false,
        });
        return response.rows;
    } catch {
        const fallback = await appwriteTablesDB.listRows<ChatSessionRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_SESSIONS_TABLE_ID,
            queries: [
                ...baseQueries,
                Query.contains('title', searchTerm),
                ...trailingQueries,
            ],
            total: false,
        });
        return fallback.rows;
    }
}

async function searchMessageRowsByText(userId: string, searchTerm: string): Promise<ChatMessageRow[]> {
    const baseQueries = [Query.equal('userId', userId)];
    const trailingQueries = [Query.orderDesc('$sequence'), Query.limit(HISTORY_LIMIT)];

    try {
        const response = await appwriteTablesDB.listRows<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            queries: [
                ...baseQueries,
                Query.search('content', searchTerm),
                ...trailingQueries,
            ],
            total: false,
        });
        return response.rows;
    } catch {
        const fallback = await appwriteTablesDB.listRows<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            queries: [
                ...baseQueries,
                Query.contains('content', searchTerm),
                ...trailingQueries,
            ],
            total: false,
        });
        return fallback.rows;
    }
}

async function listSessionRowsByIds(userId: string, sessionIds: string[]): Promise<ChatSessionRow[]> {
    if (!sessionIds.length) {
        return [];
    }

    const response = await appwriteTablesDB.listRows<ChatSessionRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_SESSIONS_TABLE_ID,
        queries: [
            Query.equal('userId', userId),
            Query.equal('$id', sessionIds),
            Query.orderDesc('$updatedAt'),
            Query.limit(HISTORY_LIMIT),
        ],
        total: false,
    });

    return response.rows;
}

async function updateSessionAfterAssistantReply(params: {
    sessionRow: ChatSessionRow;
    userId: string;
    assistantContent: string;
    assistantCreatedAt: string;
}): Promise<ChatSessionRow> {
    const allMessageRows = await listSessionMessages(params.sessionRow.$id, params.userId);
    const allMessages = allMessageRows.map(mapMessageRowToMessage);

    const titleDecision = shouldFinalizeTitle({
        titleLocked: params.sessionRow.titleLocked,
        messages: allMessages,
    });

    let nextTitle = params.sessionRow.title || NEW_CHAT_TITLE;
    let nextTitleLocked = Boolean(params.sessionRow.titleLocked);

    if (titleDecision.shouldFinalize) {
        const builtTitle = buildTitleFromUserText(titleDecision.candidateText);
        if (builtTitle) {
            nextTitle = builtTitle;
            nextTitleLocked = true;
        } else if (titleDecision.mode === 'delayed') {
            nextTitle = NEW_CHAT_TITLE;
            nextTitleLocked = false;
        }
    }

    const updatedSummary = buildContextSummary(params.sessionRow.contextSummary || '', allMessages);
    const lastSnippet = buildSnippet(params.assistantContent);

    return appwriteTablesDB.updateRow<ChatSessionRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_SESSIONS_TABLE_ID,
        rowId: params.sessionRow.$id,
        data: {
            title: nextTitle,
            titleLocked: nextTitleLocked,
            contextSummary: updatedSummary,
            summaryUpdatedAt: params.assistantCreatedAt,
            lastSnippet,
            lastMessageAt: params.assistantCreatedAt,
            userId: params.userId,
        },
    });
}

export const ChatService = {
    async getHistory(searchTerm = ''): Promise<ChatHistoryItem[]> {
        const userId = await getCurrentUserId();
        const normalizedSearch = normalizeWhitespace(searchTerm);

        if (!normalizedSearch) {
            const rows = await listSessionRowsForHistory(userId);
            return mapSessionRowsToHistory(rows);
        }

        const [sessionMatches, messageMatches] = await Promise.all([
            searchSessionRowsByText(userId, normalizedSearch),
            searchMessageRowsByText(userId, normalizedSearch),
        ]);

        const mergedMap = new Map<string, ChatSessionRow>();
        for (const row of sessionMatches) {
            mergedMap.set(row.$id, row);
        }

        const missingSessionIds = [...new Set(messageMatches.map((row) => row.sessionId))]
            .filter((id) => !mergedMap.has(id))
            .slice(0, HISTORY_LIMIT);

        if (missingSessionIds.length) {
            const missingRows = await listSessionRowsByIds(userId, missingSessionIds);
            for (const row of missingRows) {
                mergedMap.set(row.$id, row);
            }
        }

        return mapSessionRowsToHistory([...mergedMap.values()]);
    },

    async getSession(id: string): Promise<ChatSession | null> {
        const userId = await getCurrentUserId();
        const sessionRow = await findSessionRowById(id, userId);

        if (!sessionRow) {
            return null;
        }

        const [messageRows, attachmentRows] = await Promise.all([
            listSessionMessages(sessionRow.$id, userId),
            listSessionAttachments(sessionRow.$id, userId),
        ]);
        const attachmentsByMessageId = groupAttachmentsByMessageId(attachmentRows);
        const messages = attachMessageAttachments(
            messageRows.map(mapMessageRowToMessage),
            attachmentsByMessageId,
        );
        return mapSessionRowToSession(sessionRow, messages);
    },

    async sendMessage(
        sessionId: string | null,
        content: string,
        attachments: AttachmentInput[] = [],
    ): Promise<SendMessageResult> {
        const normalizedContent = normalizeWhitespace(content);
        if (!normalizedContent) {
            throw new Error('Message content cannot be empty.');
        }

        const userId = await getCurrentUserId();
        const nowIso = new Date().toISOString();

        let sessionRow: ChatSessionRow | null = null;
        if (sessionId) {
            sessionRow = await findSessionRowById(sessionId, userId);
        }

        if (!sessionRow) {
            sessionRow = await createSessionRow(userId, nowIso);
        }

        const recentMessages = await listRecentSessionMessages(sessionRow.$id, userId, RECENT_CONTEXT_LIMIT);

        const userMessageRow = await appwriteTablesDB.createRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: ID.unique(),
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'user',
                content: normalizedContent,
                createdAt: nowIso,
            },
        });

        try {
            await persistMessageAttachments(
                userMessageRow.$id,
                sessionRow.$id,
                userId,
                attachments,
            );
        } catch (error) {
            await appwriteTablesDB.deleteRow({
                databaseId: CHAT_DATABASE_ID,
                tableId: CHAT_MESSAGES_TABLE_ID,
                rowId: userMessageRow.$id,
            }).catch(() => undefined);
            throw error;
        }

        const contextPayload = buildModelContextPayload(
            sessionRow.contextSummary || '',
            recentMessages,
            normalizedContent,
            await resolveProviderShareAttachments(attachments),
        );
        const aiSettings = await getSyncedAiSettings(userId);
        let assistantContent: string;

        try {
            assistantContent = await generateProviderReply(aiSettings, contextPayload);
        } catch (providerError) {
            console.warn('Provider response failed, using local fallback response.', providerError);
            assistantContent = generateAssistantReply(contextPayload);
        }

        const assistantCreatedAt = new Date().toISOString();

        const assistantRow = await appwriteTablesDB.createRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: ID.unique(),
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'assistant',
                content: assistantContent,
                createdAt: assistantCreatedAt,
            },
        });

        const updatedSession = await updateSessionAfterAssistantReply({
            sessionRow,
            userId,
            assistantContent,
            assistantCreatedAt,
        });

        return {
            sessionId: updatedSession.$id,
            sessionTitle: updatedSession.title || NEW_CHAT_TITLE,
            titleLocked: Boolean(updatedSession.titleLocked),
            contextSummary: updatedSession.contextSummary || '',
            assistantMessage: mapMessageRowToMessage(assistantRow),
        };
    },

    async sendMessageStream(
        sessionId: string | null,
        content: string,
        options: SendMessageStreamOptions = {},
        attachments: AttachmentInput[] = [],
    ): Promise<SendMessageResult> {
        const normalizedContent = normalizeWhitespace(content);
        if (!normalizedContent) {
            throw new Error('Message content cannot be empty.');
        }

        const userId = await getCurrentUserId();
        const nowIso = new Date().toISOString();

        let sessionRow: ChatSessionRow | null = null;
        if (sessionId) {
            sessionRow = await findSessionRowById(sessionId, userId);
        }

        if (!sessionRow) {
            sessionRow = await createSessionRow(userId, nowIso);
        }

        const recentMessages = await listRecentSessionMessages(sessionRow.$id, userId, RECENT_CONTEXT_LIMIT);

        const userMessageRow = await appwriteTablesDB.createRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: ID.unique(),
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'user',
                content: normalizedContent,
                createdAt: nowIso,
            },
        });

        try {
            await persistMessageAttachments(
                userMessageRow.$id,
                sessionRow.$id,
                userId,
                attachments,
            );
        } catch (error) {
            await appwriteTablesDB.deleteRow({
                databaseId: CHAT_DATABASE_ID,
                tableId: CHAT_MESSAGES_TABLE_ID,
                rowId: userMessageRow.$id,
            }).catch(() => undefined);
            throw error;
        }

        const assistantCreatedAt = new Date().toISOString();
        const assistantRow = await appwriteTablesDB.createRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: ID.unique(),
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'assistant',
                content: '',
                createdAt: assistantCreatedAt,
            },
        });

        const contextPayload = buildModelContextPayload(
            sessionRow.contextSummary || '',
            recentMessages,
            normalizedContent,
            await resolveProviderShareAttachments(attachments),
        );

        const aiSettings = await getSyncedAiSettings(userId);
        let assistantContent = '';

        try {
            assistantContent = await generateProviderReplyStream(aiSettings, contextPayload, {
                signal: options.signal,
                onTextDelta: (delta, fullText) => {
                    assistantContent = fullText;
                    options.onAssistantDelta?.(delta, fullText);
                },
            });
        } catch (providerError) {
            console.warn('Provider streaming failed, using non-stream response fallback.', providerError);

            if (!assistantContent.trim()) {
                try {
                    assistantContent = await generateProviderReply(aiSettings, contextPayload);
                    options.onAssistantDelta?.(assistantContent, assistantContent);
                } catch (fallbackError) {
                    console.warn('Provider fallback failed, using local fallback response.', fallbackError);
                    assistantContent = generateAssistantReply(contextPayload);
                    options.onAssistantDelta?.(assistantContent, assistantContent);
                }
            }
        }

        await appwriteTablesDB.updateRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: assistantRow.$id,
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'assistant',
                content: assistantContent,
                createdAt: assistantCreatedAt,
            },
        });

        const updatedSession = await updateSessionAfterAssistantReply({
            sessionRow,
            userId,
            assistantContent,
            assistantCreatedAt,
        });

        return {
            sessionId: updatedSession.$id,
            sessionTitle: updatedSession.title || NEW_CHAT_TITLE,
            titleLocked: Boolean(updatedSession.titleLocked),
            contextSummary: updatedSession.contextSummary || '',
            assistantMessage: {
                id: assistantRow.$id,
                role: 'assistant',
                content: assistantContent,
                createdAt: assistantCreatedAt,
                attachments: [],
            },
        };
    },

    async retryLastAssistantMessageStream(
        sessionId: string,
        assistantMessageId: string,
        options: SendMessageStreamOptions = {},
    ): Promise<SendMessageResult> {
        const normalizedSessionId = sessionId.trim();
        const normalizedAssistantMessageId = assistantMessageId.trim();
        if (!normalizedSessionId || !normalizedAssistantMessageId) {
            throw new Error('Invalid retry target.');
        }

        const userId = await getCurrentUserId();
        const sessionRow = await findSessionRowById(normalizedSessionId, userId);
        if (!sessionRow) {
            throw new Error('Session not found.');
        }

        const messageRows = await listSessionMessages(sessionRow.$id, userId);
        if (messageRows.length < 2) {
            throw new Error('No message available to retry.');
        }

        const lastMessageRow = messageRows[messageRows.length - 1];
        if (
            lastMessageRow.$id !== normalizedAssistantMessageId ||
            lastMessageRow.role !== 'assistant'
        ) {
            throw new Error('Only the latest assistant message can be retried.');
        }

        const previousRows = messageRows.slice(0, -1);
        const retryUserRow = [...previousRows].reverse().find((row) => row.role === 'user');
        if (!retryUserRow) {
            throw new Error('Could not locate the source user message for retry.');
        }

        const attachmentRows = await listSessionAttachments(sessionRow.$id, userId);
        const attachmentsByMessageId = groupAttachmentsByMessageId(attachmentRows);
        const retryAttachments = (attachmentsByMessageId.get(retryUserRow.$id) ?? [])
            .map(mapAttachmentForProvider);

        const contextPayload = buildModelContextPayload(
            sessionRow.contextSummary || '',
            previousRows.map(mapMessageRowToMessage),
            retryUserRow.content,
            await resolveProviderShareAttachments(retryAttachments),
        );

        const assistantCreatedAt = new Date().toISOString();
        await appwriteTablesDB.updateRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: normalizedAssistantMessageId,
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'assistant',
                content: '',
                createdAt: assistantCreatedAt,
            },
        });

        const aiSettings = await getSyncedAiSettings(userId);
        let assistantContent = '';

        try {
            assistantContent = await generateProviderReplyStream(aiSettings, contextPayload, {
                signal: options.signal,
                onTextDelta: (delta, fullText) => {
                    assistantContent = fullText;
                    options.onAssistantDelta?.(delta, fullText);
                },
            });
        } catch (providerError) {
            console.warn('Retry streaming failed, using non-stream response fallback.', providerError);

            if (!assistantContent.trim()) {
                try {
                    assistantContent = await generateProviderReply(aiSettings, contextPayload);
                    options.onAssistantDelta?.(assistantContent, assistantContent);
                } catch (fallbackError) {
                    console.warn('Retry fallback failed, using local fallback response.', fallbackError);
                    assistantContent = generateAssistantReply(contextPayload);
                    options.onAssistantDelta?.(assistantContent, assistantContent);
                }
            }
        }

        await appwriteTablesDB.updateRow<ChatMessageRow>({
            databaseId: CHAT_DATABASE_ID,
            tableId: CHAT_MESSAGES_TABLE_ID,
            rowId: normalizedAssistantMessageId,
            data: {
                sessionId: sessionRow.$id,
                userId,
                role: 'assistant',
                content: assistantContent,
                createdAt: assistantCreatedAt,
            },
        });

        const updatedSession = await updateSessionAfterAssistantReply({
            sessionRow,
            userId,
            assistantContent,
            assistantCreatedAt,
        });

        return {
            sessionId: updatedSession.$id,
            sessionTitle: updatedSession.title || NEW_CHAT_TITLE,
            titleLocked: Boolean(updatedSession.titleLocked),
            contextSummary: updatedSession.contextSummary || '',
            assistantMessage: {
                id: normalizedAssistantMessageId,
                role: 'assistant',
                content: assistantContent,
                createdAt: assistantCreatedAt,
                attachments: [],
            },
        };
    },
};
