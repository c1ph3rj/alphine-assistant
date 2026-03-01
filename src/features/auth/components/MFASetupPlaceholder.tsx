import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { authApi } from '../services/AppwriteAuthService';
import { MFAVerifyForm } from './MFAVerifyForm';
import { getPendingAuthFlow, savePendingAuthFlow } from '../utils/pendingAuthFlow';
import { useAuth } from '../state/AuthContext';

export function MFASetupPlaceholder() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [pendingFlow] = useState(() => getPendingAuthFlow());
    const shouldSetupFromPendingFlow =
        pendingFlow?.step === 'mfa_setup_required' && !user?.isMfaEnabled;
    const canSetupFromAuthenticatedContext =
        !pendingFlow && !!user && user.isEmailVerified && !user.isMfaEnabled;
    const shouldRedirectToChallenge =
        pendingFlow?.step === 'mfa_setup_required' && !!user?.isMfaEnabled;
    const isSetupMode = shouldSetupFromPendingFlow || canSetupFromAuthenticatedContext;
    const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string; uri: string } | null>(null);
    const [isLoading, setIsLoading] = useState(isSetupMode);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasInitializedSetup = useRef(false);
    const activeSetupRequest = useRef(0);

    const initializeSetup = useCallback(async (forceRefresh = false) => {
        const requestId = activeSetupRequest.current + 1;
        activeSetupRequest.current = requestId;
        setIsLoading(true);
        setError(null);

        try {
            const data = await authApi.setupMFA({ forceRefresh });
            if (activeSetupRequest.current !== requestId) {
                return;
            }
            setSetupData(data);
        } catch (err: unknown) {
            if (activeSetupRequest.current !== requestId) {
                return;
            }
            setError(err instanceof Error ? err.message : 'Failed to initialize MFA setup');
        } finally {
            if (activeSetupRequest.current === requestId) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!isSetupMode) {
            hasInitializedSetup.current = false;
            setIsLoading(false);
            return;
        }
        if (hasInitializedSetup.current) {
            return;
        }
        hasInitializedSetup.current = true;
        void initializeSetup(false);
    }, [initializeSetup, isSetupMode]);

    useEffect(() => {
        if (!shouldRedirectToChallenge || !user?.email) {
            return;
        }

        let active = true;

        const redirectToChallenge = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const challenge = await authApi.createMFAChallenge();
                if (!active) return;

                savePendingAuthFlow({
                    step: 'mfa_challenge_required',
                    email: user.email,
                    challengeId: challenge.challengeId,
                });
                navigate('/verify-mfa', {
                    replace: true,
                    state: { email: user.email },
                });
            } catch (err: unknown) {
                if (!active) return;
                setError(err instanceof Error ? err.message : 'Unable to start MFA challenge.');
                setIsLoading(false);
            }
        };

        void redirectToChallenge();

        return () => {
            active = false;
        };
    }, [navigate, shouldRedirectToChallenge, user?.email]);

    const copyToClipboard = async () => {
        if (!setupData) return;

        try {
            await navigator.clipboard.writeText(setupData.secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text', err);
        }
    };

    if (!pendingFlow && !canSetupFromAuthenticatedContext) {
        return <Navigate to="/login" replace />;
    }

    if (pendingFlow?.step === 'mfa_challenge_required') {
        return <Navigate to="/verify-mfa" replace />;
    }

    if (pendingFlow?.step === 'email_verification_required') {
        return <Navigate to="/verify-email" replace />;
    }

    if (isLoading) {
        return (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Preparing MFA setup...</p>
            </div>
        );
    }

    if (error || !setupData) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                <p>{error || 'MFA setup failed to initialize.'}</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => void initializeSetup(true)}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Retry setup
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Set up authenticator app</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        Scan the QR code or use the manual key, then verify one code to finish.
                    </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    MFA required
                </span>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Step 1</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Scan this QR code in your authenticator app.</p>
                    <div className="mt-4 flex justify-center rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                        <img
                            src={setupData.qrCodeUrl}
                            alt="MFA QR code"
                            className="h-56 w-56 object-contain sm:h-64 sm:w-64"
                        />
                    </div>
                </section>

                <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Step 2</h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">If needed, enter this manual key in your app.</p>
                    <div className="mt-4 space-y-2">
                        <Label htmlFor="secret" className="sr-only">Secret key</Label>
                        <Input
                            id="secret"
                            value={setupData.secret}
                            readOnly
                            className="h-10 bg-zinc-50 text-center font-mono tracking-[0.2em] dark:bg-zinc-900"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={copyToClipboard}
                            className="h-10 w-full"
                        >
                            {copied ? (
                                <>
                                    <Check className="mr-2 h-4 w-4 text-green-500" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy key
                                </>
                            )}
                        </Button>
                    </div>
                </section>
            </div>

            <section className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        Step 3
                    </h3>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => void initializeSetup(true)}
                        disabled={isLoading}
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Regenerate QR
                    </Button>
                </div>
                <MFAVerifyForm isSetupMode={true} variant="embedded" />
            </section>
        </div>
    );
}
