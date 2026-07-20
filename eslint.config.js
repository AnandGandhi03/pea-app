const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**'],
  },
  {
    rules: {
      // React Native's Animated API requires holding Animated.Value instances
      // during render (`useRef(new Animated.Value()).current`) — the React
      // Compiler lint flags this, but it is the documented RN pattern.
      'react-hooks/refs': 'off',
      // Plain apostrophes/quotes in RN <Text> are literal strings, not HTML —
      // entity escaping does not apply.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Vercel serverless functions run in Node.
    files: ['api/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        module: 'writable',
      },
    },
  },
];
