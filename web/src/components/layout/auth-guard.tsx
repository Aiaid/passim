import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/stores/auth-store';
import { EventStreamProvider } from '@/hooks/use-event-stream';

export function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <EventStreamProvider>
      <Outlet />
    </EventStreamProvider>
  );
}
