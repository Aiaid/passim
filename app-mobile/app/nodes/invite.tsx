import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { InviteCreateResponse } from '@passim/shared/types';
import { useNodeStore } from '@/stores/node-store';
import { getNodeApi } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

type Tab = 'shell' | 'docker' | 'mobile';

function formatExpiresIn(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return '0s';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${diff}s`;
}

export default function InviteNodeScreen() {
  const { t } = useTranslation();
  const hubNode = useNodeStore((s) => s.hubNode);
  const [invite, setInvite] = useState<InviteCreateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('shell');
  const [copied, setCopied] = useState(false);

  const mintInvite = async () => {
    if (!hubNode) {
      setError('No hub node');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getNodeApi(hubNode.id).createInvite({ ttl_seconds: 86400 });
      setInvite(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    mintInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCopy = async () => {
    if (!invite) return;
    const cmd = tab === 'shell' ? invite.install_cmd : invite.docker_cmd;
    await Clipboard.setStringAsync(cmd);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onRegenerate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInvite(null);
    mintInvite();
  };

  const onRevoke = () => {
    if (!invite || !hubNode) return;
    Alert.alert(t('node.invite.revoke'), invite.token.slice(0, 16) + '...', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('node.invite.revoke'),
        style: 'destructive',
        onPress: async () => {
          try {
            await getNodeApi(hubNode.id).revokeInvite(invite.token);
            router.back();
          } catch {
            // ignore — user can retry
          }
        },
      },
    ]);
  };

  const cmd = invite ? (tab === 'shell' ? invite.install_cmd : invite.docker_cmd) : '';

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1">
          {t('node.invite.title')}
        </Text>
      </View>

      {loading && !invite ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#30d158" />
          <Text className="text-gray-400 text-sm mt-2">
            {t('node.invite.creating')}
          </Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-red-400 text-sm text-center">{error}</Text>
          <Pressable
            className="mt-4 bg-gray-900 rounded-xl px-4 py-2"
            onPress={mintInvite}
          >
            <Text className="text-white">{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : invite ? (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text className="text-gray-400 text-sm mb-3">
            {t('node.invite.description')}
          </Text>

          {/* Hub address + expiry */}
          <View className="bg-gray-900 rounded-xl p-3 mb-4">
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-400 text-xs">
                {t('node.invite.hub_address')}
              </Text>
              <Text className="text-white text-xs font-medium" numberOfLines={1}>
                {invite.hub_address}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-gray-400 text-xs">Expires</Text>
              <Text className="text-white text-xs">
                {t('node.invite.expires_in', {
                  time: formatExpiresIn(invite.expires_at),
                })}
              </Text>
            </View>
          </View>

          {/* Tabs */}
          <View className="flex-row bg-gray-900 rounded-xl p-1 mb-4">
            {(['shell', 'docker', 'mobile'] as Tab[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                className={`flex-1 py-2 rounded-lg ${tab === k ? 'bg-gray-700' : ''}`}
              >
                <Text
                  className={`text-center text-sm ${tab === k ? 'text-white font-semibold' : 'text-gray-400'}`}
                >
                  {t(`node.invite.tab.${k}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Mobile section helper text */}
          {tab === 'mobile' && (
            <Text className="text-gray-400 text-xs mb-2">
              {t('node.invite.mobile_alt')} · {t('node.invite.mobile_hint')}
            </Text>
          )}

          {/* Command block */}
          <View className="bg-gray-900 rounded-xl p-3 mb-3">
            <Text className="text-white text-xs font-mono" selectable>
              {cmd}
            </Text>
          </View>

          {/* Copy button */}
          <Pressable
            className="bg-primary rounded-xl py-3.5 items-center mb-3 active:opacity-70"
            onPress={onCopy}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={18}
                color="#000"
              />
              <Text className="text-black font-semibold">
                {copied ? t('node.invite.copied') : t('node.invite.copy')}
              </Text>
            </View>
          </Pressable>

          {/* Regenerate */}
          <Pressable
            className="bg-gray-900 rounded-xl py-3.5 items-center mb-3 active:opacity-70"
            onPress={onRegenerate}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text className="text-white font-semibold">
                {t('node.invite.regenerate')}
              </Text>
            </View>
          </Pressable>

          {/* Revoke */}
          <Pressable
            className="bg-gray-900 rounded-xl py-3.5 items-center active:opacity-70"
            onPress={onRevoke}
          >
            <Text className="text-red-500 font-semibold">
              {t('node.invite.revoke')}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
