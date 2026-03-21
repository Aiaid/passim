import { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: {
  key: string;
  activeIcon: IoniconsName;
  inactiveIcon: IoniconsName;
  labelKey: string;
}[] = [
  { key: 'index', activeIcon: 'home', inactiveIcon: 'home-outline', labelKey: 'mobile.home' },
  { key: 'apps', activeIcon: 'grid', inactiveIcon: 'grid-outline', labelKey: 'nav.apps' },
  { key: 'nodes', activeIcon: 'hardware-chip', inactiveIcon: 'hardware-chip-outline', labelKey: 'nav.nodes' },
  { key: 'settings', activeIcon: 'settings', inactiveIcon: 'settings-outline', labelKey: 'nav.settings' },
];

function LiquidGlassTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.pill}>
        <View style={styles.innerRow}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const config = TAB_CONFIG.find((c) => c.key === route.name);
            if (!config) return null;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                focused={focused}
                icon={focused ? config.activeIcon : config.inactiveIcon}
                label={t(config.labelKey)}
                onPress={onPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  icon,
  label,
  onPress,
}: {
  focused: boolean;
  icon: IoniconsName;
  label: string;
  onPress: () => void;
}) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [focused, anim]);

  const pillOpacity = anim;
  const pillScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const labelOpacity = anim;
  const labelWidth = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 50],
  });
  const labelMargin = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.tabItem}
    >
      {/* Active indicator pill */}
      <Animated.View
        style={[
          styles.activePill,
          { opacity: pillOpacity, transform: [{ scale: pillScale }] },
        ]}
      />

      <View style={styles.tabContent}>
        <Ionicons
          name={icon}
          size={22}
          color={focused ? '#fff' : 'rgba(255,255,255,0.4)'}
        />
        <Animated.View
          style={{
            overflow: 'hidden',
            width: labelWidth,
            marginLeft: labelMargin,
            opacity: labelOpacity,
          }}
        >
          <Text style={styles.tabLabel} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#000' } }}
    >
      <Tabs.Screen name="index" options={{ title: t('dashboard.title') }} />
      <Tabs.Screen name="apps" options={{ title: t('nav.apps') }} />
      <Tabs.Screen name="nodes" options={{ title: t('nav.nodes') }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(40, 40, 48, 0.75)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  tabItem: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 48,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 20,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
