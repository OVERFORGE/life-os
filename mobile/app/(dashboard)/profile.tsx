import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform, KeyboardAvoidingView, Image, SafeAreaView } from 'react-native';
import { ChevronLeft, ShieldAlert, Camera, Key } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { fetchWithAuth } from '../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

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
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
            <ChevronLeft size={20} color={C.subtext} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, marginLeft: 16 }}>Profile Structure</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
          
          {/* AVATAR SECTION */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <TouchableOpacity onPress={pickImage} disabled={uploadingAvatar} style={{ position: 'relative' }}>
               {profile.avatar ? (
                <Image 
                  source={{ uri: profile.avatar }} 
                  style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: C.border }}
                />
              ) : (
                <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={36} color={C.muted} />
                </View>
              )}
              
              {/* Overlay Icon */}
              <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: C.bg, padding: 8, borderRadius: 20, borderWidth: 2, borderColor: C.border }}>
                {uploadingAvatar ? <ActivityIndicator size="small" color={C.primary} /> : <Camera size={16} color={C.primary} />}
              </View>
            </TouchableOpacity>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, fontWeight: '600' }}>Tap to upload picture</Text>
          </View>

          {/* CORE SECTION */}
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>Core Identity</Text>
            
            <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Email (Permanent)</Text>
            <TextInput 
              value={profile.email} 
              editable={false}
              style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.muted, fontSize: 14, marginBottom: 16, fontWeight: '600' }}
            />

            <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Legal Name</Text>
            <TextInput 
              value={profile.name} 
              onChangeText={(v) => setParam('name', v)}
              placeholderTextColor={C.muted}
              style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 15, fontWeight: '700' }}
            />
          </View>

          {/* BIOMETRICS SECTION */}
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>Biometric Data</Text>
            
            <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Biological Gender</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              {['Male', 'Female', 'Other'].map((g) => (
                <TouchableOpacity 
                  key={g}
                  onPress={() => setParam('gender', g)}
                  style={{ flex: 1, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: profile.gender === g ? C.primaryBg : C.bg, borderColor: profile.gender === g ? 'rgba(232,65,74,0.3)' : C.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: profile.gender === g ? C.primary : C.subtext }}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 4 }}>
                   <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Height</Text>
                   <TouchableOpacity onPress={() => setParam('heightUnit', profile.heightUnit === 'cm' ? 'ft' : 'cm')} style={{ backgroundColor: C.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                     <Text style={{ color: C.text, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>{profile.heightUnit}</Text>
                   </TouchableOpacity>
                 </View>
                <TextInput 
                  value={profile.height} 
                  onChangeText={(v) => setParam('height', v)}
                  keyboardType="decimal-pad"
                  placeholder={profile.heightUnit === 'cm' ? '180' : '5.11'}
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 15, fontWeight: '700' }}
                />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 4 }}>
                   <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>Weight</Text>
                   <View style={{ backgroundColor: C.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                     <Text style={{ color: C.text, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>KG</Text>
                   </View>
                 </View>
                <TextInput 
                  value={profile.weight} 
                  onChangeText={(v) => setParam('weight', v)}
                  keyboardType="decimal-pad"
                  placeholder="75"
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 15, fontWeight: '700' }}
                />
              </View>

              <View style={{ flex: 1 }}>
                 <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Age</Text>
                 <TextInput 
                  value={profile.age} 
                  onChangeText={(v) => setParam('age', v)}
                  keyboardType="number-pad"
                  placeholder="25"
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 15, fontWeight: '700' }}
                />
              </View>
            </View>

            <TouchableOpacity 
              onPress={handleSaveProfile} 
              disabled={saving}
              style={{ width: '100%', height: 56, backgroundColor: C.text, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24 }}
            >
              {saving ? <ActivityIndicator size="small" color={C.bg} /> : <Text style={{ color: C.bg, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Save Profile Data</Text>}
            </TouchableOpacity>
          </View>

          {/* SECURITY LOGIC SECTION */}
          <View style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 24, padding: 20, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
              <ShieldAlert size={16} color="#ef4444" />
              <Text style={{ color: '#f87171', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: 8 }}>Master Security</Text>
            </View>
            
            {hasPassword && (
               <View style={{ marginBottom: 16 }}>
                <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Current Password</Text>
                <TextInput 
                  value={oldPassword} 
                  onChangeText={setOldPassword}
                  secureTextEntry
                  placeholder="Authorize Changes"
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }}
                />
              </View>
            )}

            <View style={{ gap: 16, marginBottom: 16 }}>
               <View>
                <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>{hasPassword ? 'New Password' : 'Create Master Password'}</Text>
                <TextInput 
                  value={newPassword} 
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="6+ characters"
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }}
                />
               </View>
               <View>
                <Text style={{ color: C.subtext, fontSize: 11, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>Confirm Password</Text>
                <TextInput 
                  value={confirmPassword} 
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Type it again"
                  placeholderTextColor={C.muted}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 16, paddingHorizontal: 16, height: 56, color: C.text, fontSize: 14, fontWeight: '600' }}
                />
               </View>
            </View>

            <TouchableOpacity 
              onPress={handleSavePassword} 
              disabled={savingPass}
              style={{ width: '100%', height: 56, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 8 }}
            >
              {savingPass ? (
                <ActivityIndicator size="small" color="#ef4444" /> 
              ) : (
                <>
                  <Key size={16} color="#fca5a5" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#fca5a5', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Update Vault Password</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
