import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { useCreateStack, useValidateStack } from './queries';

interface StackCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StackCreateDialog({ open, onOpenChange }: StackCreateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [yamlText, setYamlText] = useState('');
  const [envText, setEnvText] = useState('');

  const validate = useValidateStack();
  const create = useCreateStack();

  // Reset on close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setName('');
      setYamlText('');
      setEnvText('');
      validate.reset();
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce validate: fire 500ms after the user stops typing.
  useEffect(() => {
    if (!open) return;
    if (!name.trim() || !yamlText.trim()) {
      validate.reset();
      return;
    }
    const handle = setTimeout(() => {
      validate.mutate({ name, yaml_text: yamlText, env_text: envText });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, yamlText, envText]);

  const handleCreate = () => {
    if (!name.trim() || !yamlText.trim()) return;
    create.mutate(
      { name, yaml_text: yamlText, env_text: envText },
      {
        onSuccess: () => {
          toast.success(t('stacks.create_queued'));
          onOpenChange(false);
        },
        onError: (err) => {
          const apiErr = err as ApiError;
          const translated =
            apiErr.code && t(`stacks.error.${apiErr.code}`, { defaultValue: '' });
          toast.error(translated || apiErr.message || t('common.error'));
        },
      },
    );
  };

  const validateError =
    validate.error instanceof ApiError ? (validate.error as ApiError) : null;
  const validateData = validate.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('stacks.create_title')}</DialogTitle>
          <DialogDescription>{t('stacks.create_desc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="stack-name">{t('stacks.name')}</Label>
            <Input
              id="stack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="immich"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="stack-yaml">{t('stacks.yaml')}</Label>
            <textarea
              id="stack-yaml"
              className="w-full min-h-[240px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={yamlText}
              onChange={(e) => setYamlText(e.target.value)}
              placeholder={'services:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"'}
              spellCheck={false}
            />
          </div>

          <div>
            <Label htmlFor="stack-env">{t('stacks.env_optional')}</Label>
            <textarea
              id="stack-env"
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="DB_PASSWORD=supersecret"
              spellCheck={false}
            />
          </div>

          {validate.isPending && (
            <p className="text-xs text-muted-foreground">{t('stacks.validating')}</p>
          )}
          {validateData && (
            <div className="flex items-start gap-2 rounded-md border border-status-running/30 bg-status-running/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-running" />
              <div className="flex-1">
                <p>
                  {t('stacks.validate_ok', {
                    count: validateData.services.length,
                    services: validateData.services.join(', '),
                  })}
                </p>
                {validateData.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {validateData.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {validateError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="font-medium">
                  {validateError.code
                    ? t(`stacks.error.${validateError.code}`, {
                        defaultValue: validateError.message,
                      })
                    : validateError.message}
                </p>
                {validateError.code && (
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                    {validateError.code}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !name.trim() ||
              !yamlText.trim() ||
              create.isPending ||
              !validateData // require passing validation before deploy
            }
          >
            {create.isPending ? t('stacks.creating') : t('stacks.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
