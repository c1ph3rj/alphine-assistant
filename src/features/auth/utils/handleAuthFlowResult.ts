import type { NavigateFunction } from 'react-router-dom';
import type { AuthFlowResult, User } from '../domain/models';
import { clearPendingAuthFlow, savePendingAuthFlow } from './pendingAuthFlow';

interface HandleAuthFlowResultOptions {
    navigate: NavigateFunction;
    signIn: (user: User) => void;
    emailMessage?: string;
    replace?: boolean;
}

export function handleAuthFlowResult(
    result: AuthFlowResult,
    { navigate, signIn, emailMessage, replace = true }: HandleAuthFlowResultOptions,
) {
    if (result.step === 'authenticated') {
        if (!result.user) {
            throw new Error('Authentication completed without a user profile.');
        }
        clearPendingAuthFlow();
        signIn(result.user);
        navigate('/', { replace: true });
        return;
    }

    if (result.step === 'email_verification_required') {
        savePendingAuthFlow({
            step: 'email_verification_required',
            email: result.email,
        });
        navigate('/verify-email', {
            replace,
            state: {
                email: result.email,
                message: emailMessage,
            },
        });
        return;
    }

    if (result.step === 'mfa_setup_required') {
        savePendingAuthFlow({
            step: 'mfa_setup_required',
            email: result.email,
        });
        navigate('/setup-mfa', {
            replace,
            state: { email: result.email },
        });
        return;
    }

    if (!result.challengeId) {
        throw new Error('MFA challenge is missing. Please sign in again.');
    }

    savePendingAuthFlow({
        step: 'mfa_challenge_required',
        email: result.email,
        challengeId: result.challengeId,
    });

    navigate('/verify-mfa', {
        replace,
        state: { email: result.email },
    });
}

