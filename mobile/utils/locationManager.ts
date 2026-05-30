import * as Location from 'expo-location';
import { fetchWithAuth } from './api';

type SavedLocation = {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  voiceAssistantEnabled: boolean;
};

let cachedLocations: SavedLocation[] = [];
let lastFetchTime = 0;

// Haversine formula to calculate distance in meters
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function isVoiceAssistantEnabledAtCurrentLocation(): Promise<boolean> {
  try {
    // Refresh locations cache every 5 minutes
    if (Date.now() - lastFetchTime > 300000 || cachedLocations.length === 0) {
      const res = await fetchWithAuth('/user');
      if (res.ok) {
        const data = await res.json();
        cachedLocations = data.preferences?.savedLocations || [];
        lastFetchTime = Date.now();
      }
    }

    if (cachedLocations.length === 0) return false;

    // Get current location (use last known for speed if possible, or low accuracy for battery)
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    
    // Check if within any enabled zone
    for (const loc of cachedLocations) {
      if (!loc.voiceAssistantEnabled) continue;
      
      const distance = getDistanceInMeters(
        location.coords.latitude, 
        location.coords.longitude, 
        loc.lat, 
        loc.lng
      );
      
      if (distance <= loc.radius) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Location check failed:', error);
    return false;
  }
}
