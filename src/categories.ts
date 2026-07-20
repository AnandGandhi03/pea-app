import { P } from './theme';
import type { CategoryKey } from './types';

export const CATS: Record<CategoryKey, { label: string; icon: string; color: string; bg: string }> = {
  buy:    { label: 'Groceries',  icon: '🛒', color: P.greenDark, bg: P.greenLight },
  do:     { label: 'Reminders',  icon: '⏰', color: P.amber,     bg: P.amberLight },
  call:   { label: 'Calls',      icon: '📞', color: P.rose,      bg: P.roseLight  },
  follow: { label: 'Follow-ups', icon: '🔁', color: P.lavender,  bg: P.lavLight   },
};
