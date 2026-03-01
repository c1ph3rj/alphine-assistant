import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';

const MOBILE_BREAKPOINT = 1024;
const EXPANDED_DESKTOP_BREAKPOINT = 1280;

export const ChatLayout: React.FC = () => {
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => window.innerWidth >= EXPANDED_DESKTOP_BREAKPOINT);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [newChatVersion, setNewChatVersion] = useState(0);
    const [historyRefreshVersion, setHistoryRefreshVersion] = useState(0);

    const isMobile = viewportWidth < MOBILE_BREAKPOINT;
    const isSidebarOpen = isMobile ? isMobileSidebarOpen : isSidebarExpanded;

    useEffect(() => {
        let previousIsMobile = window.innerWidth < MOBILE_BREAKPOINT;

        const handleResize = () => {
            const width = window.innerWidth;
            const nextIsMobile = width < MOBILE_BREAKPOINT;

            setViewportWidth(width);
            if (nextIsMobile) {
                setIsMobileSidebarOpen(false);
            } else if (previousIsMobile) {
                setIsSidebarExpanded(width >= EXPANDED_DESKTOP_BREAKPOINT);
            }

            previousIsMobile = nextIsMobile;
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSelectSession = (id: string) => {
        setActiveSessionId(id || null);
        if (isMobile) {
            setIsMobileSidebarOpen(false);
        }
    };

    const handleNewChat = () => {
        setActiveSessionId(null);
        setNewChatVersion((prev) => prev + 1);
        if (isMobile) {
            setIsMobileSidebarOpen(false);
        }
    };

    const handleSessionLinked = (sessionId: string) => {
        setActiveSessionId(sessionId);
        if (isMobile) {
            setIsMobileSidebarOpen(false);
        }
    };

    const handleHistoryInvalidate = () => {
        setHistoryRefreshVersion((prev) => prev + 1);
    };

    const handleOpenSidebar = () => {
        if (isMobile) {
            setIsMobileSidebarOpen(true);
            return;
        }

        setIsSidebarExpanded(true);
    };

    const handleToggleSidebar = () => {
        if (isMobile) {
            setIsMobileSidebarOpen((prev) => !prev);
            return;
        }

        setIsSidebarExpanded((prev) => !prev);
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-white text-black dark:bg-black dark:text-white">
            <Sidebar
                activeSessionId={activeSessionId}
                historyRefreshVersion={historyRefreshVersion}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
                onOpenSearch={handleOpenSidebar}
                isOpen={isSidebarOpen}
                onToggle={handleToggleSidebar}
                isMobile={isMobile}
            />
            <main className="flex min-w-0 flex-1 flex-col relative transition-all duration-300">
                <ChatArea
                    sessionId={activeSessionId}
                    resetVersion={newChatVersion}
                    onSessionLinked={handleSessionLinked}
                    onHistoryInvalidate={handleHistoryInvalidate}
                    onToggleSidebar={handleToggleSidebar}
                    isSidebarOpen={isSidebarOpen}
                />
            </main>
        </div>
    );
};
