import { createContext } from 'react';

type DialogTone = 'default' | 'destructive';

interface BaseDialogOptions {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    tone?: DialogTone;
}

export type ConfirmDialogOptions = BaseDialogOptions;

export type PromptDialogOptions = BaseDialogOptions & {
    placeholder?: string;
    initialValue?: string;
    allowEmpty?: boolean;
    validator?: (value: string) => string | null;
};

export type AlertDialogOptions = Omit<BaseDialogOptions, 'cancelText'>;

export interface AppDialogContextValue {
    alert: (options: AlertDialogOptions) => Promise<void>;
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
    prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

type AlertDialogRequest = {
    kind: 'alert';
    options: AlertDialogOptions;
    resolve: () => void;
};

type ConfirmDialogRequest = {
    kind: 'confirm';
    options: ConfirmDialogOptions;
    resolve: (value: boolean) => void;
};

type PromptDialogRequest = {
    kind: 'prompt';
    options: PromptDialogOptions;
    resolve: (value: string | null) => void;
};

export type DialogRequest = AlertDialogRequest | ConfirmDialogRequest | PromptDialogRequest;

export const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);

export function resolveCancelledRequest(request: DialogRequest) {
    if (request.kind === 'alert') {
        request.resolve();
        return;
    }

    if (request.kind === 'confirm') {
        request.resolve(false);
        return;
    }

    request.resolve(null);
}
