import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoginPage } from '@/pages/login';
import { buildRoutes } from '@/routes';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Gate: /me must succeed. On 401 the api layer already redirects; here we
 *  guard the initial load and unauthenticated navigation. */
function RequireAuth() {
  const { isLoading, isError, me } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullScreenSpinner />;
  if (isError || !me) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppShell />;
}

export default function App() {
  const routes = buildRoutes();
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
