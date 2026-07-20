import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { P, FONT } from '../theme';

interface PeaLogoProps {
  size?:     number;
  wordmark?: boolean;
  tagline?:  boolean;
  light?:    boolean;
}

export function PeaLogo({ size = 44, wordmark = false, tagline = false, light = false }: PeaLogoProps) {
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
  }, [bounceAnim, shadowAnim, size]);

  const dot = (s: number, key: string) => (
    <View key={key} style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: 'rgba(255,255,255,0.9)' }} />
  );

  return (
    <View style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel="Pea logo">
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
              {dot(size * 0.11, 'l')}
              {dot(size * 0.16, 'm')}
              {dot(size * 0.11, 'r')}
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
