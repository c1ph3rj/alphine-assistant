import { MFAVerifyForm } from '../components/MFAVerifyForm';
import { Navigate } from 'react-router-dom';
import { getPendingAuthFlow } from '../utils/pendingAuthFlow';
import { useAuth } from '../state/AuthContext';

export function VerifyMFAPage() {
    const { user, isLoading } = useAuth();
    const pendingFlow = getPendingAuthFlow();

    if (isLoading) {
        return null;
    }

    // Prevent redirecting to /login after successful MFA when pending flow gets cleared first.
    if (user) {
        if (!user.isEmailVerified) {
            return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
        }
        if (!user.isMfaEnabled) {
            return <Navigate to="/setup-mfa" replace state={{ email: user.email }} />;
        }
        return <Navigate to="/" replace />;
    }

    if (!pendingFlow || pendingFlow.step !== 'mfa_challenge_required') {
        return <Navigate to="/login" replace />;
    }

    return <MFAVerifyForm />;
}
