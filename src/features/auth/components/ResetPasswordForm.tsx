import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';

import { resetPasswordSchema } from '../validation/schemas';
import type { ResetPasswordInput } from '../validation/schemas';
import { authApi } from '../services/AppwriteAuthService';

export function ResetPasswordForm() {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const userId = searchParams.get('userId');
    const secret = searchParams.get('secret');

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ResetPasswordInput>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (data: ResetPasswordInput) => {
        if (!userId || !secret) return;

        setIsLoading(true);
        setError(null);
        try {
            await authApi.resetPassword({
                ...data,
                userId,
                secret,
            });
            navigate('/login', {
                replace: true,
                state: { message: 'Password reset successful. Please sign in.' },
            });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to reset password.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!userId || !secret) {
        return (
            <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-semibold tracking-tight">
                        Invalid reset link
                    </CardTitle>
                    <CardDescription>
                        This reset link is missing required details or has expired.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="h-10 w-full" variant="outline">
                        <Link to="/forgot-password">Request a new reset link</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Set new password
                </CardTitle>
                <CardDescription>
                    Choose a secure password to finish recovery.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">New password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
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
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-sm text-red-500">{errors.password.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm password</Label>
                        <div className="relative">
                            <Input
                                id="confirmPassword"
                                type={showConfirmPassword ? 'text' : 'password'}
                                disabled={isLoading}
                                {...register('confirmPassword')}
                                className={errors.confirmPassword ? 'border-red-500' : ''}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.confirmPassword && (
                            <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="h-10 w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update password
                    </Button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <Link
                        to="/login"
                        className="text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
                    >
                        Back to sign in
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

