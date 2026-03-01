export interface User {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    isEmailVerified: boolean;
    isMfaEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export type AuthFlowStep =
    | 'email_verification_required'
    | 'mfa_setup_required'
    | 'mfa_challenge_required'
    | 'authenticated';

export interface AuthFlowResult {
    step: AuthFlowStep;
    email?: string;
    challengeId?: string;
    user?: User;
}

export interface PendingAuthFlow {
    step: Exclude<AuthFlowStep, 'authenticated'>;
    email?: string;
    challengeId?: string;
}
