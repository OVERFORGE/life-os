import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform, KeyboardAvoidingView, Image } from 'react-native';
import { ChevronLeft, ShieldAlert, Camera, Key } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { fetchWithAuth } from '../../utils/api';

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [profile, setProfile] = useState<any>({
    name: '',
    email: '',
    avatar: '',
    gender: '',
    age: '',
    weight: '',
    height: '',
    heightUnit: 'cm',
  });

  const [hasPassword, setHasPassword] = useState(false);
  
  // Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/user');
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.name || '',
          email: data.email || '',
          avatar: data.avatar || '',
          gender: data.gender || '',
          age: data.age?.toString() || '',
          weight: data.weight?.toString() || '',
          height: data.height?.toString() || '',
          heightUnit: data.heightUnit || 'cm',
        });
        setHasPassword(!!data.hasPassword);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploadingAvatar(true);
      try {
        const res = await fetchWithAuth('/user/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image: result.assets[0].base64 }),
        });
        
        const data = await res.json();
        if (data.success && data.url) {
          setProfile((p: typeof profile) => ({ ...p, avatar: data.url }));
          Alert.alert('Success', 'Avatar updated!');
        } else {
          Alert.alert('Error', data.error || 'Avatar upload failed');
        }
      } catch (e) {
        Alert.alert('Error', 'Network request failed during upload');
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload: any = { ...profile };
      const res = await fetchWithAuth('/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        Alert.alert('Success', 'Profile metrics updated successfully');
      } else {
        Alert.alert('Error', 'Failed to save changes');
      }
    } catch (e) {
      Alert.alert('Error', 'Network request failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    if (hasPassword && !oldPassword) {
      Alert.alert('Error', 'Please enter your current password to authorize this action.');
      return;
    }

    setSavingPass(true);
    try {
      const res = await fetchWithAuth('/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: newPassword,
          ...(hasPassword && { oldPassword })
        }),
      });

      if (res.ok) {
        Alert.alert('Success', 'Security credentials updated successfully');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true); // they definitely have one now!
      } else {
        const data = await res.json();
        Alert.alert('Security Error', data.error || 'Failed to update password');
      }
    } catch (e) {
      Alert.alert('Error', 'Network connection failed');
    } finally {
      setSavingPass(false);
    }
  };

  const setParam = (key: string, val: string) => {
    setProfile((prev: any) => ({ ...prev, [key]: val }));
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#0f1115] items-center justify-center">
        <ActivityIndicator color="#fcd34d" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      className="flex-1 bg-[#0f1115]"
    >
      <View className="px-4 pt-12 pb-4 border-b border-[#232632] flex-row justify-between items-center bg-[#0f1115]">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2 bg-[#161922] rounded-full border border-[#232632]">
            <ChevronLeft size={20} color="#9ca3af" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-100">Profile Structure</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-6" contentContainerStyle={{ paddingBottom: 150 }}>
        
        {/* AVATAR SECTION */}
        <View className="items-center mb-10">
          <TouchableOpacity onPress={pickImage} disabled={uploadingAvatar} className="relative active:opacity-70">
             {profile.avatar ? (
              <Image 
                source={{ uri: profile.avatar }} 
                className="w-28 h-28 rounded-full border-4 border-[#1a1d24]"
              />
            ) : (
              <View className="w-28 h-28 rounded-full border-4 border-[#1a1d24] bg-[#1a1d24] items-center justify-center">
                <Camera size={36} color="#4b5563" />
              </View>
            )}
            
            {/* Overlay Icon */}
            <View className="absolute bottom-0 right-0 bg-[#0f1115] p-2 rounded-full border-2 border-[#1a1d24]">
              {uploadingAvatar ? <ActivityIndicator size="small" color="#fcd34d" /> : <Camera size={14} color="#fcd34d" />}
            </View>
          </TouchableOpacity>
          <Text className="text-gray-400 text-xs mt-3">Tap to upload picture</Text>
        </View>

        {/* CORE SECTION */}
        <View className="bg-[#161922] border border-[#232632] rounded-3xl p-5 mb-6">
          <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-6">Core Identity</Text>
          
          <Text className="text-gray-500 text-xs mb-1 ml-1">Email (Permanent)</Text>
          <TextInput 
            value={profile.email} 
            editable={false}
            className="w-full bg-[#0f1115] border border-[#232632] rounded-xl px-4 py-3 text-gray-600 text-sm mb-4"
          />

          <Text className="text-gray-300 text-xs mb-1 ml-1 font-semibold">Legal Name</Text>
          <TextInput 
            value={profile.name} 
            onChangeText={(v) => setParam('name', v)}
            placeholderTextColor="#4b5563"
            className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-amber-500/50"
          />
        </View>

        {/* BIOMETRICS SECTION */}
        <View className="bg-[#161922] border border-[#232632] rounded-3xl p-5 mb-6">
          <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-6">Biometric Data</Text>
          
          <Text className="text-gray-300 text-xs mb-2 ml-1 font-semibold">Biological Gender</Text>
          <View className="flex-row space-x-2 mb-6">
            {['Male', 'Female', 'Other'].map((g) => (
              <TouchableOpacity 
                key={g}
                onPress={() => setParam('gender', g)}
                className={`flex-1 py-3 rounded-xl border items-center justify-center transition-all ${profile.gender === g ? 'bg-amber-500/10 border-amber-500/50' : 'bg-[#1a1d24] border-[#2a2d36]'}`}
              >
                <Text className={`text-xs font-bold ${profile.gender === g ? 'text-amber-400' : 'text-gray-400'}`}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row space-x-3">
            <View className="flex-1">
               <View className="flex-row justify-between pr-2 items-center mb-1">
                 <Text className="text-gray-300 text-xs ml-1 font-semibold">Height</Text>
                 <TouchableOpacity onPress={() => setParam('heightUnit', profile.heightUnit === 'cm' ? 'ft' : 'cm')} className="bg-[#2a2d36] px-2 py-0.5 rounded">
                   <Text className="text-gray-300 text-[10px] font-bold uppercase tracking-wider">{profile.heightUnit}</Text>
                 </TouchableOpacity>
               </View>
              <TextInput 
                value={profile.height} 
                onChangeText={(v) => setParam('height', v)}
                keyboardType="decimal-pad"
                placeholder={profile.heightUnit === 'cm' ? '180' : '5.11'}
                placeholderTextColor="#4b5563"
                className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-amber-500/50"
              />
            </View>

            <View className="flex-1">
              <View className="flex-row justify-between pr-2 items-center mb-1">
                 <Text className="text-gray-300 text-xs ml-1 font-semibold">Weight</Text>
                 <View className="bg-[#2a2d36] px-2 py-0.5 rounded">
                   <Text className="text-gray-300 text-[10px] font-bold uppercase tracking-wider">KG</Text>
                 </View>
               </View>
              <TextInput 
                value={profile.weight} 
                onChangeText={(v) => setParam('weight', v)}
                keyboardType="decimal-pad"
                placeholder="75"
                placeholderTextColor="#4b5563"
                className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-amber-500/50"
              />
            </View>

            <View className="flex-1">
               <Text className="text-gray-300 text-xs mb-1 ml-1 font-semibold">Age</Text>
               <TextInput 
                value={profile.age} 
                onChangeText={(v) => setParam('age', v)}
                keyboardType="number-pad"
                placeholder="25"
                placeholderTextColor="#4b5563"
                className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-amber-500/50"
              />
            </View>
          </View>

          <TouchableOpacity 
            onPress={handleSaveProfile} 
            disabled={saving}
            className="w-full h-12 bg-gray-100 rounded-xl items-center justify-center mt-6 active:opacity-70"
          >
            {saving ? <ActivityIndicator size="small" color="#0f1115" /> : <Text className="text-[#0f1115] font-bold text-sm text-center">Save Profile Data</Text>}
          </TouchableOpacity>
        </View>

        {/* SECURITY LOGIC SECTION */}
        <View className="bg-red-500/5 border border-red-500/20 rounded-3xl p-5 mb-6">
          <View className="flex-row items-center mb-6">
            <ShieldAlert size={16} color="#ef4444" />
            <Text className="text-red-400 text-xs font-bold uppercase tracking-wider ml-2">Master Security</Text>
          </View>
          
          {hasPassword && (
             <View className="mb-4">
              <Text className="text-gray-300 text-xs mb-1 ml-1 font-semibold">Current Password</Text>
              <TextInput 
                value={oldPassword} 
                onChangeText={setOldPassword}
                secureTextEntry
                placeholder="Authorize Changes"
                placeholderTextColor="#4b5563"
                className="w-full bg-[#0f1115] border border-red-500/20 rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-red-500/50"
              />
            </View>
          )}

          <View className="mb-4 space-y-3">
             <View>
              <Text className="text-gray-300 text-xs mb-1 ml-1 font-semibold">{hasPassword ? 'New Password' : 'Create Master Password'}</Text>
              <TextInput 
                value={newPassword} 
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="6+ characters"
                placeholderTextColor="#4b5563"
                className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-red-500/50"
              />
             </View>
             <View className="mt-3">
              <Text className="text-gray-300 text-xs mb-1 ml-1 font-semibold">Confirm Password</Text>
              <TextInput 
                value={confirmPassword} 
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Type it again"
                placeholderTextColor="#4b5563"
                className="w-full bg-[#1a1d24] border border-[#2a2d36] rounded-xl px-4 py-3 text-gray-200 text-sm focus:border-red-500/50"
              />
             </View>
          </View>

          <TouchableOpacity 
            onPress={handleSavePassword} 
            disabled={savingPass}
            className="w-full h-12 bg-red-500/10 border border-red-500/20 rounded-xl items-center justify-center mt-2 flex-row active:opacity-70"
          >
            {savingPass ? (
              <ActivityIndicator size="small" color="#ef4444" /> 
            ) : (
              <>
                <Key size={14} color="#fca5a5" className="mr-2" />
                <Text className="text-red-300 font-bold text-sm text-center">Update Vault Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
