import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Automatically attempt to resolve the local Next.js instance IP if running locally via Expo Go
function getBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  return 'http://10.65.49.168:3000/api'; // 🔥 PUT YOUR IP HERE
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
