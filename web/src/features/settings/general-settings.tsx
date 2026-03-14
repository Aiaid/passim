import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { usePreferencesStore } from '@/stores/preferences-store';

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

  function handleLanguageChange(lang: 'zh-CN' | 'en-US') {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.general')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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
  );
}
