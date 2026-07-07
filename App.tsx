import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // FIX: Create Android notification channel (required SDK 53+)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('morning-brief', {
      name: 'Morning Brief',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6ECC85',
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

// ─── DESIGN TOKENS ───────────────────────────────────────────
const C = {
  ink:        '#1C1917',
  inkLight:   '#6B6560',
  inkFaint:   '#C4BDB5',
  cream:      '#F2EDE6',
  warmWhite:  '#FAFAF8',
  green:      '#6ECC85',
  greenDark:  '#2A7A4B',
  greenSoft:  '#EAF4EE',
  orange:     '#D4521A',
  orangeSoft: '#FDF0EA',
  blue:       '#1A4ED4',
  blueSoft:   '#EAEFfd',
  purple:     '#6A1AD4',
  purpleSoft: '#F0EAFD',
};

const CATS: Record<CategoryKey, { label: string; icon: string; color: string; bg: string }> = {
  buy:    { label: 'To Buy',    icon: '🛒', color: C.greenDark, bg: C.greenSoft  },
  do:     { label: 'To Do',     icon: '✅', color: C.orange,    bg: C.orangeSoft },
  call:   { label: 'To Call',   icon: '📞', color: C.blue,      bg: C.blueSoft   },
  follow: { label: 'Follow Up', icon: '🔔', color: C.purple,    bg: C.purpleSoft },
};

// ─── CONSTANTS ───────────────────────────────────────────────
const STORAGE_KEY = 'pea:data:v3';

// FIX: Empty items map for new/reset users — no demo data pollution
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

// ─── LOCAL CLASSIFIER ────────────────────────────────────────
function localClassify(text: string): { category: CategoryKey; cleaned: string } | null {
  const lower = text.trim().toLowerCase();
  const words  = lower.split(/\s+/);

  // Call/message patterns — check first
  const callStarters = ['call ','phone ','ring ','contact ','text ','message ','whatsapp '];
  for (const p of callStarters) {
    if (lower.startsWith(p)) return { category: 'call', cleaned: cap(text) };
  }

  // Follow-up patterns
  const followPatterns = ['follow up','follow-up','check on','hear back','waiting for','check in with','reach out to'];
  for (const p of followPatterns) {
    if (lower.includes(p)) return { category: 'follow', cleaned: cap(text) };
  }

  // Grocery/buy patterns
  for (const w of words) {
    const singular = w.endsWith('s') ? w.slice(0, -1) : w;
    if (GROCERY_WORDS.has(w) || GROCERY_WORDS.has(singular)) {
      const hasBuyVerb = ['buy','get','need','grab','pick up','purchase'].some(v => lower.startsWith(v));
      return { category: 'buy', cleaned: hasBuyVerb ? cap(text) : 'Buy ' + cap(text) };
    }
  }

  return null; // Ambiguous — Claude fallback
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

    // Dev fallback — direct API
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

// FIX: Draft generation also routes through proxy
async function generateDraft(itemText: string, userName: string): Promise<string | null> {
  try {
    const hasProxy = CONFIG.ANTHROPIC_API_URL &&
      !CONFIG.ANTHROPIC_API_URL.includes('YOUR_VERCEL');

    // Use a draft endpoint or fallback to direct API
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

// ─── CAPTURE SHEET ───────────────────────────────────────────
interface CaptureSheetProps {
  visible:  boolean;
  onClose:  () => void;
  onSave:   (text: string, category: CategoryKey) => void;
}

function CaptureSheet({ visible, onClose, onSave }: CaptureSheetProps) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inputRef  = useRef<TextInput>(null);
  const debRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode,       setMode]       = useState<'voice' | 'type'>('voice');
  const [text,       setText]       = useState('');
  const [aiResult,   setAiResult]   = useState<{ category: CategoryKey; cleaned: string } | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const { voiceState, errorMsg, startRecording, stopAndTranscribe, cancelRecording, resetError } =
    useVoiceCapture();

  // Cleanup debounce + recording on unmount
  useEffect(() => {
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
      cancelRecording();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate sheet + reset state on visibility change
  useEffect(() => {
    if (visible) {
      setMode('voice');
      setText('');
      setAiResult(null);
      setTranscript(null);
      resetError();
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
      }).start();
    } else {
      cancelRecording();
      Animated.timing(slideAnim, {
        toValue: 700, useNativeDriver: true, duration: 260,
      }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Pulse animation while recording
  useEffect(() => {
    if (voiceState === 'recording') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => { anim.stop(); pulseAnim.setValue(1); };
    } else {
      pulseAnim.setValue(1);
    }
  }, [voiceState]);

  // Auto-focus text input when switching to type mode
  useEffect(() => {
    if (mode === 'type') setTimeout(() => inputRef.current?.focus(), 300);
  }, [mode]);

  function triggerAI(val: string) {
    if (debRef.current) clearTimeout(debRef.current);
    if (val.trim().length < 3) { setAiResult(null); return; }
    setAiLoading(true);
    debRef.current = setTimeout(() => {
      const r = localClassify(val) || { category: 'do' as CategoryKey, cleaned: cap(val) };
      setAiResult(r);
      setAiLoading(false);
    }, 420);
  }

  function handleSave() {
    const t = (transcript || text).trim();
    if (!t) return;
    Keyboard.dismiss();
    const r = aiResult || localClassify(t) || { category: 'do' as CategoryKey, cleaned: cap(t) };
    onSave(r.cleaned, r.category);
    onClose();
  }

  function handleClose() {
    Keyboard.dismiss();
    cancelRecording();
    onClose();
  }

  async function handleMicPress() {
    if (voiceState === 'recording') {
      const result = await stopAndTranscribe();
      if (result) {
        setTranscript(result);
        triggerAI(result);
      }
    } else {
      resetError();
      await startRecording();
    }
  }

  function switchToType(prefill = '') {
    setTranscript(null);
    setText(prefill);
    if (prefill) triggerAI(prefill);
    setMode('type');
  }

  function switchToVoice() {
    setTranscript(null);
    setText('');
    setAiResult(null);
    resetError();
    setMode('voice');
  }

  const cat          = aiResult?.category ? CATS[aiResult.category] : null;
  const isRecording  = voiceState === 'recording';
  const isWorking    = voiceState === 'transcribing';
  const hasTranscript = !!transcript && voiceState === 'idle';

  const aiPill = (
    <View style={cs.aiStatus}>
      {aiLoading && (
        <View style={cs.pill}>
          <ActivityIndicator size="small" color={C.orange} style={{ marginRight: 6 }} />
          <Text style={cs.pillText}>Pea is thinking...</Text>
        </View>
      )}
      {!aiLoading && cat && (
        <View style={cs.pill}>
          <View style={[cs.dot, { backgroundColor: cat.color }]} />
          <Text style={cs.pillText} numberOfLines={1}>
            {cat.label} · "{aiResult?.cleaned}"
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableOpacity style={cs.backdrop} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={cs.kav}
        pointerEvents="box-none"
      >
        <Animated.View style={[cs.sheet, {
          transform: [{ translateY: slideAnim }],
          paddingBottom: insets.bottom + 24,
        }]}>
          <View style={cs.handle} />

          {/* Header */}
          <View style={cs.sheetTop}>
            <Text style={cs.title}>What to remember?</Text>
            <View style={cs.aiBadge}><Text style={cs.aiBadgeText}>✦ Pea AI</Text></View>
          </View>

          {mode === 'type' ? (
            /* ─── TYPE MODE ─── */
            <>
              <Text style={cs.sub}>Type below — Pea sorts it automatically</Text>
              <TextInput
                ref={inputRef}
                style={cs.input}
                placeholder={`"Buy oat milk" or "Call the school"`}
                placeholderTextColor={C.inkFaint}
                value={text}
                onChangeText={v => { setText(v); triggerAI(v); }}
                multiline
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={handleSave}
              />
              {aiPill}
              <TouchableOpacity
                style={[cs.saveBtn, !text.trim() && cs.saveBtnOff]}
                onPress={handleSave}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={cs.saveBtnText}>Save to Pea</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cs.modeLink} onPress={switchToVoice} activeOpacity={0.7}>
                <Text style={cs.modeLinkTxt}>🎙 Back to voice</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ─── VOICE MODE ─── */
            <>
              {/* Transcript result shown after successful transcription */}
              {hasTranscript && (
                <>
                  <View style={cs.transcriptBox}>
                    <Text style={cs.transcriptTxt}>{transcript}</Text>
                    <TouchableOpacity
                      onPress={() => switchToType(transcript!)}
                      activeOpacity={0.7}
                    >
                      <Text style={cs.editLink}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  {aiPill}
                  <TouchableOpacity style={cs.saveBtn} onPress={handleSave} activeOpacity={0.85}>
                    <Text style={cs.saveBtnText}>Save to Pea</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Mic button area (shown while idle/recording/transcribing/error) */}
              {!hasTranscript && (
                <>
                  {voiceState === 'error' && errorMsg && (
                    <View style={cs.errBanner}>
                      <Text style={cs.errTxt}>{errorMsg}</Text>
                    </View>
                  )}
                  <View style={cs.micArea}>
                    <TouchableOpacity
                      onPress={handleMicPress}
                      disabled={isWorking}
                      activeOpacity={0.85}
                    >
                      <Animated.View style={[
                        cs.micBtn,
                        isRecording && cs.micBtnRec,
                        { transform: [{ scale: pulseAnim }] },
                      ]}>
                        {isWorking
                          ? <ActivityIndicator size="large" color="#fff" />
                          : <Text style={cs.micIcon}>{isRecording ? '⏹' : '🎙'}</Text>
                        }
                      </Animated.View>
                    </TouchableOpacity>
                    <Text style={cs.micLabel}>
                      {isWorking    ? 'Pea is transcribing…'
                      : isRecording ? 'Listening… tap to finish'
                      : voiceState === 'error' ? 'Tap to try again'
                      : 'Tap and speak'}
                    </Text>
                  </View>
                </>
              )}

              {/* Type instead / edit-as-text fallback (hidden while mic is active) */}
              {!isRecording && !isWorking && (
                <TouchableOpacity
                  style={cs.modeLink}
                  onPress={() => switchToType(hasTranscript ? transcript! : '')}
                  activeOpacity={0.7}
                >
                  <Text style={cs.modeLinkTxt}>
                    {hasTranscript ? '⌨️ Edit as text' : '⌨️ Type instead'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cs = StyleSheet.create({
  // ── Sheet chrome ──
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,25,23,0.55)' },
  kav:           { flex: 1, justifyContent: 'flex-end' },
  sheet:         { backgroundColor: C.warmWhite, borderTopLeftRadius: 34, borderTopRightRadius: 34, padding: 24 },
  handle:        { width: 40, height: 4, backgroundColor: '#D9D3CB', borderRadius: 2, alignSelf: 'center', marginBottom: 22 },
  sheetTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title:         { fontSize: 24, fontWeight: '300', color: C.ink, letterSpacing: -0.5 },
  aiBadge:       { backgroundColor: C.greenSoft, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  aiBadgeText:   { fontSize: 11, color: C.greenDark, fontWeight: '600' },
  // ── Type mode ──
  sub:           { fontSize: 13, color: C.inkLight, marginBottom: 16 },
  input:         { backgroundColor: C.cream, borderRadius: 20, padding: 15, fontSize: 17, color: C.ink, minHeight: 82, textAlignVertical: 'top', lineHeight: 24 },
  // ── AI pill ──
  aiStatus:      { minHeight: 38, justifyContent: 'center', marginTop: 10, marginBottom: 4 },
  pill:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  dot:           { width: 8, height: 8, borderRadius: 4, marginRight: 7, flexShrink: 0 },
  pillText:      { fontSize: 12, color: C.inkLight, flexShrink: 1 },
  // ── Save button ──
  saveBtn:       { backgroundColor: C.ink, borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 8 },
  saveBtnOff:    { opacity: 0.25 },
  saveBtnText:   { fontSize: 15, color: '#fff', fontWeight: '600' },
  // ── Voice mode ──
  micArea:       { alignItems: 'center', paddingVertical: 32 },
  micBtn:        { width: 96, height: 96, borderRadius: 48, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 8 },
  micBtnRec:     { backgroundColor: C.orange },
  micIcon:       { fontSize: 36 },
  micLabel:      { marginTop: 16, fontSize: 15, color: C.inkLight, textAlign: 'center' },
  transcriptBox: { backgroundColor: C.cream, borderRadius: 20, padding: 16, marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  transcriptTxt: { flex: 1, fontSize: 16, color: C.ink, fontWeight: '300', lineHeight: 24 },
  editLink:      { fontSize: 13, color: C.blue, fontWeight: '600', paddingTop: 2 },
  errBanner:     { backgroundColor: C.orangeSoft, borderRadius: 14, padding: 12, marginTop: 8, marginBottom: 4 },
  errTxt:        { fontSize: 13, color: C.orange, fontWeight: '500', textAlign: 'center' },
  modeLink:      { alignItems: 'center', paddingVertical: 14 },
  modeLinkTxt:   { fontSize: 13, color: C.inkLight },
});

// ─── ONBOARDING ──────────────────────────────────────────────
interface OnboardingProps {
  onComplete: (name: string, time: string) => void;
}

function OnboardingScreen({ onComplete }: OnboardingProps) {
  const insets = useSafeAreaInsets();
  const [step,      setStep]      = useState(1);
  const [userName,  setUserName]  = useState('');
  const [briefTime, setBriefTime] = useState('');

  const TIMES = [
    { value: '6:30 AM', label: 'Early bird' },
    { value: '7:00 AM', label: 'Morning'    },
    { value: '7:30 AM', label: 'Relaxed'    },
    { value: '8:00 AM', label: 'Slow start' },
  ];

  // FIX: Proper name validation — trim + min length
  const nameValid = userName.trim().length >= 1;
  const canProceed = step === 1 ? nameValid : !!briefTime;

  function handleContinue() {
    if (!canProceed) return;
    if (step === 1) { setStep(2); }
    else { onComplete(userName.trim(), briefTime); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={[os.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>

        <Text style={os.logo}>
          p<Text style={os.logoG}>ea</Text>
        </Text>
        <Text style={os.tag}>
          {step === 1
            ? "Your family's second brain.\nNothing falls through the cracks."
            : "No categories. No setup.\nJust talk to Pea."}
        </Text>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={os.stepLbl}>Step {step} of 2</Text>

          {step === 1 ? (
            <>
              <Text style={os.q}>What should I call you?</Text>
              <TextInput
                style={os.nameInput}
                placeholder="Your first name"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={userName}
                onChangeText={setUserName}
                autoFocus
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={handleContinue}
              />
            </>
          ) : (
            <>
              <Text style={os.q}>
                When should I send your{'\n'}morning briefing?
              </Text>
              <View style={os.timeGrid}>
                {TIMES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[os.tOpt, briefTime === t.value && os.tOptSel]}
                    onPress={() => setBriefTime(t.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={os.tVal}>{t.value}</Text>
                    <Text style={os.tLbl}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[os.cta, !canProceed && os.ctaOff]}
          onPress={handleContinue}
          disabled={!canProceed}
          activeOpacity={0.85}
        >
          <Text style={os.ctaText}>
            {step === 1 ? 'Continue →' : 'Start using Pea →'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const os = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.ink, paddingHorizontal: 36 },
  logo:      { fontSize: 52, fontWeight: '200', color: '#fff', letterSpacing: -2, marginBottom: 8 },
  logoG:     { color: C.green },
  tag:       { fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 22, marginBottom: 40 },
  stepLbl:   { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, color: C.green, fontWeight: '600', marginBottom: 12 },
  q:         { fontSize: 28, fontWeight: '200', color: '#fff', lineHeight: 36, marginBottom: 28, letterSpacing: -0.5 },
  nameInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 18, paddingHorizontal: 20, paddingVertical: 18, fontSize: 22, color: '#fff' },
  timeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tOpt:      { width: '47.5%', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 18, alignItems: 'center' },
  tOptSel:   { backgroundColor: C.green, borderColor: C.green },
  tVal:      { fontSize: 20, fontWeight: '200', color: '#fff', marginBottom: 4 },
  tLbl:      { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.7 },
  cta:       { backgroundColor: C.green, borderRadius: 20, padding: 18, alignItems: 'center' },
  ctaOff:    { opacity: 0.25 },
  ctaText:   { fontSize: 16, fontWeight: '600', color: C.ink },
});

// ─── HOME SCREEN ─────────────────────────────────────────────
interface HomeScreenProps {
  data:     AppData;
  onUpdate: React.Dispatch<React.SetStateAction<AppData>>;
  onReset:  () => void;
}

function HomeScreen({ data, onUpdate, onReset }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [captureOpen,    setCaptureOpen]    = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | 'all' | null>(null);
  const [savingItem,     setSavingItem]     = useState(false);

  // FIX: Daily count with correct reset — persists to storage via onUpdate
  const todayCaptures = data.lastCountReset === todayStr() ? (data.captureCount || 0) : 0;
  const canCapture    = todayCaptures < CONFIG.FREE_CAPTURES_PER_DAY;
  const remaining     = CONFIG.FREE_CAPTURES_PER_DAY - todayCaptures;

  // Android back button — go back from category view
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeCategory) { setActiveCategory(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [activeCategory]);

  const activeCount = (Object.values(data.items) as Item[][])
    .reduce((n, arr) => n + arr.filter(i => !i.done).length, 0);

  // FIX: handleSave uses functional update pattern throughout
  async function handleSave(text: string, category: CategoryKey) {
    if (!canCapture) {
      Alert.alert(
        'Daily limit reached',
        `You've used all ${CONFIG.FREE_CAPTURES_PER_DAY} free captures today.\nUpgrade to Pea Pro for unlimited — ${CONFIG.PRO_PRICE}`,
        [{ text: 'OK' }],
      );
      return;
    }

    setSavingItem(true);
    const newItem: Item = {
      id:    Date.now().toString(),
      text,
      done:  false,
      time:  'Just now',
      draft: null,
    };

    // FIX: Functional update — always based on latest state
    onUpdate(prev => {
      const isNewDay = prev.lastCountReset !== todayStr();
      return {
        ...prev,
        captureCount:   isNewDay ? 1 : (prev.captureCount || 0) + 1,
        lastCountReset: todayStr(),
        items: {
          ...prev.items,
          [category]: [newItem, ...prev.items[category]],
        },
      };
    });

    setSavingItem(false);

    // Claude fallback for ambiguous items (non-blocking)
    const VALID_CATS = new Set<string>(['buy', 'do', 'call', 'follow']);
    const wasLocal = !!localClassify(text);
    let effectiveCategory = category;
    if (!wasLocal) {
      const result = await callClassifyAPI(text, data.userName);
      if (result && VALID_CATS.has(result.category) && result.category !== category) {
        effectiveCategory = result.category as CategoryKey;
        onUpdate(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [category]:        prev.items[category].filter(i => i.id !== newItem.id),
            [effectiveCategory]: [
              { ...newItem, text: result.cleaned },
              ...prev.items[effectiveCategory],
            ],
          },
        }));
      }
    }

    // Draft for call/follow items — use the effective (possibly reclassified) category
    if (['call', 'follow'].includes(effectiveCategory)) {
      const draft = await generateDraft(text, data.userName);
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
  }

  function toggleItem(category: CategoryKey, id: string) {
    onUpdate(prev => ({
      ...prev,
      items: {
        ...prev.items,
        [category]: prev.items[category].map(i =>
          i.id === id ? { ...i, done: !i.done } : i
        ),
      },
    }));
  }

  // FIX: Draft button with proper null check before Linking
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

  // ── Detail view (category or all) ──
  if (activeCategory) {
    const isAll = activeCategory === 'all';
    const displayItems = isAll
      ? (Object.entries(data.items) as [CategoryKey, Item[]][]).flatMap(([cat, arr]) =>
          arr.map(i => ({ ...i, cat }))
        )
      : data.items[activeCategory as CategoryKey].map(i => ({
          ...i, cat: activeCategory as CategoryKey,
        }));

    const cat       = isAll ? null : CATS[activeCategory as CategoryKey];
    const remaining = displayItems.filter(i => !i.done).length;
    const done      = displayItems.filter(i => i.done).length;

    return (
      <View style={[hs.screen, { paddingTop: insets.top }]}>
        <View style={hs.detHdr}>
          <TouchableOpacity onPress={() => setActiveCategory(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={hs.backTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={hs.detTitle}>
            {isAll ? '📋 All Items' : `${cat!.icon} ${cat!.label}`}
          </Text>
          <Text style={hs.detCount}>
            {remaining} remaining{done > 0 ? ` · ${done} done` : ''}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
        >
          {displayItems.length === 0 ? (
            <View style={hs.empty}>
              <Text style={hs.emptyIcon}>✨</Text>
              <Text style={hs.emptyT}>All clear</Text>
              <Text style={hs.emptyS}>Tap below to add something</Text>
            </View>
          ) : (
            displayItems.map(item => {
              const ic = CATS[item.cat];
              return (
                <View key={`${item.id}-${item.cat}`} style={[hs.item, item.done && hs.itemDone]}>
                  <TouchableOpacity
                    style={hs.itemMain}
                    onPress={() => toggleItem(item.cat, item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[hs.chk, item.done && hs.chkDone]}>
                      {item.done && <Text style={hs.chkMark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[hs.itemTxt, item.done && hs.itemTxtDone]}>
                        {item.text}
                      </Text>
                      <View style={hs.itemMeta}>
                        {isAll && (
                          <View style={[hs.catTag, { backgroundColor: ic.bg }]}>
                            <Text style={[hs.catTagTxt, { color: ic.color }]}>
                              {ic.icon} {ic.label}
                            </Text>
                          </View>
                        )}
                        <Text style={hs.itemTime}>{item.time}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Draft button — only for call/follow with generated draft */}
                  {item.draft && !item.done && (
                    <TouchableOpacity
                      style={hs.draftBtn}
                      onPress={() => openDraft(item.draft!)}
                      activeOpacity={0.8}
                    >
                      <Text style={hs.draftBtnText}>✉️ Draft</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        <TouchableOpacity
          style={[hs.fab, { bottom: insets.bottom + 32 }]}
          onPress={() => setCaptureOpen(true)}
          activeOpacity={0.85}
        >
          <View style={hs.fabDot} />
          <Text style={hs.fabTxt}>Remember something...</Text>
        </TouchableOpacity>

        <CaptureSheet
          visible={captureOpen}
          onClose={() => setCaptureOpen(false)}
          onSave={handleSave}
        />
      </View>
    );
  }

  // ── Home view ──
  const briefItems = (Object.entries(data.items) as [CategoryKey, Item[]][])
    .flatMap(([cat, arr]) => arr.filter(i => !i.done).map(i => ({ ...i, cat })))
    .slice(0, 3);

  return (
    <View style={[hs.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={hs.hdr}>
          <View style={{ flex: 1 }}>
            <Text style={hs.greeting}>{getGreeting()}, {data.userName} ☀️</Text>
            <Text style={hs.title}>
              You have{' '}
              <Text style={hs.titleAccent}>
                {activeCount} thing{activeCount !== 1 ? 's' : ''}
              </Text>
              {'\n'}waiting for you.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert(
              '⚙️ Settings',
              'Reset Pea? This clears all your data.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: onReset },
              ]
            )}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 20, opacity: 0.3 }}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Capture usage badge */}
        <View style={{ paddingHorizontal: 24, marginBottom: 4 }}>
          <View style={[hs.usageBadge, { backgroundColor: canCapture ? C.greenSoft : C.orangeSoft }]}>
            <View style={[hs.usageDot, { backgroundColor: canCapture ? C.greenDark : C.orange }]} />
            <Text style={[hs.usageTxt, { color: canCapture ? C.greenDark : C.orange }]}>
              {canCapture
                ? `${remaining} capture${remaining !== 1 ? 's' : ''} left today`
                : `Daily limit reached · Upgrade to Pro ${CONFIG.PRO_PRICE}`}
            </Text>
          </View>
        </View>

        {/* Morning brief — dark card */}
        <View style={hs.brief}>
          <Text style={hs.briefLbl}>☀️ MORNING BRIEF · {data.briefTime}</Text>
          <Text style={hs.briefTitle}>
            {activeCount === 0
              ? "You're all caught up 🎉"
              : `${activeCount} thing${activeCount !== 1 ? 's' : ''} waiting for you`}
          </Text>

          {briefItems.length > 0 ? briefItems.map(item => (
            <View key={`${item.id}-${item.cat}`} style={hs.briefRow}>
              <View style={[hs.briefDot, { backgroundColor: CATS[item.cat].color }]} />
              <View style={{ flex: 1 }}>
                <Text style={hs.briefTxt} numberOfLines={1}>{item.text}</Text>
                <Text style={hs.briefCat}>
                  {CATS[item.cat].icon} {CATS[item.cat].label}
                </Text>
              </View>
            </View>
          )) : (
            <View style={hs.briefRow}>
              <Text style={hs.briefTxt}>
                {activeCount === 0 ? 'Tap below to start capturing ✨' : ''}
              </Text>
            </View>
          )}

          {activeCount > 3 && (
            <Text style={hs.briefMore}>+{activeCount - 3} more items</Text>
          )}

          <TouchableOpacity
            style={hs.briefBtn}
            onPress={() => setActiveCategory('all')}
            activeOpacity={0.85}
          >
            <Text style={hs.briefBtnTxt}>Review all →</Text>
          </TouchableOpacity>
        </View>

        {/* Category grid */}
        <Text style={hs.secLbl}>Your lists</Text>
        <View style={hs.grid}>
          {(Object.entries(CATS) as [CategoryKey, typeof CATS[CategoryKey]][]).map(([key, cat]) => {
            const count = data.items[key].filter(i => !i.done).length;
            return (
              <TouchableOpacity
                key={key}
                style={[hs.catCard, { backgroundColor: cat.bg }]}
                onPress={() => setActiveCategory(key)}
                activeOpacity={0.85}
              >
                <Text style={hs.catIcon}>{cat.icon}</Text>
                <Text style={hs.catName}>{cat.label}</Text>
                <Text style={[hs.catCount, { color: cat.color }]}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Saving indicator */}
      {savingItem && (
        <View style={hs.savingBanner}>
          <ActivityIndicator size="small" color={C.green} />
          <Text style={hs.savingTxt}>Saving...</Text>
        </View>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[hs.fab, { bottom: insets.bottom + 32 }]}
        onPress={() => {
          if (canCapture) setCaptureOpen(true);
          else Alert.alert(
            'Daily limit reached',
            `Upgrade to Pea Pro for unlimited captures — ${CONFIG.PRO_PRICE}`,
          );
        }}
        activeOpacity={0.85}
      >
        <View style={[hs.fabDot, { backgroundColor: canCapture ? C.green : C.orange }]} />
        <Text style={hs.fabTxt}>
          {canCapture ? 'Remember something...' : `Upgrade · ${CONFIG.PRO_PRICE}`}
        </Text>
      </TouchableOpacity>

      <CaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSave={handleSave}
      />
    </View>
  );
}

const hs = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.warmWhite },
  hdr:          { flexDirection: 'row', padding: 24, paddingBottom: 12, alignItems: 'flex-start' },
  greeting:     { fontSize: 13, color: C.inkLight, marginBottom: 4 },
  title:        { fontSize: 30, fontWeight: '300', color: C.ink, letterSpacing: -0.5, lineHeight: 36 },
  titleAccent:  { color: C.orange, fontStyle: 'italic' },
  usageBadge:   { flexDirection: 'row', alignItems: 'center', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', gap: 6 },
  usageDot:     { width: 6, height: 6, borderRadius: 3 },
  usageTxt:     { fontSize: 12, fontWeight: '600' },
  brief:        { margin: 18, marginTop: 10, backgroundColor: C.ink, borderRadius: 28, padding: 24 },
  briefLbl:     { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: C.green, marginBottom: 6, fontWeight: '600' },
  briefTitle:   { fontSize: 20, fontWeight: '300', color: '#fff', marginBottom: 16, lineHeight: 27 },
  briefRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 7 },
  briefDot:     { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  briefTxt:     { fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: '300' },
  briefCat:     { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  briefMore:    { fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14, marginTop: 4 },
  briefBtn:     { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 8 },
  briefBtnTxt:  { fontSize: 14, fontWeight: '600', color: C.ink },
  secLbl:       { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1, color: C.inkFaint, fontWeight: '600', marginHorizontal: 24, marginBottom: 12 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18 },
  catCard:      { width: '47.5%', borderRadius: 24, padding: 20 },
  catIcon:      { fontSize: 26, marginBottom: 10 },
  catName:      { fontSize: 11, fontWeight: '600', color: C.ink, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.7 },
  catCount:     { fontSize: 34, fontWeight: '300' },
  fab:          { position: 'absolute', alignSelf: 'center', backgroundColor: C.ink, borderRadius: 100, paddingHorizontal: 28, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8 },
  fabDot:       { width: 8, height: 8, borderRadius: 4 },
  fabTxt:       { fontSize: 15, color: '#fff', fontWeight: '500' },
  detHdr:       { padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  backTxt:      { fontSize: 14, color: C.inkLight, marginBottom: 14 },
  detTitle:     { fontSize: 34, fontWeight: '300', color: C.ink, letterSpacing: -0.5 },
  detCount:     { fontSize: 13, color: C.inkLight, marginTop: 3 },
  item:         { backgroundColor: C.cream, borderRadius: 22, padding: 15, flexDirection: 'column', marginBottom: 9 },
  itemDone:     { opacity: 0.38 },
  itemMain:     { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  chk:          { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.inkFaint, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  chkDone:      { backgroundColor: C.greenDark, borderColor: C.greenDark },
  chkMark:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  itemTxt:      { fontSize: 15, fontWeight: '300', color: C.ink, lineHeight: 22 },
  itemTxtDone:  { textDecorationLine: 'line-through', color: C.inkLight },
  itemMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  itemTime:     { fontSize: 11, color: C.inkFaint },
  empty:        { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:    { fontSize: 48, marginBottom: 14 },
  emptyT:       { fontSize: 22, fontWeight: '300', color: C.inkLight, marginBottom: 8 },
  emptyS:       { fontSize: 14, color: C.inkFaint, textAlign: 'center' },
  catTag:       { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  catTagTxt:    { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  draftBtn:     { backgroundColor: C.blueSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', marginTop: 10, marginLeft: 37 },
  draftBtnText: { fontSize: 12, color: C.blue, fontWeight: '600' },
  savingBanner: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: C.ink, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingTxt:    { fontSize: 13, color: '#fff' },
});

// ─── ROOT ────────────────────────────────────────────────────
export default function App() {
  const [appState,     setAppState]     = useState<AppScreen>('loading');
  const [data,         setData]         = useState<AppData>({
    userName:       '',
    briefTime:      '',
    captureCount:   0,
    lastCountReset: todayStr(),
    // FIX: Start with EMPTY items — no demo data in real user storage
    items: EMPTY_ITEMS,
  });
  const [notifGranted, setNotifGranted] = useState(false);

  const notifListener    = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined>(undefined);
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined>(undefined);

  useEffect(() => {
    // Load saved data
    loadData().then(saved => {
      if (saved?.userName && saved?.briefTime) {
        setData(saved);
        setAppState('home');
      } else {
        setAppState('onboarding');
      }
    });

    // Notifications
    registerForNotifications().then(granted => setNotifGranted(granted));

    notifListener.current    = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // Auto-save whenever data or screen changes
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
      // FIX: Keep items empty on fresh onboarding — no demo bleed-in
      items: EMPTY_ITEMS,
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
    // FIX: Reset to truly empty state — no demo data
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
      <StatusBar barStyle="dark-content" backgroundColor={C.warmWhite} />

      {appState === 'loading' && (
        <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <Text style={{ fontSize: 52, fontWeight: '200', color: '#fff', letterSpacing: -2 }}>
            p<Text style={{ color: C.green }}>ea</Text>
          </Text>
          <ActivityIndicator color={C.green} size="large" />
        </View>
      )}

      {appState === 'onboarding' && (
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      )}

      {appState === 'home' && (
        <HomeScreen
          data={data}
          onUpdate={setData}
          onReset={handleReset}
        />
      )}
    </SafeAreaProvider>
  );
}
