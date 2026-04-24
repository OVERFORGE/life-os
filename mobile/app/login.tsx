import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../utils/api';

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Standard credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Developer Bypass
  const [devEmail, setDevEmail] = useState('');

  const handleCredentialsLogin = async () => {
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/mobile-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          password: password,
        }),
      });

      const data = await response.json();

      if (data.token) {
        await AsyncStorage.setItem('user_token', data.token);
        router.replace('/(dashboard)');
      } else {
        alert(data.error || "Invalid credentials.");
      }
    } catch (error) {
      alert("Network error connecting to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleNativeGoogleLogin = async () => {
    try {
      setLoading(true);
      let GoogleSignin, statusCodes;
      try {
        const GM = require('@react-native-google-signin/google-signin');
        GoogleSignin = GM.GoogleSignin;
        statusCodes = GM.statusCodes;
      } catch (e) {
        alert("Native Google Sign-In is incompatible with standard Expo Go. Please build an APK or use credentials!");
        setLoading(false);
        return;
      }
      
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      });

      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const { accessToken } = await GoogleSignin.getTokens();
      
      handleBackendLogin(accessToken);
    } catch (error: any) {
      if (error?.code) {
        console.log("Google error:", error);
      }
      alert("Google Sign-In failed.");
      setLoading(false);
    }
  };

  const handleBackendLogin = async (accessToken: string) => {
    try {
      setLoading(true);
      const userInfoResponse = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json();

      const backendResponse = await fetch(`${API_URL}/mobile-auth`, {
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
      const backendResponse = await fetch(`${API_URL}/mobile-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: devEmail.toLowerCase().trim(),
          name: "Local Dev Overwrite",
        }),
      });

      const text = await backendResponse.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        alert("Server returned invalid response. Check terminal.");
        setLoading(false);
        return;
      }

      if (data.token) {
        await AsyncStorage.setItem('user_token', data.token);
        router.replace('/(dashboard)');
      } else {
        alert(data.error || "Login failed");
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0f1115] items-center justify-center px-6">
      <Animated.View entering={FadeInDown.duration(800)} className="w-full max-w-sm items-center">
        <View className="flex-row items-baseline justify-center mb-2">
          <Text className="text-4xl font-bold tracking-widest text-gray-100 uppercase">Life</Text>
          <Text className="text-4xl font-bold tracking-widest text-gray-500 uppercase">OS</Text>
        </View>
        <Text className="text-sm text-gray-500 text-center mb-10">
          Personal Analytics Engine
        </Text>

        {/* Traditional Credentials Login */}
        <View className="w-full mb-6">
          <TextInput 
            placeholder="Email Address"
            placeholderTextColor="#4b5563"
            value={email}
            onChangeText={setEmail}
            className="w-full bg-[#161922] border border-[#232632] rounded-xl px-4 py-3.5 text-gray-200 text-sm mb-3 focus:border-[#4b5563]"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput 
            placeholder="Password"
            placeholderTextColor="#4b5563"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className="w-full bg-[#161922]  border border-[#232632] rounded-xl px-4 py-3.5 text-gray-200  text-sm mb-4 focus:border-[#4b5563]"
            autoCapitalize="none"
          />
          <TouchableOpacity 
            disabled={loading}
            onPress={handleCredentialsLogin}
            className="w-full h-12 items-center justify-center rounded-xl bg-gray-100 border border-[#2a2d36] active:opacity-70 mb-4"
          >
            {loading ? <ActivityIndicator size="small" color="#fcd34d" /> : <Text className="text-[#0f1115] font-bold text-sm">Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center w-full mb-6">
          <View className="flex-1 h-[1px] bg-gray-800" />
          <Text className="text-gray-500 text-xs px-4">OR</Text>
          <View className="flex-1 h-[1px] bg-gray-800" />
        </View>

        <TouchableOpacity 
          disabled={loading}
          onPress={handleNativeGoogleLogin}
          className="w-full h-12 items-center justify-center rounded-xl bg-gray-100 flex-row mb-6 active:opacity-70"
        >
          <Text className="text-[#0f1115] font-semibold text-sm">
            Sign In with Google
          </Text>
        </TouchableOpacity>

        {/* <View className="mt-8 w-full pt-6 border-t border-gray-800 items-center">
          <Text className="text-gray-500 text-xs mb-3 font-semibold uppercase tracking-wider">Developer Auth Bypass</Text>
          <View className="w-full flex-row space-x-2">
            <TextInput 
              placeholder="Enter account email..."
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
        </View> */}
      </Animated.View>
    </View>
  );
}
