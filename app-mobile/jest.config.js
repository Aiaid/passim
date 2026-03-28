module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    // pnpm hoists to .pnpm/<pkg>/node_modules/<name> — need to allow nested paths
    'node_modules/(?!(.pnpm/.*/)?(react-native|@react-native|expo|@expo|react-navigation|@react-navigation|@passim/shared|nativewind|react-native-css-interop|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-svg|react-native-sse|zustand|@react-native-async-storage))',
  ],
};
