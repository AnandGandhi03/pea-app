// Provide the official in-memory AsyncStorage mock so modules that import it at
// load time (e.g. src/services/storage.ts) can be unit-tested in Node.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
