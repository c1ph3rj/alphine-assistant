import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/AppwriteAuthService';
import { useAuth } from '../state/AuthContext';
import { handleAuthFlowResult } from '../utils/handleAuthFlowResult';

const inFlightVerificationCallbacks = new Map<string, Promise<void>>();

export function useVerifyOTP(email: string | null) {
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingCallback, setIsProcessingCallback] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(30);
    const [canResend, setCanResend] = useState(false);
    const navigate = useNavigate();
    const { signIn: finishSignIn } = useAuth();

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (countdown > 0 && !canResend) {
            timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
        } else if (countdown === 0) {
            setCanResend(true);
        }
        return () => clearTimeout(timer);
    }, [countdown, canResend]);

    const completeVerificationFromLink = useCallback(async (params: { userId: string; secret: string }) => {
        const callbackKey = `${params.userId}:${params.secret}`;

        const existingTask = inFlightVerificationCallbacks.get(callbackKey);
        if (existingTask) {
            await existingTask;
            return;
        }

        setIsProcessingCallback(true);
        setError(null);

        const task = (async () => {
            try {
                const result = await authApi.completeEmailVerification(params);
                handleAuthFlowResult(result, {
                    navigate,
                    signIn: finishSignIn,
                });
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Email verification failed');
            } finally {
                setIsProcessingCallback(false);
            }
        })();

        inFlightVerificationCallbacks.set(callbackKey, task);

        try {
            await task;
        } finally {
            inFlightVerificationCallbacks.delete(callbackKey);
        }
    }, [finishSignIn, navigate]);

    const handleResend = useCallback(async () => {
        if (!canResend) return;

        setIsLoading(true);
        setError(null);
        try {
            await authApi.sendEmailVerification();
            setCountdown(30);
            setCanResend(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to resend verification email');
        } finally {
            setIsLoading(false);
        }
    }, [canResend]);

    return {
        email,
        completeVerificationFromLink,
        resendVerification: handleResend,
        isLoading,
        isProcessingCallback,
        error,
        countdown,
        canResend,
    };
}
