export type CategoryKey = 'buy' | 'do' | 'call' | 'follow';
export type AppScreen   = 'loading' | 'onboarding' | 'home';
export type Tab         = 'home' | 'lists' | 'drafts' | 'me';

export interface Item {
  id:        string;
  text:      string;
  done:      boolean;
  createdAt: number;          // epoch ms
  draft:     string | null;
}

export interface ItemsMap {
  buy:    Item[];
  do:     Item[];
  call:   Item[];
  follow: Item[];
}

export interface AppData {
  schemaVersion:  number;
  userName:       string;
  briefTime:      string;
  items:          ItemsMap;
  captureCount:   number;
  lastCountReset: string;
}

export interface LastAction {
  itemId:     string;
  category:   CategoryKey;
  cleaned:    string;
  transcript: string;
}

export interface Classification {
  category: CategoryKey;
  cleaned:  string;
}

export const EMPTY_ITEMS: ItemsMap = { buy: [], do: [], call: [], follow: [] };

export const CATEGORY_KEYS: CategoryKey[] = ['buy', 'do', 'call', 'follow'];

export function isCategoryKey(v: unknown): v is CategoryKey {
  return v === 'buy' || v === 'do' || v === 'call' || v === 'follow';
}
