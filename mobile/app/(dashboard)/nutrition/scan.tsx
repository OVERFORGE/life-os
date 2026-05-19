import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, RefreshCcw, Check, ImageIcon, Dna, Activity, X, ArrowLeft } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

export default function NutritionScanScreen() {
  const router = useRouter();
  const toast = useToast();
  const { editFood } = useLocalSearchParams();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editModeId, setEditModeId] = useState<string | null>(null);

  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (editFood && typeof editFood === 'string') {
      try {
        const item = JSON.parse(editFood);
        setEditModeId(item._id);
        if (item.imageUrl) setImageUri(item.imageUrl);
        setResults({
          name: item.name,
          baseWeight: item.baseWeight || 100,
          macros: item.macros || { calories: 0, protein: 0, carbs: 0, fats: 0 },
          micros: item.micros || { zinc: 0, magnesium: 0, vitaminC: 0, vitaminB: 0, iron: 0, calcium: 0 }
        });
      } catch (e) {
        console.error("Failed parsing edit item", e);
      }
    }
  }, [editFood]);

  const takePicture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      toast.warning('Permission Needed', 'Camera access is required to scan food.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setImageUri(result.assets[0].uri);
      setBase64Image(result.assets[0].base64);
      setResults(null);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setImageUri(result.assets[0].uri);
      setBase64Image(result.assets[0].base64);
      setResults(null);
    }
  };

  const analyzeFood = async () => {
    if (!base64Image) return;

    setIsAnalyzing(true);
    try {
      const response = await fetchWithAuth('/nutrition/ai-analyze', {
        method: 'POST',
        body: JSON.stringify({ base64Image, description }),
      });

      const textOutput = await response.text();
      let data;
      try {
        data = JSON.parse(textOutput);
      } catch (err) {
        throw new Error(`Server returned non-JSON.`);
      }

      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResults(data);
    } catch (error: any) {
      toast.error('Analysis Failed', error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveToLibrary = async () => {
    if (!results) return;
    setIsSaving(true);
    try {
      const payload = {
        name: results.name,
        baseWeight: results.baseWeight,
        imageUrl: imageUri || results.imageUrl,
        macros: results.macros,
        micros: results.micros,
        components: results.components || []
      };

      const endpoint = editModeId ? `/nutrition/library/${editModeId}` : '/nutrition/library';
      const method = editModeId ? 'PUT' : 'POST';

      const response = await fetchWithAuth(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save — server returned an error');
      }

      toast.success(
        editModeId ? 'Food Updated!' : 'Added to Library!',
        editModeId ? 'Your changes have been saved.' : 'Food added to your personal library.',
      );
      setTimeout(() => router.back(), 1800);
    } catch (e: any) {
      toast.error('Save Failed', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateMacro = (key: string, value: string) => {
    setResults({ ...results, macros: { ...results.macros, [key]: Number(value) || 0 } });
  };
  const updateMicro = (key: string, value: string) => {
    setResults({ ...results, micros: { ...results.micros, [key]: Number(value) || 0 } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
            <ArrowLeft size={20} color={C.subtext} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text, flex: 1, textAlign: 'center' }}>{editModeId ? "Edit Food" : "AI Scanner"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: C.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{editModeId ? "Modify specific metrics for this food item." : "Scan any food to get precision macro detection."}</Text>
          </View>

          {!imageUri ? (
            <View>
              <TouchableOpacity 
                style={{ backgroundColor: C.text, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center' }}
                onPress={takePicture} 
                activeOpacity={0.8}
              >
                <Camera color={C.bg} size={24} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 18, fontWeight: '900', color: C.bg, textTransform: 'uppercase', letterSpacing: 1 }}>Open Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 24, padding: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}
                onPress={pickImage} 
                activeOpacity={0.7}
              >
                <ImageIcon color={C.subtext} size={20} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.subtext, marginLeft: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Upload from Gallery</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={{ borderRadius: 24, overflow: 'hidden', height: 350, borderWidth: 1, borderColor: C.border }}>
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%', backgroundColor: C.card }} />
                <TouchableOpacity style={{ position: 'absolute', top: 16, right: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} onPress={() => setImageUri(null)}>
                  <BlurView 
                    intensity={40} 
                    tint="dark" 
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}
                  >
                    <RefreshCcw color="white" size={14} />
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '900', marginLeft: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Retake</Text>
                  </BlurView>
                </TouchableOpacity>
              </View>

              {!results && (
                <View style={{ marginTop: 24, backgroundColor: C.card, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Context (Optional)</Text>
                  <TextInput
                    style={{ backgroundColor: C.bg, color: C.text, fontSize: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, height: 96, textAlignVertical: 'top' }}
                    placeholder="e.g. Cooked with 1 tbsp olive oil"
                    placeholderTextColor={C.muted}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                  
                  <TouchableOpacity 
                    style={{ marginTop: 16, borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: isAnalyzing ? C.bg : C.text, borderWidth: 1, borderColor: isAnalyzing ? C.border : C.text }}
                    onPress={analyzeFood} 
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <ActivityIndicator color={C.primary} />
                    ) : (
                      <Text style={{ color: C.bg, fontWeight: '900', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Analyze Food Data</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {results && (
            <View style={{ marginTop: 32, backgroundColor: C.card, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: C.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, textAlign: 'center' }}>Verification Override</Text>
              
              <TextInput 
                style={{ backgroundColor: C.bg, color: C.text, fontSize: 20, fontWeight: '900', padding: 16, borderRadius: 16, textAlign: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.border }}
                value={results.name}
                onChangeText={(text) => setResults({...results, name: text})}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginLeft: 4 }}>
                <Activity size={16} color={C.primary} />
                <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginLeft: 8, textTransform: 'uppercase' }}>Macros</Text>
              </View>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 }}>
                {[
                  { label: 'Calories', key: 'calories', suffix: 'KCAL' },
                  { label: 'Protein', key: 'protein', suffix: 'g' },
                  { label: 'Carbs', key: 'carbs', suffix: 'g' },
                  { label: 'Fats', key: 'fats', suffix: 'g' }
                ].map((item) => (
                  <View style={{ width: '48%', backgroundColor: C.bg, padding: 16, borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border }} key={item.key}>
                    <Text style={{ fontSize: 10, color: C.muted, fontWeight: '900', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>{item.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      <TextInput 
                        style={{ color: C.text, fontSize: 24, fontWeight: '900', padding: 0, minWidth: 40, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 2 }}
                        keyboardType="numeric"
                        value={String(results.macros?.[item.key] || 0)}
                        onChangeText={(val) => updateMacro(item.key, val)}
                      />
                      <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '900', marginLeft: 4, marginBottom: 4 }}>{item.suffix}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginLeft: 4, marginTop: 8 }}>
                <Dna size={16} color={C.primary} />
                <Text style={{ color: C.subtext, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginLeft: 8, textTransform: 'uppercase' }}>Micros</Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {[
                  { label: 'Zinc', key: 'zinc' },
                  { label: 'Magnesium', key: 'magnesium' },
                  { label: 'Vitamin C', key: 'vitaminC' },
                  { label: 'Vitamin B', key: 'vitaminB' },
                  { label: 'Iron', key: 'iron' },
                  { label: 'Calcium', key: 'calcium' }
                ].map((item) => (
                  <View style={{ width: '48%', backgroundColor: C.bg, padding: 12, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border }} key={item.key}>
                    <Text style={{ fontSize: 10, color: C.muted, fontWeight: '900', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>{item.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      <TextInput 
                        style={{ color: C.text, fontSize: 18, fontWeight: '900', padding: 0, minWidth: 30, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 2 }}
                        keyboardType="numeric"
                        value={String(results.micros?.[item.key] || 0)}
                        onChangeText={(val) => updateMicro(item.key, val)}
                      />
                      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '900', marginLeft: 4, marginBottom: 2 }}>mg</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity 
                style={{ marginTop: 24, borderRadius: 16, padding: 16, alignItems: 'center', backgroundColor: isSaving ? C.bg : C.text, borderWidth: 1, borderColor: isSaving ? C.border : C.text }}
                onPress={saveToLibrary} 
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={C.primary} />
                ) : (
                  <Text style={{ color: C.bg, fontWeight: '900', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Save to Library</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
