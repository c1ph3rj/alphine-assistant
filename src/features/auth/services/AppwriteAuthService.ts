import {
    AuthenticationFactor,
    AuthenticatorType,
    ID,
    type Models,
    OAuthProvider,
} from 'appwrite';
import type { IAuthService } from '../domain/interfaces';
import type {
    AuthFlowResult,
    User,
} from '../domain/models';
import type {
    RegisterInput,
    ResetPasswordInput,
    SignInInput,
    VerifyMFAInput,
} from '../validation/schemas';
import { appwriteAccount, appwriteAvatars, appwriteStorage } from '@/lib/appwrite';
import { appEnv } from '@/lib/env';
import { mapAuthError, isAppwriteErrorType } from '../utils/authErrors';
import { mapAppwriteUser } from '../utils/mapAppwriteUser';

interface ResolveFlowOptions {
    sendVerificationEmail?: boolean;
    fallbackEmail?: string;
}

interface MfaSetupData {
    secret: string;
    uri: string;
    qrCodeUrl: string;
}

interface ProfileMetadata {
    headline: string;
    bio: string;
    location: string;
    website: string;
    timezone: string;
    avatarUrl: string;
    avatarFileId: string;
}

export class AppwriteAuthService implements IAuthService {
    private readonly profilePrefsKey = 'alphineProfile';
    private readonly profileImageBucketId = appEnv.appwriteProfileBucketId;
    private cachedMfaSetupData: MfaSetupData | null = null;
    private inFlightMfaSetupPromise: Promise<MfaSetupData> | null = null;

    private getRuntimeBaseUrl(): string {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return window.location.origin;
        }
        return appEnv.appBaseUrl;
    }

    private buildAppUrl(path: `/${string}`): string {
        return `${this.getRuntimeBaseUrl()}${path}`;
    }

    private async getNormalizedUserState(): Promise<{
        rawUser: Models.User;
        user: User;
        factors: Models.MfaFactors;
    }> {
        const rawUser = await appwriteAccount.get();
        const factors = await appwriteAccount.listMFAFactors();

        return {
            rawUser,
            factors,
            user: mapAppwriteUser(rawUser, { isMfaEnabled: factors.totp }),
        };
    }

    private async ensureMfaEnabledBestEffort() {
        try {
            await appwriteAccount.updateMFA({ mfa: true });
        } catch (error) {
            // MFA enforcement is a policy objective, but challenge flow should still proceed
            // if server rejects this as already enabled or for transient policy reasons.
            console.warn('Failed to enforce MFA flag before challenge:', error);
        }
    }

    private async createTotpChallenge(): Promise<{ challengeId: string }> {
        const challenge = await appwriteAccount.createMFAChallenge({
            factor: AuthenticationFactor.Totp,
        });
        return { challengeId: challenge.$id };
    }

    private normalizeOtp(code: string): string {
        return code.replace(/\s+/g, '').trim();
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private isSessionUnauthorizedError(error: unknown): boolean {
        return (
            isAppwriteErrorType(error, 'general_unauthorized_scope') ||
            isAppwriteErrorType(error, 'user_unauthorized') ||
            isAppwriteErrorType(error, 'user_session_not_found')
        );
    }

    private getProfileImageBucketIdOrThrow(): string {
        if (!this.profileImageBucketId) {
            throw new Error(
                'Profile image uploads are not configured. Set VITE_APPWRITE_PROFILE_BUCKET_ID in your .env file.',
            );
        }
        return this.profileImageBucketId;
    }

    private validateProfileImageFile(file: File) {
        if (!file.type.startsWith('image/')) {
            throw new Error('Please select a valid image file.');
        }

        const maxSizeBytes = 5 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            throw new Error('Profile image must be 5MB or smaller.');
        }
    }

    private extractProfileMetadataFromPrefs(prefs: unknown): Partial<ProfileMetadata> {
        if (!this.isRecord(prefs)) {
            return {};
        }

        const raw = prefs[this.profilePrefsKey];
        if (!this.isRecord(raw)) {
            return {};
        }

        return {
            headline: typeof raw.headline === 'string' ? raw.headline : undefined,
            bio: typeof raw.bio === 'string' ? raw.bio : undefined,
            location: typeof raw.location === 'string' ? raw.location : undefined,
            website: typeof raw.website === 'string' ? raw.website : undefined,
            timezone: typeof raw.timezone === 'string' ? raw.timezone : undefined,
            avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
            avatarFileId: typeof raw.avatarFileId === 'string' ? raw.avatarFileId : undefined,
        };
    }

    private clearMfaSetupCache() {
        this.cachedMfaSetupData = null;
    }

    private async tryRecoverCompletedMfaSetup(): Promise<User | null> {
        try {
            const state = await this.getNormalizedUserState();
            if (!state.factors.totp) {
                return null;
            }
            await this.ensureMfaEnabledBestEffort();
            this.clearMfaSetupCache();
            return state.user;
        } catch (error) {
            if (
                isAppwriteErrorType(error, 'user_more_factors_required') ||
                isAppwriteErrorType(error, 'general_unauthorized_scope') ||
                isAppwriteErrorType(error, 'user_unauthorized')
            ) {
                return null;
            }
            return null;
        }
    }

    private async tryRecoverCompletedMfaChallenge(): Promise<User | null> {
        try {
            const state = await this.getNormalizedUserState();
            return state.user;
        } catch (error) {
            if (
                isAppwriteErrorType(error, 'user_more_factors_required') ||
                isAppwriteErrorType(error, 'general_unauthorized_scope') ||
                isAppwriteErrorType(error, 'user_unauthorized')
            ) {
                return null;
            }
            return null;
        }
    }

    async signIn(credentials: SignInInput): Promise<AuthFlowResult> {
        try {
            await appwriteAccount.createEmailPasswordSession({
                email: credentials.email.trim(),
                password: credentials.password,
            });
            return await this.resolvePostLoginFlow({
                sendVerificationEmail: true,
                fallbackEmail: credentials.email.trim(),
            });
        } catch (error) {
            if (isAppwriteErrorType(error, 'user_more_factors_required')) {
                return this.resolvePostLoginFlow({
                    sendVerificationEmail: false,
                    fallbackEmail: credentials.email.trim(),
                });
            }
            throw new Error(mapAuthError(error, 'Unable to sign in right now.'));
        }
    }

    async register(data: RegisterInput): Promise<AuthFlowResult> {
        const email = data.email.trim();
        try {
            await appwriteAccount.create({
                userId: ID.unique(),
                email,
                password: data.password,
                name: data.fullName.trim(),
            });
            await appwriteAccount.createEmailPasswordSession({
                email,
                password: data.password,
            });
            return await this.resolvePostLoginFlow({
                sendVerificationEmail: true,
                fallbackEmail: email,
            });
        } catch (error) {
            throw new Error(mapAuthError(error, 'Unable to create your account right now.'));
        }
    }

    async resolvePostLoginFlow(options: ResolveFlowOptions = {}): Promise<AuthFlowResult> {
        const {
            sendVerificationEmail = false,
            fallbackEmail,
        } = options;

        try {
            const state = await this.getNormalizedUserState();
            const email = state.rawUser.email || fallbackEmail;

            if (!state.rawUser.emailVerification) {
                if (sendVerificationEmail) {
                    await appwriteAccount.createEmailVerification({
                        url: this.buildAppUrl('/verify-email'),
                    });
                }

                return {
                    step: 'email_verification_required',
                    email,
                };
            }

            if (!state.factors.totp) {
                return {
                    step: 'mfa_setup_required',
                    email,
                };
            }

            this.clearMfaSetupCache();
            await this.ensureMfaEnabledBestEffort();
            const challenge = await this.createTotpChallenge();

            return {
                step: 'mfa_challenge_required',
                email,
                challengeId: challenge.challengeId,
            };
        } catch (error) {
            if (isAppwriteErrorType(error, 'user_more_factors_required')) {
                try {
                    const challenge = await this.createTotpChallenge();

                    return {
                        step: 'mfa_challenge_required',
                        email: fallbackEmail,
                        challengeId: challenge.challengeId,
                    };
                } catch (challengeError) {
                    throw new Error(
                        mapAuthError(challengeError, 'Unable to start MFA challenge. Please sign in again.'),
                    );
                }
            }

            throw new Error(mapAuthError(error, 'Unable to continue your authentication flow.'));
        }
    }

    async sendEmailVerification(): Promise<void> {
        try {
            await appwriteAccount.createEmailVerification({
                url: this.buildAppUrl('/verify-email'),
            });
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to send verification email.'));
        }
    }

    async completeEmailVerification(params: { userId: string; secret: string }): Promise<AuthFlowResult> {
        try {
            await appwriteAccount.updateEmailVerification({
                userId: params.userId,
                secret: params.secret,
            });
        } catch (error) {
            const alreadyVerifiedError =
                isAppwriteErrorType(error, 'user_already_verified') ||
                isAppwriteErrorType(error, 'user_email_already_verified');

            if (!alreadyVerifiedError) {
                let isVerified = false;

                try {
                    const currentUser = await appwriteAccount.get();
                    isVerified = currentUser.emailVerification;
                } catch (checkError) {
                    if (isAppwriteErrorType(checkError, 'user_more_factors_required')) {
                        isVerified = true;
                    }
                }

                if (!isVerified) {
                    if (isAppwriteErrorType(error, 'user_invalid_token')) {
                        throw new Error('This verification link is invalid or expired. Please request a new one.');
                    }
                    throw new Error(mapAuthError(error, 'Email verification failed.'));
                }
            }
        }

        return this.resolvePostLoginFlow({
            sendVerificationEmail: false,
        });
    }

    async setupMFA(options: { forceRefresh?: boolean } = {}): Promise<MfaSetupData> {
        const forceRefresh = options.forceRefresh ?? false;
        if (forceRefresh) {
            this.clearMfaSetupCache();
        }

        if (this.cachedMfaSetupData) {
            return this.cachedMfaSetupData;
        }

        if (this.inFlightMfaSetupPromise) {
            return this.inFlightMfaSetupPromise;
        }

        const setupPromise = (async () => {
            try {
                const mfaData = await appwriteAccount.createMFAAuthenticator({
                    type: AuthenticatorType.Totp,
                });

                const qrCodeUrl = appwriteAvatars.getQR({
                    text: mfaData.uri,
                    size: 320,
                    margin: 1,
                    download: false,
                });

                const setupData = {
                    secret: mfaData.secret,
                    uri: mfaData.uri,
                    qrCodeUrl,
                };
                this.cachedMfaSetupData = setupData;
                return setupData;
            } catch (error) {
                throw new Error(mapAuthError(error, 'Failed to initialize MFA setup.'));
            } finally {
                this.inFlightMfaSetupPromise = null;
            }
        })();

        this.inFlightMfaSetupPromise = setupPromise;
        return setupPromise;
    }

    async completeMFASetup(data: VerifyMFAInput): Promise<User> {
        const otp = this.normalizeOtp(data.code);

        if (!/^\d{6}$/.test(otp)) {
            throw new Error('Enter a valid 6-digit authenticator code.');
        }

        try {
            await appwriteAccount.updateMFAAuthenticator({
                type: AuthenticatorType.Totp,
                otp,
            });
            await this.ensureMfaEnabledBestEffort();
            const state = await this.getNormalizedUserState();
            this.clearMfaSetupCache();
            return state.user.isMfaEnabled ? state.user : { ...state.user, isMfaEnabled: true };
        } catch (error) {
            if (isAppwriteErrorType(error, 'user_invalid_token')) {
                const recoveredUser = await this.tryRecoverCompletedMfaSetup();
                if (recoveredUser) {
                    return recoveredUser;
                }
                try {
                    await appwriteAccount.get();
                } catch (sessionError) {
                    if (this.isSessionUnauthorizedError(sessionError)) {
                        throw new Error('Your session expired. Sign in again, then restart MFA setup.');
                    }
                }
                this.clearMfaSetupCache();
                throw new Error(
                    'Invalid or expired authenticator token. Regenerate the QR code, scan it again, and enter the latest 6-digit code.',
                );
            }
            if (this.isSessionUnauthorizedError(error)) {
                throw new Error('Your session expired. Sign in again, then restart MFA setup.');
            }
            throw new Error(mapAuthError(error, 'Failed to verify authenticator setup.'));
        }
    }

    async createMFAChallenge(): Promise<{ challengeId: string }> {
        try {
            await this.ensureMfaEnabledBestEffort();
            return await this.createTotpChallenge();
        } catch (error) {
            throw new Error(
                mapAuthError(error, 'Unable to start MFA challenge. Please sign in again.'),
            );
        }
    }

    async verifyMFA(data: VerifyMFAInput & { challengeId: string }): Promise<User> {
        const otp = this.normalizeOtp(data.code);

        if (!/^\d{6}$/.test(otp)) {
            throw new Error('Enter a valid 6-digit authenticator code.');
        }

        try {
            await appwriteAccount.updateMFAChallenge({
                challengeId: data.challengeId,
                otp,
            });
            const state = await this.getNormalizedUserState();
            return state.user;
        } catch (error) {
            if (isAppwriteErrorType(error, 'user_invalid_token')) {
                const recoveredUser = await this.tryRecoverCompletedMfaChallenge();
                if (recoveredUser) {
                    return recoveredUser;
                }
                throw new Error('Invalid authenticator code. Please try again.');
            }
            throw new Error(mapAuthError(error, 'MFA verification failed.'));
        }
    }

    async signOut(): Promise<void> {
        try {
            await appwriteAccount.deleteSession({ sessionId: 'current' });
        } catch (error) {
            if (
                isAppwriteErrorType(error, 'user_session_not_found') ||
                isAppwriteErrorType(error, 'general_unauthorized_scope') ||
                isAppwriteErrorType(error, 'user_unauthorized')
            ) {
                return;
            }
            throw new Error(mapAuthError(error, 'Failed to sign out.'));
        } finally {
            this.clearMfaSetupCache();
        }
    }

    async deleteAccount(): Promise<void> {
        throw new Error('Account deletion is currently unavailable.');
    }

    async signOutOtherSessions(): Promise<void> {
        try {
            const list = await appwriteAccount.listSessions();
            const otherSessions = list.sessions.filter((session) => !session.current);
            await Promise.all(
                otherSessions.map((session) =>
                    appwriteAccount.deleteSession({ sessionId: session.$id }),
                ),
            );
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to sign out from other sessions.'));
        }
    }

    async initiateGoogleSignIn(): Promise<void> {
        try {
            appwriteAccount.createOAuth2Session({
                provider: OAuthProvider.Google,
                success: this.buildAppUrl('/oauth-callback'),
                failure: this.buildAppUrl('/login?oauth=failed'),
            });
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to start Google sign-in.'));
        }
    }

    async forgotPassword(email: string): Promise<void> {
        try {
            await appwriteAccount.createRecovery({
                email: email.trim(),
                url: this.buildAppUrl('/reset-password'),
            });
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to send password reset email.'));
        }
    }

    async resetPassword(data: ResetPasswordInput & { userId: string; secret: string }): Promise<void> {
        try {
            await appwriteAccount.updateRecovery({
                userId: data.userId,
                secret: data.secret,
                password: data.password,
            });
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to reset password.'));
        }
    }

    async uploadProfileImage(file: File): Promise<{ avatarUrl: string; avatarFileId: string }> {
        this.validateProfileImageFile(file);

        const bucketId = this.getProfileImageBucketIdOrThrow();

        try {
            const createdFile = await appwriteStorage.createFile({
                bucketId,
                fileId: ID.unique(),
                file,
            });

            const avatarUrl = appwriteStorage.getFileView({
                bucketId,
                fileId: createdFile.$id,
            });

            return {
                avatarUrl,
                avatarFileId: createdFile.$id,
            };
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to upload profile image.'));
        }
    }

    async deleteProfileImage(fileId: string): Promise<void> {
        const normalizedFileId = fileId.trim();
        if (!normalizedFileId) {
            return;
        }

        const bucketId = this.getProfileImageBucketIdOrThrow();
        try {
            await appwriteStorage.deleteFile({
                bucketId,
                fileId: normalizedFileId,
            });
        } catch (error) {
            if (isAppwriteErrorType(error, 'storage_file_not_found')) {
                return;
            }
            throw new Error(mapAuthError(error, 'Failed to delete profile image.'));
        }
    }

    async getProfileMetadata(): Promise<{
        headline?: string;
        bio?: string;
        location?: string;
        website?: string;
        timezone?: string;
        avatarUrl?: string;
        avatarFileId?: string;
    }> {
        try {
            const prefs = await appwriteAccount.getPrefs<Record<string, unknown>>();
            return this.extractProfileMetadataFromPrefs(prefs);
        } catch (error) {
            if (
                this.isSessionUnauthorizedError(error) ||
                isAppwriteErrorType(error, 'user_more_factors_required')
            ) {
                return {};
            }
            throw new Error(mapAuthError(error, 'Failed to load profile metadata.'));
        }
    }

    async updateProfile(data: {
        fullName: string;
        headline: string;
        bio: string;
        location: string;
        website: string;
        timezone: string;
        avatarUrl: string;
        avatarFileId: string;
    }): Promise<User> {
        const fullName = data.fullName.trim();
        if (!fullName) {
            throw new Error('Full name is required.');
        }

        // Validate the website URL at the service layer so callers other than the
        // settings page form cannot bypass the protocol restriction.
        const website = data.website.trim();
        if (website) {
            try {
                const parsed = new URL(website);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    throw new Error('Website URL must use http or https.');
                }
            } catch (urlError) {
                if (urlError instanceof Error && urlError.message.includes('http')) {
                    throw urlError;
                }
                throw new Error('Website must be a valid URL starting with http:// or https://.');
            }
        }

        const metadata: ProfileMetadata = {
            headline: data.headline.trim(),
            bio: data.bio.trim(),
            location: data.location.trim(),
            website,
            timezone: data.timezone.trim(),
            avatarUrl: data.avatarUrl.trim(),
            avatarFileId: data.avatarFileId.trim(),
        };

        try {
            const currentUser = await appwriteAccount.get();
            if (currentUser.name !== fullName) {
                await appwriteAccount.updateName({ name: fullName });
            }

            const prefs = await appwriteAccount.getPrefs<Record<string, unknown>>();
            const previousMetadata = this.extractProfileMetadataFromPrefs(prefs);
            const previousAvatarFileId = previousMetadata.avatarFileId?.trim() ?? '';
            const nextPrefs: Record<string, unknown> = this.isRecord(prefs) ? { ...prefs } : {};
            nextPrefs[this.profilePrefsKey] = metadata;
            await appwriteAccount.updatePrefs<Record<string, unknown>>({
                prefs: nextPrefs,
            });

            const state = await this.getNormalizedUserState();
            if (
                previousAvatarFileId &&
                previousAvatarFileId !== metadata.avatarFileId &&
                this.profileImageBucketId
            ) {
                try {
                    await this.deleteProfileImage(previousAvatarFileId);
                } catch (cleanupError) {
                    console.warn('Failed to clean up replaced profile image:', cleanupError);
                }
            }
            return {
                ...state.user,
                fullName,
                avatarUrl: metadata.avatarUrl || undefined,
            };
        } catch (error) {
            throw new Error(mapAuthError(error, 'Failed to update profile.'));
        }
    }

    async getCurrentUser(): Promise<User | null> {
        try {
            const state = await this.getNormalizedUserState();
            let avatarUrl: string | undefined;

            try {
                const metadata = await this.getProfileMetadata();
                avatarUrl = metadata.avatarUrl;
            } catch (metadataError) {
                console.warn('Failed to load avatar metadata while fetching current user:', metadataError);
            }

            return {
                ...state.user,
                avatarUrl,
            };
        } catch (error) {
            if (
                isAppwriteErrorType(error, 'general_unauthorized_scope') ||
                isAppwriteErrorType(error, 'user_unauthorized')
            ) {
                return null;
            }
            if (error instanceof Error && error.message.includes('missing scope (account)')) {
                return null;
            }
            throw new Error(mapAuthError(error, 'Failed to fetch current user.'));
        }
    }
}

export const authApi = new AppwriteAuthService();
