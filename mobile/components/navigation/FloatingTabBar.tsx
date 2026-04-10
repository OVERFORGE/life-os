import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Dumbbell, Bot, Settings } from 'lucide-react-native';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      <BlurView intensity={20} tint="dark" style={styles.blurView}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key].options as any;
          
          // Only show these three specific routes
          const allowedRoutes = ['index', 'gym', 'brain', 'settings'];
          if (!allowedRoutes.includes(route.name) || options.href === null) {
             return null;
          }

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          let Icon = Home;
          if (route.name === 'index') Icon = Home;
          if (route.name === 'gym') Icon = Dumbbell;
          if (route.name === 'brain') Icon = Bot;
          if (route.name === 'settings') Icon = Settings;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={[
                styles.tabButton,
                isFocused && styles.tabButtonActive
              ]}
              activeOpacity={0.7}
            >
              <Icon size={24} color={isFocused ? '#f3f4f6' : '#4b5563'} strokeWidth={isFocused ? 2.5 : 2} />
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: '20%',
    right: '20%',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blurView: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 17, 21, 0.85)',
  },
  tabButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  }
});
