import { useTranslation } from 'react-i18next';
import { Container } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { CardGridSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useContainers } from './queries';
import { ContainerList } from './container-list';

export function ContainersPage() {
  const { t } = useTranslation();
  const { data: containers, isLoading } = useContainers();

  return (
    <div className="space-y-6">
      <PageHeader title={t('container.title')} />

      {isLoading ? (
        <CardGridSkeleton />
      ) : !containers || containers.length === 0 ? (
        <EmptyState
          icon={Container}
          title={t('container.no_containers')}
          description={t('container.no_containers_desc')}
        />
      ) : (
        <ContainerList containers={containers} />
      )}
    </div>
  );
}
