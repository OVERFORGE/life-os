import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Image } from 'react-native';
import { Power, Settings as SettingsIcon, Save, RefreshCw, ChevronRight, User as UserIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#fcd34d" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0f1115]">
      {/* Header */}
      <View className="px-6 pt-12 pb-6 border-b border-[#232632] bg-[#0f1115] flex-row justify-between items-center">
        <View className="flex-row items-center">
          <SettingsIcon size={24} color="#fcd34d" />
          <Text className="text-2xl font-bold text-gray-100 ml-3">System Settings</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} className="bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20 flex-row items-center">
          <Power size={14} color="#ef4444" />
          <Text className="text-red-400 font-bold ml-1 text-xs">LOGOUT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
        
        {/* USER PROFILE CARD */}
        {userProfile && (
          <TouchableOpacity 
            onPress={() => router.push('/profile')}
            className="bg-[#161922] border border-[#232632] rounded-2xl p-4 mb-6 flex-row items-center active:opacity-70"
          >
            {userProfile.avatar ? (
              <Image 
                source={{ uri: userProfile.avatar }} 
                className="w-14 h-14 rounded-full border-2 border-amber-500/50 mr-4"
              />
            ) : (
              <View className="w-14 h-14 rounded-full border-2 border-amber-500/50 mr-4 bg-[#1a1d24] items-center justify-center">
                <UserIcon size={24} color="#fbbf24" />
              </View>
            )}
            
            <View className="flex-1 justify-center">
              <Text className="text-gray-100 font-bold text-lg leading-tight mb-0.5">{userProfile.name}</Text>
              <Text className="text-gray-500 text-xs">{userProfile.email}</Text>
            </View>
            
            <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
              <ChevronRight size={18} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        )}

        {/* PERSONALIZATION CARD */}
        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/personalization')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-4 mb-6 flex-row items-center active:opacity-70"
        >
          <View className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 mr-4 items-center justify-center">
            <SettingsIcon size={22} color="#10b981" />
          </View>
          <View className="flex-1 justify-center">
            <Text className="text-gray-100 font-bold text-base leading-tight mb-0.5">Personalization</Text>
            <Text className="text-gray-500 text-xs">Reminders, rollover hour & preferences</Text>
          </View>
          <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
            <ChevronRight size={18} color="#9ca3af" />
          </View>
        </TouchableOpacity>


        <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4 mt-2">Preferences</Text>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/signals')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-4 mb-4 flex-row items-center active:opacity-70"
        >
          <View className="w-12 h-12 rounded-xl bg-purple-500/10 items-center justify-center mr-4">
            <SettingsIcon size={22} color="#a855f7" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-100 font-bold text-base leading-tight mb-0.5">Custom Signals</Text>
            <Text className="text-gray-500 text-xs">Create & manage category schemas</Text>
          </View>
          <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
            <ChevronRight size={18} color="#9ca3af" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/weights')}
          className="bg-[#161922] border border-[#232632] rounded-2xl p-4 mb-6 flex-row items-center active:opacity-70"
        >
          <View className="w-12 h-12 rounded-xl bg-amber-500/10 items-center justify-center mr-4">
            <SettingsIcon size={22} color="#fbbf24" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-100 font-bold text-base leading-tight mb-0.5">Algorithm Weights</Text>
            <Text className="text-gray-500 text-xs">Tune LifeOS V1 Phase & Goal weights</Text>
          </View>
          <View className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
            <ChevronRight size={18} color="#9ca3af" />
          </View>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
