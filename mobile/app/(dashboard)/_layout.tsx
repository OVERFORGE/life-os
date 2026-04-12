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
          name="gym"
          options={{
            title: 'Gym Session',
          }}
        />
        <Tabs.Screen
          name="nutrition"
          options={{
            title: 'Nutrition Tracker',
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
          options={{
            href: null,
            title: 'Life Trajectory',
          }}
        />
        <Tabs.Screen
          name="era/[id]"
          options={{
            href: null,
            title: 'Era Details',
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
