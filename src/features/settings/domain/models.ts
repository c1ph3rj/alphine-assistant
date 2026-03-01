export type ThemePreference = 'system' | 'light' | 'dark';

export type MessageDensity = 'comfortable' | 'compact';
export type AIProvider = 'openrouter' | 'google';

export interface ProfileSettings {
    fullName: string;
    headline: string;
    bio: string;
    location: string;
    website: string;
    timezone: string;
    avatarUrl: string;
    avatarFileId: string;
}

export interface PreferenceSettings {
    theme: ThemePreference;
    messageDensity: MessageDensity;
    enterToSend: boolean;
    autoTitleChats: boolean;
}

export interface NotificationSettings {
    mentionEmails: boolean;
    productUpdates: boolean;
    securityAlerts: boolean;
    weeklyDigest: boolean;
}

export interface SecuritySettings {
    sessionTimeoutMinutes: 30 | 60 | 120;
    trustedDevicesOnly: boolean;
}

export interface AIProviderSettings {
    apiKey: string;
    model: string;
}

export interface AISettings {
    provider: AIProvider;
    systemInstruction: string;
    openRouter: AIProviderSettings;
    google: AIProviderSettings;
}

export interface UserSettings {
    profile: ProfileSettings;
    preferences: PreferenceSettings;
    notifications: NotificationSettings;
    security: SecuritySettings;
    ai: AISettings;
    updatedAt: string;
}
