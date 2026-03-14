import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, Languages, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/stores/preferences-store';
import { api } from '@/lib/api-client';
import { IperfSettings } from './iperf-settings';

const themes = [
  { value: 'light' as const, labelKey: 'settings.theme_light', icon: Sun },
  { value: 'dark' as const, labelKey: 'settings.theme_dark', icon: Moon },
  { value: 'system' as const, labelKey: 'settings.theme_system', icon: Monitor },
];

const languages = [
  { value: 'zh-CN' as const, label: '中文' },
  { value: 'en-US' as const, label: 'English' },
];

export function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = usePreferencesStore();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const [nodeName, setNodeName] = useState<string | null>(null);
  const displayName = nodeName ?? settings?.node_name ?? '';

  const updateSettings = useMutation({
    mutationFn: (data: { node_name?: string }) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
      setNodeName(null);
    },
  });

  const isDirty = nodeName !== null && nodeName !== (settings?.node_name ?? '');

  function handleLanguageChange(lang: 'zh-CN' | 'en-US') {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }

  function handleSaveName() {
    if (nodeName !== null) {
      updateSettings.mutate({ node_name: nodeName });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Node Name */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t('settings.node_name')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.node_name_desc')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={displayName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder={t('settings.node_name_placeholder')}
                className="w-48 h-9"
                maxLength={64}
              />
              {isDirty && (
                <Button size="sm" onClick={handleSaveName} disabled={updateSettings.isPending}>
                  <Check className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t('settings.theme')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.theme_desc')}</p>
            </div>
            <div className="flex items-center gap-1">
              {themes.map(({ value, labelKey, icon: Icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(value)}
                >
                  <Icon className="size-4" />
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t('settings.language')}</Label>
              <p className="text-sm text-muted-foreground">{t('settings.language_desc')}</p>
            </div>
            <div className="flex items-center gap-1">
              {languages.map(({ value, label }) => (
                <Button
                  key={value}
                  variant={language === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleLanguageChange(value)}
                >
                  <Languages className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <IperfSettings />
    </div>
  );
}
