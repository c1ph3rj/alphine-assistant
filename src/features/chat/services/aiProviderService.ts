import type { AISettings } from '@/features/settings/domain/models';
import { DEFAULT_SYSTEM_INSTRUCTION } from '@/features/settings/domain/defaultSystemInstruction';
import type { AttachmentInput, Message } from '../domain/models';

export interface ModelContextPayload {
    summary: string;
    recent: Message[];
    latestUserMessage: string;
    latestUserAttachments: AttachmentInput[];
}

export interface ProviderReplyStreamOptions {
    onTextDelta?: (delta: string, fullText: string) => void;
    signal?: AbortSignal;
}

const MAX_GOOGLE_INLINE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function resolveSystemInstruction(settings: AISettings): string {
    const custom = settings.systemInstruction.trim();
    if (custom) {
        return custom;
    }
    return DEFAULT_SYSTEM_INSTRUCTION;
}

function formatRecentMessages(messages: Message[]): string {
    if (!messages.length) {
        return 'No recent messages.';
    }

    return messages
        .map((message) => {
            const prefix = message.role === 'user' ? 'User' : 'Assistant';
            return `${prefix}: ${message.content}`;
        })
        .join('\n');
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

function formatAttachmentList(attachments: AttachmentInput[]): string {
    if (!attachments.length) {
        return 'No attachments.';
    }

    return attachments
        .map((attachment) => (
            `- ${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${formatFileSize(attachment.sizeBytes)})`
        ))
        .join('\n');
}

function buildProviderPrompt(payload: ModelContextPayload): string {
    return [
        `Summary:\n${payload.summary || 'No summary yet.'}`,
        `Recent messages:\n${formatRecentMessages(payload.recent)}`,
        `Latest user attachments:\n${formatAttachmentList(payload.latestUserAttachments)}`,
        `Latest user message:\n${payload.latestUserMessage}`,
        'Respond to the latest user message while using the provided context and attachments when relevant.',
    ].join('\n\n');
}

function buildAttachmentReferenceText(attachment: AttachmentInput): string {
    const base = `${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${formatFileSize(attachment.sizeBytes)})`;
    if (attachment.url) {
        return `${base}\nURL: ${attachment.url}`;
    }
    return base;
}

function buildOpenRouterUserContent(
    payload: ModelContextPayload,
): string | Array<Record<string, unknown>> {
    if (!payload.latestUserAttachments.length) {
        return buildProviderPrompt(payload);
    }

    const parts: Array<Record<string, unknown>> = [
        { type: 'text', text: buildProviderPrompt(payload) },
    ];

    for (const attachment of payload.latestUserAttachments) {
        if (attachment.kind === 'image' && attachment.url) {
            parts.push({
                type: 'image_url',
                image_url: {
                    url: attachment.url,
                },
            });
            continue;
        }

        parts.push({
            type: 'text',
            text: `Attachment reference:\n${buildAttachmentReferenceText(attachment)}`,
        });
    }

    return parts;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
}

async function fetchAttachmentAsBase64(
    url: string,
    signal?: AbortSignal,
): Promise<string> {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal,
    });

    if (!response.ok) {
        // Some Appwrite deployments may reject `view` URLs for certain files while `download` succeeds.
        if (response.status === 404 && url.includes('/view?')) {
            const fallbackUrl = url.replace('/view?', '/download?');
            const fallbackResponse = await fetch(fallbackUrl, {
                method: 'GET',
                credentials: 'include',
                signal,
            });

            if (!fallbackResponse.ok) {
                throw new Error(`Failed to download attachment bytes (${fallbackResponse.status}).`);
            }

            const fallbackBuffer = await fallbackResponse.arrayBuffer();
            return arrayBufferToBase64(fallbackBuffer);
        }

        throw new Error(`Failed to download attachment bytes (${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return arrayBufferToBase64(arrayBuffer);
}

async function buildGoogleUserParts(
    payload: ModelContextPayload,
    signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
    const parts: Array<Record<string, unknown>> = [
        { text: buildProviderPrompt(payload) },
    ];

    for (const attachment of payload.latestUserAttachments) {
        const canInlineImage =
            attachment.kind === 'image' &&
            Boolean(attachment.url) &&
            attachment.sizeBytes > 0 &&
            attachment.sizeBytes <= MAX_GOOGLE_INLINE_ATTACHMENT_BYTES;

        if (canInlineImage) {
            try {
                const base64Data = await fetchAttachmentAsBase64(attachment.url, signal);
                parts.push({
                    inlineData: {
                        mimeType: attachment.mimeType || 'application/octet-stream',
                        data: base64Data,
                    },
                });
                continue;
            } catch (error) {
                console.warn('Failed to inline attachment for Google provider. Falling back to URL reference.', error);
            }
        }

        parts.push({
            text: `Attachment reference:\n${buildAttachmentReferenceText(attachment)}`,
        });
    }

    return parts;
}

function extractOpenRouterContentText(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (!Array.isArray(content)) {
        return '';
    }

    return content
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return '';
            }

            const part = item as { text?: string };
            return typeof part.text === 'string' ? part.text : '';
        })
        .join('');
}

function readOpenRouterText(raw: unknown): string {
    if (typeof raw !== 'object' || raw === null) {
        return '';
    }

    const response = raw as {
        choices?: Array<{
            message?: {
                content?: string | Array<{ type?: string; text?: string }>;
            };
        }>;
    };

    return extractOpenRouterContentText(response.choices?.[0]?.message?.content).trim();
}

function readOpenRouterStreamDelta(raw: unknown): string {
    if (typeof raw !== 'object' || raw === null) {
        return '';
    }

    const response = raw as {
        choices?: Array<{
            delta?: {
                content?: string | Array<{ text?: string }>;
            };
        }>;
    };

    return extractOpenRouterContentText(response.choices?.[0]?.delta?.content);
}

function readGoogleText(raw: unknown): string {
    if (typeof raw !== 'object' || raw === null) {
        return '';
    }

    const response = raw as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: string }>;
            };
        }>;
    };

    return (response.candidates?.[0]?.content?.parts ?? [])
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

function readGoogleStreamChunk(raw: unknown): string {
    if (typeof raw !== 'object' || raw === null) {
        return '';
    }

    const response = raw as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: string }>;
            };
        }>;
    };

    return (response.candidates?.[0]?.content?.parts ?? [])
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('');
}

function resolveStreamDelta(chunkText: string, accumulatedText: string): string {
    if (!chunkText) {
        return '';
    }

    if (!accumulatedText) {
        return chunkText;
    }

    if (chunkText.startsWith(accumulatedText)) {
        return chunkText.slice(accumulatedText.length);
    }

    if (accumulatedText.endsWith(chunkText)) {
        return '';
    }

    return chunkText;
}

function tryParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function getErrorMessageFromJson(json: unknown, fallback: string): string {
    if (typeof json !== 'object' || !json) {
        return fallback;
    }

    if ('error' in json) {
        return JSON.stringify((json as { error: unknown }).error);
    }

    return fallback;
}

function extractSseEventData(rawEvent: string): string {
    return rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();
}

async function consumeSseStream(
    response: Response,
    onData: (data: string) => void,
    signal?: AbortSignal,
): Promise<void> {
    if (!response.body) {
        throw new Error('Streaming response body is unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        if (signal?.aborted) {
            throw new DOMException('Request aborted.', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
            const rawEvent = buffer.slice(0, boundaryIndex).trim();
            buffer = buffer.slice(boundaryIndex + 2);

            if (rawEvent) {
                const data = extractSseEventData(rawEvent);
                if (data) {
                    onData(data);
                }
            }

            boundaryIndex = buffer.indexOf('\n\n');
        }
    }

    const trailingData = extractSseEventData(buffer.trim());
    if (trailingData) {
        onData(trailingData);
    }
}

async function callOpenRouter(settings: AISettings, payload: ModelContextPayload): Promise<string> {
    const apiKey = settings.openRouter.apiKey.trim();
    const model = settings.openRouter.model.trim();
    const systemInstruction = resolveSystemInstruction(settings);

    if (!apiKey) {
        throw new Error('OpenRouter API key is not configured.');
    }
    if (!model) {
        throw new Error('OpenRouter model is not configured.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Alphine',
        },
        body: JSON.stringify({
            model,
            temperature: 0.7,
            messages: [
                {
                    role: 'system',
                    content: systemInstruction,
                },
                {
                    role: 'user',
                    content: buildOpenRouterUserContent(payload),
                },
            ],
        }),
    });

    const json = (await response.json()) as unknown;
    if (!response.ok) {
        const message = getErrorMessageFromJson(
            json,
            `OpenRouter request failed with status ${response.status}.`,
        );
        throw new Error(message);
    }

    const text = readOpenRouterText(json);
    if (!text) {
        throw new Error('OpenRouter returned an empty response.');
    }
    return text;
}

async function callOpenRouterStream(
    settings: AISettings,
    payload: ModelContextPayload,
    options: ProviderReplyStreamOptions = {},
): Promise<string> {
    const apiKey = settings.openRouter.apiKey.trim();
    const model = settings.openRouter.model.trim();
    const systemInstruction = resolveSystemInstruction(settings);

    if (!apiKey) {
        throw new Error('OpenRouter API key is not configured.');
    }
    if (!model) {
        throw new Error('OpenRouter model is not configured.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Alphine',
        },
        body: JSON.stringify({
            model,
            temperature: 0.7,
            stream: true,
            messages: [
                {
                    role: 'system',
                    content: systemInstruction,
                },
                {
                    role: 'user',
                    content: buildOpenRouterUserContent(payload),
                },
            ],
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const raw = await response.text();
        const parsed = tryParseJson(raw);
        throw new Error(getErrorMessageFromJson(parsed, `OpenRouter request failed with status ${response.status}.`));
    }

    let fullText = '';

    await consumeSseStream(
        response,
        (data) => {
            if (data === '[DONE]') {
                return;
            }

            const parsed = tryParseJson(data);
            const delta = readOpenRouterStreamDelta(parsed);
            if (!delta) {
                return;
            }

            fullText += delta;
            options.onTextDelta?.(delta, fullText);
        },
        options.signal,
    );

    const normalized = fullText.trim();
    if (!normalized) {
        throw new Error('OpenRouter returned an empty response.');
    }

    return normalized;
}

async function callGoogleGenerativeAI(settings: AISettings, payload: ModelContextPayload): Promise<string> {
    const apiKey = settings.google.apiKey.trim();
    const model = settings.google.model.trim();
    const systemInstruction = resolveSystemInstruction(settings);

    if (!apiKey) {
        throw new Error('Google Generative AI API key is not configured.');
    }
    if (!model) {
        throw new Error('Google Generative AI model is not configured.');
    }

    const userParts = await buildGoogleUserParts(payload);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Send the key as a header instead of a URL query parameter to avoid
                // it appearing in server logs, browser history, and network traces.
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                },
                contents: [
                    {
                        role: 'user',
                        parts: userParts,
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                },
            }),
        },
    );

    const json = (await response.json()) as unknown;
    if (!response.ok) {
        const message = getErrorMessageFromJson(
            json,
            `Google Generative AI request failed with status ${response.status}.`,
        );
        throw new Error(message);
    }

    const text = readGoogleText(json);
    if (!text) {
        throw new Error('Google Generative AI returned an empty response.');
    }
    return text;
}

async function callGoogleGenerativeAIStream(
    settings: AISettings,
    payload: ModelContextPayload,
    options: ProviderReplyStreamOptions = {},
): Promise<string> {
    const apiKey = settings.google.apiKey.trim();
    const model = settings.google.model.trim();
    const systemInstruction = resolveSystemInstruction(settings);

    if (!apiKey) {
        throw new Error('Google Generative AI API key is not configured.');
    }
    if (!model) {
        throw new Error('Google Generative AI model is not configured.');
    }

    const userParts = await buildGoogleUserParts(payload, options.signal);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Send the key as a header instead of a URL query parameter to avoid
                // it appearing in server logs, browser history, and network traces.
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                },
                contents: [
                    {
                        role: 'user',
                        parts: userParts,
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                },
            }),
            signal: options.signal,
        },
    );

    if (!response.ok) {
        const raw = await response.text();
        const parsed = tryParseJson(raw);
        throw new Error(getErrorMessageFromJson(parsed, `Google Generative AI request failed with status ${response.status}.`));
    }

    let fullText = '';

    await consumeSseStream(
        response,
        (data) => {
            const parsed = tryParseJson(data);
            const chunkText = readGoogleStreamChunk(parsed);
            const delta = resolveStreamDelta(chunkText, fullText);

            if (!delta) {
                return;
            }

            fullText += delta;
            options.onTextDelta?.(delta, fullText);
        },
        options.signal,
    );

    const normalized = fullText.trim();
    if (!normalized) {
        throw new Error('Google Generative AI returned an empty response.');
    }

    return normalized;
}

export async function generateProviderReply(
    settings: AISettings,
    payload: ModelContextPayload,
): Promise<string> {
    if (settings.provider === 'google') {
        return callGoogleGenerativeAI(settings, payload);
    }
    return callOpenRouter(settings, payload);
}

export async function generateProviderReplyStream(
    settings: AISettings,
    payload: ModelContextPayload,
    options: ProviderReplyStreamOptions = {},
): Promise<string> {
    if (settings.provider === 'google') {
        return callGoogleGenerativeAIStream(settings, payload, options);
    }
    return callOpenRouterStream(settings, payload, options);
}
