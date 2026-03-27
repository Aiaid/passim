const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// pnpm uses symlinks — Metro needs to follow them and watch the real .pnpm store
const monorepoRoot = path.resolve(__dirname, '..');
config.watchFolders = [
  path.resolve(monorepoRoot, 'node_modules', '.pnpm'),
  path.resolve(monorepoRoot, 'packages'),
];

// Allow Metro to resolve symlinked packages
config.resolver.unstable_enableSymlinks = true;

// Force singleton resolution for critical packages to prevent duplicate
// React instances in production builds (monorepo has multiple versions)
const singletons = [
  'react',
  'react-dom',
  'react-native',
  'react-native-css-interop',
  'expo',
  'expo-router',
  'expo-modules-core',
  '@expo/metro-runtime',
];
config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  acc[name] = path.resolve(__dirname, 'node_modules', name);
  return acc;
}, {});
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
