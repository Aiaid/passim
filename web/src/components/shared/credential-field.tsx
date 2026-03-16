import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CredentialFieldProps {
  label: string;
  value: string;
  sensitive?: boolean;
  className?: string;
}

export function CredentialField({ label, value, sensitive = true, className }: CredentialFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(!sensitive);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayValue = visible ? value : '\u2022'.repeat(Math.min(value.length, 20));

  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn(
          'mt-0.5 text-sm truncate',
          visible ? 'font-mono' : 'tracking-wider',
        )}>
          {displayValue}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {sensitive && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setVisible((v) => !v)}
            title={visible ? t('app.hide_password') : t('app.show_password')}
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleCopy}
          title={copied ? t('app.copied') : t('app.copy')}
        >
          {copied ? (
            <Check className="size-3.5 text-green-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
