const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**'],
  },
  {
    // Jest globals for test files and setup.
    files: ['**/__tests__/**/*.ts', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        require: 'readonly',
      },
    },
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
