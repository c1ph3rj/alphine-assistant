import React from 'react';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';

interface AvatarProps {
    className?: string;
    fallback?: string;
    role?: 'user' | 'assistant';
}

export const Avatar: React.FC<AvatarProps> = ({ className, fallback, role = 'user' }) => {
    return (
        <div
            className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 text-black dark:bg-white/10 dark:text-white',
                {
                    'bg-black text-white dark:bg-white dark:text-black': role === 'user',
                },
                className
            )}
        >
            {fallback ? (
                <span className="font-bold text-sm uppercase">{fallback}</span>
            ) : role === 'user' ? (
                <User className="h-5 w-5" />
            ) : (
                <Bot className="h-5 w-5" />
            )}
        </div>
    );
};
