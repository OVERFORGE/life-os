import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, SafeAreaView,
  Switch, ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Bell, Moon, Scale, ChevronUp, ChevronDown, Check, Flame, TrendingDown, Minus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWithAuth } from '../../utils/api';

const C = {
  bg: '#0f1115', card: '#161922', border: '#232632', border2: '#374151',
  text: '#f3f4f6', subtext: '#9ca3af', muted: '#6b7280',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)',
  amber: '#f59e0b',
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
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronDown color={C.subtext} size={16} />
      </TouchableOpacity>
      <View style={{ backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.emerald + '40', paddingHorizontal: 20, paddingVertical: 8, minWidth: 110, alignItems: 'center' }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{format(value)}</Text>
      </View>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronUp color={C.subtext} size={16} />
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

  // Diet mode state
  const [dietMode, setDietMode] = useState('recomp');
  const [maintenanceCals, setMaintenanceCals] = useState(2200);
  const [dietSaving, setDietSaving] = useState(false);
  const [dietSaved, setDietSaved] = useState(false);

  const loadPrefs = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/user');
      if (res.ok) {
        const d = await res.json();
        const prefs = d.preferences || {};
        setReminderEnabled(prefs.weightReminderEnabled !== false);
        setReminderDay(prefs.weightReminderDay ?? 0);
        setReminderHour(prefs.weightReminderHour ?? 9);
        setRolloverHour(prefs.dayRolloverHour ?? 4);
        if (d.dietMode) setDietMode(d.dietMode);
        if (d.maintenanceCalories) setMaintenanceCals(d.maintenanceCalories);
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
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
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
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 16 }}
        >
          <ArrowLeft color={C.subtext} size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Personalization</Text>
          <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, marginTop: 1 }}>App Preferences</Text>
        </View>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: saved ? C.emerald + '20' : C.emeraldBg,
            borderWidth: 1, borderColor: saved ? C.emerald : C.emerald + '40',
            paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
          }}
        >
          {saving ? <ActivityIndicator color={C.emerald} size="small" /> :
            saved ? <Check color={C.emerald} size={14} /> : null}
          <Text style={{ color: C.emerald, fontWeight: '800', fontSize: 13 }}>
            {saved ? 'Saved!' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.emerald} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* ── Weight Reminder ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 20 }}>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.emeraldBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Scale color={C.emerald} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>Weight Reminder</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Get notified to measure your weight</Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: C.border2, true: C.emerald + '50' }}
                thumbColor={reminderEnabled ? C.emerald : C.subtext}
              />
            </View>

            {reminderEnabled && (
              <>
                {/* Day Picker */}
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Reminder Day</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                  {DAYS.map((day, i) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => setReminderDay(i)}
                      style={{
                        flex: 1, minWidth: 40,
                        paddingVertical: 10,
                        borderRadius: 14,
                        alignItems: 'center',
                        backgroundColor: reminderDay === i ? C.emerald + '20' : C.bg,
                        borderWidth: 1,
                        borderColor: reminderDay === i ? C.emerald : C.border,
                      }}
                    >
                      <Text style={{
                        color: reminderDay === i ? C.emerald : C.subtext,
                        fontSize: 12,
                        fontWeight: reminderDay === i ? '800' : '600',
                      }}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Time Picker */}
                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>Reminder Time (local)</Text>
                <Stepper value={reminderHour} min={0} max={23} onChange={setReminderHour} format={formatHour} />
                <Text style={{ color: C.muted, fontSize: 11, marginTop: 10, lineHeight: 16 }}>
                  You'll be reminded every {DAYS_FULL[reminderDay]} at {formatHour(reminderHour)} to measure your weight.
                </Text>
              </>
            )}
          </View>

          {/* ── Day Rollover Hour ── */}
          <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.amber + '15', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Moon color={C.amber} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>Day Rollover Hour</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>When does your "day" actually start?</Text>
              </View>
            </View>

            <Stepper value={rolloverHour} min={0} max={6} onChange={setRolloverHour} format={formatHour} />

            <View style={{ backgroundColor: C.amber + '10', borderRadius: 14, borderWidth: 1, borderColor: C.amber + '30', padding: 14, marginTop: 16 }}>
              <Text style={{ color: C.amber, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>How it works</Text>
              <Text style={{ color: C.subtext, fontSize: 12, lineHeight: 18 }}>
                Currently set to <Text style={{ color: C.text, fontWeight: '700' }}>{formatHour(rolloverHour)}</Text>.{'\n'}
                Any food or activity logged before {formatHour(rolloverHour)} will count towards <Text style={{ color: C.text, fontWeight: '700' }}>yesterday's</Text> record — great if you're a night owl.
              </Text>
            </View>
          </View>

          {/* ── Diet Plan ── */}
          {(() => {
            const MODES = [
              { key: 'bulk',       label: 'Bulk',         desc: '+500 kcal surplus',   color: '#4ade80', offset: 500 },
              { key: 'slight_bulk',label: 'Slight Bulk',  desc: '+250 kcal surplus',   color: '#86efac', offset: 250 },
              { key: 'recomp',     label: 'Recomp',       desc: '~Maintenance',         color: '#60a5fa', offset: 0 },
              { key: 'slight_cut', label: 'Slight Cut',   desc: '−250 kcal deficit',   color: '#facc15', offset: -250 },
              { key: 'cut',        label: 'Cut',          desc: '−500 kcal deficit',   color: '#f87171', offset: -500 },
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
              <View style={{ backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: activeModeObj.color + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Flame color={activeModeObj.color} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>Diet Plan</Text>
                    <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Target: {targetCals} kcal/day</Text>
                  </View>
                  {dietSaving ? <ActivityIndicator color={C.emerald} size="small" /> :
                    dietSaved ? <Check color={C.emerald} size={18} /> : null}
                </View>

                <Text style={{ color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Select Mode</Text>
                <View style={{ gap: 8 }}>
                  {MODES.map(m => {
                    const isActive = dietMode === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        onPress={() => saveDietMode(m.key)}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: isActive ? m.color + '15' : C.bg,
                          borderWidth: 1,
                          borderColor: isActive ? m.color + '60' : C.border,
                          borderRadius: 14, padding: 14,
                        }}
                      >
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isActive ? m.color : '#374151', marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: isActive ? m.color : C.text, fontSize: 14, fontWeight: '700' }}>{m.label}</Text>
                          <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{m.desc}</Text>
                        </View>
                        {isActive && <Check color={m.color} size={16} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ backgroundColor: activeModeObj.color + '10', borderRadius: 12, borderWidth: 1, borderColor: activeModeObj.color + '30', padding: 12, marginTop: 14 }}>
                  <Text style={{ color: activeModeObj.color, fontSize: 12, lineHeight: 18 }}>
                    Maintenance: <Text style={{ fontWeight: '800' }}>{maintenanceCals} kcal</Text>
                    {activeModeObj.offset !== 0 ? (
                      <Text> {activeModeObj.offset > 0 ? '+ ' : '− '}{Math.abs(activeModeObj.offset)} = <Text style={{ fontWeight: '800' }}>{targetCals} kcal target</Text></Text>
                    ) : ' (your target)'}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>You can also say "switch to bulk" or "start a cut" in the AI chat.</Text>
                </View>
              </View>
            );
          })()}

          {/* Notification Note */}
          <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Bell color={C.muted} size={14} />
              <Text style={{ color: C.muted, fontSize: 12, flex: 1, lineHeight: 18 }}>
                Notifications are delivered through the app. Make sure LifeOS notifications are enabled in your phone settings.
              </Text>
            </View>
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}
