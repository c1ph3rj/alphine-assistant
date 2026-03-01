import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/AppwriteAuthService';
import type { RegisterInput } from '../validation/schemas';
import { useAuth } from '../state/AuthContext';
import { handleAuthFlowResult } from '../utils/handleAuthFlowResult';

export function useRegister() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { signIn: finishSignIn } = useAuth();

    const handleRegister = async (data: RegisterInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await authApi.register(data);
            handleAuthFlowResult(result, {
                navigate,
                signIn: finishSignIn,
                emailMessage: 'Account created successfully. Please check your inbox to verify your email.',
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred during registration');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        registerUser: handleRegister,
        isLoading,
        error,
    };
}
