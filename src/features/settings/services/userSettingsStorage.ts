import type { User } from '@/features/auth/domain/models';
import { appwriteAccount } from '@/lib/appwrite';
import type { AIProvider, MessageDensity, ThemePreference, UserSettings, AISettings } from '../domain/models';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../domain/defaultSystemInstruction';

const STORAGE_KEY_PREFIX = 'alphine:user-settings:';
const PUBLIC_THEME_STORAGE_KEY = 'alphine:public-theme';
const REMOTE_SETTINGS_PREFS_KEY = 'alphineSettings';
const MAX_SYSTEM_INSTRUCTION_CHARS = 4000;

function getStorageKey(userId: string) {
    return `${STORAGE_KEY_PREFIX}${userId}`;
}

function sanitizeTheme(theme: unknown): ThemePreference {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
        return theme;
    }
    return 'system';
}

function sanitizeDensity(value: unknown): MessageDensity {
    if (value === 'compact' || value === 'comfortable') {
        return value;
    }
    return 'comfortable';
}

function sanitizeSessionTimeout(value: unknown): 30 | 60 | 120 {
    if (value === 30 || value === 60 || value === 120) {
        return value;
    }
    return 60;
}

function sanitizeProvider(value: unknown): AIProvider {
    if (value === 'openrouter' || value === 'google') {
        return value;
    }
    return 'openrouter';
}

function sanitizeAIProviderSettings(value: unknown, defaults: { apiKey: string; model: string }) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return defaults;
    }

    const parsed = value as Partial<{ apiKey: string; model: string }>;
    return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : defaults.apiKey,
        model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : defaults.model,
    };
}

function sanitizeSystemInstruction(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_SYSTEM_INSTRUCTION;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_SYSTEM_INSTRUCTION;
    }

    return trimmed.slice(0, MAX_SYSTEM_INSTRUCTION_CHARS);
}

function sanitizeAISettings(value: unknown): AISettings {
    const defaults: AISettings = {
        provider: 'openrouter',
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        openRouter: {
            apiKey: '',
            model: 'openai/gpt-4o-mini',
        },
        google: {
            apiKey: '',
            model: 'gemini-2.0-flash',
        },
    };

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return defaults;
    }

    const parsed = value as Partial<AISettings>;
    return {
        provider: sanitizeProvider(parsed.provider),
        systemInstruction: sanitizeSystemInstruction(parsed.systemInstruction),
        openRouter: sanitizeAIProviderSettings(parsed.openRouter, defaults.openRouter),
        google: sanitizeAIProviderSettings(parsed.google, defaults.google),
    };
}

/**
 * Returns a copy of settings with API keys removed.
 * API keys are sensitive secrets and must never be cached in localStorage
 * where they are accessible to any JavaScript running on the page (XSS risk).
 * The authoritative copy is always the remote Appwrite user prefs.
 */
function stripApiKeys(settings: UserSettings): UserSettings {
    return {
        ...settings,
        ai: {
            ...settings.ai,
            openRouter: { ...settings.ai.openRouter, apiKey: '' },
            google: { ...settings.ai.google, apiKey: '' },
        },
    };
}

function buildDefaultSettings(user: User): UserSettings {
    return {
        profile: {
            fullName: user.fullName,
            headline: 'Product Engineer',
            bio: 'Building thoughtful AI workflows with Alphine.',
            location: 'Remote',
            website: '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            avatarUrl: '',
            avatarFileId: '',
        },
        preferences: {
            theme: 'system',
            messageDensity: 'comfortable',
            enterToSend: true,
            autoTitleChats: true,
        },
        notifications: {
            mentionEmails: true,
            productUpdates: true,
            securityAlerts: true,
            weeklyDigest: false,
        },
        security: {
            sessionTimeoutMinutes: 60,
            trustedDevicesOnly: false,
        },
        ai: sanitizeAISettings(null),
        updatedAt: new Date().toISOString(),
    };
}

function readSettingsFromStorage(user: User): UserSettings {
    const defaults = buildDefaultSettings(user);
    const raw = localStorage.getItem(getStorageKey(user.id));

    if (!raw) {
        return defaults;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<UserSettings>;

        return {
            profile: {
                fullName: parsed.profile?.fullName ?? defaults.profile.fullName,
                headline: parsed.profile?.headline ?? defaults.profile.headline,
                bio: parsed.profile?.bio ?? defaults.profile.bio,
                location: parsed.profile?.location ?? defaults.profile.location,
                website: parsed.profile?.website ?? defaults.profile.website,
                timezone: parsed.profile?.timezone ?? defaults.profile.timezone,
                avatarUrl: parsed.profile?.avatarUrl ?? defaults.profile.avatarUrl,
                avatarFileId: parsed.profile?.avatarFileId ?? defaults.profile.avatarFileId,
            },
            preferences: {
                theme: sanitizeTheme(parsed.preferences?.theme),
                messageDensity: sanitizeDensity(parsed.preferences?.messageDensity),
                enterToSend: parsed.preferences?.enterToSend ?? defaults.preferences.enterToSend,
                autoTitleChats: parsed.preferences?.autoTitleChats ?? defaults.preferences.autoTitleChats,
            },
            notifications: {
                mentionEmails: parsed.notifications?.mentionEmails ?? defaults.notifications.mentionEmails,
                productUpdates: parsed.notifications?.productUpdates ?? defaults.notifications.productUpdates,
                securityAlerts: parsed.notifications?.securityAlerts ?? defaults.notifications.securityAlerts,
                weeklyDigest: parsed.notifications?.weeklyDigest ?? defaults.notifications.weeklyDigest,
            },
            security: {
                sessionTimeoutMinutes: sanitizeSessionTimeout(parsed.security?.sessionTimeoutMinutes),
                trustedDevicesOnly: parsed.security?.trustedDevicesOnly ?? defaults.security.trustedDevicesOnly,
            },
            ai: sanitizeAISettings(parsed.ai),
            updatedAt: parsed.updatedAt ?? defaults.updatedAt,
        };
    } catch {
        localStorage.removeItem(getStorageKey(user.id));
        return defaults;
    }
}

function toValidDateOrEpoch(value: string | undefined): Date {
    if (!value) {
        return new Date(0);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return new Date(0);
    }

    return date;
}

function mergePrefs(
    current: unknown,
    nextSettings: UserSettings,
): Record<string, unknown> {
    const base = (typeof current === 'object' && current !== null && !Array.isArray(current))
        ? { ...(current as Record<string, unknown>) }
        : {};

    base[REMOTE_SETTINGS_PREFS_KEY] = nextSettings;
    return base;
}

async function readSettingsFromRemote(user: User): Promise<UserSettings | null> {
    try {
        const prefs = await appwriteAccount.getPrefs<Record<string, unknown>>();
        const raw = prefs[REMOTE_SETTINGS_PREFS_KEY];

        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            return null;
        }

        const parsed = raw as Partial<UserSettings>;
        const sanitized: UserSettings = {
            profile: {
                fullName: parsed.profile?.fullName ?? user.fullName,
                headline: parsed.profile?.headline ?? 'Product Engineer',
                bio: parsed.profile?.bio ?? 'Building thoughtful AI workflows with Alphine.',
                location: parsed.profile?.location ?? 'Remote',
                website: parsed.profile?.website ?? '',
                timezone: parsed.profile?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
                avatarUrl: parsed.profile?.avatarUrl ?? '',
                avatarFileId: parsed.profile?.avatarFileId ?? '',
            },
            preferences: {
                theme: sanitizeTheme(parsed.preferences?.theme),
                messageDensity: sanitizeDensity(parsed.preferences?.messageDensity),
                enterToSend: parsed.preferences?.enterToSend ?? true,
                autoTitleChats: parsed.preferences?.autoTitleChats ?? true,
            },
            notifications: {
                mentionEmails: parsed.notifications?.mentionEmails ?? true,
                productUpdates: parsed.notifications?.productUpdates ?? true,
                securityAlerts: parsed.notifications?.securityAlerts ?? true,
                weeklyDigest: parsed.notifications?.weeklyDigest ?? false,
            },
            security: {
                sessionTimeoutMinutes: sanitizeSessionTimeout(parsed.security?.sessionTimeoutMinutes),
                trustedDevicesOnly: parsed.security?.trustedDevicesOnly ?? false,
            },
            ai: sanitizeAISettings(parsed.ai),
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        };

        return sanitized;
    } catch {
        return null;
    }
}

async function writeSettingsToRemote(nextSettings: UserSettings): Promise<void> {
    const currentPrefs = await appwriteAccount.getPrefs<Record<string, unknown>>();
    const mergedPrefs = mergePrefs(currentPrefs, nextSettings);
    await appwriteAccount.updatePrefs<Record<string, unknown>>({
        prefs: mergedPrefs,
    });
}

export async function getUserSettings(user: User): Promise<UserSettings> {
    const localSettings = readSettingsFromStorage(user);
    const remoteSettings = await readSettingsFromRemote(user);

    if (!remoteSettings) {
        return localSettings;
    }

    const localDate = toValidDateOrEpoch(localSettings.updatedAt);
    const remoteDate = toValidDateOrEpoch(remoteSettings.updatedAt);

    if (remoteDate >= localDate) {
        // Strip API keys before caching in localStorage — keys live only in remote prefs.
        localStorage.setItem(getStorageKey(user.id), JSON.stringify(stripApiKeys(remoteSettings)));
        return remoteSettings;
    }

    // Local is newer: push it to remote to keep devices in sync.
    // Preserve API keys from remote so we never overwrite them with empty values.
    const settingsToSync: UserSettings = {
        ...localSettings,
        ai: {
            ...localSettings.ai,
            openRouter: {
                ...localSettings.ai.openRouter,
                apiKey: remoteSettings.ai.openRouter.apiKey || localSettings.ai.openRouter.apiKey,
            },
            google: {
                ...localSettings.ai.google,
                apiKey: remoteSettings.ai.google.apiKey || localSettings.ai.google.apiKey,
            },
        },
    };
    try {
        await writeSettingsToRemote(settingsToSync);
    } catch (error) {
        console.warn('Failed to sync local settings to Appwrite prefs.', error);
    }
    return settingsToSync;
}

export async function saveUserSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
    const normalized: UserSettings = {
        ...settings,
        preferences: {
            ...settings.preferences,
            theme: sanitizeTheme(settings.preferences.theme),
            messageDensity: sanitizeDensity(settings.preferences.messageDensity),
        },
        security: {
            ...settings.security,
            sessionTimeoutMinutes: sanitizeSessionTimeout(settings.security.sessionTimeoutMinutes),
        },
        ai: sanitizeAISettings(settings.ai),
        updatedAt: new Date().toISOString(),
    };

    await writeSettingsToRemote(normalized);
    // Strip API keys before persisting locally — remote prefs are the authoritative store for secrets.
    localStorage.setItem(getStorageKey(userId), JSON.stringify(stripApiKeys(normalized)));
    return normalized;
}

export async function resetUserSettings(user: User): Promise<UserSettings> {
    const defaults = buildDefaultSettings(user);
    return saveUserSettings(user.id, defaults);
}

export function getStoredThemePreference(userId: string): ThemePreference | null {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<UserSettings>;
        return sanitizeTheme(parsed.preferences?.theme);
    } catch {
        localStorage.removeItem(getStorageKey(userId));
        return null;
    }
}

export function getStoredPublicThemePreference(): ThemePreference | null {
    const raw = localStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
    if (!raw) {
        return null;
    }
    return sanitizeTheme(raw);
}

export function setStoredPublicThemePreference(theme: ThemePreference) {
    localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, sanitizeTheme(theme));
}

export function getStoredAiSettings(userId: string): AISettings {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
        return sanitizeAISettings(null);
    }

    try {
        const parsed = JSON.parse(raw) as Partial<UserSettings>;
        return sanitizeAISettings(parsed.ai);
    } catch {
        return sanitizeAISettings(null);
    }
}

async function readRemoteAiSettings(): Promise<AISettings | null> {
    try {
        const prefs = await appwriteAccount.getPrefs<Record<string, unknown>>();
        const raw = prefs[REMOTE_SETTINGS_PREFS_KEY];

        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            return null;
        }

        const parsed = raw as Partial<UserSettings>;
        return sanitizeAISettings(parsed.ai);
    } catch {
        return null;
    }
}

function syncLocalAiSettings(userId: string, aiSettings: AISettings) {
    const storageKey = getStorageKey(userId);
    // Strip API keys — never cache secrets in localStorage.
    const safeAi: AISettings = {
        ...aiSettings,
        openRouter: { ...aiSettings.openRouter, apiKey: '' },
        google: { ...aiSettings.google, apiKey: '' },
    };

    try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        parsed.ai = safeAi;
        parsed.updatedAt = new Date().toISOString();
        localStorage.setItem(storageKey, JSON.stringify(parsed));
    } catch {
        localStorage.setItem(storageKey, JSON.stringify({
            ai: safeAi,
            updatedAt: new Date().toISOString(),
        }));
    }
}

export async function getSyncedAiSettings(userId: string): Promise<AISettings> {
    const localAi = getStoredAiSettings(userId);
    const remoteAi = await readRemoteAiSettings();

    if (!remoteAi) {
        return localAi;
    }

    syncLocalAiSettings(userId, remoteAi);
    return remoteAi;
}
