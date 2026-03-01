import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowUp,
    Camera,
    Mic,
    Paperclip,
    Plus,
    RefreshCcw,
    Upload,
    X,
} from 'lucide-react';
import { Textarea } from '../../../shared/components/Textarea';
import { Button } from '../../../shared/components/Button';
import { useAuth } from '@/features/auth/state/AuthContext';
import type { AttachmentInput, AttachmentKind } from '../domain/models';
import {
    deleteUploadedAttachment,
    getAllowedAttachmentAccept,
    MAX_DRAFT_ATTACHMENTS,
    uploadAttachmentDraft,
    validateAttachmentFile,
} from '../services/chatAttachmentService';

interface ComposerProps {
    onSend: (message: string, attachments: AttachmentInput[]) => Promise<void> | void;
    disabled?: boolean;
}

interface ComposerAttachmentItem {
    clientId: string;
    file: File;
    status: 'uploading' | 'uploaded' | 'failed';
    uploaded?: AttachmentInput;
    error?: string;
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

function kindLabel(kind: AttachmentKind): string {
    if (kind === 'image') {
        return 'Image';
    }
    if (kind === 'video') {
        return 'Video';
    }
    if (kind === 'pdf') {
        return 'PDF';
    }
    if (kind === 'markdown') {
        return 'Markdown';
    }
    if (kind === 'word') {
        return 'Word';
    }
    return 'Excel';
}

export const Composer: React.FC<ComposerProps> = ({ onSend, disabled }) => {
    const [input, setInput] = useState('');
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
        window.matchMedia('(pointer: coarse)').matches,
    );
    const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
        window.matchMedia('(max-width: 767px)').matches,
    );
    const [attachmentItems, setAttachmentItems] = useState<ComposerAttachmentItem[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const isDisabled = Boolean(disabled);
    const { user } = useAuth();

    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const actionButtonRef = useRef<HTMLButtonElement | null>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const captureImageInputRef = useRef<HTMLInputElement | null>(null);

    const uploadingCount = attachmentItems.filter((item) => item.status === 'uploading').length;
    const uploadedAttachments = useMemo(() =>
        attachmentItems
            .filter((item) => item.status === 'uploaded' && item.uploaded)
            .map((item) => item.uploaded as AttachmentInput)
        , [attachmentItems]);
    const shouldUseBottomSheet = isCoarsePointer && isNarrowViewport;

    useEffect(() => {
        const pointerMedia = window.matchMedia('(pointer: coarse)');
        const narrowMedia = window.matchMedia('(max-width: 767px)');
        const handlePointerChange = (event: MediaQueryListEvent) => {
            setIsCoarsePointer(event.matches);
        };
        const handleNarrowChange = (event: MediaQueryListEvent) => {
            setIsNarrowViewport(event.matches);
        };

        pointerMedia.addEventListener('change', handlePointerChange);
        narrowMedia.addEventListener('change', handleNarrowChange);
        return () => {
            pointerMedia.removeEventListener('change', handlePointerChange);
            narrowMedia.removeEventListener('change', handleNarrowChange);
        };
    }, []);

    useEffect(() => {
        if (!isActionMenuOpen || shouldUseBottomSheet) {
            return;
        }

        const handleClickOutside = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                actionMenuRef.current?.contains(target) ||
                actionButtonRef.current?.contains(target)
            ) {
                return;
            }
            setIsActionMenuOpen(false);
        };

        window.addEventListener('pointerdown', handleClickOutside);
        return () => window.removeEventListener('pointerdown', handleClickOutside);
    }, [isActionMenuOpen, shouldUseBottomSheet]);

    const handleSend = async () => {
        const messageToSend = input.trim();
        if (!messageToSend || isDisabled || uploadingCount > 0) {
            return;
        }

        const attachmentItemsToRestore = attachmentItems;
        const attachmentsToSend = uploadedAttachments;

        // Clear draft UI immediately so chips do not linger while streaming.
        setInput('');
        setAttachmentItems([]);
        setAttachmentError(null);

        try {
            await onSend(messageToSend, attachmentsToSend);
        } catch (error) {
            console.error('Failed to send message from composer:', error);
            setInput(messageToSend);
            setAttachmentItems(attachmentItemsToRestore);
            setAttachmentError('Failed to send message. Please try again.');
        }
    };

    const isInputEmpty = !input.trim();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    const setItemStatus = (clientId: string, update: Partial<ComposerAttachmentItem>) => {
        setAttachmentItems((previous) =>
            previous.map((item) =>
                item.clientId === clientId
                    ? { ...item, ...update }
                    : item,
            ),
        );
    };

    const uploadFile = async (item: ComposerAttachmentItem) => {
        if (!user) {
            setItemStatus(item.clientId, {
                status: 'failed',
                error: 'You must be signed in to upload attachments.',
            });
            return;
        }

        try {
            const uploaded = await uploadAttachmentDraft(item.file, user.id);
            setItemStatus(item.clientId, {
                status: 'uploaded',
                uploaded,
                error: undefined,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to upload attachment.';
            setItemStatus(item.clientId, {
                status: 'failed',
                error: message,
            });
        }
    };

    const appendFiles = async (files: File[]) => {
        if (!files.length) {
            return;
        }

        const remainingSlots = MAX_DRAFT_ATTACHMENTS - attachmentItems.length;
        if (remainingSlots <= 0) {
            setAttachmentError(`You can attach up to ${MAX_DRAFT_ATTACHMENTS} files.`);
            return;
        }

        const selected = files.slice(0, remainingSlots);
        if (files.length > selected.length) {
            setAttachmentError(`Only the first ${remainingSlots} files were added.`);
        } else {
            setAttachmentError(null);
        }

        const nextItems: ComposerAttachmentItem[] = [];
        for (const file of selected) {
            try {
                validateAttachmentFile(file);
                nextItems.push({
                    clientId: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
                    file,
                    status: 'uploading',
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unsupported file type.';
                setAttachmentError(message);
            }
        }

        if (!nextItems.length) {
            return;
        }

        setAttachmentItems((previous) => [...previous, ...nextItems]);
        await Promise.all(nextItems.map((item) => uploadFile(item)));
    };

    const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        setIsActionMenuOpen(false);
        await appendFiles(files);
    };

    const startCaptureImage = () => {
        if (isDisabled) {
            return;
        }

        // Camera capture is restricted on insecure origins in many mobile browsers.
        const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (!window.isSecureContext && !isLocalhost) {
            setAttachmentError('Camera capture requires HTTPS. Use "Upload file" on HTTP.');
            const uploadInput = uploadInputRef.current;
            setIsActionMenuOpen(false);
            uploadInput?.click();
            return;
        }

        setAttachmentError(null);
        const captureInput = captureImageInputRef.current;
        setIsActionMenuOpen(false);
        captureInput?.click();
    };

    const startUploadPicker = () => {
        if (isDisabled) {
            return;
        }

        setAttachmentError(null);
        const uploadInput = uploadInputRef.current;
        setIsActionMenuOpen(false);
        uploadInput?.click();
    };

    const removeAttachment = async (item: ComposerAttachmentItem) => {
        if (item.uploaded?.fileId) {
            await deleteUploadedAttachment(item.uploaded.fileId);
        }

        setAttachmentItems((previous) => previous.filter((entry) => entry.clientId !== item.clientId));
    };

    const retryAttachment = async (item: ComposerAttachmentItem) => {
        setItemStatus(item.clientId, {
            status: 'uploading',
            error: undefined,
        });
        await uploadFile(item);
    };

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-2 lg:max-w-4xl">
            <input
                ref={uploadInputRef}
                type="file"
                className="sr-only"
                multiple
                accept={getAllowedAttachmentAccept()}
                onChange={(event) => { void handleUploadChange(event); }}
            />
            <input
                ref={captureImageInputRef}
                type="file"
                className="sr-only"
                accept="image/*"
                capture="environment"
                onChange={(event) => { void handleUploadChange(event); }}
            />

            {attachmentItems.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                    {attachmentItems.map((item) => (
                        <div
                            key={item.clientId}
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/15 dark:bg-white/5"
                        >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[140px] sm:max-w-[220px]">
                                {item.file.name}
                            </span>
                            <span className="opacity-70">
                                {formatFileSize(item.file.size)}
                            </span>
                            <span className="opacity-70">
                                {item.uploaded ? kindLabel(item.uploaded.kind) : ''}
                            </span>
                            {item.status === 'uploading' ? (
                                <span className="opacity-70">Uploading...</span>
                            ) : null}
                            {item.status === 'failed' ? (
                                <button
                                    type="button"
                                    className="inline-flex items-center rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                                    onClick={() => { void retryAttachment(item); }}
                                    title={item.error || 'Retry upload'}
                                >
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="inline-flex items-center rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                                onClick={() => { void removeAttachment(item); }}
                                title="Remove attachment"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {attachmentError ? (
                <p className="mb-2 text-xs text-red-600 dark:text-red-400">{attachmentError}</p>
            ) : null}

            <div className="relative">
                {isActionMenuOpen && !shouldUseBottomSheet ? (
                    <div
                        ref={actionMenuRef}
                        className="composer-pop-in absolute bottom-full left-0 z-30 mb-2 w-56 rounded-xl border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#171717]"
                    >
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => { void startCaptureImage(); }}
                        >
                            <Camera className="h-4 w-4" />
                            Capture image
                        </button>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={startUploadPicker}
                        >
                            <Upload className="h-4 w-4" />
                            Upload file
                        </button>
                    </div>
                ) : null}

                <div className="flex items-center gap-2 rounded-[26px] bg-[#f4f4f4] px-3 py-[10px] shadow-sm dark:bg-[#2f2f2f] lg:py-[11px]">
                    <button
                        ref={actionButtonRef}
                        type="button"
                        disabled={isDisabled}
                        aria-label="Add attachment"
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/25 text-black/50 transition-all duration-200 hover:scale-[1.02] hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white lg:h-9 lg:w-9"
                        onClick={() => setIsActionMenuOpen((previous) => !previous)}
                    >
                        <Plus className={`h-5 w-5 transition-transform duration-200 ${isActionMenuOpen ? 'rotate-45' : 'rotate-0'}`} />
                    </button>

                    <Textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isDisabled ? 'Loading conversation...' : 'Ask anything ...'}
                        rows={1}
                        disabled={isDisabled}
                        className="max-h-[200px] min-h-8 flex-1 resize-none overflow-y-auto border-none bg-transparent px-0 py-1 font-normal leading-6 focus-visible:ring-0 lg:min-h-9 lg:py-1"
                    />

                    <div className="flex shrink-0 items-center gap-1">
                        {isInputEmpty ? (
                            <button
                                type="button"
                                disabled={isDisabled}
                                aria-label="Voice input"
                                className="flex h-8 w-8 items-center justify-center rounded-full text-black/60 transition-colors hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white lg:h-9 lg:w-9"
                            >
                                <Mic className="h-5 w-5" />
                            </button>
                        ) : (
                            <Button
                                size="icon"
                                onClick={() => { void handleSend(); }}
                                disabled={isDisabled || uploadingCount > 0}
                                className="h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-black text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black lg:h-9 lg:w-9"
                            >
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {isActionMenuOpen && shouldUseBottomSheet ? createPortal(
                <div className="fixed inset-0 z-[130]">
                    <button
                        type="button"
                        className="composer-fade-in absolute inset-0 bg-black/55"
                        onClick={() => setIsActionMenuOpen(false)}
                        aria-label="Close attachment actions"
                    />
                    <div className="composer-sheet-in absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-black/10 bg-white px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4 shadow-2xl dark:border-white/10 dark:bg-[#171717]">
                        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/20 dark:bg-white/20" />
                        <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => { void startCaptureImage(); }}
                        >
                            <Camera className="h-5 w-5" />
                            <span className="text-sm">Capture image</span>
                        </button>
                        <button
                            type="button"
                            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={startUploadPicker}
                        >
                            <Upload className="h-5 w-5" />
                            <span className="text-sm">Upload file</span>
                        </button>
                        <button
                            type="button"
                            className="mt-3 flex w-full items-center justify-center rounded-xl border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                            onClick={() => setIsActionMenuOpen(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>,
                document.body,
            ) : null}

            <div className="mt-2 text-center">
                <p className="text-xs text-black/50 dark:text-white/50">
                    Alphine can make mistakes. Verify important info.
                </p>
            </div>
        </div>
    );
};
