import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { CategoryIcon } from '@/components/shared/category-icon';
import { CredentialField } from '@/components/shared/credential-field';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_COLORS } from '@/lib/constants';
import { localized } from '@/lib/utils';
import { useApp, useTemplateForApp, useTemplateDetail } from './queries';
import { ClientConfig } from './client-config';
import { AppEvents } from './app-events';
import { AppSettingsForm } from './app-settings-form';
import { ConnectionGuide } from './connection-guide';
import { UndeployDialog } from './undeploy-dialog';

function isSensitiveSetting(key: string): boolean {
  return /password|psk|secret|key|uuid|token/i.test(key);
}

export function AppDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showUndeploy, setShowUndeploy] = useState(false);

  const { data: app, isLoading } = useApp(id!);
  const template = useTemplateForApp(app?.template);
  const { data: templateDetail } = useTemplateDetail(app?.template);

  const parsedSettings = useMemo(() => {
    if (!app?.settings) return {};
    return app.settings as Record<string, unknown>;
  }, [app?.settings]);

  if (isLoading || !app) {
    return <PageSkeleton />;
  }

  const categoryColor = CATEGORY_COLORS[template?.category ?? 'vpn'] || 'var(--cat-vpn)';

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div
        className="rounded-xl border p-6"
        style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${categoryColor} 5%, transparent), transparent)` }}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button onClick={() => navigate('/apps')} className="hover:text-foreground transition-colors">
            {t('app.title')}
          </button>
          <span>/</span>
          <span className="capitalize">{app.template}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CategoryIcon category={template?.category ?? ''} templateName={app.template} size="lg" />
            <div>
              <h1 className="text-2xl font-bold capitalize">{app.template}</h1>
              {template && (
                <p className="text-sm text-muted-foreground mt-1">
                  {localized(template.description, i18n.language)}
                </p>
              )}
              {templateDetail?.source && (
                <div className="flex items-center gap-2 mt-2">
                  {templateDetail.source.url && (
                    <a
                      href={templateDetail.source.url}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-primary hover:underline"
                    >
                      {t('app.source')}
                    </a>
                  )}
                  {templateDetail.source.license && (
                    <Badge variant="secondary" className="text-xs">
                      {templateDetail.source.license}
                    </Badge>
                  )}
                </div>
              )}
              <div className="mt-2">
                <StatusBadge status={app.status} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="destructive" size="sm" onClick={() => setShowUndeploy(true)}>
              <Trash2 className="mr-1 size-4" />
              {t('app.undeploy')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('app.overview')}</TabsTrigger>
          <TabsTrigger value="settings">{t('app.settings_tab')}</TabsTrigger>
          <TabsTrigger value="client-config">{t('app.client_config', 'Client Config')}</TabsTrigger>
          <TabsTrigger value="events">{t('app.events')}</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Connection Details card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('app.connection_details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CredentialField
                  label={t('app.container')}
                  value={app.container_id?.slice(0, 12) ?? '-'}
                  sensitive={false}
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('app.deployed_at')}</span>
                  <span>{new Date(app.deployed_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('app.updated_at')}</span>
                  <span>{new Date(app.updated_at).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Credentials card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('app.credentials')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(parsedSettings).map(([key, value]) => (
                  <CredentialField
                    key={key}
                    label={key}
                    value={String(value ?? '-')}
                    sensitive={isSensitiveSetting(key)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Connection Guide */}
          {templateDetail && <ConnectionGuide template={templateDetail} />}

          {/* Limitations */}
          {templateDetail?.limitations && templateDetail.limitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('app.limitations')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {templateDetail.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <AppSettingsForm
                appId={app.id}
                currentSettings={parsedSettings}
                settingsSchema={template?.settings ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Client Config tab */}
        <TabsContent value="client-config" className="mt-6">
          <ClientConfig appId={app.id} />
        </TabsContent>

        {/* Events tab */}
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
