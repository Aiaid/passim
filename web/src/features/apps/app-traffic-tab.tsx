import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpFromLine, ArrowDownToLine, Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatBytes } from '@/lib/utils';
import { useAppTraffic } from './queries';
import type { TrafficUserSummary } from '@/lib/api-client';

const PERIODS = ['1h', '24h', '7d', '30d'] as const;

interface AppTrafficTabProps {
  appId: string;
}

function UserRow({ user }: { user: TrafficUserSummary }) {
  const [expanded, setExpanded] = useState(false);
  const hasNodes = (user.nodes?.length ?? 0) > 1;

  return (
    <>
      <TableRow
        className={hasNodes ? 'cursor-pointer hover:bg-muted/50' : undefined}
        onClick={hasNodes ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-1.5">
            {hasNodes && (expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />)}
            {user.username}
          </div>
        </TableCell>
        <TableCell>{formatBytes(user.tx_bytes)}</TableCell>
        <TableCell>{formatBytes(user.rx_bytes)}</TableCell>
        <TableCell>{formatBytes(user.tx_bytes + user.rx_bytes)}</TableCell>
        <TableCell>
          {user.online_connections > 0 ? (
            <Badge variant="outline" className="text-green-600">
              {user.online_connections}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && user.nodes?.map((nd) => (
        <TableRow key={nd.node} className="bg-muted/30">
          <TableCell className="pl-10 text-xs text-muted-foreground">{nd.node}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{formatBytes(nd.tx_bytes)}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{formatBytes(nd.rx_bytes)}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{formatBytes(nd.tx_bytes + nd.rx_bytes)}</TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {nd.online_connections > 0 ? nd.online_connections : '-'}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function AppTrafficTab({ appId }: AppTrafficTabProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<string>('24h');

  const { data } = useAppTraffic(appId, period, true);

  const users = data?.users ?? [];
  const total = data?.total ?? { tx_bytes: 0, rx_bytes: 0 };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <ArrowUpFromLine className="size-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('traffic.total_upload')}</p>
              <p className="text-xl font-semibold">{formatBytes(total.tx_bytes)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-500/10">
              <ArrowDownToLine className="size-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('traffic.total_download')}</p>
              <p className="text-xl font-semibold">{formatBytes(total.rx_bytes)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-user table */}
      {users.length === 0 ? (
        <EmptyState icon={Activity} title={t('traffic.no_data')} description={t('traffic.no_data_desc')} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('traffic.username')}</TableHead>
                <TableHead>{t('traffic.upload')}</TableHead>
                <TableHead>{t('traffic.download')}</TableHead>
                <TableHead>{t('traffic.total')}</TableHead>
                <TableHead>{t('traffic.online')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow key={user.username} user={user} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
