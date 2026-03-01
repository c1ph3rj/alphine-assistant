import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { authApi } from '../services/AppwriteAuthService';
import { useAuth } from '../state/AuthContext';
import { handleAuthFlowResult } from '../utils/handleAuthFlowResult';

export function OAuthCallbackPage() {
    const navigate = useNavigate();
    const { signIn: finishSignIn } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const completeOAuth = async () => {
            try {
                const result = await authApi.resolvePostLoginFlow({
                    sendVerificationEmail: true,
                });
                if (!active) return;
                handleAuthFlowResult(result, {
                    navigate,
                    signIn: finishSignIn,
                });
            } catch (err: unknown) {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Google sign in failed.';
                setError(message);
                navigate('/login', {
                    replace: true,
                    state: { message },
                });
            }
        };

        void completeOAuth();

        return () => {
            active = false;
        };
    }, [finishSignIn, navigate]);

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Completing sign in
                </CardTitle>
                <CardDescription>
                    Finalizing your Google authentication flow.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing callback...
                </div>
                {error && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
            </CardContent>
        </Card>
    );
}

