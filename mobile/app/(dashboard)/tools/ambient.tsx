import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { ArrowLeft, Play, Pause, Disc } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { checkNativeAudioAvailable, playAmbientFocus, pauseAmbientFocus } from '../../../utils/audioManager';

export default function AmbientFocusScreen() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(checkNativeAudioAvailable());
  }, []);

  const togglePlayback = async () => {
    if (!isReady) return;
    if (isPlaying) {
      await pauseAmbientFocus();
      setIsPlaying(false);
    } else {
      await playAmbientFocus('Focus Mode Active', 'Ambient Sound Playing');
      setIsPlaying(true);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#2A2B2F' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: '#1F2023', padding: 8, borderRadius: 16, borderWidth: 1, borderColor: '#2A2B2F' }}>
          <ArrowLeft size={20} color="rgba(236,231,227,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFDFC' }}>Ambient Focus</Text>
          <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>Module</Text>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        {!isReady ? (
          <View style={{ alignItems: 'center', backgroundColor: '#1F2023', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#2A2B2F' }}>
            <Disc size={48} color="rgba(236,231,227,0.4)" style={{ marginBottom: 16 }} />
            <Text style={{ color: '#FFFDFC', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>Module Unavailable</Text>
            <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 14, textAlign: 'center' }}>
              The Ambient Focus module requires a native build (APK) and cannot run inside Expo Go.
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 160, height: 160, borderRadius: 80, backgroundColor: isPlaying ? 'rgba(232,65,74,0.1)' : '#1F2023', borderWidth: 2, borderColor: isPlaying ? '#E8414A' : '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
              <Disc size={64} color={isPlaying ? '#E8414A' : '#ECE7E3'} />
            </View>
            
            <Text style={{ color: '#FFFDFC', fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
              {isPlaying ? 'Focusing...' : 'Ready to Focus'}
            </Text>
            <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 14, marginBottom: 40, textAlign: 'center', paddingHorizontal: 20 }}>
              Plays ambient background noise and activates the Spotify-style focus widget in your notifications.
            </Text>

            <TouchableOpacity
              onPress={togglePlayback}
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: '#E8414A',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#E8414A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
              }}
            >
              {isPlaying ? <Pause size={32} color="#FFFDFC" /> : <Play size={32} color="#FFFDFC" style={{ marginLeft: 4 }} />}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
