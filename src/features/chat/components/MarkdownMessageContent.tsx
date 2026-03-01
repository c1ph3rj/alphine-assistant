import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageContentProps {
    content: string;
}

export default function MarkdownMessageContent({ content }: MarkdownMessageContentProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: ({ node, href, ...props }) => {
                    void node;
                    // Block non-http(s) hrefs (e.g. javascript:, data:) to prevent
                    // XSS via AI-generated or user-submitted markdown content.
                    const safeHref = (() => {
                        if (!href) return undefined;
                        try {
                            const parsed = new URL(href);
                            return parsed.protocol === 'https:' || parsed.protocol === 'http:'
                                ? href
                                : undefined;
                        } catch {
                            return undefined;
                        }
                    })();
                    return (
                        <a
                            {...props}
                            href={safeHref}
                            target="_blank"
                            rel="noreferrer noopener"
                        />
                    );
                },
                code: ({ node, className, children, ...props }) => {
                    void node;
                    const isBlock = Boolean(className);

                    if (!isBlock) {
                        return (
                            <code {...props}>
                                {children}
                            </code>
                        );
                    }

                    return (
                        <pre>
                            <code className={className} {...props}>
                                {children}
                            </code>
                        </pre>
                    );
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
