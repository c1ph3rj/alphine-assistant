import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';
import {
    AppDialogContext,
    resolveCancelledRequest,
    type AlertDialogOptions,
    type AppDialogContextValue,
    type ConfirmDialogOptions,
    type DialogRequest,
    type PromptDialogOptions,
} from './app-dialog-context';

function getPromptInitialState(dialog: DialogRequest | null): string {
    if (dialog?.kind === 'prompt') {
        return dialog.options.initialValue ?? '';
    }
    return '';
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
    const queueRef = useRef<DialogRequest[]>([]);
    const activeDialogRef = useRef<DialogRequest | null>(null);
    const [activeDialog, setActiveDialog] = useState<DialogRequest | null>(null);
    const [promptValue, setPromptValue] = useState('');
    const [promptError, setPromptError] = useState<string | null>(null);
    const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

    const activateDialog = useCallback((dialog: DialogRequest | null) => {
        activeDialogRef.current = dialog;
        setPromptValue(getPromptInitialState(dialog));
        setPromptError(null);
        setActiveDialog(dialog);
    }, []);

    const openNextDialog = useCallback(() => {
        activateDialog(queueRef.current.shift() ?? null);
    }, [activateDialog]);

    const enqueueDialog = useCallback((request: DialogRequest) => {
        queueRef.current.push(request);
        if (!activeDialogRef.current) {
            activateDialog(queueRef.current.shift() ?? null);
        }
    }, [activateDialog]);

    const closeActiveDialog = useCallback(() => {
        openNextDialog();
    }, [openNextDialog]);

    const cancelActiveDialog = useCallback(() => {
        if (!activeDialogRef.current) {
            return;
        }
        resolveCancelledRequest(activeDialogRef.current);
        closeActiveDialog();
    }, [closeActiveDialog]);

    const confirmActiveDialog = useCallback(() => {
        const currentDialog = activeDialogRef.current;
        if (!currentDialog) {
            return;
        }

        if (currentDialog.kind === 'alert') {
            currentDialog.resolve();
            closeActiveDialog();
            return;
        }

        if (currentDialog.kind === 'confirm') {
            currentDialog.resolve(true);
            closeActiveDialog();
            return;
        }

        const nextValue = promptValue.trim();
        const allowEmpty = currentDialog.options.allowEmpty ?? false;

        if (!allowEmpty && !nextValue) {
            setPromptError('This field is required.');
            return;
        }

        if (currentDialog.options.validator) {
            const validationError = currentDialog.options.validator(nextValue);
            if (validationError) {
                setPromptError(validationError);
                return;
            }
        }

        currentDialog.resolve(nextValue);
        closeActiveDialog();
    }, [closeActiveDialog, promptValue]);

    const alert = useCallback((options: AlertDialogOptions) => {
        return new Promise<void>((resolve) => {
            enqueueDialog({
                kind: 'alert',
                options,
                resolve,
            });
        });
    }, [enqueueDialog]);

    const confirm = useCallback((options: ConfirmDialogOptions) => {
        return new Promise<boolean>((resolve) => {
            enqueueDialog({
                kind: 'confirm',
                options,
                resolve,
            });
        });
    }, [enqueueDialog]);

    const prompt = useCallback((options: PromptDialogOptions) => {
        return new Promise<string | null>((resolve) => {
            enqueueDialog({
                kind: 'prompt',
                options,
                resolve,
            });
        });
    }, [enqueueDialog]);

    useEffect(() => {
        if (!activeDialog || activeDialog.kind === 'prompt') {
            return;
        }
        primaryButtonRef.current?.focus();
    }, [activeDialog]);

    useEffect(() => {
        if (!activeDialog) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }
            event.preventDefault();
            cancelActiveDialog();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeDialog, cancelActiveDialog]);

    useEffect(() => {
        const queue = queueRef.current;

        return () => {
            const active = activeDialogRef.current;
            if (active) {
                resolveCancelledRequest(active);
            }

            while (queue.length > 0) {
                const next = queue.shift();
                if (next) {
                    resolveCancelledRequest(next);
                }
            }
        };
    }, []);

    const contextValue = useMemo<AppDialogContextValue>(() => ({
        alert,
        confirm,
        prompt,
    }), [alert, confirm, prompt]);

    const isDestructive = activeDialog?.options.tone === 'destructive';
    const showCancelAction = activeDialog?.kind !== 'alert';
    const confirmLabel = activeDialog?.options.confirmText ?? 'Continue';
    const cancelLabel = activeDialog && activeDialog.kind !== 'alert'
        ? activeDialog.options.cancelText ?? 'Cancel'
        : 'Cancel';
    const titleId = activeDialog ? `app-dialog-title-${activeDialog.kind}` : undefined;
    const descriptionId = activeDialog?.options.description ? `app-dialog-description-${activeDialog.kind}` : undefined;

    return (
        <AppDialogContext.Provider value={contextValue}>
            {children}
            {activeDialog ? createPortal(
                <div className="fixed inset-0 z-[120]">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
                        onClick={cancelActiveDialog}
                        aria-hidden="true"
                    />
                    <div className="relative z-10 flex min-h-[100svh] items-center justify-center p-4">
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={titleId}
                            aria-describedby={descriptionId}
                            className={cn(
                                'w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] dark:border-zinc-800 dark:bg-zinc-950',
                                'animate-in fade-in zoom-in-95 duration-150',
                            )}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
                                <h2 id={titleId} className="text-base font-semibold tracking-tight">
                                    {activeDialog.options.title}
                                </h2>
                                {activeDialog.options.description ? (
                                    <p id={descriptionId} className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                                        {activeDialog.options.description}
                                    </p>
                                ) : null}
                            </div>

                            {activeDialog.kind === 'prompt' ? (
                                <form
                                    className="space-y-2 px-6 py-5"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        confirmActiveDialog();
                                    }}
                                >
                                    <Input
                                        autoFocus
                                        value={promptValue}
                                        onChange={(event) => {
                                            setPromptValue(event.target.value);
                                            if (promptError) {
                                                setPromptError(null);
                                            }
                                        }}
                                        placeholder={activeDialog.options.placeholder ?? 'Enter a value'}
                                    />
                                    {promptError ? (
                                        <p className="text-xs text-red-600 dark:text-red-400">{promptError}</p>
                                    ) : null}
                                </form>
                            ) : null}

                            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                                {showCancelAction ? (
                                    <Button type="button" variant="outline" onClick={cancelActiveDialog}>
                                        {cancelLabel}
                                    </Button>
                                ) : null}
                                <Button
                                    ref={primaryButtonRef}
                                    type="button"
                                    variant={isDestructive ? 'destructive' : 'default'}
                                    onClick={confirmActiveDialog}
                                >
                                    {confirmLabel}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}
        </AppDialogContext.Provider>
    );
}
