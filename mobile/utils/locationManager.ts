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
    console.log("[Loc] Starting voice location check...");
    // Refresh locations cache every 10 seconds to quickly pick up new additions
    if (Date.now() - lastFetchTime > 10000 || cachedLocations.length === 0) {
      console.log("[Loc] Fetching saved locations from API...");
      const res = await fetchWithAuth('/user');
      if (res.ok) {
        const data = await res.json();
        cachedLocations = data.preferences?.savedLocations || [];
        lastFetchTime = Date.now();
        console.log("[Loc] Fetched", cachedLocations.length, "locations.");
      } else {
        console.log("[Loc] Failed to fetch locations, using cache.");
      }
    }

    if (cachedLocations.length === 0) {
      console.log("[Loc] No cached locations available. Returning false.");
      return false;
    }

    // Get current location (use last known for speed to prevent UI hanging)
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log("[Loc] Location permission not granted!");
      return false;
    }

    console.log("[Loc] Fetching last known position...");
    let location = await Location.getLastKnownPositionAsync();
    if (!location) {
      console.log("[Loc] No last known position, trying getCurrentPositionAsync...");
      // Fallback if last known is empty, but with a strict timeout so it doesn't hang forever
      location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
      ]);
    }
    
    if (!location) {
      console.log("[Loc] Could not acquire GPS coordinates in time. Returning false.");
      return false;
    }
    
    console.log(`[Loc] Acquired GPS: lat=${location.coords.latitude}, lng=${location.coords.longitude}`);

    // Check if within any enabled zone
    for (const loc of cachedLocations) {
      if (!loc.voiceAssistantEnabled) continue;
      
      const distance = getDistanceInMeters(
        location.coords.latitude, 
        location.coords.longitude, 
        loc.lat, 
        loc.lng
      );
      
      console.log(`[Loc] Distance to '${loc.name}': ${Math.round(distance)}m. (Required <= ${Math.max(loc.radius, 300)}m)`);
      
      // Use a minimum 300m buffer because indoor GPS (especially last known) can drift significantly
      if (distance <= Math.max(loc.radius, 300)) {
        console.log(`[Loc] Within range of '${loc.name}'! Voice allowed.`);
        return true;
      }
    }

    console.log("[Loc] Not within range of any enabled locations.");
    return false;
  } catch (error) {
    console.error('[Loc] Location check failed completely:', error);
    return false;
  }
}
