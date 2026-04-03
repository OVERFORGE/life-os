import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/login');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View className="flex-1 bg-[#0f1115] items-center justify-center">
      <Animated.View entering={FadeIn.duration(1000)} exiting={FadeOut.duration(500)}>
        <Text className="text-3xl font-bold tracking-widest text-gray-100 uppercase">
          Life<Text className="text-gray-500">OS</Text>
        </Text>
        <Text className="text-[10px] text-gray-500 tracking-[0.2em] uppercase text-center mt-2">
          Syncing...
        </Text>
      </Animated.View>
    </View>
  );
}
