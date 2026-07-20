import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Animated, Keyboard, Alert, Linking, BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { P, FONT } from '../theme';
import { CATS } from '../categories';
import { CONFIG } from '../config';
import { cap, todayStr, getGreeting, dateLabel, relativeTime, newId } from '../lib/format';
import { localClassify } from '../lib/classify';
import { classifyRemote, generateDraft } from '../services/aiService';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import { Toast, ToastData } from '../components/Toast';
import { VoiceOverlay } from '../components/VoiceOverlay';
import { ResultScreen } from './ResultScreen';
import { BriefScreen } from './BriefScreen';
import { isCategoryKey, CATEGORY_KEYS } from '../types';
import type { AppData, CategoryKey, Item, LastAction, Tab } from '../types';

interface HomeScreenProps {
  data:     AppData;
  onUpdate: React.Dispatch<React.SetStateAction<AppData>>;
  onReset:  () => void;
}

export function HomeScreen({ data, onUpdate, onReset }: HomeScreenProps) {
  const insets = useSafeAreaInsets();

  const [tab,        setTab]        = useState<Tab>('home');
  const [briefOpen,  setBriefOpen]  = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [toast,      setToast]      = useState<ToastData | null>(null);
  const [typeOpen,   setTypeOpen]   = useState(false);
  const [typedText,  setTypedText]  = useState('');
  const holdingRef = useRef(false);

  function showToast(msg: string) { setToast({ msg, id: Date.now() }); }

  // Voice errors surface as gentle toasts (design rule: no red states)
  const { micState, startRecording, stopAndTranscribe, cancelRecording } =
    useVoiceCapture(showToast);

  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 1250, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 1250, useNativeDriver: true }),
      ])
    );
    ring.start();
    return () => ring.stop();
  }, [ringAnim]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  useEffect(() => () => { cancelRecording(); }, []);

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
      id:        newId(),
      text:      r.cleaned,
      done:      false,
      createdAt: Date.now(),
      draft:     null,
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
      const wasLocal = !!localClassify(t);
      let effectiveCategory = r.category;
      if (!wasLocal) {
        const result = await classifyRemote(t, data.userName);
        if (result && isCategoryKey(result.category) && result.category !== r.category) {
          effectiveCategory = result.category;
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
      CATEGORY_KEYS.forEach(k => {
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
    await startRecording();
    // User released before recording actually started → clean up
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
  const allItems = CATEGORY_KEYS
    .flatMap(cat => data.items[cat].map(i => ({ ...i, cat })));
  const activeItems  = allItems.filter(i => !i.done);
  const recentItems  = [...allItems].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
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
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{getGreeting()}, {data.userName}</Text>
          <Text style={s.date}>{dateLabel()}</Text>
        </View>
        <TouchableOpacity
          style={s.settingsBtn}
          onPress={() => setTab('me')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text style={{ fontSize: 14 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Today's brief card */}
      <TouchableOpacity
        style={s.briefCard}
        onPress={() => setBriefOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open today's brief"
      >
        <Text style={s.briefTop}>☀️ Today's brief</Text>
        <View style={s.briefPills}>
          {counts.do     > 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>{counts.do} reminder{counts.do !== 1 ? 's' : ''}</Text></View>}
          {counts.buy    > 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>{counts.buy} grocer{counts.buy !== 1 ? 'ies' : 'y'}</Text></View>}
          {counts.call   > 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>{counts.call} call{counts.call !== 1 ? 's' : ''}</Text></View>}
          {counts.follow > 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>{counts.follow} follow-up{counts.follow !== 1 ? 's' : ''}</Text></View>}
          {draftItems.length > 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>{draftItems.length} draft{draftItems.length !== 1 ? 's' : ''}</Text></View>}
          {activeItems.length === 0 && <View style={s.briefPill}><Text style={s.briefPillTxt}>all caught up 🎉</Text></View>}
        </View>
      </TouchableOpacity>

      {/* Mic area */}
      <View style={s.micArea}>
        <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[s.micRing, {
            opacity: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0.15] }),
            transform: [{ scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          }]} />
          <TouchableOpacity
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Hold to speak a capture"
          >
            <View style={s.micBtn}>
              <Text style={{ fontSize: 30 }}>🎙️</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={s.micLabel}>hold to speak</Text>
        <TouchableOpacity
          onPress={() => setTypeOpen(!typeOpen)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Type a capture instead"
        >
          <Text style={s.typeLink}>or type it</Text>
        </TouchableOpacity>
      </View>

      {/* Typed fallback */}
      {typeOpen && (
        <View style={s.typeRow}>
          <TextInput
            style={s.typeInput}
            placeholder={`"Buy oat milk" or "Call the school"`}
            placeholderTextColor={P.muted}
            value={typedText}
            onChangeText={setTypedText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleTypedSave}
            accessibilityLabel="Capture text"
          />
          <TouchableOpacity
            style={[s.typeSave, !typedText.trim() && { opacity: 0.3 }]}
            onPress={handleTypedSave}
            disabled={!typedText.trim()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save capture"
          >
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: FONT.bodyMed }}>Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Activity feed */}
      {recentItems.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.feedLabel}>Recent</Text>
          {recentItems.map(item => {
            const c = CATS[item.cat];
            return (
              <View key={`${item.id}-${item.cat}`} style={s.feedItem}>
                <View style={[s.feedIcon, { backgroundColor: c.bg }]}>
                  <Text style={{ fontSize: 13 }}>{c.icon}</Text>
                </View>
                <Text style={[s.feedText, item.done && s.feedTextDone]} numberOfLines={1}>
                  {item.text}
                </Text>
                <Text style={s.feedTime}>{relativeTime(item.createdAt)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderLists = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={s.tabTitle}>Your lists</Text>
      {CATEGORY_KEYS.map(key => {
        const c = CATS[key];
        const items = data.items[key];
        if (items.length === 0) return null;
        return (
          <View key={key} style={{ gap: 8 }}>
            <View style={s.listHeader}>
              <Text style={s.listTitle}>{c.icon} {c.label}</Text>
              <Text style={[s.listCount, { color: c.color }]}>{counts[key]}</Text>
            </View>
            {items.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[s.feedItem, item.done && { opacity: 0.45 }]}
                onPress={() => toggleItem(key, item.id)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={item.text}
              >
                <View style={[s.chk, item.done && { backgroundColor: P.green, borderColor: P.green }]}>
                  {item.done && <Text style={{ color: '#fff', fontSize: 10, fontFamily: FONT.bodySemi }}>✓</Text>}
                </View>
                <Text style={[s.feedText, item.done && s.feedTextDone]}>{item.text}</Text>
                <Text style={s.feedTime}>{relativeTime(item.createdAt)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
      {allItems.length === 0 && (
        <View style={s.emptyBox}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>✨</Text>
          <Text style={s.emptyTitle}>All clear</Text>
          <Text style={s.emptySub}>Hold the mic on Home to add something</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderDrafts = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={s.tabTitle}>Drafts</Text>
      {draftItems.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>✉️</Text>
          <Text style={s.emptyTitle}>No drafts yet</Text>
          <Text style={s.emptySub}>
            When you capture a call or follow-up,{'\n'}Pea writes the message for you
          </Text>
        </View>
      ) : (
        draftItems.map(item => (
          <TouchableOpacity
            key={`${item.id}-${item.cat}`}
            style={s.draftCard}
            onPress={() => openDraft(item.draft!)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Send draft for ${item.text}`}
          >
            <Text style={s.draftFor}>{CATS[item.cat].icon} {item.text}</Text>
            <Text style={s.draftBody} numberOfLines={2}>"{item.draft}"</Text>
            <Text style={s.draftSend}>tap to send →</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderMe = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={s.tabTitle}>Me</Text>

      <View style={s.meCard}>
        <Text style={s.meLabel}>Name</Text>
        <Text style={s.meValue}>{data.userName}</Text>
      </View>

      <View style={s.meCard}>
        <Text style={s.meLabel}>Morning brief</Text>
        <Text style={s.meValue}>{data.briefTime}</Text>
      </View>

      <View style={s.meCard}>
        <Text style={s.meLabel}>Captures today</Text>
        <Text style={s.meValue}>
          {todayCaptures} of {CONFIG.FREE_CAPTURES_PER_DAY} free
        </Text>
        {!canCapture && (
          <Text style={[s.meLabel, { marginTop: 4, textTransform: 'none', letterSpacing: 0 }]}>
            Upgrade to Pea Pro for unlimited — {CONFIG.PRO_PRICE}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={s.resetBtn}
        onPress={() => Alert.alert(
          'Reset Pea?',
          'This clears all your data and starts over.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: onReset },
          ],
        )}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Reset Pea and clear all data"
      >
        <Text style={s.resetTxt}>Reset Pea</Text>
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
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <Toast toast={toast} />

      <View style={{ flex: 1 }}>
        {tab === 'home'   && renderHome()}
        {tab === 'lists'  && renderLists()}
        {tab === 'drafts' && renderDrafts()}
        {tab === 'me'     && renderMe()}
      </View>

      {/* Bottom nav */}
      <View style={[s.nav, { paddingBottom: insets.bottom + 8 }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={s.navItem}
            onPress={() => setTab(t.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            accessibilityLabel={t.label}
          >
            <Text style={{ fontSize: 17, opacity: tab === t.key ? 1 : 0.45 }}>{t.icon}</Text>
            <Text style={[s.navLabel, tab === t.key && { color: P.green, fontFamily: FONT.bodySemi }]}>
              {t.label}
            </Text>
            {tab === t.key && <View style={s.navDot} />}
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

const s = StyleSheet.create({
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
