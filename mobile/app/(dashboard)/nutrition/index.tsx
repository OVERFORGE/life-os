import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Apple, Camera, Activity, ChevronRight, BookOpen } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

export default function NutritionDashboard() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={styles.title}>Nutrition</Text>
          <Text style={styles.subtitle}>Metabolic telemetry</Text>
        </View>

        {/* Premium Macro Widget */}
        <View style={styles.widgetContainer}>
          <BlurView intensity={20} tint="dark" style={styles.widget}>
            <View style={styles.widgetTop}>
              <Activity color="rgba(255,255,255,0.3)" size={16} />
              <Text style={styles.widgetTitle}>TODAY'S INTAKE</Text>
            </View>
            
            <View style={styles.macroDisplay}>
              <View style={styles.primaryStat}>
                <Text style={styles.primaryValue}>0</Text>
                <Text style={styles.primaryLabel}>KCAL</Text>
              </View>
              
              <View style={styles.secondaryStats}>
                <View style={styles.secondaryStatBox}>
                  <Text style={styles.secondaryValue}>0g</Text>
                  <Text style={styles.secondaryLabel}>Protein</Text>
                </View>
                <View style={styles.secondaryStatBox}>
                  <Text style={styles.secondaryValue}>0g</Text>
                  <Text style={styles.secondaryLabel}>Carbs</Text>
                </View>
                <View style={styles.secondaryStatBox}>
                  <Text style={styles.secondaryValue}>0g</Text>
                  <Text style={styles.secondaryLabel}>Fats</Text>
                </View>
              </View>
            </View>
          </BlurView>
        </View>

        <Text style={styles.sectionHeader}>ACTIONS</Text>

        {/* Scan Food Action */}
        <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/nutrition/scan')} activeOpacity={0.7}>
          <BlurView intensity={15} tint="dark" style={styles.actionBlur}>
            <View style={styles.actionIconContainer}>
              <Camera color="white" size={20} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>AI Meal Scan</Text>
              <Text style={styles.actionSubtitle}>Analyze food macros via camera</Text>
            </View>
            <ChevronRight color="rgba(255,255,255,0.2)" size={20} />
          </BlurView>
        </TouchableOpacity>

        {/* Food Library Action */}
        <TouchableOpacity style={styles.actionCard} activeOpacity={0.7}>
          <BlurView intensity={15} tint="dark" style={styles.actionBlur}>
            <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
              <BookOpen color="white" size={20} />
            </View>
            <View style={styles.actionTextContainer}>
              <Text style={styles.actionTitle}>Food Library</Text>
              <Text style={styles.actionSubtitle}>Custom foods & day templates</Text>
            </View>
            <ChevronRight color="rgba(255,255,255,0.2)" size={20} />
          </BlurView>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    padding: 24,
    paddingTop: 80,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  widgetContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 40,
  },
  widget: {
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  widgetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  widgetTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2,
    marginLeft: 8,
  },
  macroDisplay: {
    flexDirection: 'column',
  },
  primaryStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  primaryValue: {
    fontSize: 48,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -2,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 8,
    marginBottom: 6,
  },
  secondaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  secondaryStatBox: {
    alignItems: 'flex-start',
  },
  secondaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  secondaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 16,
    marginLeft: 8,
  },
  actionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
  },
  actionBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  }
});
