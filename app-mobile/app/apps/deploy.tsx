import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { TemplateSummary, SettingInfo } from '@passim/shared/types';
import { useTemplates, useTemplate, useDeployApp } from '@/hooks/use-apps';
import { localized } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

const CATEGORY_COLORS: Record<string, string> = {
  vpn: '#30d158',
  media: '#5e5ce6',
  storage: '#0a84ff',
  network: '#ff9f0a',
  remote: '#bf5af2',
};

function TemplateCard({
  template,
  selected,
  onPress,
}: {
  template: TemplateSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const borderColor = selected ? '#30d158' : 'transparent';
  const categoryColor = CATEGORY_COLORS[template.category] ?? '#666';
  const letter = template.name.charAt(0).toUpperCase();

  return (
    <Pressable
      testID={`template-${template.name}`}
      className="bg-gray-900 rounded-xl p-4 flex-row items-center gap-3 active:opacity-70"
      style={{ borderWidth: 2, borderColor }}
      onPress={onPress}
    >
      <View
        style={{ borderColor: categoryColor, borderWidth: 2 }}
        className="w-11 h-11 rounded-full items-center justify-center"
      >
        <Text className="text-white font-bold text-lg">{letter}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">
          {template.name.charAt(0).toUpperCase() + template.name.slice(1)}
        </Text>
        <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={2}>
          {localized(template.description, 'en-US')}
        </Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color="#30d158" />
      ) : null}
    </Pressable>
  );
}

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: SettingInfo;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const label = localized(setting.label, 'en-US');

  if (setting.type === 'boolean') {
    return (
      <View className="flex-row items-center justify-between py-3">
        <Text className="text-white text-sm flex-1">{label}</Text>
        <Switch
          value={!!value}
          onValueChange={(val) => onChange(val)}
          trackColor={{ false: '#333', true: '#30d158' }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  if (setting.type === 'select' && setting.options?.length) {
    return (
      <View className="py-3">
        <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
          {label}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {setting.options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                className={`px-4 py-2 rounded-lg ${isSelected ? 'bg-primary' : 'bg-gray-800'}`}
                onPress={() => onChange(opt.value)}
              >
                <Text className={`text-sm font-medium ${isSelected ? 'text-black' : 'text-white'}`}>
                  {localized(opt.label, 'en-US')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (setting.type === 'number') {
    return (
      <View className="py-3">
        <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
          {label}
        </Text>
        <TextInput
          className="bg-gray-800 rounded-xl px-4 py-3 text-white text-base"
          value={value != null ? String(value) : ''}
          onChangeText={(text) => {
            const num = Number(text);
            onChange(isNaN(num) ? text : num);
          }}
          keyboardType="numeric"
          placeholderTextColor="#555"
          placeholder={setting.default != null ? String(setting.default) : undefined}
        />
        {(setting.min != null || setting.max != null) ? (
          <Text className="text-gray-500 text-xs mt-1">
            {setting.min != null ? `Min: ${setting.min}` : ''}
            {setting.min != null && setting.max != null ? ' / ' : ''}
            {setting.max != null ? `Max: ${setting.max}` : ''}
          </Text>
        ) : null}
      </View>
    );
  }

  // Default: string input
  return (
    <View className="py-3">
      <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      <TextInput
        className="bg-gray-800 rounded-xl px-4 py-3 text-white text-base"
        value={value != null ? String(value) : ''}
        onChangeText={(text) => onChange(text)}
        placeholderTextColor="#555"
        placeholder={setting.default != null ? String(setting.default) : undefined}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function DeployScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: templateDetail, isLoading: detailLoading } = useTemplate(selectedTemplate);
  const deployApp = useDeployApp();

  // Initialize settings from template defaults when moving to step 2
  const initSettings = useCallback(
    (detail: { settings: SettingInfo[] }) => {
      const defaults: Record<string, unknown> = {};
      for (const s of detail.settings) {
        if (s.default != null) {
          defaults[s.key] = s.default;
        }
      }
      setSettings(defaults);
    },
    [],
  );

  const basicSettings = useMemo(
    () => templateDetail?.settings.filter((s: SettingInfo) => !s.advanced) ?? [],
    [templateDetail],
  );

  const advancedSettings = useMemo(
    () => templateDetail?.settings.filter((s: SettingInfo) => s.advanced) ?? [],
    [templateDetail],
  );

  const handleSelectTemplate = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTemplate(name);
  };

  const handleNext = () => {
    if (!selectedTemplate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(2);
    // Wait for template detail to load, then init settings
    if (templateDetail) {
      initSettings(templateDetail);
    }
  };

  // Re-init settings when templateDetail loads
  if (step === 2 && templateDetail && Object.keys(settings).length === 0) {
    initSettings(templateDetail);
  }

  const handleDeploy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    deployApp.mutate(
      { template: selectedTemplate, settings },
      {
        onSuccess: (data: unknown) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const appId = (data as { id: string })?.id;
          if (appId) {
            router.replace(`/apps/${appId}`);
          } else {
            router.back();
          }
        },
        onError: (error: Error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(t('marketplace.deploy_failed'), error.message || t('mobile.deploy_failed_msg'));
        },
      },
    );
  };

  const updateSetting = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          testID="btn-deploy-back"
          onPress={() => {
            if (step === 2) {
              setStep(1);
              setSettings({});
              setShowAdvanced(false);
            } else {
              router.back();
            }
          }}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1">
          {step === 1 ? t('mobile.choose_template') : t('mobile.configure')}
        </Text>
        {/* Step indicator */}
        <View className="flex-row gap-1.5">
          <View className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-primary' : 'bg-gray-700'}`} />
          <View className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-primary' : 'bg-gray-700'}`} />
        </View>
      </View>

      {step === 1 ? (
        <>
          <ScrollView testID="template-list" className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {templatesLoading ? (
              <ActivityIndicator size="large" color="#30d158" className="mt-12" />
            ) : templates?.length ? (
              <View className="gap-3 mt-2">
                {templates.map((t: TemplateSummary) => (
                  <TemplateCard
                    key={t.name}
                    template={t}
                    selected={selectedTemplate === t.name}
                    onPress={() => handleSelectTemplate(t.name)}
                  />
                ))}
              </View>
            ) : (
              <View className="items-center mt-12">
                <Text className="text-gray-500">{t('mobile.no_templates')}</Text>
              </View>
            )}
          </ScrollView>

          {/* Next Button */}
          {selectedTemplate ? (
            <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
              <Pressable
                className="bg-primary rounded-xl py-4 items-center active:opacity-70"
                onPress={handleNext}
              >
                <Text className="text-black font-semibold text-base">{t('mobile.next')}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
            {detailLoading ? (
              <ActivityIndicator size="large" color="#30d158" className="mt-12" />
            ) : (
              <>
                {/* Basic Settings */}
                {basicSettings.length > 0 ? (
                  <View className="bg-gray-900 rounded-xl p-4 mt-2">
                    {basicSettings.map((s: SettingInfo) => (
                      <SettingField
                        key={s.key}
                        setting={s}
                        value={settings[s.key]}
                        onChange={(val) => updateSetting(s.key, val)}
                      />
                    ))}
                  </View>
                ) : (
                  <View className="bg-gray-900 rounded-xl p-6 mt-2 items-center">
                    <Text className="text-gray-400 text-sm">
                      {t('mobile.no_config_needed')}
                    </Text>
                  </View>
                )}

                {/* Advanced Settings Toggle */}
                {advancedSettings.length > 0 ? (
                  <>
                    <Pressable
                      className="flex-row items-center justify-center gap-2 py-4 active:opacity-70"
                      onPress={() => setShowAdvanced(!showAdvanced)}
                    >
                      <Ionicons
                        name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#666"
                      />
                      <Text className="text-gray-400 text-sm">
                        {showAdvanced ? t('mobile.hide_advanced') : t('mobile.show_advanced')}
                      </Text>
                    </Pressable>

                    {showAdvanced ? (
                      <View className="bg-gray-900 rounded-xl p-4">
                        {advancedSettings.map((s: SettingInfo) => (
                          <SettingField
                            key={s.key}
                            setting={s}
                            value={settings[s.key]}
                            onChange={(val) => updateSetting(s.key, val)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {/* Error */}
                {deployApp.isError ? (
                  <View className="bg-red-500/10 rounded-xl px-4 py-3 mt-4">
                    <Text className="text-red-400 text-sm">
                      {deployApp.error?.message || t('marketplace.deploy_failed')}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* Deploy Button */}
          <View className="px-4 pb-6 pt-3 bg-black border-t border-gray-900">
            <Pressable
              testID="btn-deploy-confirm"
              className={`rounded-xl py-4 items-center ${deployApp.isPending ? 'bg-gray-800' : 'bg-primary active:opacity-70'}`}
              onPress={handleDeploy}
              disabled={deployApp.isPending}
            >
              {deployApp.isPending ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#30d158" />
                  <Text className="text-gray-300 font-semibold text-base">{t('mobile.deploying')}</Text>
                </View>
              ) : (
                <Text className="text-black font-semibold text-base">{t('mobile.deploy')}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
