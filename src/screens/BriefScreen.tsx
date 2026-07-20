import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { P, FONT } from '../theme';
import { getGreeting, dateLabel } from '../lib/format';
import type { AppData } from '../types';

export function BriefScreen({ data, onBack }: { data: AppData; onBack: () => void }) {
  const insets = useSafeAreaInsets();

  const reminders = data.items.do.filter(i => !i.done);
  const groceries = data.items.buy.filter(i => !i.done);
  const calls     = data.items.call.filter(i => !i.done);
  const follows   = data.items.follow.filter(i => !i.done);
  const drafts    = [...calls, ...follows].filter(i => i.draft);

  const section = (title: string, rows: { dot: string; text: string }[]) => {
    if (rows.length === 0) return null;
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{title}</Text>
        {rows.map((r, i) => (
          <View key={i} style={[s.item, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={[s.dot, { backgroundColor: r.dot }]} />
            <Text style={s.itemTxt} numberOfLines={1}>{r.text}</Text>
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
        <Text style={s.date}>{dateLabel()}</Text>
        <Text style={s.heading}>{getGreeting()}, {data.userName} ☀️</Text>

        {empty && (
          <View style={s.section}>
            <Text style={[s.itemTxt, { paddingVertical: 8 }]}>
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

        <TouchableOpacity
          style={s.startBtn}
          onPress={onBack}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start my day, back to home"
        >
          <Text style={s.startTxt}>Start my day →</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
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
