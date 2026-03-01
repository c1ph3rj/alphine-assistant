import type { PendingAuthFlow } from '../domain/models';

const PENDING_AUTH_FLOW_KEY = 'pending_auth_flow';

export function savePendingAuthFlow(flow: PendingAuthFlow) {
    sessionStorage.setItem(PENDING_AUTH_FLOW_KEY, JSON.stringify(flow));
}

export function getPendingAuthFlow(): PendingAuthFlow | null {
    const raw = sessionStorage.getItem(PENDING_AUTH_FLOW_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw) as PendingAuthFlow;
    } catch {
        sessionStorage.removeItem(PENDING_AUTH_FLOW_KEY);
        return null;
    }
}

export function clearPendingAuthFlow() {
    sessionStorage.removeItem(PENDING_AUTH_FLOW_KEY);
}

