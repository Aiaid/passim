import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CATEGORY_ICONS } from '@/lib/constants';
import { useEventStream } from '@/hooks/use-event-stream';
import { TemplateGrid } from './template-grid';
import { useTemplates } from './queries';

const CATEGORIES = ['all', 'vpn', 'storage', 'proxy', 'remote', 'tools'] as const;

export function MarketplacePage() {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useTemplates();
  const { apps } = useEventStream();

  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!templates) return [];

    // Hide templates that are already deployed
    const deployedTemplates = new Set(apps?.map((a) => a.template));

    return templates.filter((tpl) => {
      if (deployedTemplates.has(tpl.name)) return false;
      const matchCategory = category === 'all' || tpl.category === category;
      const matchSearch =
        !search || tpl.name.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [templates, category, search, apps]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  const hasFilter = category !== 'all' || search.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('marketplace.title')} />

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList>
          {CATEGORIES.map((cat) => {
            const CatIcon = CATEGORY_ICONS[cat];
            return (
              <TabsTrigger key={cat} value={cat}>
                {CatIcon && <CatIcon className="mr-1.5 size-3.5" />}
                {t(`marketplace.${cat}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('marketplace.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <TemplateGrid templates={filtered} hasFilter={hasFilter} />
    </div>
  );
}
