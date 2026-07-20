// On-device classifier — fast path that avoids a network round-trip for
// unambiguous captures. Ambiguous text falls through (returns null) and is
// reclassified by Claude in the background when the API is configured.

import { cap } from './format';
import type { Classification, CategoryKey } from '../types';

const GROCERY_WORDS = new Set([
  'apple','apples','orange','oranges','banana','bananas','grape','grapes',
  'strawberry','strawberries','blueberry','blueberries','mango','mangoes',
  'lemon','lemons','lime','limes','pear','pears','peach','peaches',
  'watermelon','melon','pineapple','kiwi','avocado','avocados',
  'tomato','tomatoes','potato','potatoes','onion','onions','garlic',
  'carrot','carrots','broccoli','spinach','lettuce','cucumber','cucumbers',
  'pepper','peppers','celery','corn','zucchini','mushroom','mushrooms',
  'milk','oat milk','almond milk','eggs','egg','butter','cheese','yogurt',
  'cream','chicken','beef','pork','salmon','tuna','shrimp','fish','bacon',
  'bread','pasta','rice','flour','sugar','salt','olive oil','coffee','tea',
  'juice','soda','soap','shampoo','toothpaste','toilet paper','batteries',
  'chocolate','candy','ice cream','hummus','nuts','almonds','oats','cereal',
  'wipes','diapers','formula','baby food','sunscreen','lotion',
]);

export function localClassify(text: string): Classification | null {
  const lower = text.trim().toLowerCase();
  const words = lower.split(/\s+/);

  const callStarters = ['call ','phone ','ring ','contact ','text ','message ','whatsapp '];
  for (const p of callStarters) {
    if (lower.startsWith(p)) return { category: 'call', cleaned: cap(text) };
  }

  const followPatterns = ['follow up','follow-up','check on','hear back','waiting for','check in with','reach out to'];
  for (const p of followPatterns) {
    if (lower.includes(p)) return { category: 'follow', cleaned: cap(text) };
  }

  for (const w of words) {
    const singular = w.endsWith('s') ? w.slice(0, -1) : w;
    if (GROCERY_WORDS.has(w) || GROCERY_WORDS.has(singular)) {
      const hasBuyVerb = ['buy','get','need','grab','pick up','purchase'].some(v => lower.startsWith(v));
      return { category: 'buy', cleaned: hasBuyVerb ? cap(text) : 'Buy ' + cap(text) };
    }
  }

  return null;
}

export function classifyWithFallback(text: string): Classification {
  return localClassify(text) || { category: 'do' as CategoryKey, cleaned: cap(text) };
}
