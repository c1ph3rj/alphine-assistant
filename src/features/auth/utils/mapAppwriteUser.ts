import type { Models } from 'appwrite';
import type { User } from '../domain/models';

export function mapAppwriteUser(
    user: Models.User,
    options?: { isMfaEnabled?: boolean; avatarUrl?: string },
): User {
    const fallbackName = user.email ? user.email.split('@')[0] : 'User';

    return {
        id: user.$id,
        email: user.email,
        fullName: user.name || fallbackName,
        avatarUrl: options?.avatarUrl,
        isEmailVerified: user.emailVerification,
        isMfaEnabled: options?.isMfaEnabled ?? user.mfa,
        createdAt: user.$createdAt,
        updatedAt: user.$updatedAt,
    };
}
