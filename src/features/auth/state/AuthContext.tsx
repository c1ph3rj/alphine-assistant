/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../domain/models';
import { authApi } from '../services/AppwriteAuthService';
import { clearPendingAuthFlow } from '../utils/pendingAuthFlow';
import { applyThemePreference } from '@/features/settings/services/themeService';
import { getStoredPublicThemePreference, getStoredThemePreference } from '@/features/settings/services/userSettingsStorage';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    signIn: (user: User) => void;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<User | null>;
    updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshUser = async () => {
        try {
            const profile = await authApi.getCurrentUser();
            setUser(profile);
            return profile;
        } catch (error) {
            console.error('Failed to restore auth session:', error);
            setUser(null);
            return null;
        }
    };

    useEffect(() => {
        const loadUser = async () => {
            await refreshUser();
            setIsLoading(false);
        };

        void loadUser();
    }, []);

    useEffect(() => {
        if (!user) {
            const storedTheme = getStoredPublicThemePreference() ?? 'system';
            applyThemePreference(storedTheme);
            return;
        }

        const storedTheme = getStoredThemePreference(user.id) ?? 'system';
        applyThemePreference(storedTheme);
    }, [user]);

    const signIn = (nextUser: User) => {
        setUser(nextUser);
        clearPendingAuthFlow();
    };

    const signOut = async () => {
        try {
            await authApi.signOut();
        } finally {
            setUser(null);
            clearPendingAuthFlow();
        }
    };

    const updateUser = (updatedUser: User) => {
        setUser(updatedUser);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            signIn,
            signOut,
            refreshUser,
            updateUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
