import { useState } from 'react';
import { authApi } from '../services/AppwriteAuthService';
import type { SignInInput } from '../validation/schemas';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { handleAuthFlowResult } from '../utils/handleAuthFlowResult';

export function useSignIn() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { signIn: finishSignIn } = useAuth();

    const handleSignIn = async (data: SignInInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await authApi.signIn(data);
            handleAuthFlowResult(result, {
                navigate,
                signIn: finishSignIn,
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred during sign in');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        signIn: handleSignIn,
        isLoading,
        error,
    };
}
