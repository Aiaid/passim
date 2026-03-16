import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Trash2, Package } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_ICONS } from '@/lib/constants';
import { useApp, useTemplateForApp } from './queries';
import { AppConfigs } from './app-configs';
import { AppEvents } from './app-events';
import { AppSettingsForm } from './app-settings-form';
import { UndeployDialog } from './undeploy-dialog';

export function AppDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showUndeploy, setShowUndeploy] = useState(false);

  const { data: app, isLoading } = useApp(id!);
  const template = useTemplateForApp(app?.template);

  const parsedSettings = useMemo(() => {
    if (!app?.settings) return {};
    return app.settings as Record<string, unknown>;
  }, [app?.settings]);

  if (isLoading || !app) {
    return <PageSkeleton />;
  }

  const Icon = template ? (CATEGORY_ICONS[template.category] || Package) : Package;

  return (
    <div className="space-y-6">
      <PageHeader
        title={app.template}
        description={t('app.detail')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/apps')}>
              <ArrowLeft className="mr-1 size-4" />
              {t('app.back')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowUndeploy(true)}
            >
              <Trash2 className="mr-1 size-4" />
              {t('app.undeploy')}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('app.overview')}</TabsTrigger>
          <TabsTrigger value="configs">{t('app.configs')}</TabsTrigger>
          <TabsTrigger value="events">{t('app.events')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                {app.template}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t('app.status')}</p>
                  <div className="mt-1">
                    <StatusBadge status={app.status} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('app.container')}</p>
                  <p className="mt-1 font-mono text-sm">{app.container_id ? app.container_id.slice(0, 12) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('app.deployed_at')}</p>
                  <p className="mt-1 text-sm">{new Date(app.deployed_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('app.updated_at')}</p>
                  <p className="mt-1 text-sm">{new Date(app.updated_at).toLocaleString()}</p>
                </div>
              </div>

              <Separator />

              <AppSettingsForm
                appId={app.id}
                currentSettings={parsedSettings}
                settingsSchema={template?.settings ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configs" className="mt-6">
          <AppConfigs appId={app.id} />
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <AppEvents appId={app.id} />
        </TabsContent>
      </Tabs>

      <UndeployDialog
        appId={app.id}
        open={showUndeploy}
        onOpenChange={setShowUndeploy}
      />
    </div>
  );
}
