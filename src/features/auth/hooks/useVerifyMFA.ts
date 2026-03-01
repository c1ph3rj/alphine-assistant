import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { authApi } from '../services/AppwriteAuthService';
import type { VerifyMFAInput } from '../validation/schemas';
import { getPendingAuthFlow } from '../utils/pendingAuthFlow';

export function useVerifyMFA(isSetupMode: boolean = false) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { signIn: finishSignIn } = useAuth();
    const navigate = useNavigate();

    const handleVerify = async (data: VerifyMFAInput) => {
        setIsLoading(true);
        setError(null);
        const normalizedCode = data.code.replace(/\s+/g, '').trim();

        try {
            if (isSetupMode) {
                const user = await authApi.completeMFASetup({ code: normalizedCode });
                finishSignIn(user);
                navigate('/', { replace: true });
                return;
            }

            const pendingFlow = getPendingAuthFlow();
            if (!pendingFlow || pendingFlow.step !== 'mfa_challenge_required' || !pendingFlow.challengeId) {
                navigate('/login', {
                    replace: true,
                    state: { message: 'Your MFA session expired. Please sign in again.' },
                });
                return;
            }

            const user = await authApi.verifyMFA({
                code: normalizedCode,
                challengeId: pendingFlow.challengeId,
            });
            finishSignIn(user);
            navigate('/', { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'MFA verification failed');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        verifyMFA: handleVerify,
        isLoading,
        error,
    };
}
