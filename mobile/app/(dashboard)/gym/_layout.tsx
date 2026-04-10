import { Stack } from 'expo-router';

export default function GymLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f1115' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-gym" />
      <Stack.Screen name="create-routine" />
      <Stack.Screen name="live-session" />
      <Stack.Screen name="history" />
      <Stack.Screen name="log-past" />
      <Stack.Screen name="edit-session" />
    </Stack>
  );
}
