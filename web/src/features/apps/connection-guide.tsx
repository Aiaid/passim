import { useTranslation } from 'react-i18next';
import { Smartphone, Monitor, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localized } from '@/lib/utils';
import type { TemplateDetail } from '@/lib/api-client';

interface ConnectionGuideProps {
  template: TemplateDetail;
}

export function ConnectionGuide({ template }: ConnectionGuideProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const usage = template.guide?.usage ? localized(template.guide.usage, lang) : null;
  const clients = template.clients;

  if (!usage && !clients) return null;

  const clientEntries = [
    { key: 'mobile', data: clients?.mobile, icon: Smartphone },
    { key: 'desktop', data: clients?.desktop, icon: Monitor },
    { key: 'web', data: clients?.web, icon: Globe },
  ].filter(e => e.data);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('app.how_to_connect')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage && <p className="text-sm text-muted-foreground">{usage}</p>}
        {clientEntries.length > 0 && (
          <div className="space-y-2">
            {clientEntries.map(({ key, data, icon: Icon }) => (
              <div key={key} className="flex items-start gap-3 rounded-lg border-l-2 border-primary/30 pl-3 py-2">
                <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{data!.label ? localized(data!.label, lang) : key}</p>
                  {data!.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{localized(data!.description, lang)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
