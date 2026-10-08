import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { P, FONT } from '../theme';

const WAVE_HEIGHTS = [12, 28, 40, 34, 48, 38, 22, 32, 16];

interface VoiceOverlayProps {
  visible:      boolean;
  transcribing: boolean;
  onRelease:    () => void;
}

export function VoiceOverlay({ visible, transcribing, onRelease }: VoiceOverlayProps) {
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
  }, [visible, transcribing, waveAnims]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRelease}>
      <View style={s.screen} accessible accessibilityLabel={transcribing ? 'Transcribing your voice note' : 'Listening'}>
        <Text style={s.top}>{transcribing ? 'Got it' : 'Listening…'}</Text>

        {transcribing ? (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <ActivityIndicator size="large" color={P.greenPop} />
            <Text style={s.transcript}>Pea is thinking…</Text>
          </View>
        ) : (
          <View style={s.waveform}>
            {waveAnims.map((a, i) => (
              <Animated.View
                key={i}
                style={[s.waveBar, { height: WAVE_HEIGHTS[i], transform: [{ scaleY: a }] }]}
              />
            ))}
          </View>
        )}

        <Text style={s.hint}>
          {transcribing ? 'one moment' : 'release to send to Pea'}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: P.night, alignItems: 'center', justifyContent: 'space-evenly', padding: 32 },
  top:        { fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.bodyMed },
  waveform:   { flexDirection: 'row', alignItems: 'center', gap: 5, height: 64 },
  waveBar:    { width: 4, borderRadius: 2, backgroundColor: P.greenPop },
  transcript: { fontFamily: FONT.displayItalic, fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  hint:       { fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: FONT.body },
});
