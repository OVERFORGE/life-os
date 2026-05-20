import { useEffect } from 'react';
import { View, Text, Image } from 'react-native';
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
        <View style={{ width: 100, height: 100, borderRadius: 24, backgroundColor: 'rgba(232,65,74,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 32, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
          <Image 
            source={require('../assets/images/logo.png')} 
            style={{ width: 70, height: 70 }} 
            resizeMode="contain"
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 2, color: '#FFFDFC', textTransform: 'uppercase' }}>
            Life
          </Text>
          <Text style={{ fontSize: 32, fontWeight: 'bold', letterSpacing: 2, color: 'rgba(236,231,227,0.5)', textTransform: 'uppercase' }}>
            OS
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', letterSpacing: 4, textTransform: 'uppercase', marginTop: 8 }}>
          Syncing Telemetry...
        </Text>
      </Animated.View>
    </View>
  );
}
