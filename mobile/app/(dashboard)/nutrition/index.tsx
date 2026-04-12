import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Apple, Camera } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function NutritionDashboard() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Apple color="#00f0ff" size={40} style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Nutrition Core</Text>
        <Text style={styles.subtitle}>AI Macro Analysis Active</Text>
      </View>
      
      <View style={styles.ringsPlaceholder}>
        <Text style={styles.ringsText}>Daily Macros Overview</Text>
      </View>

      <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/nutrition/scan')}>
        <Camera color="white" size={24} style={{ marginRight: 8 }} />
        <Text style={styles.actionButtonText}>Scan Food</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 16,
    color: '#00f0ff',
    opacity: 0.8,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  ringsPlaceholder: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: 'rgba(0, 240, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  ringsText: {
    color: 'white',
    opacity: 0.5,
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: '#00f0ff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#00f0ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  actionButtonText: {
    color: '#050505',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
