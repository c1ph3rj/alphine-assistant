import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    autoResize?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, autoResize = true, onChange, ...props }, ref) => {
        const internalRef = useRef<HTMLTextAreaElement>(null);
        const textareaRef = (ref as React.MutableRefObject<HTMLTextAreaElement>) || internalRef;

        const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            if (autoResize && textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
            }
            onChange?.(e);
        };

        useEffect(() => {
            if (autoResize && textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
            }
        }, [autoResize, props.value, textareaRef]);

        return (
            <textarea
                className={cn(
                    'flex min-h-[40px] w-full rounded-xl border border-black/20 bg-transparent px-3 py-2 text-sm text-black placeholder:text-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:text-white dark:placeholder:text-white/50 dark:focus-visible:ring-white/20 resize-none',
                    className
                )}
                ref={textareaRef}
                onChange={handleInput}
                {...props}
            />
        );
    }
);
Textarea.displayName = 'Textarea';
