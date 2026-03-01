import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, MessageSquareText, Monitor, Moon, ShieldCheck, Sparkles, Sun, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ThemePreference } from '@/features/settings/domain/models';
import { applyThemePreference } from '@/features/settings/services/themeService';
import { getStoredPublicThemePreference, setStoredPublicThemePreference } from '@/features/settings/services/userSettingsStorage';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { cn } from '@/lib/utils';

const VALUE_ITEMS = [
    {
        title: 'Focused chat workspace',
        description: 'Move from idea to answer quickly with a clean, distraction-free interface built for daily work.',
        icon: MessageSquareText,
    },
    {
        title: 'Secure by default',
        description: 'Email verification and mandatory multi-factor authentication are built into every account.',
        icon: ShieldCheck,
    },
    {
        title: 'Practical workflow controls',
        description: 'Tune theme, chat behavior, and account preferences from one reliable settings surface.',
        icon: Workflow,
    },
];

const ONBOARDING_STEPS = [
    {
        label: 'Create account',
        detail: 'Register with your email and set your workspace identity.',
    },
    {
        label: 'Verify security',
        detail: 'Confirm your inbox and complete authenticator setup.',
    },
    {
        label: 'Start chatting',
        detail: 'Enter your chat workspace and continue where you left off.',
    },
];

const THEME_OPTIONS: Array<{
    value: ThemePreference;
    label: string;
    icon: typeof Monitor;
}> = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
];

export function LandingPage() {
    const [selectedTheme, setSelectedTheme] = useState<ThemePreference>(() => getStoredPublicThemePreference() ?? 'system');

    useEffect(() => {
        applyThemePreference(selectedTheme);
        setStoredPublicThemePreference(selectedTheme);
    }, [selectedTheme]);

    return (
        <div
            className="relative min-h-[100svh] overflow-x-hidden overflow-y-auto bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,0,0,0.08),_transparent_48%),radial-gradient(circle_at_85%_12%,_rgba(0,0,0,0.06),_transparent_34%)] dark:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_52%),radial-gradient(circle_at_85%_12%,_rgba(255,255,255,0.11),_transparent_34%)]" />

            <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <header className="flex flex-col gap-4 rounded-[28px] border border-zinc-200 bg-white/75 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70 sm:gap-5 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="inline-flex min-w-0 items-center gap-3 sm:gap-4">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                            <BadgeCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-base font-semibold tracking-wide sm:text-lg">Alphine</p>
                            <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-300">A secure, modern AI chat workspace</p>
                        </div>
                    </div>

                    <div className="grid w-full gap-3 lg:w-auto lg:min-w-[420px]">
                        <div className="grid w-full grid-cols-3 items-center gap-1 rounded-xl border border-zinc-200 bg-white/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/80">
                            {THEME_OPTIONS.map((option) => {
                                const Icon = option.icon;
                                const isActive = selectedTheme === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setSelectedTheme(option.value)}
                                        className={cn(
                                            'inline-flex h-9 items-center justify-center rounded-lg px-2 py-1 text-[11px] font-medium leading-none transition-colors sm:text-xs',
                                            isActive
                                                ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                                                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                                        )}
                                        aria-label={`Set ${option.label.toLowerCase()} theme`}
                                        title={option.label}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="grid grid-cols-1 gap-2 min-[460px]:grid-cols-2">
                            <Button asChild variant="outline" className="h-10 w-full">
                                <Link to="/login" className="justify-center">Sign in</Link>
                            </Button>
                            <Button asChild className="h-10 w-full">
                                <Link to="/register" className="inline-flex items-center justify-center gap-2">
                                    Create account
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </header>

                <main className="mt-6 grid gap-4 sm:mt-8 sm:gap-5 md:grid-cols-[1.08fr_0.92fr] lg:mt-10 lg:gap-6">
                    <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-7 lg:p-8">
                        <p className="inline-flex rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                            Front page
                        </p>
                        <h1 className="mt-4 max-w-[18ch] text-[clamp(2rem,6vw,3.65rem)] font-semibold leading-[1.05] tracking-tight">
                            Professional conversations, protected from sign-in to session.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
                            Alphine gives your team a clean AI chat experience with strong account security and practical controls. Sign in to continue your workspace, or create a new account to get started.
                        </p>
                        <div className="mt-6 grid gap-2 min-[480px]:grid-cols-2 sm:mt-8 sm:gap-3">
                            <Button asChild className="h-11 w-full sm:px-6">
                                <Link to="/register" className="inline-flex items-center justify-center gap-2">
                                    Get started
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="h-11 w-full sm:px-6">
                                <Link to="/login" className="justify-center">I already have an account</Link>
                            </Button>
                        </div>
                    </section>

                    <Card className="rounded-[28px] border-zinc-300/70 bg-white/85 backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-950/80">
                        <CardHeader className="p-5 pb-3 sm:p-6">
                            <CardTitle className="text-xl">How onboarding works</CardTitle>
                            <CardDescription>Everything needed to start is handled in a short guided flow.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-5 pt-0 sm:space-y-4 sm:p-6 sm:pt-0">
                            {ONBOARDING_STEPS.map((step, index) => (
                                <div key={step.label} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Step {index + 1}</p>
                                    <p className="mt-1 text-sm font-semibold">{step.label}</p>
                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{step.detail}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </main>

                <section className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {VALUE_ITEMS.map((item) => {
                        const Icon = item.icon;

                        return (
                            <Card key={item.title} className="rounded-2xl border-zinc-200/90 bg-white/85 dark:border-zinc-800/90 dark:bg-zinc-950/80">
                                <CardHeader className="p-5 pb-2 sm:p-6 sm:pb-2">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <CardTitle className="pt-2 text-base">{item.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{item.description}</p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </section>

                <section className="mt-6 rounded-[24px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:mt-8 sm:p-7 lg:p-8">
                    <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-semibold">Ready to enter Alphine?</p>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Use your account to continue to chat, or create one in under a minute.</p>
                        </div>
                        <div className="grid w-full gap-2 min-[460px]:grid-cols-2 md:w-auto">
                            <Button asChild variant="outline" className="h-10 w-full md:w-auto">
                                <Link to="/login" className="justify-center">Sign in</Link>
                            </Button>
                            <Button asChild className="h-10 w-full md:w-auto">
                                <Link to="/register" className="inline-flex items-center justify-center gap-2">
                                    Create account
                                    <Sparkles className="h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
