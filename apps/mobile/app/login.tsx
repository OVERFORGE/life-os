// CACHE BUST 
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Image } from 'react-native';
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
        const { NativeModules } = require('react-native');
        if (!NativeModules.RNGoogleSignin) {
          throw new Error('Not available');
        }
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
    <View style={{ flex: 1, backgroundColor: '#161618', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Animated.View entering={FadeInDown.duration(800)} style={{ width: '100%', maxWidth: 400, alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(232,65,74,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)' }}>
          <Image 
            source={require('../assets/images/logo.png')} 
            style={{ width: 56, height: 56 }} 
            resizeMode="contain"
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 36, fontWeight: 'bold', letterSpacing: 1, color: '#FFFDFC', textTransform: 'uppercase' }}>Life</Text>
          <Text style={{ fontSize: 36, fontWeight: 'bold', letterSpacing: 1, color: 'rgba(236,231,227,0.5)', textTransform: 'uppercase' }}>OS</Text>
        </View>
        <Text style={{ fontSize: 12, color: 'rgba(236,231,227,0.5)', textAlign: 'center', marginBottom: 40, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600' }}>
          Personal Analytics Engine
        </Text>

        {/* Traditional Credentials Login */}
        <View style={{ width: '100%', marginBottom: 24 }}>
          <TextInput 
            placeholder="Email Address"
            placeholderTextColor="rgba(236, 231, 227, 0.5)"
            value={email}
            onChangeText={setEmail}
            style={{ width: '100%', backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#FFFDFC', fontSize: 14, marginBottom: 12 }}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput 
            placeholder="Password"
            placeholderTextColor="rgba(236, 231, 227, 0.5)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={{ width: '100%', backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#FFFDFC', fontSize: 14, marginBottom: 16 }}
            autoCapitalize="none"
          />
          <TouchableOpacity 
            disabled={loading}
            onPress={handleCredentialsLogin}
            style={{ width: '100%', height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E8414A', borderWidth: 1, borderColor: '#D62C35', marginBottom: 16 }}
          >
            {loading ? <ActivityIndicator size="small" color="#FFFDFC" /> : <Text style={{ color: '#FFFDFC', fontWeight: 'bold', fontSize: 14 }}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 24 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: '#2A2B2F' }} />
          <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12, paddingHorizontal: 16 }}>OR</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: '#2A2B2F' }} />
        </View>

        <TouchableOpacity 
          disabled={loading}
          onPress={handleNativeGoogleLogin}
          style={{ width: '100%', height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFDFC', flexDirection: 'row', marginBottom: 24 }}
        >
          <Text style={{ color: '#161618', fontWeight: '600', fontSize: 14 }}>
            Sign In with Google
          </Text>
        </TouchableOpacity>
        {/* <View className="mt-8 w-full pt-6 border-t border-[#2A2B2F] items-center">
          <Text className="text-[#ECE7E3]/50 text-xs mb-3 font-semibold uppercase tracking-wider">Developer Auth Bypass</Text>
          <View className="w-full flex-row space-x-2">
            <TextInput 
              placeholder="Enter account email..."
              placeholderTextColor="rgba(236, 231, 227, 0.5)"
              value={devEmail}
              onChangeText={setDevEmail}
              className="flex-1 bg-[#1F2023] border border-[#2A2B2F] rounded-lg px-4 text-[#FFFDFC] text-sm h-12"
              autoCapitalize="none"
            />
            <TouchableOpacity 
              onPress={handleDemobypass} 
              className="bg-[#2A2B2F] h-12 px-4 justify-center items-center rounded-lg border border-[#2A2B2F]"
            >
              <Text className="text-[#ECE7E3] text-xs font-bold">BYPASS</Text>
            </TouchableOpacity>
          </View>
        </View> */}
      </Animated.View>
    </View>
  );
}
