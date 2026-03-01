import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Plus, Search, PanelLeftClose, PanelLeftOpen, User as UserIcon, Settings } from 'lucide-react';
import { useChatHistory } from '../hooks/useChatHistory';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/state/AuthContext';

interface SidebarProps {
    onSelectSession: (id: string) => void;
    onNewChat: () => void;
    onOpenSearch: () => void;
    activeSessionId: string | null;
    historyRefreshVersion: number;
    isOpen: boolean;
    isMobile: boolean;
    onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    onSelectSession,
    onNewChat,
    onOpenSearch,
    activeSessionId,
    historyRefreshVersion,
    isOpen,
    isMobile,
    onToggle
}) => {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
    const { history, loading } = useChatHistory(debouncedSearchTerm, historyRefreshVersion);
    const { user } = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        const handle = window.setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 250);

        return () => window.clearTimeout(handle);
    }, [searchTerm]);

    const openSettings = () => {
        navigate('/settings/profile');
        if (isMobile && isOpen) {
            onToggle();
        }
    };

    const userLabel = user?.fullName || 'User Profile';
    const userInitial = userLabel.trim().charAt(0).toUpperCase();
    const userAvatarUrl = user?.avatarUrl?.trim() ?? '';
    const [isAvatarBroken, setIsAvatarBroken] = React.useState(false);

    React.useEffect(() => {
        setIsAvatarBroken(false);
    }, [userAvatarUrl]);

    const avatarSrc = React.useMemo(() => {
        if (!userAvatarUrl || isAvatarBroken) {
            return '';
        }
        try {
            const url = new URL(userAvatarUrl);
            if (user?.updatedAt) {
                url.searchParams.set('v', user.updatedAt);
            }
            return url.toString();
        } catch {
            return userAvatarUrl;
        }
    }, [isAvatarBroken, user?.updatedAt, userAvatarUrl]);

    return (
        <>
            {/* Mobile Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
                    isMobile && isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
                onClick={onToggle}
            />

            <aside
                className={cn(
                    'inset-y-0 left-0 z-50 flex flex-col bg-[#f9f9f9] transition-all duration-300 ease-in-out dark:bg-[#171717] overflow-hidden will-change-transform',
                    isMobile
                        ? `fixed w-64 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
                        : `static translate-x-0 ${isOpen ? 'w-64' : 'w-[68px]'}`
                )}
            >
                {/* Fixed width inner container to prevent text wrapping during animation */}
                <div className="w-64 flex flex-col h-full">

                    {/* Header: Logo and Toggle */}
                    <div className="flex items-center h-14 px-3.5 shrink-0 dark:border-white/10">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggle}
                            className="h-10 w-10 shrink-0 rounded-lg text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                            title={isOpen ? "Close sidebar" : "Open sidebar"}
                        >
                            {isOpen ? (
                                <PanelLeftClose className="h-5 w-5 hidden lg:block" />
                            ) : (
                                <PanelLeftOpen className="h-5 w-5 hidden lg:block" />
                            )}
                            <PanelLeftClose className="h-5 w-5 lg:hidden" />
                        </Button>
                        <span className={cn(
                            "font-bold text-lg whitespace-nowrap transition-opacity duration-300 pl-2 flex items-center gap-2",
                            isOpen ? "opacity-100 w-auto" : "opacity-0 w-0"
                        )}>
                            Alphine
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-md">v0.0.1</span>
                        </span>
                    </div>

                    {/* Actions: New Chat & Search */}
                    <div className="flex flex-col px-3.5 gap-2 mt-2">
                        <Button
                            variant="ghost"
                            className={cn(
                                "justify-start p-0 h-10 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 overflow-hidden transition-[width] duration-300",
                                isOpen ? "w-[228px]" : "w-[228px] lg:w-10"
                            )}
                            onClick={onNewChat}
                            title="New Chat"
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                                <Plus className="h-5 w-5" />
                            </div>
                            <span className={cn("transition-opacity duration-300 font-semibold text-sm whitespace-nowrap", isOpen ? "opacity-100" : "opacity-0 invisible")}>
                                New Chat
                            </span>
                        </Button>

                        <div className="relative w-full flex items-center h-10">
                            <div className="absolute left-0 flex h-10 w-10 shrink-0 items-center justify-center z-10 pointer-events-none">
                                <Search className="h-4 w-4 text-black/50 dark:text-white/50" />
                            </div>
                            <div className={cn("w-full transition-opacity duration-300", isOpen ? "opacity-100" : "opacity-0 pointer-events-none invisible")}>
                                <Input
                                    placeholder="Search..."
                                    className="pl-10 h-10 w-full bg-white dark:bg-black"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                />
                            </div>
                            <div
                                className={cn("absolute inset-y-0 left-0 w-10 z-20 cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/5", isOpen || isMobile ? "hidden" : "block")}
                                onClick={onOpenSearch}
                                title="Search chats"
                            />
                        </div>
                    </div>

                    {/* History List */}
                    <div className={cn("flex-1 overflow-y-auto mt-4 px-3.5 transition-opacity duration-300", isOpen ? "opacity-100" : "opacity-0 invisible pointer-events-none")}>
                        {loading && isOpen ? (
                            <div className="p-4 text-sm text-center animate-pulse">Loading history...</div>
                        ) : isOpen ? (
                            <div className="flex flex-col gap-1">
                                <div className="px-2 py-1 text-xs font-bold uppercase tracking-wider">History</div>
                                {history.length === 0 ? (
                                    <div className="px-2 py-3 text-xs opacity-70">
                                        {debouncedSearchTerm ? 'No chats match your search.' : 'No chat history yet.'}
                                    </div>
                                ) : (
                                    history.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => onSelectSession(item.id)}
                                            className={cn(
                                                'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
                                                activeSessionId === item.id && 'bg-black/5 dark:bg-white/10'
                                            )}
                                        >
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="truncate text-sm font-medium leading-tight">
                                                    {item.title}
                                                </span>
                                                <span className="truncate text-xs opacity-70 mt-1">
                                                    {item.snippet}
                                                </span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Profile Detail Section */}
                    <div className="p-3.5 shrink-0 border-t border-black/10 dark:border-white/10">
                        <button className={cn(
                            "group flex h-10 items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-[width,background-color] duration-300 overflow-hidden",
                            isOpen ? "w-[228px]" : "w-10"
                        )} title="Open profile and settings" onClick={openSettings}>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-white dark:bg-white dark:text-black">
                                    {avatarSrc ? (
                                        <img
                                            src={avatarSrc}
                                            alt="Profile"
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                            onError={() => setIsAvatarBroken(true)}
                                        />
                                    ) : userInitial ? (
                                        <span className="text-sm font-semibold">{userInitial}</span>
                                    ) : (
                                        <UserIcon className="h-4 w-4" />
                                    )}
                                </div>
                            </div>
                            <div className={cn("flex flex-col flex-1 whitespace-nowrap transition-opacity duration-300", isOpen ? "opacity-100" : "opacity-0")}>
                                <span className="text-sm font-semibold text-black dark:text-white truncate text-left">
                                    {userLabel}
                                </span>
                            </div>
                            <Settings className={cn("h-4 w-4 shrink-0 transition-opacity duration-300 mx-3", isOpen ? "opacity-50 group-hover:opacity-100" : "opacity-0")} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};
