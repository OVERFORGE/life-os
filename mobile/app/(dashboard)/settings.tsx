import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Image, SafeAreaView } from 'react-native';
import { Power, Settings as SettingsIcon, Save, RefreshCw, ChevronRight, User as UserIcon, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function SettingsScreen() {
  const router = useRouter();
  
  const [data, setData] = useState<any>(null);
  const [derived, setDerived] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [overrides, setOverrides] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [resData, resDerived, resUser] = await Promise.all([
        fetchWithAuth('/settings'),
        fetchWithAuth('/settings/derived'),
        fetchWithAuth('/user')
      ]);

      if (resData.ok) {
        const d = await resData.json();
        setData(d);
        setOverrides(d.overrides || {});
      }
      
      if (resDerived.ok) {
        const d = await resDerived.json();
        setDerived(d.derived || null);
      }
      
      if (resUser.ok) {
        const d = await resUser.json();
        setUserProfile(d);
      } else {
        const errText = await resUser.text();
        console.log("FAILED TO FETCH USER PROFILE:", errText);
        setUserProfile({ name: "Error Loading Profile", email: "Check Console Logs", avatar: "" });
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const saveOverrides = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      });
      if (res.ok) {
        Alert.alert('Success', 'Settings Overrides Saved. Changes applied universally.');
        loadSettings();
      } else {
        Alert.alert('Error', 'Failed to save overrides');
      }
    } catch (e) {
      Alert.alert('Error', 'Network request failed');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    Alert.alert('Reset System Overrides?', 'This will clear your manual tuning and revert to LifeOS defaults.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await fetchWithAuth('/settings', { method: 'DELETE' });
            loadSettings();
          } finally {
            setSaving(false);
          }
      }}
    ]);
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('user_token');
          try {
            const GM = require('@react-native-google-signin/google-signin');
            if (GM.GoogleSignin) {
              await GM.GoogleSignin.signOut();
            }
          } catch (e) {
            console.log('Skipped Native Google Signout (Unsupported in Expo Go).');
          }
          router.replace('/login');
        },
      },
    ]);
  };

  const getVal = (path: string[], fallback: number) => {
    let ref = overrides;
    for (const p of path) ref = ref?.[p];
    return ref ?? fallback;
  };

  const setVal = (path: string[], value: number) => {
    setOverrides((prev: any) => {
      const copy = JSON.parse(JSON.stringify(prev));
      let ref = copy;
      for (let i = 0; i < path.length - 1; i++) {
        ref[path[i]] ||= {};
        ref = ref[path[i]];
      }
      ref[path[path.length - 1]] = value;
      return copy;
    });
  };

  if (loading && !userProfile) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SettingsIcon size={24} color={C.text} />
          <Text style={{ fontSize: 24, fontWeight: '900', color: C.text, marginLeft: 12 }}>System Settings</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={{ backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', flexDirection: 'row', alignItems: 'center' }}>
          <Power size={14} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontWeight: '900', marginLeft: 6, fontSize: 11, letterSpacing: 1 }}>LOGOUT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        
        {/* USER PROFILE CARD */}
        {userProfile && (
          <TouchableOpacity 
            onPress={() => router.push('/profile')}
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 16, marginBottom: 32, flexDirection: 'row', alignItems: 'center' }}
            activeOpacity={0.7}
          >
            {userProfile.avatar ? (
              <Image 
                source={{ uri: userProfile.avatar }} 
                style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: C.border, marginRight: 16 }}
              />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: C.border, marginRight: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <UserIcon size={24} color={C.subtext} />
              </View>
            )}
            
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 18, marginBottom: 2 }}>{userProfile.name}</Text>
              <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>{userProfile.email}</Text>
            </View>
            
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={16} color={C.subtext} />
            </View>
          </TouchableOpacity>
        )}

        {/* PREFERENCES SECTION */}
        <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 }}>Preferences</Text>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/personalization')}
          style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={0.7}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <SettingsIcon size={24} color={C.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Personalization</Text>
            <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>Reminders, rollover hour & preferences</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color={C.subtext} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/locations')}
          style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={0.7}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <MapPin size={24} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Locations</Text>
            <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>Voice assistant zones & geofencing</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color={C.subtext} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/signals')}
          style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={0.7}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <SettingsIcon size={24} color={C.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Custom Signals</Text>
            <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>Create & manage category schemas</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color={C.subtext} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/weights')}
          style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={0.7}
        >
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <SettingsIcon size={24} color={C.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Algorithm Weights</Text>
            <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '600' }}>Tune LifeOS V1 Phase & Goal weights</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color={C.subtext} />
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
