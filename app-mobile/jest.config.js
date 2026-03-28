module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    // pnpm nests node_modules inside .pnpm, so we need a broader pattern
    'node_modules/(?!(.pnpm/.*/(node_modules/)?)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@passim/shared))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@passim/shared/(.*)$': '<rootDir>/../packages/shared/src/$1',
    '^@passim/shared$': '<rootDir>/../packages/shared/src',
  },
};
