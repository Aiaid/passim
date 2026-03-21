import { useLocation, Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Container, AppWindow, Globe, Settings, LogOut, ArrowUpCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api-client';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
  { key: 'dashboard', path: '/', icon: LayoutDashboard },
  { key: 'containers', path: '/containers', icon: Container },
  { key: 'apps', path: '/apps', icon: AppWindow },
  { key: 'nodes', path: '/nodes', icon: Globe },
];

const bottomItems = [
  { key: 'settings', path: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { state } = useSidebar();

  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: () => api.getVersion(),
    staleTime: Infinity,
  });

  const { data: updateInfo } = useQuery({
    queryKey: ['update-check', false],
    queryFn: () => api.checkUpdate(),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const hasUpdate = updateInfo?.available ?? false;

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          {state === 'collapsed' ? (
            <img src="/logo/svg/passim-icon.svg" alt="Passim" className="size-6" />
          ) : (
            <>
              <img src="/logo/svg/passim-color.svg" alt="Passim" className="h-7 dark:hidden" />
              <img src="/logo/svg/passim-white.svg" alt="Passim" className="h-7 hidden dark:block" />
            </>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.local')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.path} size="lg" className="text-base">
                    <Link to={item.path}>
                      <item.icon className="size-5" />
                      <span>{t(`nav.${item.key}`)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* Update available indicator */}
          {hasUpdate && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="text-base text-[oklch(0.65_0.2_145)] hover:text-[oklch(0.7_0.2_145)]"
              >
                <Link to="/settings">
                  <ArrowUpCircle className="size-5" />
                  <span className="flex items-center gap-2">
                    {t('settings.update_available')}
                    <span className="text-xs font-mono opacity-70">{updateInfo?.latest}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {bottomItems.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton asChild isActive={location.pathname === item.path} size="lg" className="text-base">
                <Link to={item.path}>
                  <item.icon className="size-5" />
                  <span>{t(`nav.${item.key}`)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {/* Version display */}
          {state !== 'collapsed' && versionInfo?.version && (
            <SidebarMenuItem>
              <div className="px-3 py-1.5">
                <span className="text-xs font-mono text-muted-foreground/50">
                  {versionInfo.version}
                </span>
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="text-base text-muted-foreground hover:text-destructive"
              onClick={() => { logout(); navigate('/login', { replace: true }); }}
            >
              <LogOut className="size-5" />
              <span>{t('nav.logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
