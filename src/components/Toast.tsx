import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import { P, FONT } from '../theme';

export interface ToastData {
  msg: string;
  id:  number;
}

export function Toast({ toast }: { toast: ToastData | null }) {
  const slideAnim   = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [hiddenId, setHiddenId] = useState<number | null>(null);

  const visible = !!toast && toast.id !== hiddenId;

  useEffect(() => {
    if (!toast) return;
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
      ]).start(() => setHiddenId(toast.id));
    }, 2200);
    return () => clearTimeout(t);
  }, [toast, slideAnim, opacityAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[s.pill, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={s.txt}>{toast?.msg}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  pill: { position: 'absolute', top: 16, alignSelf: 'center', zIndex: 999, backgroundColor: P.night, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 10 },
  txt:  { fontSize: 14, color: '#fff', fontFamily: FONT.bodyMed },
});
