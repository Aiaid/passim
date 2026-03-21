import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  focused: boolean;
  color: string;
  size: number;
  activeIcon: IoniconsName;
  inactiveIcon: IoniconsName;
}

function TabIcon({ focused, color, size, activeIcon, inactiveIcon }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? activeIcon : inactiveIcon}
      size={size}
      color={color}
    />
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1a1a1a',
        },
        tabBarActiveTintColor: '#30d158',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('dashboard.title'),
          tabBarLabel: t('mobile.home'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeIcon="home"
              inactiveIcon="home-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: t('nav.apps'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeIcon="grid"
              inactiveIcon="grid-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="nodes"
        options={{
          title: t('nav.nodes'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeIcon="hardware-chip"
              inactiveIcon="hardware-chip-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              activeIcon="settings"
              inactiveIcon="settings-outline"
            />
          ),
        }}
      />
    </Tabs>
  );
}
