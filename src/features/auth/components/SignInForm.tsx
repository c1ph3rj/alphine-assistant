import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';

import { signInSchema } from '../validation/schemas';
import type { SignInInput } from '../validation/schemas';
import { useSignIn } from '../hooks/useSignIn';
import { SocialLogin } from './SocialLogin';

export function SignInForm() {
    const [showPassword, setShowPassword] = useState(false);
    const location = useLocation();
    const infoMessage = location.state?.message as string | undefined;
    const query = new URLSearchParams(location.search);
    const oauthFailed = query.get('oauth') === 'failed';
    const { signIn, isLoading, error } = useSignIn();

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<SignInInput>({
        resolver: zodResolver(signInSchema),
        defaultValues: {
            email: '',
            password: '',
            rememberMe: false,
        },
    });

    const onSubmit = (data: SignInInput) => {
        signIn(data);
    };

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Sign in
                </CardTitle>
                <CardDescription>
                    Enter your credentials to continue.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {(infoMessage || oauthFailed) && (
                    <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
                        {infoMessage || 'Google sign in was cancelled or failed. Please try again.'}
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="name@example.com"
                            autoComplete="email"
                            disabled={isLoading}
                            {...register('email')}
                            className={errors.email ? 'border-red-500' : ''}
                        />
                        {errors.email && (
                            <p className="text-sm text-red-500">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                            <Link
                                to="/forgot-password"
                                className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                disabled={isLoading}
                                {...register('password')}
                                className={errors.password ? 'border-red-500' : ''}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-sm text-red-500">{errors.password.message}</p>
                        )}
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="rememberMe"
                            onCheckedChange={(checked) => setValue('rememberMe', checked === true)}
                            disabled={isLoading}
                        />
                        <Label
                            htmlFor="rememberMe"
                            className="text-sm font-medium leading-none text-zinc-600 dark:text-zinc-300"
                        >
                            Remember me
                        </Label>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="h-10 w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sign in
                    </Button>
                </form>

                <div className="mt-6">
                    <SocialLogin />
                </div>

                <div className="mt-6 text-center text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                        Don&apos;t have an account?{' '}
                    </span>
                    <Link
                        to="/register"
                        className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                        Create one
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
