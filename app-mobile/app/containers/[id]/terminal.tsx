import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNodeStore } from '@/stores/node-store';
import { useTranslation } from '@/lib/i18n';

type Status = 'connecting' | 'connected' | 'disconnected';

const STATUS_COLORS: Record<Status, string> = {
  connecting: '#ffd60a',
  connected: '#30d158',
  disconnected: '#666',
};

export default function ContainerTerminalScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const containerName = useLocalSearchParams<{ name: string }>().name ?? id.slice(0, 12);
  const nodeId = useNodeStore((s) => s.activeNodeId) ?? '';
  const node = useNodeStore((s) => s.nodes.find((n) => n.id === nodeId));

  const [status, setStatus] = useState<Status>('disconnected');
  const [output, setOutput] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const pendingBuffer = useRef('');
  // Store node info in a ref to avoid re-creating connect on every store change
  const nodeRef = useRef(node);
  nodeRef.current = node;

  const appendOutput = useCallback((text: string) => {
    // Buffer incoming text and split into lines
    pendingBuffer.current += text;
    const parts = pendingBuffer.current.split('\n');
    // Keep the last part as pending (might be an incomplete line)
    pendingBuffer.current = parts.pop() ?? '';
    if (parts.length > 0) {
      setOutput((prev) => {
        const updated = [...prev];
        // Append to the last line if it was incomplete
        if (updated.length > 0 && !updated[updated.length - 1].endsWith('\n')) {
          updated[updated.length - 1] += parts.shift();
        }
        return [...updated, ...parts].slice(-500); // Keep last 500 lines
      });
    }
  }, []);

  const connect = useCallback(() => {
    const currentNode = nodeRef.current;
    if (!currentNode) return;

    // Clean up previous connection
    wsRef.current?.close();
    setOutput([]);
    pendingBuffer.current = '';

    const host = currentNode.host;
    const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'ws:' : 'wss:';
    const token = currentNode.token;
    const url = `${proto}//${host}/api/containers/${id}/terminal?token=${encodeURIComponent(token)}`;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Send initial resize (80x24 is standard terminal size)
      ws.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        appendOutput(ev.data);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      // Flush any remaining buffer
      if (pendingBuffer.current) {
        setOutput((prev) => [...prev, pendingBuffer.current].slice(-500));
        pendingBuffer.current = '';
      }
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, [id, appendOutput]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  // Auto-scroll when output changes
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [output]);

  const sendCommand = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !inputText) return;

    // Send the command with newline as binary
    const encoder = new TextEncoder();
    const data = encoder.encode(inputText + '\n');
    ws.send(data);
    setInputText('');
  }, [inputText]);

  const sendSpecialKey = useCallback((key: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = new TextEncoder();
    ws.send(encoder.encode(key));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          onPress={() => {
            wsRef.current?.close();
            router.back();
          }}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-900 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text className="text-white text-lg font-semibold flex-1" numberOfLines={1}>
          {t('container.terminal')}
        </Text>
      </View>

      {/* Terminal chrome bar */}
      <View className="flex-row items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800">
        <View className="flex-row items-center gap-2">
          <View className="flex-row gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <View className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </View>
          <Text className="text-neutral-500 text-xs font-mono ml-1" numberOfLines={1}>
            {containerName}
          </Text>
          <Text className="text-xs font-mono ml-1" style={{ color: STATUS_COLORS[status] }}>
            {t(`container.terminal_${status}`)}
          </Text>
        </View>
        {status === 'disconnected' && (
          <Pressable
            onPress={connect}
            className="w-7 h-7 items-center justify-center rounded-md active:opacity-70"
          >
            <Ionicons name="refresh" size={14} color="#999" />
          </Pressable>
        )}
      </View>

      {/* Terminal output */}
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-neutral-950 p-3"
        contentContainerStyle={{ paddingBottom: 10 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => inputRef.current?.focus()}>
          {output.map((line, i) => (
            <Text key={i} className="text-neutral-300 text-xs font-mono leading-5" selectable>
              {line}
            </Text>
          ))}
          {pendingBuffer.current ? (
            <Text className="text-neutral-300 text-xs font-mono leading-5" selectable>
              {pendingBuffer.current}
            </Text>
          ) : null}
          {status === 'disconnected' && output.length > 0 && (
            <Text className="text-neutral-600 text-xs font-mono mt-2">
              {t('container.terminal_session_ended')}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Quick action bar */}
      {status === 'connected' && (
        <View className="flex-row items-center px-3 py-1.5 bg-neutral-900 border-t border-neutral-800 gap-1.5">
          <Pressable
            onPress={() => sendSpecialKey('\t')}
            className="px-3 py-1.5 rounded-md bg-neutral-800 active:opacity-70"
          >
            <Text className="text-neutral-400 text-xs font-mono">Tab</Text>
          </Pressable>
          <Pressable
            onPress={() => sendSpecialKey('\x03')}
            className="px-3 py-1.5 rounded-md bg-neutral-800 active:opacity-70"
          >
            <Text className="text-neutral-400 text-xs font-mono">Ctrl+C</Text>
          </Pressable>
          <Pressable
            onPress={() => sendSpecialKey('\x04')}
            className="px-3 py-1.5 rounded-md bg-neutral-800 active:opacity-70"
          >
            <Text className="text-neutral-400 text-xs font-mono">Ctrl+D</Text>
          </Pressable>
          <Pressable
            onPress={() => sendSpecialKey('\x1b[A')}
            className="px-3 py-1.5 rounded-md bg-neutral-800 active:opacity-70"
          >
            <Ionicons name="arrow-up" size={12} color="#999" />
          </Pressable>
          <Pressable
            onPress={() => sendSpecialKey('\x1b[B')}
            className="px-3 py-1.5 rounded-md bg-neutral-800 active:opacity-70"
          >
            <Ionicons name="arrow-down" size={12} color="#999" />
          </Pressable>
        </View>
      )}

      {/* Input bar */}
      {status === 'connected' && (
        <View className="flex-row items-center px-3 py-2 bg-neutral-900 border-t border-neutral-800">
          <Text className="text-green-500 text-xs font-mono mr-2">$</Text>
          <TextInput
            ref={inputRef}
            className="flex-1 text-neutral-200 text-sm font-mono py-1.5"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendCommand}
            placeholder={t('container.terminal_placeholder')}
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="send"
            blurOnSubmit={false}
            keyboardAppearance="dark"
          />
          <Pressable
            onPress={sendCommand}
            disabled={!inputText}
            className="ml-2 w-8 h-8 items-center justify-center rounded-lg active:opacity-70"
            style={{ backgroundColor: inputText ? '#30d158' : '#333' }}
          >
            <Ionicons
              name="arrow-up"
              size={16}
              color={inputText ? '#000' : '#666'}
            />
          </Pressable>
        </View>
      )}

      {/* Reconnect bar when disconnected */}
      {status === 'disconnected' && (
        <View className="px-4 py-3 bg-neutral-900 border-t border-neutral-800">
          <Pressable
            onPress={connect}
            className="bg-gray-800 rounded-xl py-3 items-center active:opacity-70"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="refresh" size={16} color="#30d158" />
              <Text className="text-white font-semibold text-sm">{t('container.terminal_reconnect')}</Text>
            </View>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
