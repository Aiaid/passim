import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api-client';
import { useAddNode } from './queries';

const addNodeSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  api_key: z.string().min(1, 'API key is required'),
  name: z.string().optional(),
});

type AddNodeFormValues = z.infer<typeof addNodeSchema>;

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddNodeDialog({ open, onOpenChange }: AddNodeDialogProps) {
  const { t } = useTranslation();
  const addNodeMutation = useAddNode();
  const [tlsConfirm, setTlsConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<AddNodeFormValues | null>(null);

  const form = useForm<AddNodeFormValues>({
    resolver: zodResolver(addNodeSchema),
    defaultValues: {
      address: '',
      api_key: '',
      name: '',
    },
  });

  function submitNode(values: AddNodeFormValues, skipTLSVerify = false) {
    addNodeMutation.mutate(
      {
        address: values.address,
        api_key: values.api_key,
        name: values.name || undefined,
        skip_tls_verify: skipTLSVerify,
      },
      {
        onSuccess: () => {
          form.reset();
          setTlsConfirm(false);
          setPendingValues(null);
          onOpenChange(false);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.tlsError) {
            setPendingValues(values);
            setTlsConfirm(true);
          }
        },
      },
    );
  }

  function handleSubmit(values: AddNodeFormValues) {
    submitNode(values, false);
  }

  function handleTlsSkip() {
    if (pendingValues) {
      submitNode(pendingValues, true);
    }
  }

  function handleClose(v: boolean) {
    if (!v) {
      setTlsConfirm(false);
      setPendingValues(null);
    }
    onOpenChange(v);
  }

  if (tlsConfirm) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-500" />
              {t('mobile.tls_error_title')}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {t('mobile.tls_error_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setTlsConfirm(false); setPendingValues(null); }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleTlsSkip}
              disabled={addNodeMutation.isPending}
            >
              {addNodeMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('mobile.tls_skip_connect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('node.add')}</DialogTitle>
          <DialogDescription>
            {t('node.no_nodes_desc')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('node.address')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('node.address_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('node.api_key')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t('node.api_key_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('node.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('node.name_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={addNodeMutation.isPending}>
                {addNodeMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                {t('node.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
