import type { AuthFlowResult, User } from './models';
import type {
    SignInInput,
    RegisterInput,
    VerifyMFAInput,
    ResetPasswordInput
} from '../validation/schemas';

export interface IAuthService {
    /** Authenticate user with email and password */
    signIn(credentials: SignInInput): Promise<AuthFlowResult>;

    /** Register a new user */
    register(data: RegisterInput): Promise<AuthFlowResult>;

    /** Continue flow after OAuth or completed email verification */
    resolvePostLoginFlow(options?: {
        sendVerificationEmail?: boolean;
        fallbackEmail?: string;
    }): Promise<AuthFlowResult>;

    /** Send email verification link to current user */
    sendEmailVerification(): Promise<void>;

    /** Complete email verification from callback params */
    completeEmailVerification(params: { userId: string; secret: string }): Promise<AuthFlowResult>;

    /** Begin setup for authenticator app (MFA) */
    setupMFA(options?: { forceRefresh?: boolean }): Promise<{ secret: string; uri: string; qrCodeUrl: string }>;

    /** Verify TOTP and complete setup */
    completeMFASetup(data: VerifyMFAInput): Promise<User>;

    /** Begin TOTP challenge for sign-in */
    createMFAChallenge(): Promise<{ challengeId: string }>;

    /** Verify MFA challenge and complete sign-in */
    verifyMFA(data: VerifyMFAInput & { challengeId: string }): Promise<User>;

    /** Sign out current user */
    signOut(): Promise<void>;

    /** Delete current user account */
    deleteAccount(): Promise<void>;

    /** Sign out all other user sessions */
    signOutOtherSessions(): Promise<void>;

    /** Initiate OAuth flow for Google */
    initiateGoogleSignIn(): Promise<void>;

    /** Trigger forgot password flow */
    forgotPassword(email: string): Promise<void>;

    /** Complete password reset */
    resetPassword(data: ResetPasswordInput & { userId: string; secret: string }): Promise<void>;

    /** Get current authenticated user profile */
    getCurrentUser(): Promise<User | null>;

    /** Read profile metadata stored in user prefs */
    getProfileMetadata(): Promise<{
        headline?: string;
        bio?: string;
        location?: string;
        website?: string;
        timezone?: string;
        avatarUrl?: string;
        avatarFileId?: string;
    }>;

    /** Update user profile on Appwrite (name + profile metadata prefs) */
    updateProfile(data: {
        fullName: string;
        headline: string;
        bio: string;
        location: string;
        website: string;
        timezone: string;
        avatarUrl: string;
        avatarFileId: string;
    }): Promise<User>;

    /** Upload a profile image to Appwrite storage */
    uploadProfileImage(file: File): Promise<{ avatarUrl: string; avatarFileId: string }>;

    /** Delete a profile image from Appwrite storage */
    deleteProfileImage(fileId: string): Promise<void>;
}
