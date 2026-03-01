import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

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

import { forgotPasswordSchema } from '../validation/schemas';
import type { ForgotPasswordInput } from '../validation/schemas';
import { authApi } from '../services/AppwriteAuthService';

export function ForgotPasswordForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ForgotPasswordInput>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: '',
        },
    });

    const onSubmit = async (data: ForgotPasswordInput) => {
        setIsLoading(true);
        setError(null);
        try {
            await authApi.forgotPassword(data.email);
            setIsSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to send reset link');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <CardHeader className="items-center justify-center space-y-1 text-center">
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <CardTitle className="text-2xl font-semibold tracking-tight">
                        Check your email
                    </CardTitle>
                    <CardDescription>
                        If the account exists, we&apos;ve sent a password reset link.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <Button asChild className="h-10 w-full" variant="outline">
                        <Link to="/login">Return to sign in</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Reset password
                </CardTitle>
                <CardDescription>
                    Enter your email and we&apos;ll send a reset link.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="name@example.com"
                            disabled={isLoading}
                            {...register('email')}
                            className={errors.email ? 'border-red-500' : ''}
                        />
                        {errors.email && (
                            <p className="text-sm text-red-500">{errors.email.message}</p>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="h-10 w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send reset link
                    </Button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <Link
                        to="/login"
                        className="inline-flex items-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to sign in
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
