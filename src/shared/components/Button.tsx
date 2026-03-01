import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'ghost' | 'icon';
    size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer rounded-lg',
                    {
                        'bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90': variant === 'primary',
                        'border border-black/20 bg-transparent hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5': variant === 'outline',
                        'bg-transparent hover:bg-black/5 dark:hover:bg-white/5': variant === 'ghost' || variant === 'icon',
                    },
                    {
                        'h-9 px-4 py-2': size === 'md' && variant !== 'icon',
                        'h-8 rounded-md px-3 text-sm': size === 'sm' && variant !== 'icon',
                        'h-11 rounded-md px-8': size === 'lg' && variant !== 'icon',
                        'h-10 w-10 shrink-0': size === 'icon' || variant === 'icon',
                    },
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';
