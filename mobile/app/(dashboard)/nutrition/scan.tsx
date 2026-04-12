import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, RefreshCcw, Check, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';

// Make sure to define EXPO_PUBLIC_API_URL in your mobile/.env
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

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
      Alert.alert('Permission Denied', 'Sorry, we need camera permissions to scan food.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // Keep quality low to save tokens & speed up upload
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
      const response = await fetch(`${API_URL}/api/nutrition/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, description }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      setResults(data);
    } catch (error: any) {
      Alert.alert("Analysis Error", error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveToLibrary = async () => {
    try {
      // Endpoint logic for /api/nutrition/library goes here
      // We pass the verified `results` object
      Alert.alert("Success", "Food saved to your library!");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", "Could not save to library");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <Text style={styles.headerTitle}>AI Nutrition Scanner</Text>
      
      {!imageUri ? (
        <View style={styles.captureContainer}>
          <TouchableOpacity style={styles.captureCard} onPress={takePicture}>
            <Camera color="#00f0ff" size={48} />
            <Text style={styles.captureText}>Take Picture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.captureCard, { marginTop: 16, borderColor: 'rgba(255,255,255,0.1)' }]} onPress={pickImage}>
            <Text style={[styles.captureText, { color: 'white' }]}>Upload from Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.analysisContainer}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
          <TouchableOpacity style={styles.retakeButton} onPress={() => setImageUri(null)}>
            <RefreshCcw color="white" size={16} />
            <Text style={styles.retakeText}>Retake</Text>
          </TouchableOpacity>

          {!results && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Details (e.g. cooked in 1tbsp olive oil)"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={description}
                onChangeText={setDescription}
              />
              <TouchableOpacity style={styles.analyzeButton} onPress={analyzeFood} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <>
                    <Sparkles color="black" size={20} style={{ marginRight: 8 }} />
                    <Text style={styles.analyzeText}>Analyze Macros</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {results && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultTitle}>{results.name || "Identified Food"}</Text>
          
          <View style={styles.macroRow}>
            <View style={styles.macroBox}>
              <Text style={styles.macroLabel}>Calories</Text>
              <Text style={styles.macroValue}>{results.macros?.calories}</Text>
            </View>
            <View style={styles.macroBox}>
              <Text style={styles.macroLabel}>Protein</Text>
              <Text style={styles.macroValue}>{results.macros?.protein}g</Text>
            </View>
            <View style={styles.macroBox}>
              <Text style={styles.macroLabel}>Carbs</Text>
              <Text style={styles.macroValue}>{results.macros?.carbs}g</Text>
            </View>
            <View style={styles.macroBox}>
              <Text style={styles.macroLabel}>Fats</Text>
              <Text style={styles.macroValue}>{results.macros?.fats}g</Text>
            </View>
          </View>

          <Text style={styles.subtext}>* Please verify amounts. Click values to manually edit them before saving (UI placeholder).</Text>

          <TouchableOpacity style={styles.saveButton} onPress={saveToLibrary}>
             <Check color="black" size={20} style={{ marginRight: 8 }} />
             <Text style={styles.saveText}>Save to Library</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', padding: 24, paddingTop: 60 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 24 },
  captureContainer: { marginTop: 40 },
  captureCard: { backgroundColor: 'rgba(0, 240, 255, 0.05)', borderWidth: 1, borderColor: '#00f0ff', borderRadius: 16, height: 200, justifyContent: 'center', alignItems: 'center' },
  captureText: { color: '#00f0ff', marginTop: 16, fontWeight: 'bold' },
  analysisContainer: { marginTop: 20 },
  previewImage: { width: '100%', height: 300, borderRadius: 16 },
  retakeButton: { flexDirection: 'row', position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, alignItems: 'center' },
  retakeText: { color: 'white', marginLeft: 4, fontSize: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', padding: 16, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  analyzeButton: { backgroundColor: '#00f0ff', padding: 16, borderRadius: 12, marginTop: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  analyzeText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  resultsContainer: { marginTop: 32, padding: 24, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  resultTitle: { color: '#00f0ff', fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  macroBox: { alignItems: 'center' },
  macroLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  macroValue: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  subtext: { color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'center', marginBottom: 24, fontStyle: 'italic' },
  saveButton: { backgroundColor: 'white', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12 },
  saveText: { color: 'black', fontWeight: 'bold', fontSize: 16 }
});
