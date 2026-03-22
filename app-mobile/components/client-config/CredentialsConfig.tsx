import { View, Text } from 'react-native';
import type { ClientConfigResponse } from '@passim/shared/types';
import { CopyableField } from './CopyableField';
import { localized } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface Props {
  config: ClientConfigResponse;
}

export function CredentialsConfig({ config }: Props) {
  const { language } = useTranslation();

  return (
    <View className="bg-gray-900 rounded-xl p-4">
      <Text className="text-white text-sm font-semibold mb-2">
        Connection Details
      </Text>
      {config.fields?.map((field) => (
        <CopyableField
          key={field.key}
          label={localized(field.label, language)}
          value={field.value}
          secret={field.secret}
        />
      ))}
    </View>
  );
}
