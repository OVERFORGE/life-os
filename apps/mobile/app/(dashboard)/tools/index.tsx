// CACHE BUST 
// FORCE CACHE BUST 1
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Heart, FileText, Target, Clock, ChevronRight, CheckSquare } from 'lucide-react-native';

export default function ToolsHubScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#161618' }}>
      {/* ─── Header ─── */}
      <BlurView intensity={20} tint="dark" style={{ paddingTop: 64, paddingBottom: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#2A2B2F', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <View>
          <Text style={{ color: '#FFFDFC', fontWeight: 'bold', fontSize: 22 }}>Tools & Modules</Text>
          <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 12, marginTop: 4 }}>Manage your life infrastructure</Text>
        </View>
      </BlurView>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }} contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={{ color: 'rgba(236,231,227,0.7)', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Available Modules</Text>

        {/* ─── Task Manager Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/tasks')}
          style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <CheckSquare size={24} color="#ECE7E3" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '600', fontSize: 16 }}>Task Manager</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 14, marginTop: 2 }}>Manage daily schedule and to-dos</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Health Hub Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/health')}
          style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <Heart size={24} color="#ECE7E3" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '600', fontSize: 16 }}>Health Hub</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 14, marginTop: 2 }}>Biometrics, calories & weight</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Manual Daily Log Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/daily-log')}
          style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <FileText size={24} color="#ECE7E3" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '600', fontSize: 16 }}>Daily Log Form</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 14, marginTop: 2 }}>Manual data entry for today</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

        {/* ─── Global Goals Card ─── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(dashboard)/tools/goals')}
          style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#2A2B2F', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <Target size={24} color="#ECE7E3" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFDFC', fontWeight: '600', fontSize: 16 }}>Global Goals</Text>
            <Text style={{ color: 'rgba(236,231,227,0.5)', fontSize: 14, marginTop: 2 }}>Manage life ambitions & targets</Text>
          </View>
          <ChevronRight size={20} color="rgba(236,231,227,0.3)" />
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}
