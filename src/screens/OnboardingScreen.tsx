import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { P, FONT } from '../theme';
import { PeaLogo } from '../components/PeaLogo';

const TIMES = [
  { value: '6:30 AM', label: 'Early bird' },
  { value: '7:00 AM', label: 'Morning'    },
  { value: '7:30 AM', label: 'Relaxed'    },
  { value: '8:00 AM', label: 'Slow start' },
];

export function OnboardingScreen({ onComplete }: { onComplete: (name: string, time: string) => void }) {
  const insets = useSafeAreaInsets();
  const [step,      setStep]      = useState(0);
  const [userName,  setUserName]  = useState('');
  const [briefTime, setBriefTime] = useState('');

  const canProceed = step === 0 ? true : step === 1 ? userName.trim().length >= 1 : !!briefTime;

  function handleContinue() {
    if (!canProceed) return;
    if (step < 2) setStep(step + 1);
    else onComplete(userName.trim(), briefTime);
  }

  return (
    <LinearGradient colors={['#e8f4ed', '#faf9f5']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[s.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          <View style={s.dotRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[s.dot, step === i && s.dotActive]} />
            ))}
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
            {step === 0 && (
              <>
                <PeaLogo size={72} wordmark tagline />
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <Text style={s.title}>Meet Pea</Text>
                  <Text style={s.sub}>
                    Your hands-free family assistant.{'\n'}Just speak — Pea takes care of the rest.
                  </Text>
                </View>
              </>
            )}

            {step === 1 && (
              <View style={{ width: '100%', gap: 20 }}>
                <Text style={s.title}>What should I call you?</Text>
                <TextInput
                  style={s.nameInput}
                  placeholder="Your first name"
                  placeholderTextColor={P.muted}
                  value={userName}
                  onChangeText={setUserName}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={handleContinue}
                  accessibilityLabel="Your first name"
                />
              </View>
            )}

            {step === 2 && (
              <View style={{ width: '100%', gap: 20 }}>
                <Text style={s.title}>When should your{'\n'}morning brief arrive?</Text>
                <View style={s.timeGrid}>
                  {TIMES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[s.tOpt, briefTime === t.value && s.tOptSel]}
                      onPress={() => setBriefTime(t.value)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: briefTime === t.value }}
                      accessibilityLabel={`${t.value}, ${t.label}`}
                    >
                      <Text style={[s.tVal, briefTime === t.value && { color: '#fff' }]}>{t.value}</Text>
                      <Text style={[s.tLbl, briefTime === t.value && { color: 'rgba(255,255,255,0.75)' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[s.cta, !canProceed && s.ctaOff]}
            onPress={handleContinue}
            disabled={!canProceed}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={step === 0 ? 'Get started' : step === 1 ? 'Continue' : 'Start using Pea'}
          >
            <Text style={s.ctaText}>
              {step === 0 ? 'Get started' : step === 1 ? 'Continue' : 'Start using Pea'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
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
