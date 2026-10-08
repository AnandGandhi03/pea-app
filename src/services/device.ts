// A random per-install ID sent with API calls so the server can apply fair
// per-device rate limits. It is not tied to the person, the hardware, or any
// account, and it deliberately survives "Reset Pea" so limits can't be reset.

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = 'pea:device:v1';

function randomId(): string {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${part()}${part()}`;
}

let cached: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      try {
        const saved = await AsyncStorage.getItem(DEVICE_KEY);
        if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
      } catch {}
      const id = randomId();
      try { await AsyncStorage.setItem(DEVICE_KEY, id); } catch {}
      return id;
    })();
  }
  return cached;
}

// Test-only: forget the in-memory copy.
export function _resetDeviceIdCache(): void {
  cached = null;
}
