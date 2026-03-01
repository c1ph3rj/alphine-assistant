import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, Link, Navigate } from 'react-router-dom';

import { Button } from '@/shared/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';

import { useVerifyOTP } from '../hooks/useVerifyOTP';
import { getPendingAuthFlow } from '../utils/pendingAuthFlow';
import { useAuth } from '../state/AuthContext';

export function OTPForm() {
    const location = useLocation();
    const pendingFlow = getPendingAuthFlow();
    const { user } = useAuth();
    const email = (location.state?.email as string | undefined) || pendingFlow?.email || user?.email;
    const message = location.state?.message as string | undefined;
    const query = new URLSearchParams(location.search);
    const userId = query.get('userId');
    const secret = query.get('secret');

    const {
        completeVerificationFromLink,
        resendVerification,
        isLoading,
        isProcessingCallback,
        error,
        countdown,
        canResend,
    } = useVerifyOTP(email || null);

    useEffect(() => {
        if (!userId || !secret) return;
        void completeVerificationFromLink({ userId, secret });
    }, [completeVerificationFromLink, secret, userId]);

    // If this page is stale after verification (for example, refreshed old tab),
    // continue to the next required step instead of staying on verify-email.
    if (user?.isEmailVerified) {
        if (!user.isMfaEnabled) {
            return <Navigate to="/setup-mfa" replace state={{ email: user.email }} />;
        }
        return <Navigate to="/" replace />;
    }

    if (!email && !userId && !secret) {
        return <Navigate to="/login" replace />;
    }

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Verify email
                </CardTitle>
                <CardDescription>
                    {email
                        ? <>Use the link sent to <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span> to continue.</>
                        : 'Use the verification link from your inbox to continue.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {message && (
                    <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
                        {message}
                    </div>
                )}

                {isProcessingCallback ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Completing email verification...
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                            Open the verification email and click the secure link. Return here after completion.
                        </div>

                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                                {error}
                            </div>
                        )}

                        <Button
                            type="button"
                            className="h-10 w-full"
                            onClick={resendVerification}
                            disabled={isLoading || !canResend}
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {canResend ? 'Resend verification email' : `Resend in ${countdown}s`}
                        </Button>
                    </div>
                )}

                <div className="mt-6 text-center text-sm">
                    <Link
                        to="/login"
                        className="text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
                    >
                        Back to sign in
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
