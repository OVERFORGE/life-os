import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, Plus, Trash2, Mic, ArrowLeft } from 'lucide-react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { fetchWithAuth } from '../../../utils/api';
import C from '../../../constants/Colors';

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
  const [currentMapRegion, setCurrentMapRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  
  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedCoord, setSelectedCoord] = useState<{lat: number, lng: number} | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    fetchProfile();
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please grant location permission to use geofencing features.');
      return;
    }
    let loc = await Location.getCurrentPositionAsync({});
    setCurrentMapRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setSelectedCoord({ lat: loc.coords.latitude, lng: loc.coords.longitude });
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

  const saveLocationsToBackend = async (newLocations: SavedLocation[]) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/user', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: {
            savedLocations: newLocations
          }
        })
      });
      if (!res.ok) throw new Error('Failed to save');
      setLocations(newLocations);
      setIsAdding(false);
      setNewName('');
    } catch (error) {
      Alert.alert('Error', 'Failed to save locations.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocation = () => {
    if (!newName.trim() || !selectedCoord) {
      Alert.alert('Incomplete', 'Please provide a name and drop a pin on the map.');
      return;
    }
    const newLoc: SavedLocation = {
      name: newName.trim(),
      lat: selectedCoord.lat,
      lng: selectedCoord.lng,
      radius: 100, // 100 meters default
      voiceAssistantEnabled: voiceEnabled
    };
    saveLocationsToBackend([...locations, newLoc]);
  };

  const handleDeleteLocation = (index: number) => {
    const newLocations = locations.filter((_, i) => i !== index);
    saveLocationsToBackend(newLocations);
  };

  const toggleVoiceAssistant = (index: number) => {
    const newLocations = [...locations];
    newLocations[index].voiceAssistantEnabled = !newLocations[index].voiceAssistantEnabled;
    saveLocationsToBackend(newLocations);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FFFDFC" />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Locations</Text>
      </View>

      <ScrollView style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#E8414A" style={{ marginTop: 40 }} />
        ) : (
          <>
            {!isAdding && (
              <View style={styles.listContainer}>
                {locations.length === 0 ? (
                  <Text style={styles.emptyText}>No locations saved.</Text>
                ) : (
                  locations.map((loc, idx) => (
                    <View key={idx} style={styles.locationCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.locName}>{loc.name}</Text>
                        <Text style={styles.locCoords}>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</Text>
                      </View>
                      
                      <TouchableOpacity 
                        onPress={() => toggleVoiceAssistant(idx)}
                        style={[styles.toggleBtn, loc.voiceAssistantEnabled ? styles.toggleOn : styles.toggleOff]}
                      >
                        <Mic size={16} color={loc.voiceAssistantEnabled ? '#FFF' : '#AAA'} />
                        <Text style={[styles.toggleText, loc.voiceAssistantEnabled ? styles.textOn : styles.textOff]}>
                          {loc.voiceAssistantEnabled ? 'Enabled' : 'Disabled'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleDeleteLocation(idx)} style={styles.deleteBtn}>
                        <Trash2 size={20} color="#E8414A" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(true)}>
                  <Plus size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.addText}>Add New Location</Text>
                </TouchableOpacity>
              </View>
            )}

            {isAdding && (
              <View style={styles.addForm}>
                <Text style={styles.label}>Location Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Home, Office"
                  placeholderTextColor="#666"
                  value={newName}
                  onChangeText={setNewName}
                />
                
                <Text style={styles.label}>Drop Pin on Map</Text>
                <View style={styles.mapContainer}>
                  <MapView
                    style={styles.map}
                    region={currentMapRegion}
                    onRegionChangeComplete={setCurrentMapRegion}
                    onPress={(e) => setSelectedCoord({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
                  >
                    {selectedCoord && (
                      <Marker coordinate={{ latitude: selectedCoord.lat, longitude: selectedCoord.lng }} />
                    )}
                  </MapView>
                </View>

                <TouchableOpacity 
                  style={styles.voiceToggle}
                  onPress={() => setVoiceEnabled(!voiceEnabled)}
                >
                  <View style={[styles.checkbox, voiceEnabled && styles.checkboxActive]} />
                  <Text style={styles.checkboxLabel}>Enable Voice Assistant here</Text>
                </TouchableOpacity>

                <View style={styles.actionRow}>
                  <TouchableOpacity 
                    style={styles.cancelBtn} 
                    onPress={() => setIsAdding(false)}
                    disabled={saving}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.saveBtn} 
                    onPress={handleAddLocation}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveText}>Save Location</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#18181A' },
  backButton: { marginRight: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#FFFDFC' },
  content: { flex: 1, padding: 20 },
  listContainer: { gap: 16 },
  emptyText: { color: '#888', textAlign: 'center', marginVertical: 40, fontSize: 16 },
  locationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181A', p: 16, borderRadius: 16, padding: 16 },
  locName: { fontSize: 18, fontWeight: '600', color: '#FFF' },
  locCoords: { fontSize: 12, color: '#888', marginTop: 4 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 12 },
  toggleOn: { backgroundColor: 'rgba(232,65,74,0.2)' },
  toggleOff: { backgroundColor: '#2A2B2F' },
  toggleText: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
  textOn: { color: '#E8414A' },
  textOff: { color: '#AAA' },
  deleteBtn: { padding: 8 },
  addButton: { flexDirection: 'row', backgroundColor: '#2A2B2F', padding: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  addText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  addForm: { backgroundColor: '#18181A', padding: 20, borderRadius: 16 },
  label: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#2A2B2F', color: '#FFF', padding: 16, borderRadius: 12, fontSize: 16 },
  mapContainer: { height: 250, borderRadius: 12, overflow: 'hidden', marginVertical: 12 },
  map: { width: '100%', height: '100%' },
  voiceToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 24 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#666', marginRight: 12 },
  checkboxActive: { backgroundColor: '#E8414A', borderColor: '#E8414A' },
  checkboxLabel: { color: '#FFF', fontSize: 16 },
  actionRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#2A2B2F', alignItems: 'center' },
  saveBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#E8414A', alignItems: 'center' },
  cancelText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
