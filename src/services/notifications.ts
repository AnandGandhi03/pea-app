import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { ItemsMap } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

export async function registerForNotifications(): Promise<boolean> {
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

let lastScheduleSignature = '';

// Cancels and reschedules only when the brief's content actually changed —
// avoids notification churn on every unrelated data update.
export async function scheduleMorningBrief(briefTime: string, items: ItemsMap): Promise<void> {
  const active = Object.values(items).flatMap(a => a).filter(i => !i.done);
  const total   = active.length;
  const topItem = active[0];

  const signature = `${briefTime}|${total}|${topItem?.text ?? ''}`;
  if (signature === lastScheduleSignature) return;

  const [timePart, period] = briefTime.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
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
  lastScheduleSignature = signature;
}

export async function cancelAllNotifications(): Promise<void> {
  lastScheduleSignature = '';
  await Notifications.cancelAllScheduledNotificationsAsync();
}
