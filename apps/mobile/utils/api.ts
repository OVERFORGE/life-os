import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Automatically attempt to resolve the local Next.js instance IP if running locally via Expo Go
function getBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    let url = process.env.EXPO_PUBLIC_API_URL;
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (!url.endsWith('/api')) url += '/api';
    console.log('[API URL RESOLVED]', url);
    return url;
  }

  console.log('[API URL FALLBACK]', 'http://192.168.1.34:3000/api');
  // Fallback to the local IP address if no environment variable is provided
  // (Based on the IP from the Expo connection)
  return 'http://192.168.1.34:3000/api'; 
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
