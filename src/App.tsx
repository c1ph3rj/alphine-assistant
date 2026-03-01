import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/state/AuthContext';
import { Loader2 } from 'lucide-react';
import { AppDialogProvider } from './shared/components/ui/app-dialog-provider';

const AuthLayout = lazy(() =>
  import('./features/auth/components/AuthLayout').then((module) => ({ default: module.AuthLayout })),
);
const SignInPage = lazy(() =>
  import('./features/auth/pages/SignInPage').then((module) => ({ default: module.SignInPage })),
);
const RegisterPage = lazy(() =>
  import('./features/auth/pages/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const VerifyEmailPage = lazy(() =>
  import('./features/auth/pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })),
);
const SetupMFAPage = lazy(() =>
  import('./features/auth/pages/SetupMFAPage').then((module) => ({ default: module.SetupMFAPage })),
);
const VerifyMFAPage = lazy(() =>
  import('./features/auth/pages/VerifyMFAPage').then((module) => ({ default: module.VerifyMFAPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./features/auth/pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })),
);
const OAuthCallbackPage = lazy(() =>
  import('./features/auth/pages/OAuthCallbackPage').then((module) => ({ default: module.OAuthCallbackPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./features/auth/pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })),
);
const ChatLayout = lazy(() =>
  import('./features/chat/components/ChatLayout').then((module) => ({ default: module.ChatLayout })),
);
const SettingsPage = lazy(() =>
  import('./features/settings/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const LandingPage = lazy(() =>
  import('./features/landing/pages/LandingPage').then((module) => ({ default: module.LandingPage })),
);

function getPostAuthRedirect(user: ReturnType<typeof useAuth>['user']) {
  if (user && !user.isEmailVerified) {
    return {
      pathname: '/verify-email',
      state: { email: user.email },
    };
  }

  if (user && !user.isMfaEnabled) {
    return {
      pathname: '/setup-mfa',
      state: { email: user.email },
    };
  }

  return {
    pathname: '/',
    state: undefined,
  };
}

// Protected Route Wrapper
function FullScreenLoader() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }

  if (user && !user.isEmailVerified) {
    return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  }

  if (user && !user.isMfaEnabled) {
    return <Navigate to="/setup-mfa" replace state={{ email: user.email }} />;
  }

  return <>{children}</>;
}

function GuestAuthRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated) {
    const redirect = getPostAuthRedirect(user);
    return <Navigate to={redirect.pathname} replace state={redirect.state} />;
  }

  return <>{children}</>;
}

function PublicLandingRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <LandingPage />;
}


function AppRoutes() {
  const location = useLocation();

  return (
    <div
      key={`${location.pathname}${location.search}`}
      className="page-transition-layer"
    >
      <Suspense fallback={<FullScreenLoader />}>
        <Routes location={location}>
          <Route path="/welcome" element={<PublicLandingRoute />} />

          {/* Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route
              path="/login"
              element={(
                <GuestAuthRoute>
                  <SignInPage />
                </GuestAuthRoute>
              )}
            />
            <Route
              path="/register"
              element={(
                <GuestAuthRoute>
                  <RegisterPage />
                </GuestAuthRoute>
              )}
            />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/setup-mfa" element={<SetupMFAPage />} />
            <Route path="/verify-mfa" element={<VerifyMFAPage />} />
            <Route
              path="/forgot-password"
              element={(
                <GuestAuthRoute>
                  <ForgotPasswordPage />
                </GuestAuthRoute>
              )}
            />
            <Route
              path="/reset-password"
              element={(
                <GuestAuthRoute>
                  <ResetPasswordPage />
                </GuestAuthRoute>
              )}
            />
            <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
          </Route>

          {/* Main App Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div
                  className="h-[100svh] w-full overflow-hidden antialiased bg-white text-black dark:bg-black dark:text-white"
                  style={{
                    paddingTop: 'env(safe-area-inset-top)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                  }}
                >
                  <ChatLayout />
                </div>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Navigate to="/settings/profile" replace />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings/:section"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppDialogProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AppDialogProvider>
    </AuthProvider>
  );
}

export default App;
