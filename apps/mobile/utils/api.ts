import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Automatically attempt to resolve the local Next.js instance IP if running locally via Expo Go
export function getBaseUrl(): string {
  // 1. Dynamically resolve the Metro bundler host IP from Expo Constants
  const expoHost =
    Constants.expoConfig?.hostUri?.split(':')[0] ||
    (Constants as any)?.manifest?.debuggerHost?.split(':')[0] ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0];

  // 2. Check explicitly provided env URL
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  // If in __DEV__ and an expo host IP was detected from the bundler connection, prefer local dev host
  // unless user explicitly forced a production URL that is active
  if (typeof __DEV__ !== 'undefined' && __DEV__ && expoHost && (!envUrl || envUrl.includes('vercel.app') || envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
    const localUrl = `http://${expoHost}:3000/api`;
    console.log('[API URL RESOLVED VIA EXPO HOST]', localUrl);
    return localUrl;
  }

  if (envUrl) {
    let url = envUrl;
    // Android emulator cannot reach host via 127.0.0.1 or localhost
    if (Platform.OS === 'android' && (url.includes('localhost') || url.includes('127.0.0.1'))) {
      url = url.replace(/localhost|127\.0\.0\.1/, '10.0.2.2');
    }
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (!url.endsWith('/api')) url += '/api';
    console.log('[API URL RESOLVED FROM ENV]', url);
    return url;
  }

  // 3. Fallback based on detected Expo host or current workstation Wi-Fi IP
  if (expoHost) {
    return `http://${expoHost}:3000/api`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }

  // Localhost fallback (override via EXPO_PUBLIC_API_URL for physical devices)
  return 'http://localhost:3456/api';
}

export const API_URL = getBaseUrl();

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem('user_token');

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // If the user explicitly provided Content-Type as 'multipart/form-data', we must DELETE it
  // so the native fetch implementation auto-generates the correct multipart boundary!
  if (headers.get('Content-Type') === 'multipart/form-data') {
    headers.delete('Content-Type');
  } else if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });
}
