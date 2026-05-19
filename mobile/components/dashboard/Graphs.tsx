import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Log } from './StatCards';

const screenWidth = Dimensions.get("window").width;

export function MoodEnergyChart({ logs }: { logs: Log[] }) {
  const last14 = logs.slice(-14);

  // If no logs, we provide dummy empty data so it doesn't crash
  const labels = last14.length > 0 ? last14.map(l => l.date.slice(5)) : ["--"];
  const moodData = last14.length > 0 ? last14.map(l => l.mental?.mood ?? 0) : [0];
  const energyData = last14.length > 0 ? last14.map(l => l.mental?.energy ?? 0) : [0];

  return (
    <View className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-4 mb-6">
      <Text className="text-[#FFFDFC] font-semibold mb-4 ml-2">Mood & Energy (14d)</Text>
      
      <LineChart
        data={{
          labels: labels,
          datasets: [
            {
              data: moodData,
              color: (opacity = 1) => `rgba(236, 231, 227, ${opacity})`, 
              strokeWidth: 2
            },
            {
              data: energyData,
              color: (opacity = 1) => `rgba(232, 65, 74, ${opacity})`,
              strokeWidth: 2
            }
          ],
          legend: ["Mood", "Energy"]
        }}
        width={screenWidth - 64} // padding 16 * 2 + parent padding 16 * 2
        height={220}
        chartConfig={{
          backgroundColor: "#1F2023",
          backgroundGradientFrom: "#1F2023",
          backgroundGradientTo: "#1F2023",
          decimalPlaces: 1, 
          color: (opacity = 1) => `rgba(236, 231, 227, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(236, 231, 227, ${opacity * 0.7})`,
          style: {
            borderRadius: 16
          },
          propsForDots: {
            r: "4",
            strokeWidth: "2",
          }
        }}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16,
          marginLeft: -10 // adjustments for react-native-chart-kit spacing
        }}
      />
    </View>
  );
}
