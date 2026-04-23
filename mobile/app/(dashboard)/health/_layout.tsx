import { Stack } from 'expo-router';

export default function HealthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f1115' } }}>
      <Stack.Screen name="weight-trend" />
    </Stack>
  );
}
