import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FloatingTabBar } from '../../components/navigation/FloatingTabBar';
import { useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { scheduleAllTaskReminders } from '../../utils/notifications';
import * as Notifications from 'expo-notifications';
import { handleSpontaneousSpeech } from '../../utils/voiceAssistant';

export default function DashboardLayout() {
  useEffect(() => {
    // Sync local timezone to backend on boot
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localTimezone) {
      fetchWithAuth('/user', {
        method: 'PATCH',
        body: JSON.stringify({ settings: { timezone: localTimezone } }),
      }).catch(e => console.log('Timezone sync failed', e));
    }

    // Re-schedule all task reminders on app boot
    scheduleAllTaskReminders().catch(e => console.log('Task reminder sync failed', e));

    import('../../utils/persistentNotification').then(n => n.setupPersistentNotification());

    // Listen for foreground push notifications to trigger voice
    const sub1 = Notifications.addNotificationReceivedListener(notification => {
      const title = notification.request.content.title || 'Reminder';
      const body = notification.request.content.body || 'You have a new reminder.';
      const speechText = `${title}. ${body}`;
      handleSpontaneousSpeech(speechText).catch(console.error);
    });

    // Listen for user tapping the notification when the app is in the background
    const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
      const title = response.notification.request.content.title || 'Reminder';
      const body = response.notification.request.content.body || 'You have a new reminder.';
      const speechText = `${title}. ${body}`;
      handleSpontaneousSpeech(speechText).catch(console.error);
    });

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f1115' }} edges={['top']}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            title: 'Tools',
          }}
        />
        <Tabs.Screen
          name="brain"
          options={{
            title: 'Brain',
          }}
        />
        <Tabs.Screen
          name="trajectory"
          options={{ href: null, title: 'Life Trajectory' }}
        />
        <Tabs.Screen
          name="era/index"
          options={{ href: null, title: 'Life Eras' }}
        />
        <Tabs.Screen
          name="era/[id]"
          options={{ href: null, title: 'Era Details' }}
        />
        <Tabs.Screen
          name="phase/[id]"
          options={{ href: null, title: 'Phase Detail' }}
        />
        {/* Hidden tabs — still navigable but not shown in bar */}
        <Tabs.Screen name="health" options={{ href: null, title: 'Health Hub' }} />
        <Tabs.Screen name="gym" options={{ href: null, title: 'Gym Session' }} />
        <Tabs.Screen name="nutrition" options={{ href: null, title: 'Nutrition Tracker' }} />
        <Tabs.Screen name="personalization" options={{ href: null, title: 'Personalization' }} />
        <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
        <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
        <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
      </Tabs>
    </SafeAreaView>
  );
}
