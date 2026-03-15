import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthGuard } from '@/components/layout/auth-guard';
import { AppLayout } from '@/components/layout/app-layout';

// Feature pages
import { LoginPage } from '@/features/auth/login-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ContainersPage } from '@/features/containers/containers-page';
import { MarketplacePage } from '@/features/marketplace/marketplace-page';
import { DeployWizardPage } from '@/features/marketplace/deploy-wizard-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { AppsPage } from '@/features/apps/apps-page';
import { AppDetailPage } from '@/features/apps/app-detail-page';
import { GlobeTestPage } from '@/features/dashboard/globe-test-page';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/test" element={<GlobeTestPage />} />
        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/containers" element={<ContainersPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/apps/new" element={<MarketplacePage />} />
            <Route path="/apps/new/:template" element={<DeployWizardPage />} />
            <Route path="/apps/:id" element={<AppDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
