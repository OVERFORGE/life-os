import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Automatically attempt to resolve the local Next.js instance IP if running locally via Expo Go
function getBaseUrl() {
  // if (process.env.EXPO_PUBLIC_API_URL) {
  //   return process.env.EXPO_PUBLIC_API_URL;
  // }

  return 'http://10.65.49.168:3000/api'; // 🔥 PUT YOUR IP HERE
}

export const API_URL = getBaseUrl();

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem('user_token');

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });
}
