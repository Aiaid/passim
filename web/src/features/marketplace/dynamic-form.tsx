import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
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

interface DynamicFormProps {
  settings: SettingInfo[];
  onSubmit: (values: Record<string, unknown>) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

function isGenerated(defaultValue: unknown): boolean {
  return typeof defaultValue === 'string' && defaultValue.startsWith('{{generated.');
}

function buildSchema(settings: SettingInfo[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const s of settings) {
    const optional = isGenerated(s.default);

    if (s.type === 'number') {
      let schema = z.coerce.number();
      if (s.min !== undefined) schema = schema.min(s.min);
      if (s.max !== undefined) schema = schema.max(s.max);
      shape[s.key] = optional ? schema.optional() : schema;
    } else if (s.type === 'boolean') {
      shape[s.key] = z.boolean().optional();
    } else {
      // string
      if (s.options && s.options.length > 0) {
        shape[s.key] = optional
          ? z.string().optional()
          : z.string().min(1);
      } else {
        shape[s.key] = optional
          ? z.string().optional()
          : z.string().min(1);
      }
    }
  }

  return z.object(shape);
}

function buildDefaults(settings: SettingInfo[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const s of settings) {
    if (isGenerated(s.default)) {
      // Leave generated fields empty
      defaults[s.key] = s.type === 'number' ? undefined : '';
    } else if (s.default !== undefined) {
      defaults[s.key] = s.default;
    } else if (s.type === 'boolean') {
      defaults[s.key] = false;
    } else if (s.type === 'number') {
      defaults[s.key] = s.min ?? 0;
    } else {
      defaults[s.key] = '';
    }
  }

  return defaults;
}

export function DynamicForm({ settings, onSubmit, isSubmitting, submitLabel }: DynamicFormProps) {
  const { t, i18n } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const schema = useMemo(() => buildSchema(settings), [settings]);
  const defaults = useMemo(() => buildDefaults(settings), [settings]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const basicSettings = settings.filter((s) => !s.advanced);
  const advancedSettings = settings.filter((s) => s.advanced);

  function handleSubmit(values: Record<string, unknown>) {
    // Strip empty strings for generated fields
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === undefined) continue;
      cleaned[key] = value;
    }
    onSubmit(cleaned);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          {basicSettings.map((s) => (
            <SettingField key={s.key} setting={s} lang={i18n.language} />
          ))}
        </div>

        {advancedSettings.length > 0 && (
          <>
            <Separator />
            <button
              type="button"
              className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              {advancedOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              {t('marketplace.advanced_settings')}
            </button>
            {advancedOpen && (
              <div className="space-y-4">
                {advancedSettings.map((s) => (
                  <SettingField key={s.key} setting={s} lang={i18n.language} />
                ))}
              </div>
            )}
          </>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('marketplace.deploying') : submitLabel ?? t('marketplace.deploy')}
        </Button>
      </form>
    </Form>
  );
}

function SettingField({ setting, lang }: { setting: SettingInfo; lang: string }) {
  const { t } = useTranslation();
  const label = localized(setting.label, lang);
  const generated = isGenerated(setting.default);

  // string with options → Select
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
                  <SelectValue
                    placeholder={generated ? t('marketplace.auto_generated') : undefined}
                  />
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

  // boolean → Switch
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

  // number with min/max → Slider
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

  // number without range → number input
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
                placeholder={generated ? t('marketplace.auto_generated') : undefined}
                {...field}
                value={field.value as number | string ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  // string — password or text
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
              placeholder={generated ? t('marketplace.auto_generated') : undefined}
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
