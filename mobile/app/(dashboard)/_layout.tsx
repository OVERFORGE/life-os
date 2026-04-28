import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FloatingTabBar } from '../../components/navigation/FloatingTabBar';

export default function DashboardLayout() {
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
