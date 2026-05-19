import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await AsyncStorage.getItem('user_token');
        if (token) {
          router.replace('/(dashboard)');
          return;
        }
      } catch (e) {
        console.error("Error reading token", e);
      }
      
      // Fallback if no token
      setTimeout(() => {
        router.replace('/login');
      }, 2000);
    }
    
    // Give the splash screen at least 1s before redirecting if we have a token
    const timer = setTimeout(() => {
      checkAuth();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View entering={FadeIn.duration(1000)} exiting={FadeOut.duration(500)} style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 2, color: '#FFFDFC', textTransform: 'uppercase' }}>
            Life
          </Text>
          <Text style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 2, color: 'rgba(236,231,227,0.5)', textTransform: 'uppercase' }}>
            OS
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', letterSpacing: 4, textTransform: 'uppercase', marginTop: 8 }}>
          Syncing...
        </Text>
      </Animated.View>
    </View>
  );
}
