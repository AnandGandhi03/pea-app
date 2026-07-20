import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_ITEMS, CATEGORY_KEYS } from '../types';
import type { AppData, Item, ItemsMap } from '../types';
import { todayStr } from '../lib/format';

const STORAGE_KEY = 'pea:data:v3';
export const SCHEMA_VERSION = 2;

export function emptyData(): AppData {
  return {
    schemaVersion:  SCHEMA_VERSION,
    userName:       '',
    briefTime:      '',
    captureCount:   0,
    lastCountReset: todayStr(),
    items:          EMPTY_ITEMS,
  };
}

// Migrates any stored payload (including pre-schemaVersion data whose items
// used a static `time` string instead of `createdAt`) to the current shape.
// Exported for unit testing.
export function migrate(raw: any): AppData | null {
  if (!raw || typeof raw !== 'object') return null;

  const items: ItemsMap = { buy: [], do: [], call: [], follow: [] };
  for (const key of CATEGORY_KEYS) {
    const arr = Array.isArray(raw.items?.[key]) ? raw.items[key] : [];
    items[key] = arr
      .filter((i: any) => i && typeof i.id === 'string' && typeof i.text === 'string')
      .map((i: any): Item => ({
        id:        i.id,
        text:      i.text,
        done:      !!i.done,
        // v1 items had `time: string` and a Date.now() id — recover the
        // timestamp from the id where possible.
        createdAt: typeof i.createdAt === 'number'
          ? i.createdAt
          : (/^\d{13}$/.test(i.id) ? Number(i.id) : Date.now()),
        draft:     typeof i.draft === 'string' ? i.draft : null,
      }));
  }

  return {
    schemaVersion:  SCHEMA_VERSION,
    userName:       typeof raw.userName === 'string' ? raw.userName : '',
    briefTime:      typeof raw.briefTime === 'string' ? raw.briefTime : '',
    captureCount:   typeof raw.captureCount === 'number' ? raw.captureCount : 0,
    lastCountReset: typeof raw.lastCountReset === 'string' ? raw.lastCountReset : todayStr(),
    items,
  };
}

export async function loadData(): Promise<AppData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export async function clearData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
