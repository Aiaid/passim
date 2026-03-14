import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { localized } from '@/lib/utils';
import type { SettingInfo } from '@/lib/api-client';
import { useUpdateApp } from './queries';

interface AppSettingsFormProps {
  appId: string;
  currentSettings: Record<string, unknown>;
  settingsSchema: SettingInfo[];
}

function buildSchema(settings: SettingInfo[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const s of settings) {
    if (s.type === 'number') {
      let schema = z.coerce.number();
      if (s.min !== undefined) schema = schema.min(s.min);
      if (s.max !== undefined) schema = schema.max(s.max);
      shape[s.key] = schema.optional();
    } else if (s.type === 'boolean') {
      shape[s.key] = z.boolean().optional();
    } else {
      shape[s.key] = z.string().optional();
    }
  }

  return z.object(shape);
}

export function AppSettingsForm({ appId, currentSettings, settingsSchema }: AppSettingsFormProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const updateApp = useUpdateApp();

  const schema = useMemo(() => buildSchema(settingsSchema), [settingsSchema]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: currentSettings,
  });

  function handleSubmit(values: Record<string, unknown>) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === undefined) continue;
      cleaned[key] = value;
    }
    updateApp.mutate(
      { id: appId, settings: cleaned },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('app.settings')}</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Edit className="mr-1 size-4" />
            {t('app.edit_settings')}
          </Button>
        </div>
        <div className="space-y-2">
          {settingsSchema.map((s) => {
            const label = localized(s.label, i18n.language);
            const value = currentSettings[s.key];
            return (
              <div key={s.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium">
                  {s.type === 'boolean'
                    ? value ? 'On' : 'Off'
                    : String(value ?? '-')}
                </span>
              </div>
            );
          })}
          {settingsSchema.length === 0 && Object.entries(currentSettings).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-muted-foreground">{key}</span>
              <span className="text-sm font-medium">{String(value ?? '-')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('app.settings')}</h3>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {settingsSchema.map((s) => (
            <SettingField key={s.key} setting={s} lang={i18n.language} />
          ))}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={updateApp.isPending}>
              <Save className="mr-1 size-4" />
              {t('app.save_settings')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                form.reset(currentSettings);
                setEditing(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function SettingField({ setting, lang }: { setting: SettingInfo; lang: string }) {
  const label = localized(setting.label, lang);

  if (setting.type === 'string' && setting.options && setting.options.length > 0) {
    return (
      <FormField
        name={setting.key}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value as string}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {setting.options!.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  if (setting.type === 'boolean') {
    return (
      <FormField
        name={setting.key}
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4">
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Switch checked={field.value as boolean} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    );
  }

  if (setting.type === 'number' && setting.min !== undefined && setting.max !== undefined) {
    return (
      <FormField
        name={setting.key}
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>{label}</FormLabel>
              <span className="text-sm tabular-nums text-muted-foreground">
                {field.value ?? setting.min}
              </span>
            </div>
            <FormControl>
              <Slider
                min={setting.min}
                max={setting.max}
                step={1}
                value={[Number(field.value ?? setting.min)]}
                onValueChange={([v]) => field.onChange(v)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  if (setting.type === 'number') {
    return (
      <FormField
        name={setting.key}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input
                type="number"
                {...field}
                value={(field.value as number | string) ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  const isPassword = setting.key.toLowerCase().includes('password');

  return (
    <FormField
      name={setting.key}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={isPassword ? 'password' : 'text'}
              {...field}
              value={(field.value as string) ?? ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
