import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { P, FONT } from '../theme';

interface State {
  hasError: boolean;
}

// Last line of defense: a render crash anywhere in the tree shows a calm
// recovery screen instead of a white screen. User data lives in AsyncStorage,
// so "Try again" remounts the tree and reloads state safely.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={s.screen}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>🫛</Text>
        <Text style={s.title}>Something went sideways</Text>
        <Text style={s.sub}>Your data is safe. Let's try that again.</Text>
        <TouchableOpacity
          style={s.btn}
          onPress={() => this.setState({ hasError: false })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={s.btnTxt}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.cream, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title:  { fontFamily: FONT.display, fontSize: 24, color: P.text, marginBottom: 8, textAlign: 'center' },
  sub:    { fontFamily: FONT.body, fontSize: 14, color: P.muted, marginBottom: 24, textAlign: 'center' },
  btn:    { backgroundColor: P.green, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 },
  btnTxt: { color: '#fff', fontSize: 14, fontFamily: FONT.bodySemi },
});
