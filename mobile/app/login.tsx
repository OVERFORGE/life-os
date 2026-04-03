import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../utils/api';
import Animated, { FadeInDown } from 'react-native-reanimated';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [devEmail, setDevEmail] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { params } = response;
      if (params?.access_token) {
        handleBackendLogin(params.access_token);
      }
    }
  }, [response]);

  const handleBackendLogin = async (accessToken: string) => {
    try {
      setLoading(true);
      const userInfoResponse = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();

      const backendResponse = await fetch(`${API_URL}/auth/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email,
          name: userInfo.name,
          image: userInfo.picture,
        }),
      });

      const data = await backendResponse.json();
      
      if (data.token) {
        await AsyncStorage.setItem('user_token', data.token);
        router.replace('/(dashboard)');
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error during backend login:", error);
      setLoading(false);
    }
  };

  const handleDemobypass = async () => {
    if (!devEmail) {
      alert("Please enter your account email to test actual data.");
      return;
    }
    setLoading(true);
    try {
      const backendResponse = await fetch(`${API_URL}/auth/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: devEmail.toLowerCase().trim(),
          name: "Local Dev Overwrite",
        }),
      });
      const data = await backendResponse.json();
      if (data.token) {
        await AsyncStorage.setItem('user_token', data.token);
        router.replace('/(dashboard)');
      }
    } catch (err) {
      console.log("Bypass err", err);
    }
    setLoading(false);
  }

  return (
    <View className="flex-1 bg-[#0f1115] items-center justify-center px-6">
      <Animated.View entering={FadeInDown.duration(800)} className="w-full max-w-sm items-center">
        <Text className="text-4xl font-bold tracking-widest text-gray-100 uppercase mb-2">
          Life<Text className="text-gray-500">OS</Text>
        </Text>
        <Text className="text-sm text-gray-500 text-center mb-16">
          Personal Analytics Engine
        </Text>

        <TouchableOpacity 
          disabled={!request || loading}
          onPress={() => promptAsync()}
          className="w-full h-14 items-center justify-center rounded-xl bg-gray-100 flex-row mb-6 active:opacity-70"
        >
          <Text className="text-[#0f1115] font-semibold text-sm">
            Sign In with Google
          </Text>
        </TouchableOpacity>

        {loading && <ActivityIndicator size="small" color="#fff" />}

        <View className="mt-12 w-full pt-6 border-t border-gray-800 items-center">
          <Text className="text-gray-500 text-xs mb-3 font-semibold uppercase tracking-wider">Developer Auth Bypass</Text>
          <View className="w-full flex-row space-x-2">
            <TextInput 
              placeholder="Enter your real account email..."
              placeholderTextColor="#4b5563"
              value={devEmail}
              onChangeText={setDevEmail}
              className="flex-1 bg-[#161922] border border-[#232632] rounded-lg px-4 text-gray-200 text-sm h-12"
              autoCapitalize="none"
            />
            <TouchableOpacity 
              onPress={handleDemobypass} 
              className="bg-gray-800 h-12 px-4 justify-center items-center rounded-lg border border-gray-700"
            >
              <Text className="text-gray-300 text-xs font-bold">BYPASS</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-gray-600 text-[10px] mt-3 text-center">
            Instantly generates a local session for your profile. Data will perfectly mirror your PC Dashboard.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
