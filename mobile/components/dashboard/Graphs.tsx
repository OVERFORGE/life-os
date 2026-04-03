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
    <View className="bg-[#161922] border border-[#232632] rounded-xl p-4 mb-6">
      <Text className="text-gray-100 font-semibold mb-4 ml-2">Mood & Energy (14d)</Text>
      
      <LineChart
        data={{
          labels: labels,
          datasets: [
            {
              data: moodData,
              color: (opacity = 1) => `rgba(96, 165, 250, ${opacity})`, // blue-400
              strokeWidth: 2
            },
            {
              data: energyData,
              color: (opacity = 1) => `rgba(52, 211, 153, ${opacity})`, // emerald-400
              strokeWidth: 2
            }
          ],
          legend: ["Mood", "Energy"]
        }}
        width={screenWidth - 64} // padding 16 * 2 + parent padding 16 * 2
        height={220}
        chartConfig={{
          backgroundColor: "#161922",
          backgroundGradientFrom: "#161922",
          backgroundGradientTo: "#161922",
          decimalPlaces: 1, 
          color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`, // gray-400
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
