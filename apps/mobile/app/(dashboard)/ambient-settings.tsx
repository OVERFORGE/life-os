import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ActiveExecutionNotificationManager } from '../../services/ActiveExecutionNotificationManager';
import { MobileWakeWordService } from '../../services/MobileWakeWordService';

/**
 * LifeOS Mobile Ambient Settings Screen (Phase 11)
 * 
 * Provides clean, calm user configuration for:
 * - Active Execution Notifications
 * - Android Home Screen Widget instructions
 * - Quick Settings Tile instructions
 * - Wake Word toggles and Privacy Notice
 */
export default function AmbientSettingsScreen() {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [heyAvenEnabled, setHeyAvenEnabled] = useState(true);
  const [avenEnabled, setAvenEnabled] = useState(false);
  const [permStatus, setPermStatus] = useState<string>('Checking…');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const notifs = await AsyncStorage.getItem('@ambient_notifs_enabled');
      if (notifs !== null) setNotificationsEnabled(notifs === 'true');

      const wake = await AsyncStorage.getItem('@ambient_wake_enabled');
      if (wake !== null) setWakeWordEnabled(wake === 'true');

      // Check Notification Permission
      const manager = ActiveExecutionNotificationManager.getInstance();
      const granted = await manager.requestPermissions();
      setPermStatus(granted ? 'Granted' : 'Permission Required');
    } catch {}
  };

  const toggleNotifications = async (val: boolean) => {
    setNotificationsEnabled(val);
    await AsyncStorage.setItem('@ambient_notifs_enabled', String(val));
    if (val) {
      await ActiveExecutionNotificationManager.getInstance().start();
    } else {
      await ActiveExecutionNotificationManager.getInstance().cancelNotification();
    }
  };

  const toggleWakeWord = async (val: boolean) => {
    setWakeWordEnabled(val);
    await AsyncStorage.setItem('@ambient_wake_enabled', String(val));
    const service = MobileWakeWordService.getInstance();
    if (val) {
      await service.startListening();
    } else {
      await service.stopListening();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#F6F3F1" />
        </TouchableOpacity>
        <Text style={styles.title}>Aven & Ambient</Text>
      </View>
      <Text style={styles.subtitle}>
        LifeOS stays with you quietly without keeping the full app open.
      </Text>

      {/* Card 1: Notifications */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <View style={styles.iconBadge}>
              <Ionicons name="notifications-outline" size={18} color="#E8414A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Execution Notifications</Text>
              <Text style={styles.cardDesc}>
                Active chronometer during work and auto-dismiss upon completion.
              </Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: '#2A2B2F', true: '#E8414A' }}
            thumbColor="#FFFDFC"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>System Permission</Text>
          <Text style={[styles.statusValue, permStatus === 'Granted' ? styles.statusOk : styles.statusWarn]}>
            {permStatus}
          </Text>
        </View>
      </View>

      {/* Card 2: Quick Settings & Widget Guidance */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="grid-outline" size={18} color="#E8414A" />
          <Text style={styles.cardTitle}>Home Screen & Quick Access</Text>
        </View>

        <View style={styles.stepBox}>
          <Text style={styles.stepNum}>1</Text>
          <Text style={styles.stepText}>
            <Text style={{ fontWeight: 'bold', color: '#FFF' }}>Home Widget: </Text>
            Long press on your home screen, tap Widgets, find Life OS, and drag to place.
          </Text>
        </View>

        <View style={styles.stepBox}>
          <Text style={styles.stepNum}>2</Text>
          <Text style={styles.stepText}>
            <Text style={{ fontWeight: 'bold', color: '#FFF' }}>Quick Settings Tile: </Text>
            Pull down your notification shade twice, tap Edit, and add the "Aven" tile for 1-tap voice access.
          </Text>
        </View>
      </View>

      {/* Card 3: Local Wake Word */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <View style={styles.iconBadge}>
              <Ionicons name="mic-outline" size={18} color="#E8414A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Local Wake Word</Text>
              <Text style={styles.cardDesc}>
                Detects wake phrases completely on-device without cloud recording.
              </Text>
            </View>
          </View>
          <Switch
            value={wakeWordEnabled}
            onValueChange={toggleWakeWord}
            trackColor={{ false: '#2A2B2F', true: '#E8414A' }}
            thumbColor="#FFFDFC"
          />
        </View>

        {wakeWordEnabled && (
          <View style={styles.phraseContainer}>
            <TouchableOpacity
              onPress={() => setHeyAvenEnabled(!heyAvenEnabled)}
              style={[styles.phraseChip, heyAvenEnabled && styles.phraseChipActive]}
            >
              <Text style={[styles.phraseText, heyAvenEnabled && styles.phraseTextActive]}>
                "Hey Aven" (Recommended)
              </Text>
              {heyAvenEnabled && <Ionicons name="checkmark" size={16} color="#E8414A" />}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setAvenEnabled(!avenEnabled)}
              style={[styles.phraseChip, avenEnabled && styles.phraseChipActive]}
            >
              <Text style={[styles.phraseText, avenEnabled && styles.phraseTextActive]}>
                "Aven"
              </Text>
              {avenEnabled && <Ionicons name="checkmark" size={16} color="#E8414A" />}
            </TouchableOpacity>
          </View>
        )}

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#E8414A" />
          <Text style={styles.privacyText}>
            Audio is processed in local transient RAM only. Zero speech is sent to any server until wake word is confirmed.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0B',
  },
  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFDFC',
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8B93',
    marginBottom: 20,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#161618',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    padding: 16,
    marginBottom: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1F2023',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#2A2B2F',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFDFC',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 11,
    color: '#8A8B93',
    lineHeight: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2B2F',
    marginVertical: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#8A8B93',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusOk: {
    color: '#34D399',
  },
  statusWarn: {
    color: '#F87171',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2023',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2B2F',
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E8414A',
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 20,
    marginRight: 10,
  },
  stepText: {
    flex: 1,
    fontSize: 12,
    color: '#D1D2D9',
    lineHeight: 16,
  },
  phraseContainer: {
    marginTop: 12,
    gap: 8,
  },
  phraseChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#1F2023',
    borderWidth: 1,
    borderColor: '#2A2B2F',
  },
  phraseChipActive: {
    borderColor: 'rgba(232, 65, 74, 0.6)',
  },
  phraseText: {
    fontSize: 12,
    color: '#8A8B93',
  },
  phraseTextActive: {
    color: '#FFFDFC',
    fontWeight: '600',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 10,
    backgroundColor: '#1A1A1D',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2B2F',
  },
  privacyText: {
    flex: 1,
    fontSize: 10,
    color: '#8A8B93',
    lineHeight: 14,
  },
});
