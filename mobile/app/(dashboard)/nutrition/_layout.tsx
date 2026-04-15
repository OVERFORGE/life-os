import { Stack } from 'expo-router';

export default function NutritionLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="scan" 
        options={{ 
          headerShown: false,
          presentation: 'modal'
        }} 
      />
      <Stack.Screen 
        name="library" 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="create-template" 
        options={{ headerShown: false, presentation: 'modal' }} 
      />
      <Stack.Screen 
        name="daily-log" 
        options={{ headerShown: false }} 
      />
    </Stack>
  );
}
