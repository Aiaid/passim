import { useLocation, Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Container, AppWindow, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
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
