import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, RefreshCcw, Check, ImageIcon, Dna, Activity, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useToast } from '../../../components/ui/Toast';
import { fetchWithAuth } from '../../../utils/api';

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
        { label: 'Go Back', onPress: () => router.back() }
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
    <KeyboardAvoidingView className="flex-1 bg-[#0f1115]" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        <View className="mb-8 flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-bold text-gray-100 tracking-tight">{editModeId ? "Edit Food" : "AI Scanner"}</Text>
            <Text className="text-sm text-gray-500 mt-1 font-medium">{editModeId ? "Modify specific metrics" : "Precision macro detection"}</Text>
          </View>
          {editModeId && (
            <TouchableOpacity onPress={() => router.back()} className="p-2 border border-[#232632] rounded-full bg-[#161922]">
              <X color="#9ca3af" size={20} />
            </TouchableOpacity>
          )}
        </View>

        {!imageUri ? (
          <View className="mt-8">
            <TouchableOpacity 
              className="bg-gray-100 rounded-3xl p-6 items-center mb-4 flex-row justify-center" 
              onPress={takePicture} 
              activeOpacity={0.8}
            >
              <Camera color="#0f1115" size={24} style={{ marginRight: 12 }} />
              <Text className="text-lg font-bold text-[#0f1115]">Open Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-row bg-[#161922] rounded-2xl p-5 items-center justify-center border border-[#232632]" 
              onPress={pickImage} 
              activeOpacity={0.7}
            >
              <ImageIcon color="#9ca3af" size={20} />
              <Text className="text-sm font-semibold text-gray-300 ml-3">Upload from Gallery</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mt-2">
            <View className="rounded-3xl overflow-hidden h-[350px] border border-[#232632]">
              <Image source={{ uri: imageUri }} className="w-full h-full bg-[#161922]" />
              <TouchableOpacity className="absolute top-4 right-4 rounded-xl overflow-hidden border border-white/10" onPress={() => setImageUri(null)}>
                <BlurView 
                  intensity={40} 
                  tint="dark" 
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <RefreshCcw color="white" size={12} />
                  <Text className="text-white text-xs font-semibold ml-2">Retake</Text>
                </BlurView>
              </TouchableOpacity>
            </View>

            {!results && (
              <View className="mt-6 bg-[#161922] p-5 rounded-3xl border border-[#232632]">
                <Text className="text-[10px] font-bold text-gray-500 tracking-widest mb-3">CONTEXT (OPTIONAL)</Text>
                <TextInput
                  className="bg-[#0f1115] text-gray-100 text-sm p-4 rounded-xl border border-[#232632] h-24"
                  style={{ textAlignVertical: 'top' }}
                  placeholder="e.g. Cooked with 1 tbsp olive oil"
                  placeholderTextColor="#4b5563"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                
                <TouchableOpacity 
                  className={`mt-4 rounded-xl p-4 items-center ${isAnalyzing ? 'bg-[#232632]' : 'bg-gray-100'}`} 
                  onPress={analyzeFood} 
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <ActivityIndicator color="#0f1115" />
                  ) : (
                    <Text className="text-[#0f1115] font-bold text-base">Analyze Food Data</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {results && (
          <View className="mt-8 bg-[#161922] p-6 rounded-3xl border border-[#232632] shadow-xl">
            <Text className="text-[10px] font-bold text-gray-500 tracking-widest mb-4 text-center">VERIFICATION OVERRIDE</Text>
            
            <TextInput 
              className="bg-[#0f1115] text-gray-100 text-xl font-bold p-4 rounded-xl text-center mb-6 border border-[#232632] focus:border-[#4b5563]"
              value={results.name}
              onChangeText={(text) => setResults({...results, name: text})}
            />

            <View className="flex-row items-center mb-4 ml-1">
              <Activity size={16} color="#9ca3af" />
              <Text className="text-gray-300 text-sm font-bold tracking-wide ml-2">MACROS</Text>
            </View>
            
            <View className="flex-row flex-wrap justify-between mb-2">
              {[
                { label: 'Calories', key: 'calories', suffix: 'KCAL' },
                { label: 'Protein', key: 'protein', suffix: 'g' },
                { label: 'Carbs', key: 'carbs', suffix: 'g' },
                { label: 'Fats', key: 'fats', suffix: 'g' }
              ].map((item) => (
                <View className="w-[48%] bg-[#0f1115] p-4 rounded-2xl mb-4 border border-[#232632]" key={item.key}>
                  <Text className="text-[10px] text-gray-500 font-bold tracking-wider mb-2 uppercase">{item.label}</Text>
                  <View className="flex-row items-end">
                    <TextInput 
                      className="text-gray-100 text-2xl font-bold p-0 min-w-[40px] border-b border-[#232632] focus:border-[#4b5563] pb-0.5"
                      keyboardType="numeric"
                      value={String(results.macros?.[item.key] || 0)}
                      onChangeText={(val) => updateMacro(item.key, val)}
                    />
                    <Text className="text-gray-500 text-xs font-bold ml-1 mb-1">{item.suffix}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="flex-row items-center mb-4 ml-1 mt-2">
              <Dna size={16} color="#9ca3af" />
              <Text className="text-gray-300 text-sm font-bold tracking-wide ml-2">MICROS</Text>
            </View>

            <View className="flex-row flex-wrap justify-between">
              {[
                { label: 'Zinc', key: 'zinc' },
                { label: 'Magnesium', key: 'magnesium' },
                { label: 'Vitamin C', key: 'vitaminC' },
                { label: 'Vitamin B', key: 'vitaminB' },
                { label: 'Iron', key: 'iron' },
                { label: 'Calcium', key: 'calcium' }
              ].map((item) => (
                <View className="w-[48%] bg-[#0f1115] p-3 rounded-xl mb-3 border border-[#232632]" key={item.key}>
                  <Text className="text-[10px] text-gray-500 font-bold tracking-wider mb-2 uppercase">{item.label}</Text>
                  <View className="flex-row items-end">
                    <TextInput 
                      className="text-gray-100 text-lg font-bold p-0 min-w-[30px] border-b border-[#232632] focus:border-[#4b5563] pb-0.5"
                      keyboardType="numeric"
                      value={String(results.micros?.[item.key] || 0)}
                      onChangeText={(val) => updateMicro(item.key, val)}
                    />
                    <Text className="text-gray-500 text-xs font-bold ml-1 mb-1">mg</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity 
              className={`mt-6 rounded-xl p-4 items-center ${isSaving ? 'bg-[#232632]' : 'bg-gray-100'}`} 
              onPress={saveToLibrary} 
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#0f1115" />
              ) : (
                <Text className="text-[#0f1115] font-bold text-base">Save to Library</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
