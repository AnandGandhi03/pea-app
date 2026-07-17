import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, KeyboardAvoidingView, Platform,
  Animated, ActivityIndicator, Keyboard, Alert, Linking,
  StatusBar, BackHandler,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular, DMSerifDisplay_400Regular_Italic } from '@expo-google-fonts/dm-serif-display';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import { CONFIG } from './src/constants';
import { useVoiceCapture } from './src/useVoiceCapture';

// ─── NOTIFICATIONS ────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

async function registerForNotifications(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('morning-brief', {
      name: 'Morning Brief',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4a7c59',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

async function scheduleMorningBrief(briefTime: string, items: ItemsMap): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const [timePart, period] = briefTime.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  const active = Object.values(items)
    .flatMap(a => a)
    .filter(i => !i.done);
  const total   = active.length;
  const topItem = active[0];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: total > 0
        ? `☀️ Good morning! ${total} thing${total !== 1 ? 's' : ''} need you today`
        : '☀️ Good morning! You\'re all caught up 🎉',
      body: topItem
        ? `Starting with: ${topItem.text}`
        : 'Tap to open Pea',
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'morning-brief' } : {}),
    },
    trigger: { hour: hours, minute: minutes, repeats: true } as any,
  });
}

// ─── TYPES ───────────────────────────────────────────────────
type CategoryKey = 'buy' | 'do' | 'call' | 'follow';
type AppScreen   = 'loading' | 'onboarding' | 'home';
type Tab         = 'home' | 'lists' | 'drafts' | 'me';

interface Item {
  id:    string;
  text:  string;
  done:  boolean;
  time:  string;
  draft: string | null;
}

interface ItemsMap {
  buy:    Item[];
  do:     Item[];
  call:   Item[];
  follow: Item[];
}

interface AppData {
  userName:       string;
  briefTime:      string;
  items:          ItemsMap;
  captureCount:   number;
  lastCountReset: string;
}

interface LastAction {
  itemId:     string;
  category:   CategoryKey;
  cleaned:    string;
  transcript: string;
}

// ─── DESIGN TOKENS (Pea design system) ───────────────────────
const P = {
  green:      '#4a7c59',
  greenLight: '#e8f2eb',
  greenMid:   '#7fad8c',
  greenDark:  '#2d5a3d',
  greenPop:   '#6ab87a',
  cream:      '#faf9f5',
  warm:       '#f5f0e8',
  text:       '#1c2b22',
  muted:      '#6b7f71',
  border:     'rgba(74,124,89,0.15)',
  amber:      '#c4873a',
  amberLight: '#fdf3e7',
  rose:       '#c4607a',
  roseLight:  '#f8ecef',
  lavender:   '#7a68a6',
  lavLight:   '#f0ebf8',
  night:      '#1a2e20',
};

const FONT = {
  display:       'DMSerifDisplay_400Regular',
  displayItalic: 'DMSerifDisplay_400Regular_Italic',
  bodyLight:     'DMSans_300Light',
  body:          'DMSans_400Regular',
  bodyMed:       'DMSans_500Medium',
  bodySemi:      'DMSans_600SemiBold',
};

const CATS: Record<CategoryKey, { label: string; icon: string; color: string; bg: string }> = {
  buy:    { label: 'Groceries',  icon: '🛒', color: P.greenDark, bg: P.greenLight },
  do:     { label: 'Reminders',  icon: '⏰', color: P.amber,     bg: P.amberLight },
  call:   { label: 'Calls',      icon: '📞', color: P.rose,      bg: P.roseLight  },
  follow: { label: 'Follow-ups', icon: '🔁', color: P.lavender,  bg: P.lavLight   },
};

// ─── CONSTANTS ───────────────────────────────────────────────
const STORAGE_KEY = 'pea:data:v3';
const EMPTY_ITEMS: ItemsMap = { buy: [], do: [], call: [], follow: [] };

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

// ─── HELPERS ─────────────────────────────────────────────────
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function todayStr(): string {
  return new Date().toDateString();
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function dateLabel(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${weekday} · ${monthDay}`;
}

// ─── LOCAL CLASSIFIER ────────────────────────────────────────
function localClassify(text: string): { category: CategoryKey; cleaned: string } | null {
  const lower = text.trim().toLowerCase();
  const words  = lower.split(/\s+/);

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

// ─── API ─────────────────────────────────────────────────────
async function callClassifyAPI(
  text: string,
  userName: string,
): Promise<{ category: CategoryKey; cleaned: string } | null> {
  try {
    const hasProxy = CONFIG.ANTHROPIC_API_URL &&
      !CONFIG.ANTHROPIC_API_URL.includes('YOUR_VERCEL');

    if (hasProxy) {
      const res = await fetch(CONFIG.ANTHROPIC_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, userName }),
      });
      if (!res.ok) return null;
      return await res.json();
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: 200,
        system: `Classify parent note into: "buy","do","call","follow".
Clean up text. Reply ONLY JSON: {"category":"do","cleaned":"Text here"}`,
        messages: [{ role: 'user', content: `"${text}"` }],
      }),
    });
    if (!res.ok) return null;
    const d   = await res.json();
    const raw = d.content?.[0]?.text || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

async function generateDraft(itemText: string, userName: string): Promise<string | null> {
  try {
    const hasProxy = CONFIG.ANTHROPIC_API_URL &&
      !CONFIG.ANTHROPIC_API_URL.includes('YOUR_VERCEL');

    const endpoint = hasProxy
      ? CONFIG.ANTHROPIC_API_URL.replace('/classify', '/draft')
      : 'https://api.anthropic.com/v1/messages';

    if (hasProxy) {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: itemText, userName, mode: 'draft' }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return d.draft || null;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: 200,
        system: `Draft a short, friendly text message for a busy parent.
Reply with ONLY the message text — no quotes, no explanation.
Keep it 2–3 sentences max. Sign off with their first name if provided.`,
        messages: [{
          role:    'user',
          content: `Draft a message for: "${itemText}"\nParent name: ${userName}`,
        }],
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ─── STORAGE ─────────────────────────────────────────────────
async function loadData(): Promise<AppData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

async function clearData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// ─── PEA LOGO (bouncing pea) ─────────────────────────────────
function PeaLogo({ size = 44, wordmark = false, tagline = false, light = false }: {
  size?: number; wordmark?: boolean; tagline?: boolean; light?: boolean;
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -size * 0.27, duration: 700, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: -size * 0.18, duration: 480, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: -size * 0.32, duration: 480, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,            duration: 740, useNativeDriver: true }),
      ])
    );
    const shadow = Animated.loop(
      Animated.sequence([
        Animated.timing(shadowAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        Animated.timing(shadowAnim, { toValue: 0.7, duration: 480, useNativeDriver: true }),
        Animated.timing(shadowAnim, { toValue: 0.5, duration: 480, useNativeDriver: true }),
        Animated.timing(shadowAnim, { toValue: 1,   duration: 740, useNativeDriver: true }),
      ])
    );
    bounce.start();
    shadow.start();
    return () => { bounce.stop(); shadow.stop(); };
  }, []);

  const dot = (s: number) => (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: 'rgba(255,255,255,0.9)' }} />
  );

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Animated.View style={{ transform: [{ translateY: bounceAnim }] }}>
        <LinearGradient
          colors={['#6ab87a', '#4a7c59', '#2d5a3d']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size, height: size, borderRadius: size / 2,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <View style={{
            width: size * 0.59, height: size * 0.59, borderRadius: size * 0.3,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {dot(size * 0.11)}
              {dot(size * 0.16)}
              {dot(size * 0.11)}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
      <Animated.View style={{
        width: size * 0.55, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(74,124,89,0.2)',
        transform: [{ scaleX: shadowAnim }],
      }} />
      {wordmark && (
        <Text style={{
          fontFamily: FONT.display, fontSize: size * 0.5,
          color: light ? '#fff' : P.greenDark, letterSpacing: -0.5,
        }}>
          Pea
        </Text>
      )}
      {tagline && (
        <Text style={{ fontFamily: FONT.body, fontSize: 12, color: P.muted, letterSpacing: 0.5 }}>
          your family, handled
        </Text>
      )}
    </View>
  );
}

// ─── TOAST ───────────────────────────────────────────────────
function Toast({ toast }: { toast: { msg: string; id: number } | null }) {
  const slideAnim   = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    slideAnim.setValue(-80);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: -80, duration: 220, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,   duration: 220, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }, 2200);
    return () => clearTimeout(t);
  }, [toast?.id]);

  if (!visible) return null;

  return (
    <Animated.View style={[
      toastS.pill,
      { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
    ]}>
      <Text style={toastS.txt}>{toast?.msg}</Text>
    </Animated.View>
  );
}

const toastS = StyleSheet.create({
  pill: { position: 'absolute', top: 16, alignSelf: 'center', zIndex: 999, backgroundColor: P.night, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 10 },
  txt:  { fontSize: 14, color: '#fff', fontFamily: FONT.bodyMed },
});

// ─── VOICE OVERLAY (dark green full-screen) ──────────────────
const WAVE_HEIGHTS = [12, 28, 40, 34, 48, 38, 22, 32, 16];

function VoiceOverlay({ visible, transcribing, onRelease }: {
  visible: boolean; transcribing: boolean; onRelease: () => void;
}) {
  const waveAnims = useRef(WAVE_HEIGHTS.map(() => new Animated.Value(0.4))).current;

  useEffect(() => {
    if (!visible || transcribing) {
      waveAnims.forEach(a => a.setValue(0.4));
      return;
    }
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const loops: Animated.CompositeAnimation[] = [];
    waveAnims.forEach((anim, i) => {
      const t = setTimeout(() => {
        const l = Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1,   duration: 400, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.4, duration: 400, useNativeDriver: true }),
          ])
        );
        l.start();
        loops.push(l);
      }, (i % 4) * 100);
      timeouts.push(t);
    });
    return () => {
      timeouts.forEach(clearTimeout);
      loops.forEach(l => l.stop());
      waveAnims.forEach(a => a.setValue(0.4));
    };
  }, [visible, transcribing]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRelease}>
      <View style={vs.screen}>
        <Text style={vs.top}>{transcribing ? 'Got it' : 'Listening…'}</Text>

        {transcribing ? (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <ActivityIndicator size="large" color={P.greenPop} />
            <Text style={vs.transcript}>Pea is thinking…</Text>
          </View>
        ) : (
          <View style={vs.waveform}>
            {waveAnims.map((a, i) => (
              <Animated.View
                key={i}
                style={[vs.waveBar, { height: WAVE_HEIGHTS[i], transform: [{ scaleY: a }] }]}
              />
            ))}
          </View>
        )}

        <Text style={vs.hint}>
          {transcribing ? 'one moment' : 'release to send to Pea'}
        </Text>
      </View>
    </Modal>
  );
}

const vs = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: P.night, alignItems: 'center', justifyContent: 'space-evenly', padding: 32 },
  top:        { fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.bodyMed },
  waveform:   { flexDirection: 'row', alignItems: 'center', gap: 5, height: 64 },
  waveBar:    { width: 4, borderRadius: 2, backgroundColor: P.greenPop },
  transcript: { fontFamily: FONT.displayItalic, fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  hint:       { fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: FONT.body },
});

// ─── RESULT SCREEN ───────────────────────────────────────────
function ResultScreen({ action, userName, onUndo, onDone }: {
  action: LastAction; userName: string; onUndo: () => void; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const cat    = CATS[action.category];

  return (
    <View style={[rs.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <View style={rs.check}>
          <Text style={{ fontSize: 26, color: P.green }}>✓</Text>
        </View>
        <Text style={rs.title}>Done, {userName}</Text>

        <View style={rs.card}>
          <Text style={rs.cardLabel}>Pea just did</Text>
          <View style={rs.action}>
            <View style={[rs.actionIcon, { backgroundColor: cat.bg }]}>
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
            </View>
            <Text style={rs.actionText}>
              Saved to {cat.label} — <Text style={{ fontFamily: FONT.bodySemi }}>{action.cleaned}</Text>
            </Text>
          </View>
        </View>

        {!!action.transcript && action.transcript !== action.cleaned && (
          <View style={rs.card}>
            <Text style={rs.cardLabel}>What you said</Text>
            <Text style={rs.saidText}>"{action.transcript}"</Text>
          </View>
        )}
      </View>

      <View style={rs.btns}>
        <TouchableOpacity style={rs.btnUndo} onPress={onUndo} activeOpacity={0.8}>
          <Text style={rs.btnUndoTxt}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rs.btnDone} onPress={onDone} activeOpacity={0.85}>
          <Text style={rs.btnDoneTxt}>Back to home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: P.cream, paddingHorizontal: 24 },
  check:      { width: 64, height: 64, borderRadius: 32, backgroundColor: P.greenLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title:      { fontFamily: FONT.display, fontSize: 30, color: P.greenDark, textAlign: 'center' },
  card:       { backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 18, padding: 16 },
  cardLabel:  { fontSize: 10, fontFamily: FONT.bodySemi, letterSpacing: 1, textTransform: 'uppercase', color: P.muted, marginBottom: 10 },
  action:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionText: { flex: 1, fontSize: 14, color: P.text, lineHeight: 20, fontFamily: FONT.body },
  saidText:   { fontFamily: FONT.displayItalic, fontSize: 14, color: P.muted, lineHeight: 21 },
  btns:       { flexDirection: 'row', gap: 10 },
  btnUndo:    { flex: 1, borderWidth: 1, borderColor: P.border, borderRadius: 16, padding: 15, alignItems: 'center' },
  btnUndoTxt: { fontSize: 14, color: P.muted, fontFamily: FONT.bodyMed },
  btnDone:    { flex: 2, backgroundColor: P.green, borderRadius: 16, padding: 15, alignItems: 'center' },
  btnDoneTxt: { fontSize: 14, color: '#fff', fontFamily: FONT.bodySemi },
});

// ─── MORNING BRIEF SCREEN ────────────────────────────────────
function BriefScreen({ data, onBack }: { data: AppData; onBack: () => void }) {
  const insets = useSafeAreaInsets();

  const reminders = data.items.do.filter(i => !i.done);
  const groceries = data.items.buy.filter(i => !i.done);
  const calls     = data.items.call.filter(i => !i.done);
  const follows   = data.items.follow.filter(i => !i.done);
  const drafts    = [...calls, ...follows].filter(i => i.draft);

  const section = (title: string, rows: { dot: string; text: string }[]) => {
    if (rows.length === 0) return null;
    return (
      <View style={bs.section}>
        <Text style={bs.sectionTitle}>{title}</Text>
        {rows.map((r, i) => (
          <View key={i} style={[bs.item, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={[bs.dot, { backgroundColor: r.dot }]} />
            <Text style={bs.itemTxt} numberOfLines={1}>{r.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  const empty = reminders.length + groceries.length + calls.length + follows.length === 0;

  return (
    <LinearGradient colors={['#fdf3e7', '#faf9f5']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{
        paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10,
      }}>
        <Text style={bs.date}>{dateLabel()}</Text>
        <Text style={bs.heading}>{getGreeting()}, {data.userName} ☀️</Text>

        {empty && (
          <View style={bs.section}>
            <Text style={[bs.itemTxt, { paddingVertical: 8 }]}>
              Nothing on your plate — you're all caught up 🎉
            </Text>
          </View>
        )}

        {section('Reminders today', reminders.map(i => ({ dot: P.amber, text: i.text })))}
        {groceries.length > 0 && section(`Grocery list · ${groceries.length} item${groceries.length !== 1 ? 's' : ''}`, [
          { dot: P.green, text: groceries.map(i => i.text.replace(/^Buy /i, '')).join(', ') },
        ])}
        {section('Calls', calls.map(i => ({ dot: P.rose, text: i.text })))}
        {section('Follow-ups', follows.map(i => ({ dot: P.lavender, text: i.text })))}
        {drafts.length > 0 && section(`Draft${drafts.length !== 1 ? 's' : ''} waiting`, drafts.map(i => ({
          dot: P.rose, text: `${i.text} · tap Drafts to send`,
        })))}

        <TouchableOpacity style={bs.startBtn} onPress={onBack} activeOpacity={0.85}>
          <Text style={bs.startTxt}>Start my day →</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const bs = StyleSheet.create({
  date:         { fontSize: 11, fontFamily: FONT.bodyMed, color: P.amber, textTransform: 'uppercase', letterSpacing: 1.2 },
  heading:      { fontFamily: FONT.display, fontSize: 26, color: P.text, marginBottom: 6 },
  section:      { backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 },
  sectionTitle: { fontSize: 10, fontFamily: FONT.bodySemi, letterSpacing: 1, textTransform: 'uppercase', color: P.muted, marginBottom: 6 },
  item:         { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: P.border },
  dot:          { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  itemTxt:      { fontSize: 13, color: P.text, fontFamily: FONT.body, flex: 1 },
  startBtn:     { backgroundColor: P.amber, borderRadius: 16, padding: 15, alignItems: 'center', marginTop: 6 },
  startTxt:     { fontSize: 14, color: '#fff', fontFamily: FONT.bodyMed },
});

// ─── ONBOARDING ──────────────────────────────────────────────
function OnboardingScreen({ onComplete }: { onComplete: (name: string, time: string) => void }) {
  const insets = useSafeAreaInsets();
  const [step,      setStep]      = useState(0);
  const [userName,  setUserName]  = useState('');
  const [briefTime, setBriefTime] = useState('');

  const TIMES = [
    { value: '6:30 AM', label: 'Early bird' },
    { value: '7:00 AM', label: 'Morning'    },
    { value: '7:30 AM', label: 'Relaxed'    },
    { value: '8:00 AM', label: 'Slow start' },
  ];

  const canProceed = step === 0 ? true : step === 1 ? userName.trim().length >= 1 : !!briefTime;

  function handleContinue() {
    if (!canProceed) return;
    if (step < 2) setStep(step + 1);
    else onComplete(userName.trim(), briefTime);
  }

  return (
    <LinearGradient colors={['#e8f4ed', '#faf9f5']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[ob.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          <View style={ob.dotRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[ob.dot, step === i && ob.dotActive]} />
            ))}
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
            {step === 0 && (
              <>
                <PeaLogo size={72} wordmark tagline />
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Text style={ob.title}>Meet Pea</Text>
                  <Text style={ob.sub}>
                    Your hands-free family assistant.{'\n'}Just speak — Pea takes care of the rest.
                  </Text>
                </View>
              </>
            )}

            {step === 1 && (
              <View style={{ width: '100%', gap: 20 }}>
                <Text style={ob.title}>What should I call you?</Text>
                <TextInput
                  style={ob.nameInput}
                  placeholder="Your first name"
                  placeholderTextColor={P.muted}
                  value={userName}
                  onChangeText={setUserName}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={handleContinue}
                />
              </View>
            )}

            {step === 2 && (
              <View style={{ width: '100%', gap: 20 }}>
                <Text style={ob.title}>When should your{'\n'}morning brief arrive?</Text>
                <View style={ob.timeGrid}>
                  {TIMES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[ob.tOpt, briefTime === t.value && ob.tOptSel]}
                      onPress={() => setBriefTime(t.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[ob.tVal, briefTime === t.value && { color: '#fff' }]}>{t.value}</Text>
                      <Text style={[ob.tLbl, briefTime === t.value && { color: 'rgba(255,255,255,0.75)' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[ob.cta, !canProceed && ob.ctaOff]}
            onPress={handleContinue}
            disabled={!canProceed}
            activeOpacity={0.85}
          >
            <Text style={ob.ctaText}>
              {step === 0 ? 'Get started' : step === 1 ? 'Continue' : 'Start using Pea'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const ob = StyleSheet.create({
  screen:    { flex: 1, paddingHorizontal: 28 },
  dotRow:    { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: P.border },
  dotActive: { width: 18, borderRadius: 3, backgroundColor: P.green },
  title:     { fontFamily: FONT.display, fontSize: 28, color: P.text, textAlign: 'center', lineHeight: 36 },
  sub:       { fontSize: 14, color: P.muted, textAlign: 'center', lineHeight: 22, fontFamily: FONT.body },
  nameInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: P.border, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, fontSize: 19, color: P.text, fontFamily: FONT.body },
  timeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tOpt:      { width: '47.5%', backgroundColor: '#fff', borderWidth: 1, borderColor: P.border, borderRadius: 16, padding: 16, alignItems: 'center' },
  tOptSel:   { backgroundColor: P.green, borderColor: P.green },
  tVal:      { fontSize: 18, fontFamily: FONT.display, color: P.text, marginBottom: 4 },
  tLbl:      { fontSize: 10, color: P.muted, textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: FONT.bodyMed },
  cta:       { backgroundColor: P.green, borderRadius: 16, padding: 16, alignItems: 'center' },
  ctaOff:    { opacity: 0.3 },
  ctaText:   { fontSize: 15, fontFamily: FONT.bodyMed, color: '#fff' },
});

// ─── HOME SCREEN (tabs + voice) ──────────────────────────────
interface HomeScreenProps {
  data:     AppData;
  onUpdate: React.Dispatch<React.SetStateAction<AppData>>;
  onReset:  () => void;
}

function HomeScreen({ data, onUpdate, onReset }: HomeScreenProps) {
  const insets = useSafeAreaInsets();

  const [tab,        setTab]        = useState<Tab>('home');
  const [briefOpen,  setBriefOpen]  = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; id: number } | null>(null);
  const [typeOpen,   setTypeOpen]   = useState(false);
  const [typedText,  setTypedText]  = useState('');
  const holdingRef = useRef(false);

  const { micState, errorMsg, startRecording, stopAndTranscribe, cancelRecording, resetError } =
    useVoiceCapture();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 1250, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 1250, useNativeDriver: true }),
      ])
    );
    ring.start();
    return () => ring.stop();
  }, []);

  useEffect(() => () => { cancelRecording(); }, []);

  function showToast(msg: string) { setToast({ msg, id: Date.now() }); }

  const todayCaptures = data.lastCountReset === todayStr() ? (data.captureCount || 0) : 0;
  const canCapture    = todayCaptures < CONFIG.FREE_CAPTURES_PER_DAY;

  // Android back: close sub-screens first
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lastAction) { setLastAction(null); return true; }
      if (briefOpen)  { setBriefOpen(false); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [lastAction, briefOpen, tab]);

  // ── Capture pipeline ──
  function saveCapture(rawText: string, transcript: string): LastAction | null {
    const t = rawText.trim();
    if (!t) return null;

    if (!canCapture) {
      Alert.alert(
        'Daily limit reached',
        `You've used all ${CONFIG.FREE_CAPTURES_PER_DAY} free captures today.\nUpgrade to Pea Pro for unlimited — ${CONFIG.PRO_PRICE}`,
        [{ text: 'OK' }],
      );
      return null;
    }

    const r = localClassify(t) || { category: 'do' as CategoryKey, cleaned: cap(t) };
    const newItem: Item = {
      id:    Date.now().toString(),
      text:  r.cleaned,
      done:  false,
      time:  'Just now',
      draft: null,
    };

    onUpdate(prev => {
      const isNewDay = prev.lastCountReset !== todayStr();
      return {
        ...prev,
        captureCount:   isNewDay ? 1 : (prev.captureCount || 0) + 1,
        lastCountReset: todayStr(),
        items: {
          ...prev.items,
          [r.category]: [newItem, ...prev.items[r.category]],
        },
      };
    });

    // Background: Claude reclassification for ambiguous items + draft generation
    (async () => {
      const VALID_CATS = new Set<string>(['buy', 'do', 'call', 'follow']);
      const wasLocal = !!localClassify(t);
      let effectiveCategory = r.category;
      if (!wasLocal) {
        const result = await callClassifyAPI(t, data.userName);
        if (result && VALID_CATS.has(result.category) && result.category !== r.category) {
          effectiveCategory = result.category as CategoryKey;
          onUpdate(prev => ({
            ...prev,
            items: {
              ...prev.items,
              [r.category]:        prev.items[r.category].filter(i => i.id !== newItem.id),
              [effectiveCategory]: [
                { ...newItem, text: result.cleaned },
                ...prev.items[effectiveCategory],
              ],
            },
          }));
        }
      }
      if (['call', 'follow'].includes(effectiveCategory)) {
        const draft = await generateDraft(t, data.userName);
        if (draft) {
          onUpdate(prev => ({
            ...prev,
            items: {
              ...prev.items,
              [effectiveCategory]: prev.items[effectiveCategory].map(i =>
                i.id === newItem.id ? { ...i, draft } : i
              ),
            },
          }));
        }
      }
    })();

    return { itemId: newItem.id, category: r.category, cleaned: r.cleaned, transcript };
  }

  function undoLastAction() {
    if (!lastAction) return;
    onUpdate(prev => {
      const items = { ...prev.items };
      (Object.keys(items) as CategoryKey[]).forEach(k => {
        items[k] = items[k].filter(i => i.id !== lastAction.itemId);
      });
      return { ...prev, items, captureCount: Math.max(0, (prev.captureCount || 1) - 1) };
    });
    setLastAction(null);
    showToast('Undone — nothing saved');
  }

  // ── Voice: hold to speak ──
  async function handleMicPressIn() {
    if (!canCapture) {
      Alert.alert('Daily limit reached', `Upgrade to Pea Pro for unlimited captures — ${CONFIG.PRO_PRICE}`);
      return;
    }
    holdingRef.current = true;
    resetError();
    await startRecording();
    // User released before recording actually started → cancel
    if (!holdingRef.current) await cancelRecording();
  }

  async function handleMicPressOut() {
    holdingRef.current = false;
    if (micState === 'recording') {
      const transcript = await stopAndTranscribe();
      if (transcript) {
        const action = saveCapture(transcript, transcript);
        if (action) setLastAction(action);
      }
    } else {
      await cancelRecording();
    }
  }

  // Voice errors → gentle toast (never red)
  useEffect(() => {
    if (micState === 'error' && errorMsg) {
      showToast(errorMsg);
      resetError();
    }
  }, [micState, errorMsg]);

  function handleTypedSave() {
    const action = saveCapture(typedText, typedText);
    if (action) {
      Keyboard.dismiss();
      setTypedText('');
      setTypeOpen(false);
      setLastAction(action);
    }
  }

  function toggleItem(category: CategoryKey, id: string) {
    const wasDone = data.items[category].find(i => i.id === id)?.done ?? false;
    onUpdate(prev => ({
      ...prev,
      items: {
        ...prev.items,
        [category]: prev.items[category].map(i =>
          i.id === id ? { ...i, done: !i.done } : i
        ),
      },
    }));
    if (!wasDone) showToast('Nice — done ✓');
  }

  function openDraft(draft: string) {
    if (!draft) return;
    Alert.alert(
      '✉️ Pea drafted this for you',
      draft,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Edit & Send',
          onPress: () => {
            const url = `sms:&body=${encodeURIComponent(draft)}`;
            Linking.canOpenURL(url).then(supported => {
              if (supported) Linking.openURL(url);
              else Alert.alert('Messages not available', 'Copy the draft manually.');
            });
          },
        },
      ],
    );
  }

  // ── Derived data ──
  const allItems = (Object.entries(data.items) as [CategoryKey, Item[]][])
    .flatMap(([cat, arr]) => arr.map(i => ({ ...i, cat })));
  const activeItems  = allItems.filter(i => !i.done);
  const recentItems  = [...allItems].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 4);
  const draftItems   = activeItems.filter(i => i.draft);
  const counts: Record<CategoryKey, number> = {
    buy:    data.items.buy.filter(i => !i.done).length,
    do:     data.items.do.filter(i => !i.done).length,
    call:   data.items.call.filter(i => !i.done).length,
    follow: data.items.follow.filter(i => !i.done).length,
  };

  // ── Sub-screens ──
  if (lastAction) {
    return (
      <ResultScreen
        action={lastAction}
        userName={data.userName}
        onUndo={undoLastAction}
        onDone={() => setLastAction(null)}
      />
    );
  }

  if (briefOpen) {
    return <BriefScreen data={data} onBack={() => setBriefOpen(false)} />;
  }

  // ── Tab content ──
  const renderHome = () => (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={hm.header}>
        <View>
          <Text style={hm.greeting}>{getGreeting()}, {data.userName}</Text>
          <Text style={hm.date}>{dateLabel()}</Text>
        </View>
        <TouchableOpacity style={hm.settingsBtn} onPress={() => setTab('me')} activeOpacity={0.8}>
          <Text style={{ fontSize: 14 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Today's brief card */}
      <TouchableOpacity style={hm.briefCard} onPress={() => setBriefOpen(true)} activeOpacity={0.85}>
        <Text style={hm.briefTop}>☀️ Today's brief</Text>
        <View style={hm.briefPills}>
          {counts.do     > 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>{counts.do} reminder{counts.do !== 1 ? 's' : ''}</Text></View>}
          {counts.buy    > 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>{counts.buy} grocer{counts.buy !== 1 ? 'ies' : 'y'}</Text></View>}
          {counts.call   > 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>{counts.call} call{counts.call !== 1 ? 's' : ''}</Text></View>}
          {counts.follow > 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>{counts.follow} follow-up{counts.follow !== 1 ? 's' : ''}</Text></View>}
          {draftItems.length > 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>{draftItems.length} draft{draftItems.length !== 1 ? 's' : ''}</Text></View>}
          {activeItems.length === 0 && <View style={hm.briefPill}><Text style={hm.briefPillTxt}>all caught up 🎉</Text></View>}
        </View>
      </TouchableOpacity>

      {/* Mic area */}
      <View style={hm.micArea}>
        <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[hm.micRing, {
            opacity: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0.15] }),
            transform: [{ scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          }]} />
          <TouchableOpacity
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            activeOpacity={0.9}
          >
            <Animated.View style={[hm.micBtn, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={{ fontSize: 30 }}>🎙️</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
        <Text style={hm.micLabel}>hold to speak</Text>
        <TouchableOpacity onPress={() => setTypeOpen(!typeOpen)} activeOpacity={0.7}>
          <Text style={hm.typeLink}>or type it</Text>
        </TouchableOpacity>
      </View>

      {/* Typed fallback */}
      {typeOpen && (
        <View style={hm.typeRow}>
          <TextInput
            style={hm.typeInput}
            placeholder={`"Buy oat milk" or "Call the school"`}
            placeholderTextColor={P.muted}
            value={typedText}
            onChangeText={setTypedText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleTypedSave}
          />
          <TouchableOpacity
            style={[hm.typeSave, !typedText.trim() && { opacity: 0.3 }]}
            onPress={handleTypedSave}
            disabled={!typedText.trim()}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: FONT.bodyMed }}>Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Activity feed */}
      {recentItems.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={hm.feedLabel}>Recent</Text>
          {recentItems.map(item => {
            const c = CATS[item.cat];
            return (
              <View key={`${item.id}-${item.cat}`} style={hm.feedItem}>
                <View style={[hm.feedIcon, { backgroundColor: c.bg }]}>
                  <Text style={{ fontSize: 13 }}>{c.icon}</Text>
                </View>
                <Text style={[hm.feedText, item.done && hm.feedTextDone]} numberOfLines={1}>
                  {item.text}
                </Text>
                <Text style={hm.feedTime}>{item.time}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderLists = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={hm.tabTitle}>Your lists</Text>
      {(Object.entries(CATS) as [CategoryKey, typeof CATS[CategoryKey]][]).map(([key, c]) => {
        const items = data.items[key];
        if (items.length === 0) return null;
        return (
          <View key={key} style={{ gap: 8 }}>
            <View style={hm.listHeader}>
              <Text style={hm.listTitle}>{c.icon} {c.label}</Text>
              <Text style={[hm.listCount, { color: c.color }]}>{counts[key]}</Text>
            </View>
            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[hm.feedItem, item.done && { opacity: 0.45 }]}
                onPress={() => toggleItem(key, item.id)}
                activeOpacity={0.7}
              >
                <View style={[hm.chk, item.done && { backgroundColor: P.green, borderColor: P.green }]}>
                  {item.done && <Text style={{ color: '#fff', fontSize: 10, fontFamily: FONT.bodySemi }}>✓</Text>}
                </View>
                <Text style={[hm.feedText, item.done && hm.feedTextDone]}>{item.text}</Text>
                <Text style={hm.feedTime}>{item.time}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
      {allItems.length === 0 && (
        <View style={hm.emptyBox}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>✨</Text>
          <Text style={hm.emptyTitle}>All clear</Text>
          <Text style={hm.emptySub}>Hold the mic on Home to add something</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderDrafts = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={hm.tabTitle}>Drafts</Text>
      {draftItems.length === 0 ? (
        <View style={hm.emptyBox}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>✉️</Text>
          <Text style={hm.emptyTitle}>No drafts yet</Text>
          <Text style={hm.emptySub}>
            When you capture a call or follow-up,{'\n'}Pea writes the message for you
          </Text>
        </View>
      ) : (
        draftItems.map(item => (
          <TouchableOpacity
            key={`${item.id}-${item.cat}`}
            style={hm.draftCard}
            onPress={() => openDraft(item.draft!)}
            activeOpacity={0.8}
          >
            <Text style={hm.draftFor}>{CATS[item.cat].icon} {item.text}</Text>
            <Text style={hm.draftBody} numberOfLines={2}>"{item.draft}"</Text>
            <Text style={hm.draftSend}>tap to send →</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderMe = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={hm.tabTitle}>Me</Text>

      <View style={hm.meCard}>
        <Text style={hm.meLabel}>Name</Text>
        <Text style={hm.meValue}>{data.userName}</Text>
      </View>

      <View style={hm.meCard}>
        <Text style={hm.meLabel}>Morning brief</Text>
        <Text style={hm.meValue}>{data.briefTime}</Text>
      </View>

      <View style={hm.meCard}>
        <Text style={hm.meLabel}>Captures today</Text>
        <Text style={hm.meValue}>
          {todayCaptures} of {CONFIG.FREE_CAPTURES_PER_DAY} free
        </Text>
        {!canCapture && (
          <Text style={[hm.meLabel, { marginTop: 4, textTransform: 'none', letterSpacing: 0 }]}>
            Upgrade to Pea Pro for unlimited — {CONFIG.PRO_PRICE}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={hm.resetBtn}
        onPress={() => Alert.alert(
          'Reset Pea?',
          'This clears all your data and starts over.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: onReset },
          ],
        )}
        activeOpacity={0.8}
      >
        <Text style={hm.resetTxt}>Reset Pea</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'home',   label: 'Home',   icon: '🏠' },
    { key: 'lists',  label: 'Lists',  icon: '📋' },
    { key: 'drafts', label: 'Drafts', icon: '✉️' },
    { key: 'me',     label: 'Me',     icon: '🙂' },
  ];

  return (
    <View style={[hm.screen, { paddingTop: insets.top }]}>
      <Toast toast={toast} />

      <View style={{ flex: 1 }}>
        {tab === 'home'   && renderHome()}
        {tab === 'lists'  && renderLists()}
        {tab === 'drafts' && renderDrafts()}
        {tab === 'me'     && renderMe()}
      </View>

      {/* Bottom nav */}
      <View style={[hm.nav, { paddingBottom: insets.bottom + 8 }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={hm.navItem}
            onPress={() => setTab(t.key)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 17, opacity: tab === t.key ? 1 : 0.45 }}>{t.icon}</Text>
            <Text style={[hm.navLabel, tab === t.key && { color: P.green, fontFamily: FONT.bodySemi }]}>
              {t.label}
            </Text>
            {tab === t.key && <View style={hm.navDot} />}
          </TouchableOpacity>
        ))}
      </View>

      <VoiceOverlay
        visible={micState === 'recording' || micState === 'transcribing'}
        transcribing={micState === 'transcribing'}
        onRelease={handleMicPressOut}
      />
    </View>
  );
}

const hm = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: P.cream },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:     { fontFamily: FONT.display, fontSize: 24, color: P.text, lineHeight: 30 },
  date:         { fontSize: 12, color: P.muted, fontFamily: FONT.body, marginTop: 2 },
  settingsBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: P.greenLight, alignItems: 'center', justifyContent: 'center' },
  briefCard:    { backgroundColor: P.amberLight, borderWidth: 0.5, borderColor: 'rgba(196,135,58,0.2)', borderRadius: 18, padding: 14 },
  briefTop:     { fontSize: 11, fontFamily: FONT.bodySemi, color: P.amber, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  briefPills:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  briefPill:    { backgroundColor: 'rgba(196,135,58,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  briefPillTxt: { fontSize: 11, color: P.amber, fontFamily: FONT.bodyMed },
  micArea:      { alignItems: 'center', gap: 8, paddingVertical: 14 },
  micRing:      { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(74,124,89,0.25)' },
  micBtn:       { width: 80, height: 80, borderRadius: 40, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center', shadowColor: P.greenDark, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 7 },
  micLabel:     { fontSize: 12, color: P.muted, letterSpacing: 0.5, fontFamily: FONT.body },
  typeLink:     { fontSize: 12, color: P.green, fontFamily: FONT.bodyMed, padding: 6 },
  typeRow:      { flexDirection: 'row', gap: 8 },
  typeInput:    { flex: 1, backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: P.text, fontFamily: FONT.body },
  typeSave:     { backgroundColor: P.green, borderRadius: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  feedLabel:    { fontSize: 10, fontFamily: FONT.bodySemi, letterSpacing: 1, textTransform: 'uppercase', color: P.muted },
  feedItem:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  feedIcon:     { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feedText:     { flex: 1, fontSize: 13, color: P.text, fontFamily: FONT.body, lineHeight: 18 },
  feedTextDone: { textDecorationLine: 'line-through', color: P.muted },
  feedTime:     { fontSize: 10, color: P.muted, fontFamily: FONT.body, flexShrink: 0 },
  tabTitle:     { fontFamily: FONT.display, fontSize: 26, color: P.text, marginBottom: 4 },
  listHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  listTitle:    { fontSize: 12, fontFamily: FONT.bodySemi, letterSpacing: 0.8, textTransform: 'uppercase', color: P.muted },
  listCount:    { fontFamily: FONT.display, fontSize: 18 },
  chk:          { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: P.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptyBox:     { alignItems: 'center', paddingVertical: 56 },
  emptyTitle:   { fontFamily: FONT.display, fontSize: 20, color: P.text, marginBottom: 6 },
  emptySub:     { fontSize: 13, color: P.muted, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
  draftCard:    { backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 16, padding: 14, gap: 6 },
  draftFor:     { fontSize: 13, fontFamily: FONT.bodyMed, color: P.text },
  draftBody:    { fontFamily: FONT.displayItalic, fontSize: 13, color: P.muted, lineHeight: 19 },
  draftSend:    { fontSize: 11, color: P.green, fontFamily: FONT.bodyMed },
  meCard:       { backgroundColor: '#fff', borderWidth: 0.5, borderColor: P.border, borderRadius: 16, padding: 14 },
  meLabel:      { fontSize: 10, fontFamily: FONT.bodySemi, letterSpacing: 1, textTransform: 'uppercase', color: P.muted, marginBottom: 4 },
  meValue:      { fontSize: 16, color: P.text, fontFamily: FONT.body },
  resetBtn:     { borderWidth: 1, borderColor: P.border, borderRadius: 16, padding: 14, alignItems: 'center', marginTop: 8 },
  resetTxt:     { fontSize: 13, color: P.muted, fontFamily: FONT.bodyMed },
  nav:          { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: P.border },
  navItem:      { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 2 },
  navLabel:     { fontSize: 10, color: P.muted, fontFamily: FONT.bodyMed },
  navDot:       { width: 4, height: 4, borderRadius: 2, backgroundColor: P.green },
});

// ─── ROOT ────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({
    DMSerifDisplay_400Regular,
    DMSerifDisplay_400Regular_Italic,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [appState, setAppState] = useState<AppScreen>('loading');
  const [data,     setData]     = useState<AppData>({
    userName:       '',
    briefTime:      '',
    captureCount:   0,
    lastCountReset: todayStr(),
    items:          EMPTY_ITEMS,
  });
  const [notifGranted, setNotifGranted] = useState(false);

  const notifListener    = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined>(undefined);
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined>(undefined);

  useEffect(() => {
    loadData().then(saved => {
      if (saved?.userName && saved?.briefTime) {
        setData(saved);
        setAppState('home');
      } else {
        setAppState('onboarding');
      }
    });

    registerForNotifications().then(granted => setNotifGranted(granted));

    notifListener.current    = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (appState === 'home') {
      saveData(data);
      if (notifGranted && data.briefTime) {
        scheduleMorningBrief(data.briefTime, data.items);
      }
    }
  }, [data, appState, notifGranted]);

  async function handleOnboardingComplete(name: string, time: string) {
    const newData: AppData = {
      ...data,
      userName:  name,
      briefTime: time,
      items:     EMPTY_ITEMS,
    };
    setData(newData);
    await saveData(newData);
    setAppState('home');

    if (notifGranted) {
      await scheduleMorningBrief(time, newData.items);
      Alert.alert(
        '🔔 Morning Brief set!',
        `Pea will send you a daily reminder at ${time}.`,
        [{ text: 'Great!' }],
      );
    }
  }

  async function handleReset() {
    await clearData();
    await Notifications.cancelAllScheduledNotificationsAsync();
    setData({
      userName:       '',
      briefTime:      '',
      captureCount:   0,
      lastCountReset: todayStr(),
      items:          EMPTY_ITEMS,
    });
    setAppState('onboarding');
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={P.cream} />

      {(appState === 'loading' || !fontsLoaded) && (
        <View style={{ flex: 1, backgroundColor: P.cream, alignItems: 'center', justifyContent: 'center' }}>
          {fontsLoaded
            ? <PeaLogo size={72} wordmark tagline />
            : <ActivityIndicator color={P.green} size="large" />}
        </View>
      )}

      {appState === 'onboarding' && fontsLoaded && (
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      )}

      {appState === 'home' && fontsLoaded && (
        <HomeScreen
          data={data}
          onUpdate={setData}
          onReset={handleReset}
        />
      )}
    </SafeAreaProvider>
  );
}
