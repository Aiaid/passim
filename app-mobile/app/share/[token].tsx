import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useGlobalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { ShareConfigResponse, GuidePlatform } from '@passim/shared/types';
import { useTranslation } from '@/lib/i18n';
import { countryFlag } from '@/lib/utils';
import { CopyableField } from '@/components/client-config/CopyableField';
import { QRFullScreen } from '@/components/client-config/QRFullScreen';
import {
  useShareConfig,
  getShareFileURL,
  getShareRemoteFileURL,
  getShareSubscribeURL,
  fetchShareFileContent,
  fetchShareRemoteFileContent,
} from '@/hooks/use-share';

// ---- Screen ----

export default function ShareScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const globalParams = useGlobalSearchParams<{ host?: string }>();

  // Host can come from deep link query param or be empty (not expected in practice)
  const host = globalParams.host ?? '';

  const { data, isLoading, error } = useShareConfig(host, token ?? '');

  if (!host) {
    return (
      <Shell>
        <View className="items-center justify-center px-6">
          <View className="w-14 h-14 rounded-full bg-red-500/10 items-center justify-center mb-3">
            <Ionicons name="warning-outline" size={28} color="#ff453a" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            {t('share.missing_host')}
          </Text>
          <Text className="text-gray-400 text-sm text-center">
            {t('share.missing_host_desc')}
          </Text>
        </View>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <View className="gap-4 w-full max-w-md px-4">
          <View className="bg-gray-900 rounded-xl h-8 w-40 self-center" />
          <View className="bg-gray-900 rounded-xl h-52" />
          <View className="bg-gray-900 rounded-xl h-28" />
        </View>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <View className="items-center justify-center px-6">
          <View className="w-14 h-14 rounded-full bg-red-500/10 items-center justify-center mb-3">
            <Ionicons name="warning-outline" size={28} color="#ff453a" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            {t('share.unavailable')}
          </Text>
          <Text className="text-gray-400 text-sm text-center max-w-xs">
            {t('share.unavailable_desc')}
          </Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <ScrollView
        className="w-full"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 max-w-lg self-center w-full">
          {/* Header */}
          <View className="items-center gap-2 pt-2">
            <TypeBadge type={data.type} />
            <Text className="text-white text-lg font-semibold tracking-tight">
              {t('share.your_connection')}
            </Text>
          </View>

          {/* Content by type */}
          {data.type === 'file_per_user' && (
            <ShareFiles host={host} token={token!} config={data} />
          )}
          {data.type === 'credentials' && (
            <ShareCredentials config={data} />
          )}
          {data.type === 'url' && (
            <ShareURLs host={host} token={token!} config={data} />
          )}

          {/* Guide */}
          {data.guide?.platforms && data.guide.platforms.length > 0 && (
            <ShareGuide platforms={data.guide.platforms} />
          )}

          {/* Limitations */}
          {data.limitations && data.limitations.length > 0 && (
            <View className="bg-gray-900 rounded-xl p-4">
              <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-2">
                {t('share.limitations')}
              </Text>
              {data.limitations.map((l, i) => (
                <View key={i} className="flex-row items-start gap-2 mb-1 last:mb-0">
                  <Text className="text-gray-600 mt-px">-</Text>
                  <Text className="text-gray-400 text-xs flex-1">{l}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Footer */}
          <View className="items-center pt-4 pb-8">
            <Text className="text-gray-600 text-[10px] uppercase tracking-widest">
              Powered by Passim
            </Text>
          </View>
        </View>
      </ScrollView>
    </Shell>
  );
}

// ---- Shell ----

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Back button if router can go back */}
      <View className="flex-row items-center px-4 py-2">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            }
          }}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
          style={{ opacity: router.canGoBack() ? 1 : 0 }}
          disabled={!router.canGoBack()}
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
      </View>
      <View className="flex-1 items-center justify-start">
        {children}
      </View>
    </SafeAreaView>
  );
}

// ---- Type Badge ----

const TYPE_META = {
  file_per_user: { label: 'Config Files', icon: 'document-text-outline' as const, color: '#0a84ff' },
  credentials: { label: 'Credentials', icon: 'shield-checkmark-outline' as const, color: '#30d158' },
  url: { label: 'Connection', icon: 'globe-outline' as const, color: '#5e5ce6' },
} as const;

function TypeBadge({ type }: { type: ShareConfigResponse['type'] }) {
  const meta = TYPE_META[type];
  return (
    <View
      className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
      style={{ backgroundColor: meta.color + '20' }}
    >
      <Ionicons name={meta.icon} size={14} color={meta.color} />
      <Text style={{ color: meta.color }} className="text-[11px] font-semibold uppercase tracking-wide">
        {meta.label}
      </Text>
    </View>
  );
}

// ---- Copy Button ----

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Pressable
      onPress={handleCopy}
      className="w-7 h-7 items-center justify-center active:opacity-70"
    >
      <Ionicons
        name={copied ? 'checkmark' : 'copy-outline'}
        size={14}
        color={copied ? '#30d158' : '#999'}
      />
    </Pressable>
  );
}

// ---- Small Action Button ----

function SmallButton({
  icon,
  label,
  color = '#999',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 active:opacity-70"
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color }} className="text-xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

// ---- File Per User ----

function ShareFiles({
  host,
  token,
  config,
}: {
  host: string;
  token: string;
  config: ShareConfigResponse;
}) {
  const { t } = useTranslation();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState('');
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const files = config.files ?? [];
  const remoteFileGroups = (config.remote_groups ?? []).filter(
    (g) => g.files && g.files.length > 0,
  );
  const hasMultipleNodes = remoteFileGroups.length > 0;

  const handleDownload = async (url: string, name: string) => {
    try {
      const tempUri = (FileSystem.cacheDirectory ?? '') + name;
      const download = await FileSystem.downloadAsync(url, tempUri);
      await Sharing.shareAsync(download.uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: `Import ${name}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('common.error'), t('share.download_failed'));
    }
  };

  const handleQR = async (index: number, name: string, isRemote = false, nodeId?: string, appId?: string) => {
    try {
      setLoadingIndex(index);
      let content: string;
      if (isRemote && nodeId && appId) {
        content = await fetchShareRemoteFileContent(host, token, index, nodeId, appId);
      } else {
        content = await fetchShareFileContent(host, token, index);
      }
      setQrValue(content);
      setQrTitle(name);
    } catch {
      Alert.alert(t('common.error'), t('share.qr_failed'));
    } finally {
      setLoadingIndex(null);
    }
  };

  const handleDownloadZIP = () => {
    const zipURL = `https://${host}/api/s/${token}/zip`;
    Linking.openURL(zipURL);
  };

  return (
    <>
      {/* Local node files */}
      {files.length > 0 && (
        <View className="bg-gray-900 rounded-xl p-4">
          {hasMultipleNodes && (
            <View className="flex-row items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-800">
              <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">
                Local
              </Text>
            </View>
          )}
          {files.map((file) => (
            <FileRow
              key={file.index}
              file={file}
              qr={config.qr}
              loading={loadingIndex === file.index}
              onDownload={() =>
                handleDownload(getShareFileURL(host, token, file.index), file.name)
              }
              onQR={() => handleQR(file.index, file.name)}
            />
          ))}
        </View>
      )}

      {/* Remote node files */}
      {remoteFileGroups.map((group) => (
        <View key={group.node_name} className="bg-gray-900 rounded-xl p-4">
          <View className="flex-row items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-800">
            {group.node_country && (
              <Text className="text-xs">{countryFlag(group.node_country)}</Text>
            )}
            <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">
              {group.node_name}
            </Text>
          </View>
          {group.files!.map((file) => (
            <FileRow
              key={file.index}
              file={file}
              qr={group.qr}
              loading={loadingIndex === file.index}
              onDownload={() =>
                handleDownload(
                  getShareRemoteFileURL(host, token, file.index, group.node_id!, group.app_id!),
                  file.name,
                )
              }
              onQR={() =>
                handleQR(file.index, file.name, true, group.node_id!, group.app_id!)
              }
            />
          ))}
        </View>
      ))}

      {/* Download All ZIP */}
      {hasMultipleNodes && (
        <Pressable
          className="bg-gray-900 rounded-xl py-3.5 flex-row items-center justify-center gap-2 active:opacity-70"
          onPress={handleDownloadZIP}
        >
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text className="text-white text-sm font-medium">
            {t('share.download_all_zip')}
          </Text>
        </Pressable>
      )}

      <QRFullScreen
        visible={!!qrValue}
        value={qrValue}
        title={qrTitle}
        onClose={() => {
          setQrValue(null);
          setQrTitle('');
        }}
      />
    </>
  );
}

function FileRow({
  file,
  qr,
  loading,
  onDownload,
  onQR,
}: {
  file: { index: number; name: string };
  qr?: boolean;
  loading?: boolean;
  onDownload: () => void;
  onQR: () => void;
}) {
  return (
    <View className="flex-row items-center py-2.5 border-b border-gray-800 last:border-b-0">
      <View className="w-7 h-7 rounded-md bg-blue-500/20 items-center justify-center mr-3">
        <Text className="text-blue-400 text-xs font-semibold">{file.index}</Text>
      </View>
      <Text className="flex-1 text-white text-sm font-mono" numberOfLines={1}>
        {file.name}
      </Text>
      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={onDownload}
          disabled={loading}
          className="w-8 h-8 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#999" />
          ) : (
            <Ionicons name="download-outline" size={15} color="#5e5ce6" />
          )}
        </Pressable>
        {qr && (
          <Pressable
            onPress={onQR}
            disabled={loading}
            className="w-8 h-8 rounded-lg bg-gray-800 items-center justify-center active:opacity-70"
          >
            <Ionicons name="qr-code-outline" size={15} color="#999" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---- Credentials ----

function ShareCredentials({ config }: { config: ShareConfigResponse }) {
  const { language } = useTranslation();

  return (
    <View className="bg-gray-900 rounded-xl p-4">
      {config.fields?.map((field) => (
        <CopyableField
          key={field.key}
          label={field.label?.['en-US'] ?? field.label?.[language] ?? field.key}
          value={field.value}
          secret={field.secret}
        />
      ))}
    </View>
  );
}

// ---- URLs ----

function ShareURLs({
  host,
  token,
  config,
}: {
  host: string;
  token: string;
  config: ShareConfigResponse;
}) {
  const { t } = useTranslation();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState('QR');
  const [copied, setCopied] = useState<string | null>(null);

  const subscribeURL = getShareSubscribeURL(host, token);
  const totalNodes = 1 + (config.remote_groups?.length ?? 0);

  const handleCopy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleQR = (value: string, title: string) => {
    setQrValue(value);
    setQrTitle(title);
  };

  const handleShare = (text: string) => {
    Share.share({ message: text });
  };

  return (
    <>
      {/* URIs */}
      <View className="bg-gray-900 rounded-xl p-4">
        {/* Local node URIs */}
        {config.urls?.map((url) => (
          <URIEntry
            key={url.scheme}
            url={url}
            onCopy={handleCopy}
            onQR={handleQR}
            copiedKey={copied}
          />
        ))}

        {/* Remote node URIs */}
        {config.remote_groups?.map((group) => (
          <View key={group.node_name}>
            <View className="flex-row items-center gap-1.5 mb-2 pt-2 border-t border-gray-800">
              {group.node_country && (
                <Text className="text-xs">{countryFlag(group.node_country)}</Text>
              )}
              <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">
                {group.node_name}
              </Text>
            </View>
            {group.urls?.map((url) => (
              <URIEntry
                key={url.scheme}
                url={url}
                onCopy={handleCopy}
                onQR={handleQR}
                copiedKey={copied}
              />
            ))}
          </View>
        ))}

        {/* Subscription */}
        <View className="pt-3 mt-3 border-t border-gray-800">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">
                Subscription
              </Text>
              {totalNodes > 1 && (
                <View className="bg-gray-800 px-1.5 py-0.5 rounded">
                  <Text className="text-gray-400 text-[10px] font-semibold">
                    {totalNodes} nodes
                  </Text>
                </View>
              )}
            </View>
            <CopyButton text={subscribeURL} />
          </View>
          <Text
            className="text-white text-xs font-mono mt-1.5"
            numberOfLines={2}
            selectable
          >
            {subscribeURL}
          </Text>
        </View>
      </View>

      {/* Import buttons */}
      {config.import_urls && Object.keys(config.import_urls).length > 0 && (
        <View className="flex-row flex-wrap gap-2 justify-center">
          {Object.entries(config.import_urls).map(([client, url]) => (
            <Pressable
              key={client}
              className="flex-row items-center gap-1.5 bg-gray-900 rounded-lg px-3 py-2.5 active:opacity-70"
              onPress={() => Linking.openURL(url)}
            >
              <Ionicons name="open-outline" size={14} color="#5e5ce6" />
              <Text className="text-white text-xs font-medium">
                {client.charAt(0).toUpperCase() + client.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <QRFullScreen
        visible={!!qrValue}
        value={qrValue}
        title={qrTitle}
        onClose={() => setQrValue(null)}
      />
    </>
  );
}

function URIEntry({
  url,
  onCopy,
  onQR,
  copiedKey,
}: {
  url: { name: string; scheme: string; qr?: boolean };
  onCopy: (text: string, key: string) => void;
  onQR: (value: string, title: string) => void;
  copiedKey: string | null;
}) {
  return (
    <View className="mb-4 last:mb-0">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-gray-400 text-xs font-medium uppercase tracking-wider">
          {url.name}
        </Text>
        <View className="flex-row items-center gap-0.5">
          <SmallButton
            icon={copiedKey === url.scheme ? 'checkmark' : 'copy-outline'}
            label="Copy"
            color={copiedKey === url.scheme ? '#30d158' : '#999'}
            onPress={() => onCopy(url.scheme, url.scheme)}
          />
          {url.qr && (
            <SmallButton
              icon="qr-code-outline"
              label="QR"
              onPress={() => onQR(url.scheme, url.name)}
            />
          )}
        </View>
      </View>
      <View className="bg-black/40 rounded-lg px-3 py-2.5">
        <Text className="text-green-400 text-xs font-mono" selectable>
          {url.scheme}
        </Text>
      </View>
    </View>
  );
}

// ---- Guide ----

const PLATFORM_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  iOS: 'phone-portrait-outline',
  Android: 'phone-portrait-outline',
  Windows: 'desktop-outline',
  macOS: 'desktop-outline',
  Linux: 'desktop-outline',
};

function ShareGuide({ platforms }: { platforms: GuidePlatform[] }) {
  const { t } = useTranslation();

  return (
    <View className="bg-gray-900 rounded-xl p-4">
      <Text className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-3">
        {t('share.how_to_connect')}
      </Text>
      {platforms.map((platform) => {
        const iconName = PLATFORM_ICONS[platform.name] ?? 'desktop-outline';
        const storeLink = platform.store_url || platform.download_url;
        return (
          <View
            key={platform.name}
            className="flex-row items-start gap-3 border-l-2 border-indigo-500/30 pl-3 py-2 mb-2 last:mb-0"
          >
            <Ionicons name={iconName} size={16} color="#999" style={{ marginTop: 2 }} />
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-white text-sm font-medium">{platform.name}</Text>
                {storeLink && (
                  <Pressable onPress={() => Linking.openURL(storeLink)}>
                    <Ionicons name="open-outline" size={12} color="#5e5ce6" />
                  </Pressable>
                )}
              </View>
              {platform.steps.map((step, i) => (
                <Text key={i} className="text-gray-400 text-xs">
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
