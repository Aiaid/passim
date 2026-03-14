import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import type { Container } from '@/lib/api-client';
import { ContainerActions } from './container-actions';
import { ContainerLogs } from './container-logs';

interface ContainerListProps {
  containers: Container[];
}

function mapState(state: string): string {
  if (state === 'exited') return 'stopped';
  return state;
}

function displayName(container: Container): string {
  return container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
}

function truncateImage(image: string, max = 40): string {
  if (image.length <= max) return image;
  return image.slice(0, max) + '...';
}

export function ContainerList({ containers }: ContainerListProps) {
  const { t } = useTranslation();
  const [logsContainer, setLogsContainer] = useState<Container | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('container.name')}</TableHead>
            <TableHead>{t('container.image')}</TableHead>
            <TableHead>{t('container.state')}</TableHead>
            <TableHead>{t('container.status')}</TableHead>
            <TableHead className="w-12">{t('container.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {containers.map((container) => (
            <TableRow key={container.Id}>
              <TableCell className="font-medium">
                {displayName(container)}
              </TableCell>
              <TableCell className="text-muted-foreground" title={container.Image}>
                {truncateImage(container.Image)}
              </TableCell>
              <TableCell>
                <StatusBadge status={mapState(container.State)} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {container.Status}
              </TableCell>
              <TableCell>
                <ContainerActions
                  container={container}
                  onViewLogs={() => setLogsContainer(container)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ContainerLogs
        containerId={logsContainer?.Id ?? null}
        containerName={logsContainer ? displayName(logsContainer) : ''}
        open={!!logsContainer}
        onOpenChange={(open) => {
          if (!open) setLogsContainer(null);
        }}
      />
    </>
  );
}
