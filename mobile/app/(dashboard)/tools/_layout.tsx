import { Stack } from 'expo-router';

export default function ToolsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="daily-log" />
      <Stack.Screen name="history" />
      <Stack.Screen name="history/[date]" />
      <Stack.Screen name="goals/index" />
      <Stack.Screen name="goals/new" />
      <Stack.Screen name="goals/[id]" />
    </Stack>
  );
}
