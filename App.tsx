import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { DMSerifDisplay_400Regular, DMSerifDisplay_400Regular_Italic } from '@expo-google-fonts/dm-serif-display';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import { P } from './src/theme';
import { EMPTY_ITEMS } from './src/types';
import type { AppData, AppScreen } from './src/types';
import { todayStr } from './src/lib/format';
import { loadData, saveData, clearData, emptyData } from './src/services/storage';
import {
  registerForNotifications,
  scheduleMorningBrief,
  cancelAllNotifications,
} from './src/services/notifications';
import { PeaLogo } from './src/components/PeaLogo';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    DMSerifDisplay_400Regular,
    DMSerifDisplay_400Regular_Italic,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const [appState, setAppState] = useState<AppScreen>('loading');
  const [data,     setData]     = useState<AppData>(emptyData());
  const [notifGranted, setNotifGranted] = useState(false);

  const notifListener    = useRef<ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined>(undefined);
  const responseListener = useRef<ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined>(undefined);

  useEffect(() => {
    loadData().then(saved => {
      if (saved?.userName && saved?.briefTime) {
        setData(saved);
        setAppState('home');
      } else {
        setAppState('onboarding');
      }
    });

    registerForNotifications().then(granted => setNotifGranted(granted));

    notifListener.current    = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // Persist on every change; brief scheduling is internally deduplicated.
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
      items:     EMPTY_ITEMS,
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
    await cancelAllNotifications();
    setData({ ...emptyData(), lastCountReset: todayStr() });
    setAppState('onboarding');
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar barStyle="dark-content" backgroundColor={P.cream} />

        {(appState === 'loading' || !fontsLoaded) && (
          <View style={{ flex: 1, backgroundColor: P.cream, alignItems: 'center', justifyContent: 'center' }}>
            {fontsLoaded
              ? <PeaLogo size={72} wordmark tagline />
              : <ActivityIndicator color={P.green} size="large" />}
          </View>
        )}

        {appState === 'onboarding' && fontsLoaded && (
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        )}

        {appState === 'home' && fontsLoaded && (
          <HomeScreen
            data={data}
            onUpdate={setData}
            onReset={handleReset}
          />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
