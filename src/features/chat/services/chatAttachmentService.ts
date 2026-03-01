import { ID, Permission, Query, Role, type Models } from 'appwrite';
import { appEnv } from '@/lib/env';
import { appwriteStorage, appwriteTablesDB } from '@/lib/appwrite';
import type { AttachmentInput, AttachmentKind, MessageAttachment } from '../domain/models';

const CHAT_DATABASE_ID = appEnv.appwriteChatDatabaseId;
const CHAT_ATTACHMENTS_BUCKET_ID = appEnv.appwriteChatAttachmentsBucketId;
const CHAT_ATTACHMENTS_TABLE_ID = appEnv.appwriteChatAttachmentsTableId;
const ATTACHMENT_TOKEN_ENDPOINT = appEnv.appwriteAttachmentTokenEndpoint;
const ATTACHMENT_TOKEN_TTL_SECONDS = appEnv.appwriteAttachmentTokenTtlSeconds;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DRAFT_ATTACHMENTS = 5;
const ATTACHMENT_FETCH_LIMIT = 1000;

const MIME_TO_KIND: Array<{ pattern: RegExp; kind: AttachmentKind }> = [
    { pattern: /^image\//i, kind: 'image' },
    { pattern: /^video\//i, kind: 'video' },
    { pattern: /^application\/pdf$/i, kind: 'pdf' },
    { pattern: /^text\/markdown$/i, kind: 'markdown' },
    { pattern: /^text\/x-markdown$/i, kind: 'markdown' },
    { pattern: /^application\/msword$/i, kind: 'word' },
    { pattern: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i, kind: 'word' },
    { pattern: /^application\/vnd\.ms-excel$/i, kind: 'excel' },
    { pattern: /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/i, kind: 'excel' },
];

const EXT_TO_KIND: Record<string, AttachmentKind> = {
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.webp': 'image',
    '.gif': 'image',
    '.mp4': 'video',
    '.mov': 'video',
    '.webm': 'video',
    '.m4v': 'video',
    '.pdf': 'pdf',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.doc': 'word',
    '.docx': 'word',
    '.xls': 'excel',
    '.xlsx': 'excel',
};

const ALLOWED_UPLOAD_ACCEPT = [
    'image/*',
    'video/*',
    'application/pdf',
    'text/markdown',
    '.md',
    '.markdown',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
].join(',');

interface ChatAttachmentRow extends Models.Row {
    messageId: string;
    sessionId: string;
    userId: string;
    fileId: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    kind?: AttachmentKind;
    url?: string;
    createdAt?: string;
}

interface AttachmentShareTokenRecord {
    fileId: string;
    url: string;
    expiresAt?: string;
}

function getFileExtension(name: string): string {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex === -1) {
        return '';
    }
    return name.slice(dotIndex).toLowerCase();
}

function resolveAttachmentKind(file: File): AttachmentKind | null {
    const mimeType = file.type.trim();
    if (mimeType) {
        for (const matcher of MIME_TO_KIND) {
            if (matcher.pattern.test(mimeType)) {
                return matcher.kind;
            }
        }
    }

    const extension = getFileExtension(file.name);
    if (!extension) {
        return null;
    }
    return EXT_TO_KIND[extension] ?? null;
}

function resolveAttachmentKindFromValues(mimeType?: string, name?: string): AttachmentKind | null {
    const normalizedMimeType = (mimeType ?? '').trim();
    if (normalizedMimeType) {
        for (const matcher of MIME_TO_KIND) {
            if (matcher.pattern.test(normalizedMimeType)) {
                return matcher.kind;
            }
        }
    }

    const extension = getFileExtension(name ?? '');
    if (!extension) {
        return null;
    }

    return EXT_TO_KIND[extension] ?? null;
}

function getAttachmentViewUrl(fileId?: string): string {
    const normalized = (fileId ?? '').trim();
    if (!normalized) {
        return '';
    }

    return appwriteStorage.getFileView({
        bucketId: CHAT_ATTACHMENTS_BUCKET_ID,
        fileId: normalized,
    });
}

function parseShareTokenRecords(raw: unknown): AttachmentShareTokenRecord[] {
    if (!raw || typeof raw !== 'object') {
        return [];
    }

    const candidate = raw as {
        items?: unknown;
        tokens?: unknown;
        data?: unknown;
    };

    const collection = Array.isArray(candidate.items)
        ? candidate.items
        : Array.isArray(candidate.tokens)
            ? candidate.tokens
            : Array.isArray(candidate.data)
                ? candidate.data
                : [];

    if (!collection.length) {
        return [];
    }

    const parsed: AttachmentShareTokenRecord[] = [];
    for (const entry of collection) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const item = entry as {
            fileId?: unknown;
            resourceId?: unknown;
            url?: unknown;
            viewUrl?: unknown;
            downloadUrl?: unknown;
            expiresAt?: unknown;
            expire?: unknown;
        };

        const fileId = typeof item.fileId === 'string'
            ? item.fileId
            : (typeof item.resourceId === 'string' ? item.resourceId : '');
        const url = typeof item.url === 'string'
            ? item.url
            : (typeof item.viewUrl === 'string'
                ? item.viewUrl
                : (typeof item.downloadUrl === 'string' ? item.downloadUrl : ''));
        const expiresAt = typeof item.expiresAt === 'string'
            ? item.expiresAt
            : (typeof item.expire === 'string' ? item.expire : undefined);

        if (!fileId || !url) {
            continue;
        }

        parsed.push({
            fileId,
            url,
            expiresAt,
        });
    }

    return parsed;
}

function getUnknownAttributeName(error: unknown): string | null {
    const message = error instanceof Error ? error.message : '';
    if (!message) {
        return null;
    }

    const doubleQuoted = message.match(/Unknown attribute:\s*"([^"]+)"/i);
    if (doubleQuoted?.[1]) {
        return doubleQuoted[1];
    }

    const singleQuoted = message.match(/Unknown attribute:\s*'([^']+)'/i);
    if (singleQuoted?.[1]) {
        return singleQuoted[1];
    }

    return null;
}

async function createAttachmentRowWithSchemaFallback(
    data: Record<string, unknown>,
): Promise<void> {
    const payload = { ...data };

    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            await appwriteTablesDB.createRow<ChatAttachmentRow>({
                databaseId: CHAT_DATABASE_ID,
                tableId: CHAT_ATTACHMENTS_TABLE_ID,
                rowId: ID.unique(),
                data: payload as unknown as Omit<ChatAttachmentRow, keyof Models.Row>,
            });
            return;
        } catch (error) {
            const unknownAttribute = getUnknownAttributeName(error);
            if (!unknownAttribute || !(unknownAttribute in payload)) {
                throw error;
            }

            delete payload[unknownAttribute];
        }
    }

    throw new Error('Unable to persist attachment metadata due to repeated schema mismatch.');
}

async function requestAttachmentShareTokens(
    attachments: AttachmentInput[],
): Promise<Map<string, AttachmentShareTokenRecord>> {
    if (!ATTACHMENT_TOKEN_ENDPOINT || !attachments.length) {
        return new Map();
    }

    const fileIds = [...new Set(
        attachments
            .map((attachment) => attachment.fileId.trim())
            .filter(Boolean),
    )];

    if (!fileIds.length) {
        return new Map();
    }

    const response = await fetch(ATTACHMENT_TOKEN_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            bucketId: CHAT_ATTACHMENTS_BUCKET_ID,
            fileIds,
            ttlSeconds: ATTACHMENT_TOKEN_TTL_SECONDS,
        }),
    });

    if (!response.ok) {
        throw new Error(`Attachment token request failed with status ${response.status}.`);
    }

    const json = (await response.json()) as unknown;
    const parsed = parseShareTokenRecords(json);
    const mapped = new Map<string, AttachmentShareTokenRecord>();
    for (const record of parsed) {
        mapped.set(record.fileId, record);
    }
    return mapped;
}

function mapRowToAttachment(row: ChatAttachmentRow): MessageAttachment {
    const derivedKind = resolveAttachmentKindFromValues(row.mimeType, row.name) ?? 'pdf';
    const resolvedUrl = (row.url ?? '').trim() || getAttachmentViewUrl(row.fileId);
    return {
        id: row.$id,
        messageId: row.messageId,
        sessionId: row.sessionId,
        fileId: row.fileId,
        name: row.name,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        kind: row.kind ?? derivedKind,
        url: resolvedUrl,
        createdAt: row.createdAt || row.$createdAt,
    };
}

export function getAllowedAttachmentAccept(): string {
    return ALLOWED_UPLOAD_ACCEPT;
}

export function validateAttachmentFile(file: File): { kind: AttachmentKind } {
    if (!file) {
        throw new Error('No file selected.');
    }

    const kind = resolveAttachmentKind(file);
    if (!kind) {
        throw new Error('Only image, video, PDF, markdown, Word, and Excel files are supported.');
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('Each attachment must be 25MB or smaller.');
    }

    return { kind };
}

export async function uploadAttachmentDraft(file: File, userId: string): Promise<AttachmentInput> {
    const { kind } = validateAttachmentFile(file);

    const created = await appwriteStorage.createFile({
        bucketId: CHAT_ATTACHMENTS_BUCKET_ID,
        fileId: ID.unique(),
        file,
        permissions: [
            Permission.read(Role.user(userId)),
            Permission.update(Role.user(userId)),
            Permission.delete(Role.user(userId)),
        ],
    });

    const url = appwriteStorage.getFileView({
        bucketId: CHAT_ATTACHMENTS_BUCKET_ID,
        fileId: created.$id,
    });

    return {
        fileId: created.$id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        kind,
        url,
    };
}

export async function deleteUploadedAttachment(fileId: string): Promise<void> {
    const normalized = fileId.trim();
    if (!normalized) {
        return;
    }

    try {
        await appwriteStorage.deleteFile({
            bucketId: CHAT_ATTACHMENTS_BUCKET_ID,
            fileId: normalized,
        });
    } catch {
        // Ignore cleanup failures in draft flows.
    }
}

export async function persistMessageAttachments(
    messageId: string,
    sessionId: string,
    userId: string,
    attachments: AttachmentInput[],
): Promise<void> {
    if (!attachments.length) {
        return;
    }

    await Promise.all(attachments.map(async (attachment) => {
        await createAttachmentRowWithSchemaFallback({
            messageId,
            sessionId,
            userId,
            fileId: attachment.fileId,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            kind: attachment.kind,
            url: attachment.url,
        });
    }));
}

export async function resolveProviderShareAttachments(
    attachments: AttachmentInput[],
): Promise<AttachmentInput[]> {
    if (!attachments.length) {
        return [];
    }

    try {
        const tokenMap = await requestAttachmentShareTokens(attachments);
        if (!tokenMap.size) {
            return attachments;
        }

        return attachments.map((attachment) => {
            const token = tokenMap.get(attachment.fileId);
            if (!token?.url) {
                return attachment;
            }

            return {
                ...attachment,
                url: token.url,
            };
        });
    } catch (error) {
        console.warn('Failed to resolve expiring attachment links. Falling back to stored URLs.', error);
        return attachments;
    }
}

export async function listSessionAttachments(
    sessionId: string,
    userId: string,
): Promise<MessageAttachment[]> {
    const response = await appwriteTablesDB.listRows<ChatAttachmentRow>({
        databaseId: CHAT_DATABASE_ID,
        tableId: CHAT_ATTACHMENTS_TABLE_ID,
        queries: [
            Query.equal('sessionId', sessionId),
            Query.equal('userId', userId),
            Query.orderAsc('$createdAt'),
            Query.limit(ATTACHMENT_FETCH_LIMIT),
        ],
        total: false,
    });

    return response.rows.map(mapRowToAttachment);
}

export function groupAttachmentsByMessageId(attachments: MessageAttachment[]): Map<string, MessageAttachment[]> {
    const grouped = new Map<string, MessageAttachment[]>();

    for (const attachment of attachments) {
        if (!attachment.messageId) {
            continue;
        }

        const existing = grouped.get(attachment.messageId);
        if (existing) {
            existing.push(attachment);
            continue;
        }

        grouped.set(attachment.messageId, [attachment]);
    }

    return grouped;
}
