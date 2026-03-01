import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from 'react';
import {
    ArrowLeft,
    Bell,
    CheckCircle2,
    ImageMinus,
    ImagePlus,
    Loader2,
    LockKeyhole,
    LogOut,
    Monitor,
    Moon,
    RotateCcw,
    Save,
    ShieldCheck,
    SlidersHorizontal,
    Sun,
    UserRound,
} from 'lucide-react';
import { Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/features/auth/state/AuthContext';
import { authApi } from '@/features/auth/services/AppwriteAuthService';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useAppDialog } from '@/shared/components/ui/use-app-dialog';

import type { UserSettings } from '../domain/models';
import { DEFAULT_SYSTEM_INSTRUCTION } from '../domain/defaultSystemInstruction';
import { getUserSettings, resetUserSettings, saveUserSettings } from '../services/userSettingsStorage';
import { applyThemePreference } from '../services/themeService';

type SettingsSectionId = 'profile' | 'preferences' | 'notifications' | 'account';
type NoticeTone = 'success' | 'error';

interface NoticeState {
    tone: NoticeTone;
    text: string;
}

interface ToggleRowProps {
    title: string;
    description: string;
    checked: boolean;
    onToggle: (checked: boolean) => void;
    disabled?: boolean;
}

const SECTION_LIST: Array<{
    id: SettingsSectionId;
    label: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
}> = [
    { id: 'profile', label: 'Profile', description: 'Identity and public details', icon: UserRound },
    { id: 'preferences', label: 'Preferences', description: 'Theme and chat behavior', icon: SlidersHorizontal },
    { id: 'notifications', label: 'Notifications', description: 'Email updates and alerts', icon: Bell },
    { id: 'account', label: 'Account', description: 'Status, sign out, and account actions', icon: ShieldCheck },
];

function isSection(value: string | undefined): value is SettingsSectionId {
    return SECTION_LIST.some((section) => section.id === value);
}

function normalizeSection(value: string | undefined): SettingsSectionId | null {
    if (!value) {
        return null;
    }
    if (value === 'security') {
        return 'account';
    }
    return isSection(value) ? value : null;
}

function isValidWebsite(value: string) {
    if (!value) {
        return true;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function ToggleRow({ title, description, checked, onToggle, disabled = false }: ToggleRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
            </div>
            <button
                type="button"
                onClick={() => onToggle(!checked)}
                disabled={disabled}
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                    checked ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100' : 'border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800',
                )}
            >
                <span className={cn('inline-block h-4 w-4 rounded-full bg-white transition-transform dark:bg-zinc-900', checked ? 'translate-x-6' : 'translate-x-1')} />
            </button>
        </div>
    );
}

export function SettingsPage() {
    const { user, updateUser, signOut } = useAuth();
    const { confirm } = useAppDialog();
    const navigate = useNavigate();
    const { section } = useParams<{ section?: string }>();

    const normalizedSection = normalizeSection(section);
    const activeSection: SettingsSectionId = normalizedSection ?? 'profile';
    const [saved, setSaved] = useState<UserSettings | null>(null);
    const [draft, setDraft] = useState<UserSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [actionLoading, setActionLoading] = useState<'reset-password' | 'signout' | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);
    const selectedTheme = draft?.preferences.theme;
    const profileImageInputRef = useRef<HTMLInputElement | null>(null);
    const [pendingProfileImageFile, setPendingProfileImageFile] = useState<File | null>(null);
    const [pendingProfileImagePreviewUrl, setPendingProfileImagePreviewUrl] = useState<string | null>(null);
    const [isProfileImageBroken, setIsProfileImageBroken] = useState(false);
    const [isSystemInstructionEditorOpen, setIsSystemInstructionEditorOpen] = useState(false);
    const [systemInstructionEditorValue, setSystemInstructionEditorValue] = useState(DEFAULT_SYSTEM_INSTRUCTION);

    const clearPendingProfileImage = () => {
        setPendingProfileImageFile(null);
        setIsProfileImageBroken(false);
        setPendingProfileImagePreviewUrl((current) => {
            if (current) {
                URL.revokeObjectURL(current);
            }
            return null;
        });
        if (profileImageInputRef.current) {
            profileImageInputRef.current.value = '';
        }
    };

    const revokeAndSetPendingPreview = (url: string | null) => {
        setIsProfileImageBroken(false);
        setPendingProfileImagePreviewUrl((current) => {
            if (current) {
                URL.revokeObjectURL(current);
            }
            return url;
        });
    };

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                const localSettings = await getUserSettings(user);
                let settings = localSettings;
                try {
                    const remoteProfile = await authApi.getProfileMetadata();
                    settings = {
                        ...localSettings,
                        profile: {
                            ...localSettings.profile,
                            fullName: user.fullName,
                            headline: remoteProfile.headline ?? localSettings.profile.headline,
                            bio: remoteProfile.bio ?? localSettings.profile.bio,
                            location: remoteProfile.location ?? localSettings.profile.location,
                            website: remoteProfile.website ?? localSettings.profile.website,
                            timezone: remoteProfile.timezone ?? localSettings.profile.timezone,
                            avatarUrl: remoteProfile.avatarUrl ?? localSettings.profile.avatarUrl,
                            avatarFileId: remoteProfile.avatarFileId ?? localSettings.profile.avatarFileId,
                        },
                    };
                } catch (profileError) {
                    console.warn('Failed to load remote profile metadata, using local settings only.', profileError);
                }
                if (!cancelled) {
                    setSaved(settings);
                    setDraft(settings);
                    setPendingProfileImageFile(null);
                    setPendingProfileImagePreviewUrl((current) => {
                        if (current) {
                            URL.revokeObjectURL(current);
                        }
                        return null;
                    });
                }
            } catch (error: unknown) {
                if (!cancelled) {
                    setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to load settings.' });
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        if (!selectedTheme) {
            return;
        }
        applyThemePreference(selectedTheme);
    }, [selectedTheme]);

    useEffect(() => () => {
        if (pendingProfileImagePreviewUrl) {
            URL.revokeObjectURL(pendingProfileImagePreviewUrl);
        }
    }, [pendingProfileImagePreviewUrl]);

    const dirtyBySection = useMemo(() => {
        if (!saved || !draft) {
            return { profile: false, preferences: false, notifications: false, account: false };
        }
        return {
            profile: JSON.stringify(saved.profile) !== JSON.stringify(draft.profile) || pendingProfileImageFile !== null,
            preferences: JSON.stringify(saved.preferences) !== JSON.stringify(draft.preferences),
            notifications: JSON.stringify(saved.notifications) !== JSON.stringify(draft.notifications),
            account: JSON.stringify(saved.security) !== JSON.stringify(draft.security) || JSON.stringify(saved.ai) !== JSON.stringify(draft.ai),
        };
    }, [draft, pendingProfileImageFile, saved]);

    if (!user) {
        return <Navigate to="/welcome" replace />;
    }

    if (section && !normalizedSection) {
        return <Navigate to="/settings/profile" replace />;
    }

    if (section === 'security') {
        return <Navigate to="/settings/account" replace />;
    }

    const setDraftSection = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
    };

    const openProfileImagePicker = () => {
        profileImageInputRef.current?.click();
    };

    const handleProfileImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            setNotice({ tone: 'error', text: 'Please select a valid image file.' });
            event.target.value = '';
            return;
        }

        const maxSizeBytes = 5 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            setNotice({ tone: 'error', text: 'Profile image must be 5MB or smaller.' });
            event.target.value = '';
            return;
        }

        setNotice(null);
        setPendingProfileImageFile(file);
        revokeAndSetPendingPreview(URL.createObjectURL(file));
    };

    const removeProfileImageDraft = () => {
        if (!draft) {
            return;
        }
        clearPendingProfileImage();
        setDraftSection('profile', {
            ...draft.profile,
            avatarUrl: '',
            avatarFileId: '',
        });
        setNotice(null);
    };

    const saveCurrentSection = async () => {
        if (!draft) {
            return;
        }

        let nextDraft = draft;
        let uploadedAvatarFileId: string | null = null;

        if (activeSection === 'profile') {
            const name = draft.profile.fullName.trim();
            const website = draft.profile.website.trim();
            if (!name) {
                setNotice({ tone: 'error', text: 'Full name is required.' });
                return;
            }
            if (!isValidWebsite(website)) {
                setNotice({ tone: 'error', text: 'Website must start with http:// or https://.' });
                return;
            }
            nextDraft = {
                ...draft,
                profile: {
                    ...draft.profile,
                    fullName: name,
                    website,
                    avatarUrl: draft.profile.avatarUrl.trim(),
                    avatarFileId: draft.profile.avatarFileId.trim(),
                },
            };
            setDraft(nextDraft);
        }

        setNotice(null);
        setIsSaving(true);
        try {
            if (activeSection === 'profile') {
                if (pendingProfileImageFile) {
                    const uploadedAvatar = await authApi.uploadProfileImage(pendingProfileImageFile);
                    uploadedAvatarFileId = uploadedAvatar.avatarFileId;
                    nextDraft = {
                        ...nextDraft,
                        profile: {
                            ...nextDraft.profile,
                            avatarUrl: uploadedAvatar.avatarUrl,
                            avatarFileId: uploadedAvatar.avatarFileId,
                        },
                    };
                }

                const updatedUser = await authApi.updateProfile(nextDraft.profile);
                updateUser(updatedUser);
            }
            const next = await saveUserSettings(user.id, nextDraft);
            setSaved(next);
            setDraft(next);
            clearPendingProfileImage();
            setNotice({ tone: 'success', text: 'Changes saved.' });
        } catch (error: unknown) {
            if (uploadedAvatarFileId) {
                try {
                    await authApi.deleteProfileImage(uploadedAvatarFileId);
                } catch (cleanupError) {
                    console.warn('Failed to clean up uploaded profile image after save failure:', cleanupError);
                }
            }
            setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to save right now.' });
        } finally {
            setIsSaving(false);
        }
    };

    const resetCurrentSection = () => {
        if (!saved || !draft) {
            return;
        }
        if (activeSection === 'profile') {
            setDraftSection('profile', saved.profile);
            clearPendingProfileImage();
        }
        if (activeSection === 'preferences') {
            setDraftSection('preferences', saved.preferences);
        }
        if (activeSection === 'notifications') {
            setDraftSection('notifications', saved.notifications);
        }
        if (activeSection === 'account') {
            setDraftSection('security', saved.security);
            setDraftSection('ai', saved.ai);
        }
        setNotice(null);
    };

    const restoreDefaults = async () => {
        setIsSaving(true);
        setNotice(null);
        try {
            const defaults = await resetUserSettings(user);
            await authApi.updateProfile(defaults.profile);
            setSaved(defaults);
            setDraft(defaults);
            clearPendingProfileImage();
            const refreshedUser = await authApi.getCurrentUser();
            if (refreshedUser) {
                updateUser(refreshedUser);
            }
            setNotice({ tone: 'success', text: 'All settings restored to defaults.' });
        } catch (error: unknown) {
            setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to restore defaults.' });
        } finally {
            setIsSaving(false);
        }
    };

    const signOutNow = async () => {
        const confirmed = await confirm({
            title: 'Sign out from this device?',
            description: 'You will be redirected to the Alphine landing page.',
            confirmText: 'Sign out',
            cancelText: 'Cancel',
        });
        if (!confirmed) {
            return;
        }
        setActionLoading('signout');
        try {
            await signOut();
            navigate('/welcome', { replace: true });
        } finally {
            setActionLoading(null);
        }
    };

    const sendPasswordResetLink = async () => {
        setActionLoading('reset-password');
        setNotice(null);
        try {
            await authApi.forgotPassword(user.email);
            setNotice({ tone: 'success', text: `Password reset link sent to ${user.email}.` });
        } catch (error: unknown) {
            setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to send password reset link.' });
        } finally {
            setActionLoading(null);
        }
    };

    const openSystemInstructionEditor = () => {
        if (!draft) {
            return;
        }

        setSystemInstructionEditorValue(draft.ai.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION);
        setIsSystemInstructionEditorOpen(true);
    };

    const applySystemInstructionEditor = () => {
        if (!draft) {
            return;
        }

        setDraftSection('ai', {
            ...draft.ai,
            systemInstruction: systemInstructionEditorValue,
        });
        setIsSystemInstructionEditorOpen(false);
    };

    const profileImageUrl = pendingProfileImagePreviewUrl ?? draft?.profile.avatarUrl ?? '';
    const profileImageSrc = (() => {
        if (!profileImageUrl || isProfileImageBroken) {
            return '';
        }
        if (profileImageUrl.startsWith('blob:') || profileImageUrl.startsWith('data:')) {
            return profileImageUrl;
        }
        try {
            const parsed = new URL(profileImageUrl);
            parsed.searchParams.set('v', draft?.updatedAt ?? user.updatedAt);
            return parsed.toString();
        } catch {
            return profileImageUrl;
        }
    })();
    const canShowProfileImage = profileImageSrc !== '';
    const profileInitial = (draft?.profile.fullName || user.fullName).trim().charAt(0).toUpperCase();

    const sectionActions = (
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-2 dark:border-zinc-800 dark:bg-zinc-950/95 sm:dark:bg-transparent">
            <Button variant="outline" onClick={resetCurrentSection} disabled={isSaving || !dirtyBySection[activeSection]}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
            </Button>
            <Button onClick={() => void saveCurrentSection()} disabled={isSaving || !dirtyBySection[activeSection]}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
            </Button>
        </div>
    );

    let sectionContent: ReactNode = null;

    if (isLoading || !draft) {
        sectionContent = (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading settings
                    </CardTitle>
                    <CardDescription>Preparing your profile configuration.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="shimmer-surface h-10 w-full rounded-md" />
                        <div className="shimmer-surface h-10 w-full rounded-md" />
                        <div className="shimmer-surface h-28 w-full rounded-md" />
                    </div>
                </CardContent>
            </Card>
        );
    } else if (activeSection === 'profile') {
        sectionContent = (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Public profile</CardTitle>
                    <CardDescription>Update your basic account identity and public info.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/20 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xl font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:h-20 sm:w-20 sm:text-2xl">
                                {canShowProfileImage ? (
                                    <img
                                        src={profileImageSrc}
                                        alt="Profile preview"
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        onError={() => setIsProfileImageBroken(true)}
                                    />
                                ) : (
                                    <span>{profileInitial || 'U'}</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <Label className="text-sm font-medium">Profile picture</Label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={openProfileImagePicker}
                                            disabled={isSaving}
                                            title="Change photo"
                                            aria-label="Change photo"
                                            className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <ImagePlus className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={removeProfileImageDraft}
                                            disabled={isSaving || (!profileImageUrl && !pendingProfileImageFile)}
                                            title="Remove photo"
                                            aria-label="Remove photo"
                                            className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <ImageMinus className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                                    JPG, PNG, WEBP, GIF. Max size 5MB.
                                </p>
                                {pendingProfileImageFile && (
                                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                        Selected: {pendingProfileImageFile.name}
                                    </p>
                                )}
                            </div>
                        </div>
                        <input
                            ref={profileImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleProfileImageSelected}
                        />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="fullName">Full name</Label>
                            <Input id="fullName" value={draft.profile.fullName} onChange={(event) => setDraftSection('profile', { ...draft.profile, fullName: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="headline">Headline</Label>
                            <Input id="headline" value={draft.profile.headline} onChange={(event) => setDraftSection('profile', { ...draft.profile, headline: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input id="location" value={draft.profile.location} onChange={(event) => setDraftSection('profile', { ...draft.profile, location: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="website">Website</Label>
                            <Input id="website" value={draft.profile.website} onChange={(event) => setDraftSection('profile', { ...draft.profile, website: event.target.value })} placeholder="https://example.com" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <textarea
                            id="bio"
                            value={draft.profile.bio}
                            onChange={(event) => setDraftSection('profile', { ...draft.profile, bio: event.target.value })}
                            className="min-h-28 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="timezone">Timezone</Label>
                        <select
                            id="timezone"
                            className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300"
                            value={draft.profile.timezone}
                            onChange={(event) => setDraftSection('profile', { ...draft.profile, timezone: event.target.value })}
                        >
                            {['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata'].map((zone) => (
                                <option key={zone} value={zone} className="bg-white dark:bg-zinc-950">{zone}</option>
                            ))}
                        </select>
                    </div>
                    {sectionActions}
                </CardContent>
            </Card>
        );
    } else if (activeSection === 'preferences') {
        sectionContent = (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Workspace preferences</CardTitle>
                    <CardDescription>Choose visual mode and writing behavior for chats.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Theme</Label>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {[
                                { id: 'system', label: 'System', icon: Monitor },
                                { id: 'light', label: 'Light', icon: Sun },
                                { id: 'dark', label: 'Dark', icon: Moon },
                            ].map((item) => {
                                const Icon = item.icon;
                                const selected = draft.preferences.theme === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setDraftSection('preferences', { ...draft.preferences, theme: item.id as UserSettings['preferences']['theme'] })}
                                        className={cn('rounded-lg border px-3 py-2 text-left', selected ? 'border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 dark:border-zinc-800')}
                                    >
                                        <span className="inline-flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4" />{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="density">Message density</Label>
                        <select
                            id="density"
                            className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300"
                            value={draft.preferences.messageDensity}
                            onChange={(event) => setDraftSection('preferences', { ...draft.preferences, messageDensity: event.target.value as UserSettings['preferences']['messageDensity'] })}
                        >
                            <option value="comfortable" className="bg-white dark:bg-zinc-950">Comfortable</option>
                            <option value="compact" className="bg-white dark:bg-zinc-950">Compact</option>
                        </select>
                    </div>
                    <ToggleRow
                        title="Press Enter to send"
                        description="Use Shift+Enter for a newline."
                        checked={draft.preferences.enterToSend}
                        onToggle={(value) => setDraftSection('preferences', { ...draft.preferences, enterToSend: value })}
                    />
                    <ToggleRow
                        title="Auto-title chats"
                        description="Generate titles for new chats automatically."
                        checked={draft.preferences.autoTitleChats}
                        onToggle={(value) => setDraftSection('preferences', { ...draft.preferences, autoTitleChats: value })}
                    />
                    {sectionActions}
                </CardContent>
            </Card>
        );
    } else if (activeSection === 'notifications') {
        sectionContent = (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Notification center</CardTitle>
                    <CardDescription>Pick the email updates you want to receive.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ToggleRow
                        title="Mentions and replies"
                        description="Email updates when collaborators mention you."
                        checked={draft.notifications.mentionEmails}
                        onToggle={(value) => setDraftSection('notifications', { ...draft.notifications, mentionEmails: value })}
                    />
                    <ToggleRow
                        title="Product announcements"
                        description="Feature launches and roadmap changes."
                        checked={draft.notifications.productUpdates}
                        onToggle={(value) => setDraftSection('notifications', { ...draft.notifications, productUpdates: value })}
                    />
                    <ToggleRow
                        title="Security alerts"
                        description="Immediate alerts for account-related activity."
                        checked={draft.notifications.securityAlerts}
                        onToggle={(value) => setDraftSection('notifications', { ...draft.notifications, securityAlerts: value })}
                    />
                    <ToggleRow
                        title="Weekly digest"
                        description="A weekly summary of usage and activity."
                        checked={draft.notifications.weeklyDigest}
                        onToggle={(value) => setDraftSection('notifications', { ...draft.notifications, weeklyDigest: value })}
                    />
                    {sectionActions}
                </CardContent>
            </Card>
        );
    } else {
        sectionContent = (
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Account</CardTitle>
                    <CardDescription>View account status or sign out from this device.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                        <p className="text-sm font-medium">AI provider</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Configure the model provider and API key used for chat responses.
                        </p>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="ai-provider">Provider</Label>
                                <select
                                    id="ai-provider"
                                    className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300"
                                    value={draft.ai.provider}
                                    onChange={(event) =>
                                        setDraftSection('ai', {
                                            ...draft.ai,
                                            provider: event.target.value as UserSettings['ai']['provider'],
                                        })
                                    }
                                >
                                    <option value="openrouter" className="bg-white dark:bg-zinc-950">OpenRouter</option>
                                    <option value="google" className="bg-white dark:bg-zinc-950">Google Generative AI</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ai-model">Model</Label>
                                <Input
                                    id="ai-model"
                                    value={draft.ai.provider === 'openrouter' ? draft.ai.openRouter.model : draft.ai.google.model}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        if (draft.ai.provider === 'openrouter') {
                                            setDraftSection('ai', {
                                                ...draft.ai,
                                                openRouter: {
                                                    ...draft.ai.openRouter,
                                                    model: value,
                                                },
                                            });
                                            return;
                                        }
                                        setDraftSection('ai', {
                                            ...draft.ai,
                                            google: {
                                                ...draft.ai.google,
                                                model: value,
                                            },
                                        });
                                    }}
                                    placeholder={draft.ai.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gemini-2.0-flash'}
                                />
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <Label htmlFor="ai-api-key">API key</Label>
                            <Input
                                id="ai-api-key"
                                type="password"
                                value={draft.ai.provider === 'openrouter' ? draft.ai.openRouter.apiKey : draft.ai.google.apiKey}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    if (draft.ai.provider === 'openrouter') {
                                        setDraftSection('ai', {
                                            ...draft.ai,
                                            openRouter: {
                                                ...draft.ai.openRouter,
                                                apiKey: value,
                                            },
                                        });
                                        return;
                                    }
                                    setDraftSection('ai', {
                                        ...draft.ai,
                                        google: {
                                            ...draft.ai.google,
                                            apiKey: value,
                                        },
                                    });
                                }}
                                placeholder={draft.ai.provider === 'openrouter' ? 'or-...' : 'AIza...'}
                                autoComplete="off"
                            />
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Stored in your browser settings for this account.
                            </p>
                        </div>

                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="ai-system-instruction">System instruction</Label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="md:hidden"
                                        onClick={openSystemInstructionEditor}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        title="Reset system instruction"
                                        onClick={() =>
                                            setDraftSection('ai', {
                                                ...draft.ai,
                                                systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
                                            })
                                        }
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="flex w-full flex-col items-start rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm dark:border-zinc-800 dark:bg-zinc-900/30 md:hidden"
                                onClick={openSystemInstructionEditor}
                            >
                                <span className="line-clamp-4 whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">
                                    {draft.ai.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION}
                                </span>
                                <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    Tap to edit in fullscreen
                                </span>
                            </button>

                            <textarea
                                id="ai-system-instruction"
                                className="hidden min-h-[280px] max-h-[65vh] w-full resize-y rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm leading-6 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300 md:block"
                                value={draft.ai.systemInstruction}
                                onChange={(event) =>
                                    setDraftSection('ai', {
                                        ...draft.ai,
                                        systemInstruction: event.target.value,
                                    })
                                }
                                placeholder={DEFAULT_SYSTEM_INSTRUCTION}
                                maxLength={4000}
                            />
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Passed as the system instruction for both OpenRouter and Google responses.
                            </p>
                        </div>

                        {sectionActions}
                    </div>

                    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                        <p className="text-sm font-medium">Account status</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span
                                className={cn(
                                    'rounded-full border px-2 py-1',
                                    user.isEmailVerified
                                        ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300'
                                        : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300',
                                )}
                            >
                                Email verified: {user.isEmailVerified ? 'Yes' : 'No'}
                            </span>
                            <span
                                className={cn(
                                    'rounded-full border px-2 py-1',
                                    user.isMfaEnabled
                                        ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-300'
                                        : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300',
                                )}
                            >
                                MFA enabled: {user.isMfaEnabled ? 'Yes' : 'No'}
                            </span>
                            <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                MFA default policy: Required
                            </span>
                        </div>
                    </div>
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                        <p>Signed in as {user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" disabled={actionLoading !== null} onClick={() => void sendPasswordResetLink()}>
                            {actionLoading === 'reset-password' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}
                            Reset password
                        </Button>
                        <Button variant="destructive" disabled={actionLoading !== null} onClick={() => void signOutNow()}>
                            {actionLoading === 'signout' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                            Sign out now
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div
            className="h-[100svh] overflow-x-hidden overflow-y-auto bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                            <ArrowLeft className="h-4 w-4" />
                            Back to chat
                        </Link>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Profile and settings</h1>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Manage your identity, preferences, and account settings.</p>
                    </div>
                    <Button variant="outline" onClick={() => void restoreDefaults()} disabled={isLoading || isSaving}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore defaults
                    </Button>
                </header>

                <div className="mt-6 grid gap-6 lg:grid-cols-[250px_1fr]">
                    <aside className="hidden lg:block">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Settings sections</CardTitle>
                                <CardDescription className="text-xs">Choose a section to update.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-2">
                                {SECTION_LIST.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <NavLink
                                            key={item.id}
                                            to={`/settings/${item.id}`}
                                            className={({ isActive }) => cn(
                                                'rounded-lg border px-3 py-2 transition-colors',
                                                isActive
                                                    ? 'border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                                    : 'border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900',
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center gap-2 text-sm font-medium">
                                                    <Icon className="h-4 w-4" />
                                                    {item.label}
                                                </span>
                                                {dirtyBySection[item.id] && <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] uppercase">Unsaved</span>}
                                            </div>
                                            <p className="mt-1 text-xs text-inherit/70">{item.description}</p>
                                        </NavLink>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </aside>

                    <section>
                        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-zinc-200 bg-zinc-50/95 px-4 pb-3 pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {SECTION_LIST.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => navigate(`/settings/${item.id}`)}
                                        className={cn(
                                            'shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                                            activeSection === item.id
                                                ? 'border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                                : 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {notice && (
                            <div
                                className={cn(
                                    'mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                                    notice.tone === 'success'
                                        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
                                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300',
                                )}
                            >
                                {notice.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                <span>{notice.text}</span>
                            </div>
                        )}
                        {sectionContent}
                    </section>
                </div>
            </div>

            {isSystemInstructionEditorOpen ? (
                <div className="fixed inset-0 z-[130] md:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60"
                        onClick={() => setIsSystemInstructionEditorOpen(false)}
                        aria-label="Close system instruction editor"
                    />
                    <div className="absolute inset-0 flex flex-col bg-zinc-50 dark:bg-zinc-950">
                        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                            <button
                                type="button"
                                className="rounded-md px-3 py-2 text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
                                onClick={() => setIsSystemInstructionEditorOpen(false)}
                            >
                                Cancel
                            </button>
                            <p className="text-sm font-medium">System instruction</p>
                            <button
                                type="button"
                                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                                onClick={applySystemInstructionEditor}
                            >
                                Apply
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-4">
                            <textarea
                                className="min-h-[62svh] w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-3 text-sm leading-6 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-visible:ring-zinc-300"
                                value={systemInstructionEditorValue}
                                onChange={(event) => setSystemInstructionEditorValue(event.target.value)}
                                maxLength={4000}
                            />
                            <p className="mt-2 text-right text-xs text-zinc-500 dark:text-zinc-400">
                                {systemInstructionEditorValue.length}/4000
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
