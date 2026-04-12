import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, RefreshCcw, Check, ImageIcon } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';

import { fetchWithAuth } from '../../../utils/api';

export default function NutritionScanScreen() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const takePicture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to scan food.');
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
        throw new Error(`Server returned non-JSON. The route might not exist on ${API_URL}`);
      }

      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResults(data);
    } catch (error: any) {
      Alert.alert("Analysis Error", error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={styles.title}>AI Scanner</Text>
          <Text style={styles.subtitle}>Precision macro detection</Text>
        </View>

        {!imageUri ? (
          <View style={styles.actionsBox}>
            <TouchableOpacity style={styles.primaryAction} onPress={takePicture} activeOpacity={0.8}>
              <View style={styles.iconCircle}>
                <Camera color="#0a0a0a" size={24} />
              </View>
              <Text style={styles.primaryActionText}>Open Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryAction} onPress={pickImage} activeOpacity={0.7}>
              <ImageIcon color="white" size={20} />
              <Text style={styles.secondaryActionText}>Upload from Image Library</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.previewContainer}>
            <View style={styles.imageWrapper}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
              <TouchableOpacity style={styles.retakeButton} onPress={() => setImageUri(null)}>
                <BlurView intensity={40} tint="dark" style={styles.retakeBlur}>
                  <RefreshCcw color="white" size={14} />
                  <Text style={styles.retakeText}>Retake</Text>
                </BlurView>
              </TouchableOpacity>
            </View>

            {!results && (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>CONTEXT (OPTIONAL)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Cooked with 1 tbsp olive oil"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                />
                
                <TouchableOpacity style={styles.analyzeButton} onPress={analyzeFood} disabled={isAnalyzing}>
                  {isAnalyzing ? (
                    <ActivityIndicator color="#0a0a0a" />
                  ) : (
                    <Text style={styles.analyzeText}>Analyze Food Data</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {results && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultLabel}>DETECTED ITEM</Text>
            <Text style={styles.resultTitle}>{results.name || "Unknown Food"}</Text>
            
            <View style={styles.macroGrid}>
              <View style={styles.macroBox}>
                <Text style={styles.macroValue}>{results.macros?.calories}</Text>
                <Text style={styles.macroDesc}>KCAL</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroValue}>{results.macros?.protein}g</Text>
                <Text style={styles.macroDesc}>Protein</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroValue}>{results.macros?.carbs}g</Text>
                <Text style={styles.macroDesc}>Carbs</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroValue}>{results.macros?.fats}g</Text>
                <Text style={styles.macroDesc}>Fats</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={() => router.back()}>
              <Text style={styles.saveText}>Looks Correct</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 100 },
  header: { marginBottom: 32 },
  title: { fontSize: 34, fontWeight: '700', color: 'white', letterSpacing: -1 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  
  actionsBox: { marginTop: 40 },
  primaryAction: { backgroundColor: 'white', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  primaryActionText: { fontSize: 18, fontWeight: '600', color: '#0a0a0a' },
  
  secondaryAction: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  secondaryActionText: { fontSize: 15, fontWeight: '500', color: 'white', marginLeft: 12 },

  previewContainer: { marginTop: 10 },
  imageWrapper: { borderRadius: 24, overflow: 'hidden', height: 350, borderCurve: 'continuous' },
  previewImage: { width: '100%', height: '100%' },
  retakeButton: { position: 'absolute', top: 16, right: 16, borderRadius: 20, overflow: 'hidden' },
  retakeBlur: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  retakeText: { color: 'white', fontSize: 13, fontWeight: '500', marginLeft: 6 },

  inputSection: { marginTop: 24 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.03)', color: 'white', fontSize: 15, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', height: 100, textAlignVertical: 'top' },
  analyzeButton: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginTop: 16, alignItems: 'center' },
  analyzeText: { color: '#0a0a0a', fontSize: 16, fontWeight: '600' },

  resultsContainer: { marginTop: 24, backgroundColor: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  resultLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  resultTitle: { fontSize: 22, fontWeight: '700', color: 'white', textAlign: 'center', marginBottom: 32 },
  
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  macroBox: { width: '47%', backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 16, marginBottom: 12, alignItems: 'center' },
  macroValue: { fontSize: 24, fontWeight: '700', color: 'white', marginBottom: 4 },
  macroDesc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  
  saveButton: { backgroundColor: 'white', padding: 18, borderRadius: 16, marginTop: 20, alignItems: 'center' },
  saveText: { color: '#0a0a0a', fontSize: 16, fontWeight: '600' }
});
