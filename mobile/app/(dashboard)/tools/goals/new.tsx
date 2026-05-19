import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchWithAuth } from '../../../../utils/api';
import { ArrowLeft, Plus } from 'lucide-react-native';

export default function NewGoalScreen() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('identity');
  const [signals, setSignals] = useState<{ key: string; weight: number }[]>([]);
  
  const [availableSignals, setAvailableSignals] = useState<any[]>([]);
  const [selectedSignalKey, setSelectedSignalKey] = useState('');
  
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchWithAuth('/signals')
      .then(r => r.json())
      .then(d => {
        if (d.signals) {
          setAvailableSignals(d.signals);
          if (d.signals.length > 0) setSelectedSignalKey(d.signals[0].key);
        }
      })
      .catch(e => console.error("Error loading signals:", e));
  }, []);

  const addSignal = () => {
    if (!selectedSignalKey) return;
    if (signals.find(s => s.key === selectedSignalKey)) return;
    
    setSignals([...signals, { key: selectedSignalKey, weight: 5 }]);
  };

  const removeSignal = (key: string) => {
    setSignals(signals.filter(s => s.key !== key));
  };

  const createGoal = async () => {
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetchWithAuth('/goals/create', {
        method: 'POST',
        body: JSON.stringify({ title, type, signals })
      });
      const data = await res.json();
      if (data.id) {
        router.replace(`/(dashboard)/tools/goals/${data.id}`);
      } else {
        router.back();
      }
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  };

  const sectionLabel = (text: string) => (
    <Text style={{ color: 'rgba(236,231,227,0.4)', fontWeight: '700', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{text}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft color="rgba(236,231,227,0.7)" size={17} />
        </TouchableOpacity>
        <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 16 }}>New Goal</Text>
        <View style={{ width: 38, height: 38 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Title */}
        <View style={{ marginBottom: 24 }}>
          {sectionLabel('Goal Title')}
          <TextInput
            style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', padding: 16, borderRadius: 14, fontSize: 15 }}
            placeholder="e.g. Master React Native"
            placeholderTextColor="rgba(236,231,227,0.3)"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Type */}
        <View style={{ marginBottom: 30 }}>
          {sectionLabel('Goal Type')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {['identity', 'performance', 'maintenance', 'recovery'].map(t => {
              const isSelected = type === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isSelected ? 'rgba(232,65,74,0.4)' : '#2A2B2F',
                    backgroundColor: isSelected ? 'rgba(232,65,74,0.08)' : '#1F2023',
                  }}
                >
                  <Text style={{ textTransform: 'capitalize', fontWeight: isSelected ? '800' : '600', color: isSelected ? '#E8414A' : 'rgba(236,231,227,0.6)' }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Signals */}
        <View style={{ marginBottom: 30 }}>
          <Text style={{ color: '#FFFDFC', fontWeight: '800', fontSize: 17, marginBottom: 16 }}>Tracked Signals</Text>
          
          {/* Add Signal Form */}
          <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            {sectionLabel('Select Signal')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {availableSignals.map(s => {
                const isSelected = selectedSignalKey === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setSelectedSignalKey(s.key)}
                    style={{
                      marginRight: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                      borderColor: isSelected ? 'rgba(232,65,74,0.4)' : '#2A2B2F',
                      backgroundColor: isSelected ? 'rgba(232,65,74,0.08)' : '#161618'
                    }}
                  >
                    <Text style={{ color: isSelected ? '#E8414A' : 'rgba(236,231,227,0.5)', fontSize: 13, fontWeight: isSelected ? '700' : '500' }}>{s.label || s.key}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={addSignal} style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              <Plus size={16} color="#ECE7E3" />
              <Text style={{ color: '#ECE7E3', fontWeight: '700' }}>Add Signal</Text>
            </TouchableOpacity>
          </View>

          {/* List of Added Signals */}
          {signals.map((s, idx) => (
            <View key={s.key} style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ color: '#FFFDFC', fontWeight: '700', fontSize: 14, marginBottom: 2 }}>{availableSignals.find(a => a.key === s.key)?.label || s.key}</Text>
                <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11 }}>{s.key}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: 'rgba(236,231,227,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Weight</Text>
                  <TextInput
                    style={{ backgroundColor: '#161618', borderWidth: 1, borderColor: '#2A2B2F', color: '#FFFDFC', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, textAlign: 'center', minWidth: 40 }}
                    keyboardType="numeric"
                    value={String(s.weight)}
                    onChangeText={(v) => {
                      const next = [...signals];
                      next[idx].weight = Number(v);
                      setSignals(next);
                    }}
                  />
                </View>
                <TouchableOpacity onPress={() => removeSignal(s.key)}>
                  <Text style={{ color: '#E8414A', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity 
          onPress={createGoal} 
          disabled={creating || !title} 
          style={{ paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 20, backgroundColor: creating || !title ? '#2A2B2F' : '#E8414A' }}
        >
          <Text style={{ color: creating || !title ? 'rgba(236,231,227,0.4)' : '#FFFDFC', fontWeight: '800', fontSize: 16 }}>{creating ? 'Creating...' : 'Create Goal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
