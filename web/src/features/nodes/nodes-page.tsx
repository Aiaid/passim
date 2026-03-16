import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEventStream } from '@/hooks/use-event-stream';
import { useNodes } from './queries';
import { NodeCard } from './node-card';
import { AddNodeDialog } from './add-node-dialog';

export function NodesPage() {
  const { t } = useTranslation();
  const { nodes: sseNodes } = useEventStream();
  const { data: queryNodes, isLoading } = useNodes();
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Prefer SSE data, fall back to query data
  const nodes = sseNodes ?? queryNodes;
  const loading = nodes === null && isLoading;

  const connectedCount = nodes?.filter((n) => n.status === 'connected').length ?? 0;

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t('node.title')}
            {connectedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {connectedCount} {t('node.connected')}
              </Badge>
            )}
          </>
        }
        actions={
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 size-4" />
            {t('node.add')}
          </Button>
        }
      />

      {!nodes || nodes.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={t('node.no_nodes')}
          description={t('node.no_nodes_desc')}
          actionLabel={t('node.add')}
          onAction={() => setShowAddDialog(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 app-stagger">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}

      <AddNodeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </div>
  );
}
