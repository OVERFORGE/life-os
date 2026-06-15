import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, SafeAreaView, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, Plus, Trash2, Mic, ChevronLeft, AlertCircle } from 'lucide-react-native';
import * as Location from 'expo-location';
import { fetchWithAuth } from '../../../utils/api';

// Safe dynamic import of react-native-maps to avoid crashing when not configured
let MapView: any = null;
let Marker: any = null;
let PROVIDER_DEFAULT: any = undefined;
try {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  PROVIDER_DEFAULT = RNMaps.PROVIDER_DEFAULT;
} catch {
  // Maps native module not available
}

// ─── App Theme ────────────────────────────────────────────────────────────────
const C = {
  bg:         '#111113',
  card:       '#18181B',
  border:     '#27272A',
  text:       '#FFFDFC',
  subtext:    'rgba(255,253,252,0.6)',
  muted:      'rgba(255,253,252,0.35)',
  primary:    '#E8414A',
  primaryBg:  'rgba(232,65,74,0.12)',
  primaryBdr: 'rgba(232,65,74,0.3)',
};

type SavedLocation = {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  voiceAssistantEnabled: boolean;
};

export default function LocationsSettingsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [newName, setNewName] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedCoord, setSelectedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 28.6139,
    longitude: 77.2090,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  useEffect(() => {
    fetchProfile();
    requestLocation();
  }, []);

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setMapRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      setSelectedCoord({ lat: latitude, lng: longitude });
    } catch (e) {
      console.log('Location error:', e);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/user');
      if (res.ok) {
        const data = await res.json();
        if (data.preferences?.savedLocations) {
          setLocations(data.preferences.savedLocations);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const persist = async (list: SavedLocation[]) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/user', {
        method: 'PUT',
        body: JSON.stringify({ preferences: { savedLocations: list } }),
      });
      if (!res.ok) throw new Error();
      setLocations(list);
      setIsAdding(false);
      setNewName('');
    } catch {
      Alert.alert('Error', 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newName.trim()) {
      Alert.alert('Name required', 'Give this location a name like "Home" or "Office".');
      return;
    }
    if (!selectedCoord) {
      Alert.alert('No location', 'Could not get your location. Please grant location permission.');
      return;
    }
    persist([...locations, {
      name: newName.trim(),
      lat: selectedCoord.lat,
      lng: selectedCoord.lng,
      radius: 150,
      voiceAssistantEnabled: voiceEnabled,
    }]);
  };

  const handleDelete = (index: number) => {
    Alert.alert('Remove Location', `Delete "${locations[index].name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(locations.filter((_, i) => i !== index)) },
    ]);
  };

  const toggleVoice = (index: number) => {
    const updated = locations.map((l, i) =>
      i === index ? { ...l, voiceAssistantEnabled: !l.voiceAssistantEnabled } : l
    );
    persist(updated);
  };

  const resetForm = () => {
    setIsAdding(false);
    setNewName('');
    setMapError(false);
  };

  // ─── Map renderer with error guard ────────────────────────────────────────
  const renderMap = () => {
    if (!MapView || mapError) {
      return (
        <View style={styles.mapFallback}>
          <AlertCircle size={28} color={C.muted} />
          <Text style={styles.mapFallbackTitle}>Map unavailable</Text>
          <Text style={styles.mapFallbackSub}>
            {!MapView
              ? 'Maps module not found. Rebuild the app.'
              : 'Map failed to load. Your GPS location has been used automatically.'}
          </Text>
          {selectedCoord && (
            <View style={styles.coordChip}>
              <MapPin size={13} color={C.primary} />
              <Text style={styles.coordText}>
                {selectedCoord.lat.toFixed(5)}, {selectedCoord.lng.toFixed(5)}
              </Text>
            </View>
          )}
        </View>
      );
    }

    try {
      return (
        <View style={styles.mapContainer}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            region={mapRegion}
            onRegionChangeComplete={setMapRegion}
            onPress={(e: any) => setSelectedCoord({
              lat: e.nativeEvent.coordinate.latitude,
              lng: e.nativeEvent.coordinate.longitude,
            })}
            onMapReady={() => setMapError(false)}
            onError={() => setMapError(true)}
          >
            {selectedCoord && (
              <Marker
                coordinate={{ latitude: selectedCoord.lat, longitude: selectedCoord.lng }}
                pinColor={C.primary}
              />
            )}
          </MapView>
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>Tap to drop pin</Text>
          </View>
        </View>
      );
    } catch {
      setMapError(true);
      return null;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Locations</Text>
          <Text style={styles.headerSub}>Geofenced voice assistant zones</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Mic size={15} color={C.primary} style={{ marginRight: 10, marginTop: 1 }} />
          <Text style={styles.infoText}>
            AI responses will be spoken aloud and the mic will auto-activate only when you're within a saved location that has Voice Assistant enabled.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />

        ) : isAdding ? (
          /* ── ADD FORM ── */
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Location</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Home, Office, Gym"
              placeholderTextColor={C.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Pin on Map</Text>
            {renderMap()}

            {/* Current coords readout */}
            {selectedCoord && !mapError && (
              <View style={styles.coordChip}>
                <MapPin size={13} color={C.primary} />
                <Text style={styles.coordText}>
                  {selectedCoord.lat.toFixed(5)}, {selectedCoord.lng.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Voice toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Voice Assistant</Text>
                <Text style={styles.toggleSub}>Speak responses aloud & auto-listen here</Text>
              </View>
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#FFF"
              />
            </View>

            {/* Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.saveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

        ) : (
          /* ── LIST ── */
          <View style={{ gap: 10 }}>
            {locations.length === 0 && (
              <View style={styles.emptyState}>
                <MapPin size={44} color={C.muted} />
                <Text style={styles.emptyTitle}>No locations saved</Text>
                <Text style={styles.emptySub}>
                  Add a location to enable the geofenced voice assistant.
                </Text>
              </View>
            )}

            {locations.map((loc, idx) => (
              <View key={idx} style={styles.locCard}>
                <View style={styles.locIconWrap}>
                  <MapPin size={18} color={loc.voiceAssistantEnabled ? C.primary : C.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locName}>{loc.name}</Text>
                  <Text style={styles.locCoords}>
                    {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} · {loc.radius}m
                  </Text>
                </View>
                <View style={styles.locActions}>
                  <TouchableOpacity
                    style={[styles.voiceBtn, loc.voiceAssistantEnabled && styles.voiceBtnOn]}
                    onPress={() => toggleVoice(idx)}
                  >
                    <Mic size={14} color={loc.voiceAssistantEnabled ? C.primary : C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(idx)}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={() => setIsAdding(true)}>
              <Plus size={20} color={C.text} />
              <Text style={styles.addText}>Add Location</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#111113' },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#27272A' },
  backBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  headerTitle:    { fontSize: 20, fontWeight: '900', color: '#FFFDFC' },
  headerSub:      { fontSize: 12, color: 'rgba(255,253,252,0.4)', marginTop: 1 },

  scroll:         { padding: 20, paddingBottom: 120 },

  // Info card
  infoCard:       { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(232,65,74,0.08)', borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', borderRadius: 16, padding: 14, marginBottom: 24 },
  infoText:       { flex: 1, color: 'rgba(255,253,252,0.65)', fontSize: 13, lineHeight: 19 },

  // Form
  formCard:       { backgroundColor: '#18181B', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#27272A' },
  formTitle:      { fontSize: 18, fontWeight: '900', color: '#FFFDFC', marginBottom: 16 },
  fieldLabel:     { fontSize: 11, fontWeight: '800', color: 'rgba(255,253,252,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input:          { backgroundColor: '#111113', color: '#FFFDFC', padding: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#27272A' },

  // Map
  mapContainer:   { height: 220, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  map:            { width: '100%', height: '100%' },
  mapOverlay:     { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6, alignItems: 'center' },
  mapOverlayText: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  mapFallback:    { backgroundColor: '#111113', borderRadius: 14, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#27272A' },
  mapFallbackTitle:{ color: '#FFFDFC', fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  mapFallbackSub: { color: 'rgba(255,253,252,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  coordChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: 'rgba(232,65,74,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  coordText:      { color: '#E8414A', fontSize: 12, fontWeight: '600' },

  // Toggle
  toggleRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 22, backgroundColor: '#111113', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#27272A' },
  toggleLabel:    { color: '#FFFDFC', fontSize: 15, fontWeight: '700' },
  toggleSub:      { color: 'rgba(255,253,252,0.4)', fontSize: 12, marginTop: 2 },

  // Buttons
  btnRow:         { flexDirection: 'row', gap: 10 },
  cancelBtn:      { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#27272A', alignItems: 'center' },
  saveBtn:        { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#E8414A', alignItems: 'center' },
  cancelText:     { color: '#FFFDFC', fontSize: 15, fontWeight: '700' },
  saveText:       { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Empty state
  emptyState:     { alignItems: 'center', paddingVertical: 56 },
  emptyTitle:     { color: '#FFFDFC', fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySub:       { color: 'rgba(255,253,252,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  // Location card
  locCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#27272A' },
  locIconWrap:    { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(232,65,74,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  locName:        { fontSize: 15, fontWeight: '700', color: '#FFFDFC' },
  locCoords:      { fontSize: 11, color: 'rgba(255,253,252,0.4)', marginTop: 3 },
  locActions:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceBtn:       { width: 32, height: 32, borderRadius: 9, backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' },
  voiceBtnOn:     { backgroundColor: 'rgba(232,65,74,0.15)' },
  deleteBtn:      { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },

  // Add button
  addBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#18181B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#27272A' },
  addText:        { color: '#FFFDFC', fontSize: 15, fontWeight: '700' },
});
