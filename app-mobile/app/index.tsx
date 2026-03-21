import { Redirect } from 'expo-router';
import { useNodeStore } from '@/stores/node-store';

export default function Index() {
  const hasNodes = useNodeStore((s) => s.nodes.length > 0);
  return <Redirect href={hasNodes ? '/(tabs)' : '/(auth)/welcome'} />;
}
