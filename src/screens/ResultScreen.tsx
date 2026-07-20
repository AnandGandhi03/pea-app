import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { P, FONT } from '../theme';
import { CATS } from '../categories';
import type { LastAction } from '../types';

interface ResultScreenProps {
  action:   LastAction;
  userName: string;
  onUndo:   () => void;
  onDone:   () => void;
}

export function ResultScreen({ action, userName, onUndo, onDone }: ResultScreenProps) {
  const insets = useSafeAreaInsets();
  const cat    = CATS[action.category];

  return (
    <View style={[s.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <View style={s.check}>
          <Text style={{ fontSize: 26, color: P.green }}>✓</Text>
        </View>
        <Text style={s.title}>Done, {userName}</Text>

        <View style={s.card}>
          <Text style={s.cardLabel}>Pea just did</Text>
          <View style={s.action}>
            <View style={[s.actionIcon, { backgroundColor: cat.bg }]}>
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
            </View>
            <Text style={s.actionText}>
              Saved to {cat.label} — <Text style={{ fontFamily: FONT.bodySemi }}>{action.cleaned}</Text>
            </Text>
          </View>
        </View>

        {!!action.transcript && action.transcript !== action.cleaned && (
          <View style={s.card}>
            <Text style={s.cardLabel}>What you said</Text>
            <Text style={s.saidText}>"{action.transcript}"</Text>
          </View>
        )}
      </View>

      <View style={s.btns}>
        <TouchableOpacity
          style={s.btnUndo}
          onPress={onUndo}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Undo this capture"
        >
          <Text style={s.btnUndoTxt}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.btnDone}
          onPress={onDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={s.btnDoneTxt}>Back to home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
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
