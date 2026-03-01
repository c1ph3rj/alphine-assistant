import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

import { verifyMFASchema } from '../validation/schemas';
import type { VerifyMFAInput } from '../validation/schemas';
import { useVerifyMFA } from '../hooks/useVerifyMFA';

interface MFAVerifyFormProps {
    isSetupMode?: boolean;
    variant?: 'card' | 'embedded';
}

export function MFAVerifyForm({ isSetupMode = false, variant = 'card' }: MFAVerifyFormProps) {
    const { verifyMFA, isLoading, error } = useVerifyMFA(isSetupMode);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<VerifyMFAInput>({
        resolver: zodResolver(verifyMFASchema),
        defaultValues: {
            code: '',
        },
    });

    const onSubmit = (data: VerifyMFAInput) => {
        verifyMFA(data);
    };

    const formContent = (
        <>
            {variant === 'embedded' && (
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                        Verify code
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Enter the 6-digit code from your authenticator app.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="code" className="sr-only">Authenticator code</Label>
                    <Input
                        id="code"
                        placeholder="000000"
                        maxLength={6}
                        disabled={isLoading}
                        className={cn(
                            'text-center font-mono text-lg tracking-[0.42em] sm:tracking-[0.5em]',
                            errors.code && 'border-red-500',
                        )}
                        {...register('code')}
                    />
                    {errors.code && (
                        <p className="text-center text-sm text-red-500">{errors.code.message}</p>
                    )}
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                        {error}
                    </div>
                )}

                <Button type="submit" className="h-10 w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSetupMode ? 'Finish setup' : 'Verify and continue'}
                </Button>
            </form>

            {!isSetupMode && variant === 'card' && (
                <div className="mt-6 text-center text-sm">
                    <Link
                        to="/login"
                        className="text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
                    >
                        Back to sign in
                    </Link>
                </div>
            )}
        </>
    );

    if (variant === 'embedded') {
        return <div className="space-y-4">{formContent}</div>;
    }

    return (
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                    {isSetupMode ? 'Verify setup' : 'Two-factor authentication'}
                </CardTitle>
                <CardDescription>
                    Enter the 6-digit code from your authenticator app.
                </CardDescription>
            </CardHeader>
            <CardContent>{formContent}</CardContent>
        </Card>
    );
}
