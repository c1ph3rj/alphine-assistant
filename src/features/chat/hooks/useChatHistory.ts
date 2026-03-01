import { useState, useEffect } from 'react';
import type { ChatHistoryItem } from '../domain/models';
import { ChatService } from '../services/chatService';

export function useChatHistory(searchTerm: string, refreshVersion = 0) {
    const [history, setHistory] = useState<ChatHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            try {
                const data = await ChatService.getHistory(searchTerm);
                setHistory(data);
            } finally {
                setLoading(false);
            }
        }
        void fetchHistory();
    }, [searchTerm, refreshVersion]);

    return { history, loading };
}
