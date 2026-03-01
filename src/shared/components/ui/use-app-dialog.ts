import { useContext } from 'react';
import { AppDialogContext } from './app-dialog-context';

export function useAppDialog() {
    const context = useContext(AppDialogContext);
    if (!context) {
        throw new Error('useAppDialog must be used within AppDialogProvider.');
    }
    return context;
}
