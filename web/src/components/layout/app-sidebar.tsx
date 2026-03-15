import { useLocation, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Container, AppWindow, Settings } from 'lucide-react';
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
