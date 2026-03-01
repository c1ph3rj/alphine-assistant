type AppwriteErrorLike = {
    type?: string;
    message?: string;
    code?: number;
};

function getErrorType(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    return (error as AppwriteErrorLike).type;
}

export function mapAuthError(error: unknown, fallbackMessage: string): string {
    const type = getErrorType(error);

    switch (type) {
        case 'user_invalid_credentials':
            return 'Invalid email or password.';
        case 'user_not_found':
            return 'No account found with those credentials.';
        case 'user_already_exists':
            return 'An account with this email already exists.';
        case 'user_email_not_whitelisted':
            return 'This email domain is not allowed for this project.';
        case 'user_already_verified':
        case 'user_email_already_verified':
            return 'Your email is already verified. Continuing sign in.';
        case 'user_more_factors_required':
            return 'Additional verification is required. Continue with MFA.';
        case 'user_invalid_token':
            return 'Invalid or expired verification token.';
        case 'general_rate_limit_exceeded':
            return 'Too many attempts. Please wait and try again.';
        case 'mfa_factors_not_found':
            return 'MFA factors are not configured on this account yet.';
        case 'mfa_challenge_not_found':
            return 'MFA challenge expired. Please sign in again.';
        case 'mfa_challenge_expired':
            return 'MFA challenge expired. Please sign in again.';
        case 'mfa_challenge_not_supported':
            return 'This MFA challenge type is not supported for your account.';
        case 'mfa_authenticator_not_found':
            return 'Authenticator setup was not found. Start MFA setup again.';
        case 'mfa_authenticator_already_verified':
            return 'Authenticator is already verified.';
        case 'mfa_invalid_otp':
            return 'Invalid authenticator code.';
        default:
            break;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}

export function isAppwriteErrorType(error: unknown, type: string): boolean {
    return getErrorType(error) === type;
}
