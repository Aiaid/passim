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

module.exports = withNativeWind(config, { input: './global.css' });
