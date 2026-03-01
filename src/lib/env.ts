type RequiredEnvKey =
    | 'VITE_APPWRITE_ENDPOINT'
    | 'VITE_APPWRITE_PROJECT_ID'
    | 'VITE_APP_BASE_URL'
    | 'VITE_APPWRITE_CHAT_DATABASE_ID'
    | 'VITE_APPWRITE_CHAT_SESSIONS_TABLE_ID'
    | 'VITE_APPWRITE_CHAT_MESSAGES_TABLE_ID'
    | 'VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID'
    | 'VITE_APPWRITE_CHAT_ATTACHMENTS_TABLE_ID';

type OptionalEnvKey =
    | 'VITE_APPWRITE_PROFILE_BUCKET_ID'
    | 'VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT'
    | 'VITE_APPWRITE_ATTACHMENT_TOKEN_TTL_SECONDS';

function getRequiredEnv(key: RequiredEnvKey): string {
    const value = import.meta.env[key];

    if (!value) {
        const message = `Missing required environment variable: ${key}`;
        if (import.meta.env.DEV) {
            throw new Error(message);
        }
        console.error(message);
        return '';
    }

    return value;
}

function getOptionalEnv(key: OptionalEnvKey): string | null {
    const value = import.meta.env[key];
    return value ? value.trim() : null;
}

function getOptionalPositiveIntEnv(key: OptionalEnvKey, fallback: number): number {
    const raw = getOptionalEnv(key);
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

export const appEnv = {
    appwriteEndpoint: getRequiredEnv('VITE_APPWRITE_ENDPOINT'),
    appwriteProjectId: getRequiredEnv('VITE_APPWRITE_PROJECT_ID'),
    appBaseUrl: getRequiredEnv('VITE_APP_BASE_URL'),
    appwriteChatDatabaseId: getRequiredEnv('VITE_APPWRITE_CHAT_DATABASE_ID'),
    appwriteChatSessionsTableId: getRequiredEnv('VITE_APPWRITE_CHAT_SESSIONS_TABLE_ID'),
    appwriteChatMessagesTableId: getRequiredEnv('VITE_APPWRITE_CHAT_MESSAGES_TABLE_ID'),
    appwriteChatAttachmentsBucketId: getRequiredEnv('VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID'),
    appwriteChatAttachmentsTableId: getRequiredEnv('VITE_APPWRITE_CHAT_ATTACHMENTS_TABLE_ID'),
    appwriteProfileBucketId: getOptionalEnv('VITE_APPWRITE_PROFILE_BUCKET_ID'),
    appwriteAttachmentTokenEndpoint: getOptionalEnv('VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT'),
    appwriteAttachmentTokenTtlSeconds: getOptionalPositiveIntEnv('VITE_APPWRITE_ATTACHMENT_TOKEN_TTL_SECONDS', 600),
} as const;
