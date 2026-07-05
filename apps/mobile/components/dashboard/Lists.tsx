// CACHE BUST 
import { View, Text, ScrollView } from 'react-native';
import { Log, calculateStreak } from './StatCards';
import { Lightbulb, Trophy } from 'lucide-react-native';

export function StreakGrid({ logs }: { logs: Log[] }) {
  const isGym = (l: Log) => !!l.physical?.gym;
  const isCode = (l: Log) => !!l.work?.coded;
  const isNoFap = (l: Log) => !!l.habits?.noFap;

  const gymStreak = calculateStreak(logs, isGym);
  const codeStreak = calculateStreak(logs, isCode);
  const noFapStreak = calculateStreak(logs, isNoFap);

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: '#FFFDFC', fontWeight: '600', marginBottom: 12, paddingHorizontal: 4 }}>Current Streaks</Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 16, marginRight: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: 'rgba(236,231,227,0.7)', marginBottom: 4 }}>Gym</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFDFC' }}>{gymStreak}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 16, marginRight: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: 'rgba(236,231,227,0.7)', marginBottom: 4 }}>Code</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFDFC' }}>{codeStreak}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: 'rgba(236,231,227,0.7)', marginBottom: 4 }}>Discipline</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFDFC' }}>{noFapStreak}</Text>
        </View>
      </View>
    </View>
  );
}

export function PersonalRecords({ logs }: { logs: Log[] }) {
  const maxDeepWork = Math.max(...logs.map((l) => l.work?.deepWorkHours || 0), 0);
  
  return (
    <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Trophy size={18} color="#E8414A" />
        <Text style={{ color: '#FFFDFC', fontWeight: '600', marginLeft: 8 }}>Personal Records</Text>
      </View>
      
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#161618', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#2A2B2F', marginBottom: 8 }}>
         <Text style={{ fontSize: 14, color: 'rgba(236,231,227,0.7)' }}>Deep Work Stream</Text>
         <Text style={{ fontWeight: 'bold', color: '#FFFDFC' }}>{maxDeepWork} hours</Text>
      </View>
    </View>
  );
}

export function InsightsGrid({ logs }: { logs: Log[] }) {
  const recentLogs = logs.slice(-3);
  const consecutiveLowMood = recentLogs.every(l => (l.mental?.mood ?? 10) < 5);

  return (
    <View style={{ backgroundColor: '#1F2023', borderWidth: 1, borderColor: '#2A2B2F', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Lightbulb size={18} color="#E8414A" />
        <Text style={{ color: '#FFFDFC', fontWeight: '600', marginLeft: 8 }}>Recent Insights</Text>
      </View>

      {consecutiveLowMood ? (
        <View style={{ marginBottom: 12, borderLeftWidth: 2, borderColor: '#E8414A', paddingLeft: 12 }}>
          <Text style={{ color: 'rgba(236,231,227,0.9)', fontSize: 14, lineHeight: 20 }}>
            Mood has been under baseline for 3 consecutive days. Consider scheduling recovery.
          </Text>
        </View>
      ) : (
        <View style={{ marginBottom: 12, borderLeftWidth: 2, borderColor: '#D62C35', paddingLeft: 12 }}>
          <Text style={{ color: 'rgba(236,231,227,0.9)', fontSize: 14, lineHeight: 20 }}>
            Sustained positive energy correlation with Gym days. 
          </Text>
        </View>
      )}
    </View>
  );
}

export function Heatmap({ logs }: { logs: Log[] }) {
  const recent = logs.slice(-21);

  return (
    <View style={{ marginBottom: 40 }}>
      <Text style={{ color: '#FFFDFC', fontWeight: '600', marginBottom: 12, paddingHorizontal: 4 }}>Consistency Matrix</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 250, alignContent: 'flex-start' }}>
            {recent.map((l, i) => {
              const coded = Boolean(l.work?.coded);
              const gym = Boolean(l.physical?.gym);
              let color = "#2A2B2F";
              if (coded && gym) color = "#D62C35";
              else if (coded) color = "#F3767D";
              else if (gym) color = "#F9A8AC";
              
              return (
                <View 
                  key={i} 
                  style={{ width: 20, height: 20, borderRadius: 2, margin: 2, backgroundColor: color }}
                />
              )
            })}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginLeft: 4 }}>
        <View style={{ width: 12, height: 12, backgroundColor: '#2A2B2F', borderRadius: 2, marginRight: 4 }}/><Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', marginRight: 12 }}>Miss</Text>
        <View style={{ width: 12, height: 12, backgroundColor: '#F3767D', borderRadius: 2, marginRight: 4 }}/><Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', marginRight: 12 }}>Code</Text>
        <View style={{ width: 12, height: 12, backgroundColor: '#F9A8AC', borderRadius: 2, marginRight: 4 }}/><Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', marginRight: 12 }}>Gym</Text>
        <View style={{ width: 12, height: 12, backgroundColor: '#D62C35', borderRadius: 2, marginRight: 4 }}/><Text style={{ fontSize: 10, color: 'rgba(236,231,227,0.5)', marginRight: 12 }}>Both</Text>
      </View>
    </View>
  );
}
