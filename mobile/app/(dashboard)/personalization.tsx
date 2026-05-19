import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  Switch, ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Bell, Moon, Scale, ChevronUp, ChevronDown, Check, Flame, TrendingDown, Minus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../../utils/api';
import { setupPersistentNotification, refreshPersistentNotification } from '../../utils/persistentNotification';
import * as Notifications from 'expo-notifications';

const C = {
  bg: '#161618', card: '#1F2023', border: '#2A2B2F',
  text: '#FFFDFC', subtext: 'rgba(236,231,227,0.7)', muted: 'rgba(236,231,227,0.4)',
  primary: '#E8414A', primaryBg: 'rgba(232,65,74,0.1)'
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:00 ${ampm}`;
}

function Stepper({
  value, min, max, onChange, format,
}: { value: number; min: number; max: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronDown color={C.subtext} size={18} />
      </TouchableOpacity>
      <View style={{ backgroundColor: C.bg, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.3)', paddingHorizontal: 24, paddingVertical: 10, minWidth: 120, alignItems: 'center' }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>{format(value)}</Text>
      </View>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronUp color={C.subtext} size={18} />
      </TouchableOpacity>
    </View>
  );
}

export default function PersonalizationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Preferences state
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDay, setReminderDay] = useState(0);     // 0=Sun
  const [reminderHour, setReminderHour] = useState(9);   // 9am
  const [rolloverHour, setRolloverHour] = useState(4);   // 4am
  const [persistentNotifEnabled, setPersistentNotifEnabled] = useState(true);

  // Diet mode state
  const [dietMode, setDietMode] = useState('recomp');
  const [maintenanceCals, setMaintenanceCals] = useState(2200);
  const [dietSaving, setDietSaving] = useState(false);
  const [dietSaved, setDietSaved] = useState(false);

  const loadPrefs = async () => {
    setLoading(true);
    try {
      const [userRes, weightRes, notifSetting] = await Promise.all([
        fetchWithAuth('/user'),
        fetchWithAuth('/health/weight-trend'),
        AsyncStorage.getItem('@persistent_notif_enabled')
      ]);
      
      if (notifSetting !== null) {
        setPersistentNotifEnabled(notifSetting !== 'false');
      }
      
      let dynamicMaintenance = null;
      if (weightRes.ok) {
        const d = await weightRes.json();
        const weeks = d.weeklyData || [];
        const latestWithEstimate = [...weeks].reverse().find((w: any) => w.maintenanceEstimate !== null);
        if (latestWithEstimate) {
          dynamicMaintenance = latestWithEstimate.maintenanceEstimate;
        }
      }

      if (userRes.ok) {
        const d = await userRes.json();
        const prefs = d.preferences || {};
        setReminderEnabled(prefs.weightReminderEnabled !== false);
        setReminderDay(prefs.weightReminderDay ?? 0);
        setReminderHour(prefs.weightReminderHour ?? 9);
        setRolloverHour(prefs.dayRolloverHour ?? 4);
        if (d.dietMode) setDietMode(d.dietMode);
        
        const baseMaintenance = dynamicMaintenance || d.maintenanceCalories || 2200;
        setMaintenanceCals(Math.round(baseMaintenance / 50) * 50);
      }
    } catch (e) {
      console.error('Load prefs error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadPrefs(); }, []));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: {
            weightReminderEnabled: reminderEnabled,
            weightReminderDay: reminderDay,
            weightReminderHour: reminderHour,
            dayRolloverHour: rolloverHour,
          },
        }),
      });
      
      await AsyncStorage.setItem('@persistent_notif_enabled', persistentNotifEnabled ? 'true' : 'false');
      
      if (persistentNotifEnabled) {
        setupPersistentNotification();
      } else {
        const prevId = await AsyncStorage.getItem('@persistent_notif_id');
        if (prevId) await Notifications.dismissNotificationAsync(prevId);
      }
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // Reschedule notifications with new prefs
        import('../../utils/notifications').then(({ scheduleDailyReminder }) => {
          scheduleDailyReminder();
        });
      }
    } catch (e) {
      console.error('Save prefs error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: C.card, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
          <ArrowLeft size={20} color={C.subtext} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.text }}>Personalization</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>App Preferences</Text>
        </View>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: saved ? C.primaryBg : C.text,
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
          }}
        >
          {saving ? <ActivityIndicator color={C.bg} size="small" /> :
            saved ? <Check color={C.primary} size={14} /> : null}
          <Text style={{ color: saved ? C.primary : C.bg, fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
            {saved ? 'Saved!' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* ── Persistent Notification ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Bell color={C.primary} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>Persistent Assistant</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, fontWeight: '600' }}>Quick chat access from notification shade</Text>
              </View>
              <Switch
                value={persistentNotifEnabled}
                onValueChange={setPersistentNotifEnabled}
                trackColor={{ false: C.bg, true: 'rgba(232,65,74,0.4)' }}
                thumbColor={persistentNotifEnabled ? C.primary : C.subtext}
              />
            </View>
          </View>

          {/* ── Weight Reminder ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 24 }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Scale color={C.primary} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>Weight Reminder</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, fontWeight: '600' }}>Get notified to measure your weight</Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: C.bg, true: 'rgba(232,65,74,0.4)' }}
                thumbColor={reminderEnabled ? C.primary : C.subtext}
              />
            </View>

            {reminderEnabled && (
              <>
                {/* Day Picker */}
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Reminder Day</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                  {DAYS.map((day, i) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => setReminderDay(i)}
                      style={{
                        flex: 1, minWidth: 40,
                        paddingVertical: 12,
                        borderRadius: 16,
                        alignItems: 'center',
                        backgroundColor: reminderDay === i ? C.primaryBg : C.bg,
                        borderWidth: 1,
                        borderColor: reminderDay === i ? 'rgba(232,65,74,0.3)' : C.border,
                      }}
                    >
                      <Text style={{
                        color: reminderDay === i ? C.primary : C.subtext,
                        fontSize: 13,
                        fontWeight: reminderDay === i ? '900' : '700',
                      }}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Time Picker */}
                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Reminder Time (local)</Text>
                <Stepper value={reminderHour} min={0} max={23} onChange={setReminderHour} format={formatHour} />
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, lineHeight: 18, fontWeight: '600' }}>
                  You'll be reminded every {DAYS_FULL[reminderDay]} at {formatHour(reminderHour)} to measure your weight.
                </Text>
              </>
            )}
          </View>

          {/* ── Day Rollover Hour ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <Moon color={C.primary} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>Day Rollover Hour</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, fontWeight: '600' }}>When does your "day" actually start?</Text>
              </View>
            </View>

            <Stepper value={rolloverHour} min={0} max={6} onChange={setRolloverHour} format={formatHour} />

            <View style={{ backgroundColor: C.primaryBg, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,65,74,0.2)', padding: 16, marginTop: 20 }}>
              <Text style={{ color: C.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>How it works</Text>
              <Text style={{ color: C.subtext, fontSize: 12, lineHeight: 20, fontWeight: '600' }}>
                Currently set to <Text style={{ color: C.text, fontWeight: '900' }}>{formatHour(rolloverHour)}</Text>.{'\n'}
                Any food or activity logged before {formatHour(rolloverHour)} will count towards <Text style={{ color: C.text, fontWeight: '900' }}>yesterday's</Text> record — great if you're a night owl.
              </Text>
            </View>
          </View>

          {/* ── Diet Plan ── */}
          {(() => {
            const MODES = [
              { key: 'bulk',       label: 'Bulk',         desc: '+500 kcal surplus',   color: '#E8414A', offset: 500 },
              { key: 'slight_bulk',label: 'Slight Bulk',  desc: '+250 kcal surplus',   color: '#E8414A', offset: 250 },
              { key: 'recomp',     label: 'Recomp',       desc: '~Maintenance',         color: '#E8414A', offset: 0 },
              { key: 'slight_cut', label: 'Slight Cut',   desc: '−250 kcal deficit',   color: '#E8414A', offset: -250 },
              { key: 'cut',        label: 'Cut',          desc: '−500 kcal deficit',   color: '#E8414A', offset: -500 },
            ];
            const activeModeObj = MODES.find(m => m.key === dietMode) || MODES[2];
            const targetCals = maintenanceCals + activeModeObj.offset;

            const saveDietMode = async (newMode: string) => {
              setDietSaving(true);
              const modeObj = MODES.find(m => m.key === newMode) || MODES[2];
              try {
                await fetchWithAuth('/user', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dietMode: newMode,
                    dietModeCalorieOffset: modeObj.offset,
                    targetCalories: Math.max(1200, maintenanceCals + modeObj.offset),
                  }),
                });
                setDietMode(newMode);
                setDietSaved(true);
                setTimeout(() => setDietSaved(false), 2000);
              } catch (e) { console.error(e); }
              finally { setDietSaving(false); }
            };

            return (
              <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${activeModeObj.color}20`, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Flame color={activeModeObj.color} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>Diet Plan</Text>
                    <Text style={{ color: C.muted, fontSize: 12, marginTop: 4, fontWeight: '600' }}>Target: {targetCals} kcal/day</Text>
                  </View>
                  {dietSaving ? <ActivityIndicator color={activeModeObj.color} size="small" /> :
                    dietSaved ? <Check color={activeModeObj.color} size={20} /> : null}
                </View>

                <Text style={{ color: C.subtext, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Select Mode</Text>
                <View style={{ gap: 10 }}>
                  {MODES.map(m => {
                    const isActive = dietMode === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        onPress={() => saveDietMode(m.key)}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: isActive ? `${m.color}10` : C.bg,
                          borderWidth: 1,
                          borderColor: isActive ? `${m.color}40` : C.border,
                          borderRadius: 16, padding: 16,
                        }}
                      >
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isActive ? m.color : C.border, marginRight: 16 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: isActive ? m.color : C.text, fontSize: 14, fontWeight: '900' }}>{m.label}</Text>
                          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2, fontWeight: '600' }}>{m.desc}</Text>
                        </View>
                        {isActive && <Check color={m.color} size={18} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ backgroundColor: `${activeModeObj.color}10`, borderRadius: 16, borderWidth: 1, borderColor: `${activeModeObj.color}30`, padding: 16, marginTop: 20 }}>
                  <Text style={{ color: activeModeObj.color, fontSize: 13, lineHeight: 20, fontWeight: '600' }}>
                    Maintenance: <Text style={{ fontWeight: '900' }}>{maintenanceCals} kcal</Text>
                    {activeModeObj.offset !== 0 ? (
                      <Text> {activeModeObj.offset > 0 ? '+ ' : '− '}{Math.abs(activeModeObj.offset)} = <Text style={{ fontWeight: '900' }}>{targetCals} kcal target</Text></Text>
                    ) : ' (your target)'}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 8, fontWeight: '700' }}>You can also say "switch to bulk" or "start a cut" in the AI chat.</Text>
                </View>
              </View>
            );
          })()}

          {/* Notification Note */}
          <View style={{ backgroundColor: C.bg, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Bell color={C.muted} size={16} />
              <Text style={{ color: C.muted, fontSize: 12, flex: 1, lineHeight: 18, fontWeight: '600' }}>
                Notifications are delivered through the app. Make sure LifeOS notifications are enabled in your phone settings.
              </Text>
            </View>
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
