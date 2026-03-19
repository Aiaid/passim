import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralSettings } from './general-settings';
import { SecuritySettings } from './security-settings';
import { SSLSettings } from './ssl-settings';
import { UpdateSettings } from './update-settings';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
          <TabsTrigger value="ssl">{t('settings.ssl')}</TabsTrigger>
          <TabsTrigger value="system">{t('settings.system')}</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SecuritySettings />
        </TabsContent>
        <TabsContent value="ssl" className="mt-6">
          <SSLSettings />
        </TabsContent>
        <TabsContent value="system" className="mt-6">
          <UpdateSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
