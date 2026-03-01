import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getPendingAuthFlow } from '../utils/pendingAuthFlow';

interface AuthRouteMeta {
    eyebrow: string;
    title: string;
    description: string;
    contentWidthClass: string;
    actionLabel?: string;
    actionHref?: string;
}

const AUTH_ROUTE_META: Record<string, AuthRouteMeta> = {
    '/login': {
        eyebrow: 'Sign in',
        title: 'Welcome back.',
        description: 'Use your email and password to access your account securely.',
        contentWidthClass: 'max-w-md',
        actionLabel: 'Create account',
        actionHref: '/register',
    },
    '/register': {
        eyebrow: 'Create account',
        title: 'Start your Alphine workspace.',
        description: 'Create your account once and complete quick verification steps.',
        contentWidthClass: 'max-w-md',
        actionLabel: 'Already have an account? Sign in',
        actionHref: '/login',
    },
    '/verify-email': {
        eyebrow: 'Verify email',
        title: 'Confirm your email address.',
        description: 'Use the verification link sent to your inbox to continue.',
        contentWidthClass: 'max-w-md',
    },
    '/setup-mfa': {
        eyebrow: 'Multi-factor authentication',
        title: 'Complete MFA to continue.',
        description: 'MFA is required for all accounts. Verify your authenticator code to proceed.',
        contentWidthClass: 'max-w-4xl',
    },
    '/verify-mfa': {
        eyebrow: 'Multi-factor authentication',
        title: 'Verify your authenticator code.',
        description: 'Enter your TOTP code to complete sign in.',
        contentWidthClass: 'max-w-md',
    },
    '/forgot-password': {
        eyebrow: 'Password reset',
        title: 'Recover access safely.',
        description: 'We will send a secure reset link to your email address.',
        contentWidthClass: 'max-w-md',
        actionLabel: 'Back to sign in',
        actionHref: '/login',
    },
    '/reset-password': {
        eyebrow: 'Password reset',
        title: 'Choose a new password.',
        description: 'Set a new password to regain account access.',
        contentWidthClass: 'max-w-md',
        actionLabel: 'Back to sign in',
        actionHref: '/login',
    },
    '/oauth-callback': {
        eyebrow: 'OAuth sign in',
        title: 'Completing Google sign in.',
        description: 'We are finalizing your authentication flow.',
        contentWidthClass: 'max-w-md',
    },
};

const AUTH_PROGRESS_STEPS = [
    { label: 'Verify email', paths: ['/verify-email'] },
    { label: 'MFA', paths: ['/setup-mfa', '/verify-mfa'] },
];

export function AuthLayout() {
    const location = useLocation();
    const routeMeta = AUTH_ROUTE_META[location.pathname] ?? AUTH_ROUTE_META['/login'];
    const activeProgressStepIndex = AUTH_PROGRESS_STEPS.findIndex((step) => step.paths.includes(location.pathname));
    const shouldShowProgress = activeProgressStepIndex >= 0;
    const pendingFlow = getPendingAuthFlow();
    const isSetupMfaRoute = location.pathname === '/setup-mfa';
    const isMfaSetupMode = isSetupMfaRoute && pendingFlow?.step === 'mfa_setup_required';

    return (
        <div
            className="h-[100svh] overflow-x-hidden overflow-y-auto bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col lg:flex-row">
                <aside className="border-b border-zinc-200 bg-white px-5 py-6 dark:border-zinc-800 dark:bg-zinc-950 lg:w-[40%] lg:border-b-0 lg:border-r lg:px-9 lg:py-10">
                    <Link to="/login" className="inline-flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                            <ShieldCheck className="h-5 w-5" />
                        </span>
                        <span>
                            <strong className="block text-base font-semibold">Alphine</strong>
                            <span className="block text-sm text-zinc-500 dark:text-zinc-400">Secure authentication</span>
                        </span>
                    </Link>

                    <div className="mt-7">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                            {routeMeta.eyebrow}
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                            {routeMeta.title}
                        </h1>
                        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                            {routeMeta.description}
                        </p>
                    </div>

                    {shouldShowProgress && (
                        <ol className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            {AUTH_PROGRESS_STEPS.map((step, index) => {
                                const isActive = index === activeProgressStepIndex;
                                const isCompleted = activeProgressStepIndex > index;

                                return (
                                    <li
                                        key={step.label}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                                            isActive
                                                ? 'border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                                                : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                                                isActive
                                                    ? 'bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50'
                                                    : isCompleted
                                                        ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                                                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                                            )}
                                        >
                                            {index + 1}
                                        </span>
                                        <span>{step.label}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {routeMeta.actionLabel && routeMeta.actionHref && (
                        <div className="mt-6">
                            <Link
                                to={routeMeta.actionHref}
                                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                            >
                                {routeMeta.actionLabel}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    )}
                </aside>

                <main
                    className={cn(
                        'flex flex-1 justify-center px-4 py-8 sm:px-6 lg:px-10',
                        isMfaSetupMode ? 'items-start' : 'items-center',
                    )}
                >
                    <div className={cn('w-full', routeMeta.contentWidthClass)}>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
