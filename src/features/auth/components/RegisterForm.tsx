import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

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

import { registerSchema } from '../validation/schemas';
import type { RegisterInput } from '../validation/schemas';
import { useRegister } from '../hooks/useRegister';
import { SocialLogin } from './SocialLogin';

export function RegisterForm() {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);

    const { registerUser, isLoading, error } = useRegister();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterInput>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            fullName: '',
            email: '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = (data: RegisterInput) => {
        if (!termsAccepted) return;
        registerUser(data);
    };

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    Create account
                </CardTitle>
                <CardDescription>
                    Provide your details to get started.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Full name</Label>
                        <Input
                            id="fullName"
                            placeholder="John Doe"
                            disabled={isLoading}
                            {...register('fullName')}
                            className={errors.fullName ? 'border-red-500' : ''}
                        />
                        {errors.fullName && (
                            <p className="text-sm text-red-500">{errors.fullName.message}</p>
                        )}
                    </div>

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

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
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
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Minimum 8 characters, with one uppercase and one special character.
                        </p>
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
                                aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                            >
                                {showConfirmPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                        {errors.confirmPassword && (
                            <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                        )}
                    </div>

                    <div className="flex items-start space-x-2 pt-1">
                        <Checkbox
                            id="terms"
                            checked={termsAccepted}
                            onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                            disabled={isLoading}
                        />
                        <Label
                            htmlFor="terms"
                            className="text-sm font-normal leading-relaxed text-zinc-600 dark:text-zinc-300"
                        >
                            I agree to the terms and privacy policy.
                        </Label>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="h-10 w-full"
                        disabled={isLoading || !termsAccepted}
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create account
                    </Button>
                </form>

                <div className="mt-6">
                    <SocialLogin />
                </div>

                <div className="mt-6 text-center text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                        Already have an account?{' '}
                    </span>
                    <Link
                        to="/login"
                        className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                        Sign in
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
