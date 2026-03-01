export type Role = 'user' | 'assistant';

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'markdown' | 'word' | 'excel';

export interface AttachmentInput {
    fileId: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    kind: AttachmentKind;
    url: string;
}

export interface MessageAttachment extends AttachmentInput {
    id: string;
    messageId?: string;
    sessionId?: string;
    createdAt?: string;
}

export interface Message {
    id: string;
    role: Role;
    content: string;
    createdAt: string;
    attachments: MessageAttachment[];
}

export interface ChatSession {
    id: string;
    title: string;
    titleLocked: boolean;
    contextSummary: string;
    updatedAt: string;
    messages: Message[];
}

export interface ChatHistoryItem {
    id: string;
    title: string;
    updatedAt: string;
    snippet: string;
}

export interface SendMessageResult {
    sessionId: string;
    sessionTitle: string;
    titleLocked: boolean;
    contextSummary: string;
    assistantMessage: Message;
}
