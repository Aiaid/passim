import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { Header } from './header';
import { useTheme } from '@/hooks/use-theme';
import { useEventStream } from '@/hooks/use-event-stream';

export function AppLayout() {
  useTheme();
  const { status } = useEventStream();

  useEffect(() => {
    document.title = status?.node.name
      ? `Passim - ${status.node.name}`
      : 'Passim';
  }, [status?.node.name]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
