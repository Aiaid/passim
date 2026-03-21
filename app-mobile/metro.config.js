const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the shared package
config.watchFolders = [monorepoRoot];

// Let Metro resolve packages from the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve .native.tsx before .tsx for platform-specific files
config.resolver.sourceExts = ['native.tsx', 'native.ts', ...config.resolver.sourceExts];

module.exports = config;
