import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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

  const form = useForm<AddNodeFormValues>({
    resolver: zodResolver(addNodeSchema),
    defaultValues: {
      address: '',
      api_key: '',
      name: '',
    },
  });

  function handleSubmit(values: AddNodeFormValues) {
    addNodeMutation.mutate(
      {
        address: values.address,
        api_key: values.api_key,
        name: values.name || undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                onClick={() => onOpenChange(false)}
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
