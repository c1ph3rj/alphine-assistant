/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APPWRITE_ENDPOINT: string;
    readonly VITE_APPWRITE_PROJECT_ID: string;
    readonly VITE_APP_BASE_URL: string;
    readonly VITE_APPWRITE_CHAT_DATABASE_ID: string;
    readonly VITE_APPWRITE_CHAT_SESSIONS_TABLE_ID: string;
    readonly VITE_APPWRITE_CHAT_MESSAGES_TABLE_ID: string;
    readonly VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID: string;
    readonly VITE_APPWRITE_CHAT_ATTACHMENTS_TABLE_ID: string;
    readonly VITE_APPWRITE_PROFILE_BUCKET_ID?: string;
    readonly VITE_APPWRITE_ATTACHMENT_TOKEN_ENDPOINT?: string;
    readonly VITE_APPWRITE_ATTACHMENT_TOKEN_TTL_SECONDS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
