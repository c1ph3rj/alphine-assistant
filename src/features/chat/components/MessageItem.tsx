import React from 'react';
import { FileSpreadsheet, FileText, Film, Image as ImageIcon, Paperclip, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '../domain/models';
import { Avatar } from '../../../shared/components/Avatar';

interface MessageItemProps {
    message: Message;
    canRetry?: boolean;
    retryCount?: number;
    maxRetryCount?: number;
    responseTimeMs?: number;
    isRetrying?: boolean;
    isAwaitingStreamStart?: boolean;
    onRetry?: (messageId: string) => void;
}

const MarkdownMessageContent = React.lazy(() => import('./MarkdownMessageContent'));

export const MessageItem: React.FC<MessageItemProps> = ({
    message,
    canRetry = false,
    retryCount = 0,
    maxRetryCount = 5,
    responseTimeMs,
    isRetrying = false,
    isAwaitingStreamStart = false,
    onRetry,
}) => {
    const isUser = message.role === 'user';
    const retryLimitReached = retryCount >= maxRetryCount;

    const renderAttachmentIcon = (kind: Message['attachments'][number]['kind']) => {
        if (kind === 'image') {
            return <ImageIcon className="h-4 w-4" />;
        }
        if (kind === 'video') {
            return <Film className="h-4 w-4" />;
        }
        if (kind === 'excel') {
            return <FileSpreadsheet className="h-4 w-4" />;
        }
        if (kind === 'pdf' || kind === 'markdown' || kind === 'word') {
            return <FileText className="h-4 w-4" />;
        }
        return <Paperclip className="h-4 w-4" />;
    };

    const formatResponseTime = (value: number): string => {
        if (value < 1000) {
            return `${value} ms`;
        }
        const seconds = value / 1000;
        return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
    };

    return (
        <div className="group w-full text-black dark:text-white">
            <div className="mx-auto flex w-full max-w-3xl gap-4 p-4 md:p-6 lg:px-8">
                {/* AI Avatar */}
                {!isUser && (
                    <Avatar role={message.role} className="mt-1 flex-shrink-0" />
                )}

                {/* Message Content */}
                <div
                    className={cn(
                        'flex-1 space-y-2 overflow-hidden',
                        isUser && 'flex flex-col items-end'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                            {isUser ? 'You' : 'Alphine AI'}
                        </span>
                    </div>
                    <div
                        className={cn(
                            'max-w-none break-words leading-relaxed text-current selection:bg-black/20 selection:text-black dark:selection:bg-white/20 dark:selection:text-white [&_a]:underline [&_a]:decoration-current/40 [&_a]:underline-offset-4 [&_a:hover]:decoration-current [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/10 [&_pre]:p-3 dark:[&_pre]:bg-white/10 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.925em] dark:[&_code]:bg-white/10',
                            isUser && 'bg-[#f4f4f4] dark:bg-[#2f2f2f] px-5 py-2.5 rounded-3xl rounded-tr-sm inline-block max-w-[85%]'
                        )}
                    >
                        {isAwaitingStreamStart ? (
                            <div className="flex items-center gap-1.5 py-1.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-black/40 dark:bg-white/40 animate-pulse" style={{ animationDelay: '0ms' }} />
                                <div className="h-1.5 w-1.5 rounded-full bg-black/40 dark:bg-white/40 animate-pulse" style={{ animationDelay: '150ms' }} />
                                <div className="h-1.5 w-1.5 rounded-full bg-black/40 dark:bg-white/40 animate-pulse" style={{ animationDelay: '300ms' }} />
                            </div>
                        ) : (
                            <React.Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
                                <MarkdownMessageContent content={message.content} />
                            </React.Suspense>
                        )}

                        {message.attachments.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {message.attachments.map((attachment) => (
                                    <a
                                        key={attachment.id}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-black/15 bg-black/5 px-3 py-1.5 text-xs hover:bg-black/10 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
                                    >
                                        {renderAttachmentIcon(attachment.kind)}
                                        <span className="truncate max-w-[160px] sm:max-w-[220px]">{attachment.name}</span>
                                    </a>
                                ))}
                            </div>
                        ) : null}

                        {message.role === 'assistant' && canRetry ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-black/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
                                    onClick={() => onRetry?.(message.id)}
                                    disabled={isRetrying || retryLimitReached}
                                >
                                    <RefreshCcw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
                                    {`Retry ${retryCount}/${maxRetryCount}`}
                                </button>
                                {typeof responseTimeMs === 'number' ? (
                                    <span className="text-xs text-black/55 dark:text-white/55">
                                        {`Response time: ${formatResponseTime(responseTimeMs)}`}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};
