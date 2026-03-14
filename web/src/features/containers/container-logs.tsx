import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useContainerLogs } from './queries';

interface ContainerLogsProps {
  containerId: string | null;
  containerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContainerLogs({
  containerId,
  containerName,
  open,
  onOpenChange,
}: ContainerLogsProps) {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useContainerLogs(open ? containerId : null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data?.logs) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.logs]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col">
        <SheetHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <SheetTitle>
            {t('container.logs')} - {containerName}
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RotateCcw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4 rounded-md bg-zinc-950 p-4">
          <pre className="text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all">
            {isLoading
              ? t('common.loading')
              : data?.logs || t('common.no_data')}
          </pre>
          <div ref={bottomRef} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
