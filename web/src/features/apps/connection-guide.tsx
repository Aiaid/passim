import { useTranslation } from 'react-i18next';
import { Smartphone, Monitor, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localized } from '@/lib/utils';
import type { TemplateDetail } from '@/lib/api-client';

interface ConnectionGuideProps {
  template: TemplateDetail;
}

const platformIcons: Record<string, typeof Smartphone> = {
  iOS: Smartphone,
  Android: Smartphone,
  Windows: Monitor,
  macOS: Monitor,
  Linux: Monitor,
};

export function ConnectionGuide({ template }: ConnectionGuideProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const usage = template.guide?.usage ? localized(template.guide.usage, lang) : null;
  const platforms = template.guide?.platforms;

  if (!usage && (!platforms || platforms.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('app.how_to_connect')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage && <p className="text-sm text-muted-foreground">{usage}</p>}
        {platforms && platforms.length > 0 && (
          <div className="space-y-3">
            {platforms.map((platform) => {
              const Icon = platformIcons[platform.name] || Monitor;
              const storeLink = platform.store_url || platform.download_url;
              return (
                <div key={platform.name} className="flex items-start gap-3 rounded-lg border-l-2 border-primary/30 pl-3 py-2">
                  <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{platform.name}</p>
                      {storeLink && (
                        <a
                          href={storeLink}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                      {platform.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
