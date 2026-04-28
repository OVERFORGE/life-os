import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Wrench, Bot, Settings } from 'lucide-react-native';
import { useSegments } from 'expo-router';

// Sub-screens within each module where the tab bar should be hidden.
// The tab bar only shows when you're at the root index of each module.
const HIDE_ON_SEGMENTS: string[][] = [
  // nutrition sub-screens
  ['(dashboard)', 'nutrition', 'scan'],
  ['(dashboard)', 'nutrition', 'library'],
  ['(dashboard)', 'nutrition', 'create-template'],
  ['(dashboard)', 'nutrition', 'daily-log'],
  // gym sub-screens
  ['(dashboard)', 'gym', 'live-session'],
  ['(dashboard)', 'gym', 'create-gym'],
  ['(dashboard)', 'gym', 'create-routine'],
  ['(dashboard)', 'gym', 'history'],
  ['(dashboard)', 'gym', 'log-past'],
  ['(dashboard)', 'gym', 'edit-session'],
  // tools sub-screens
  ['(dashboard)', 'tools', 'daily-log'],
  ['(dashboard)', 'tools', 'history'],
  ['(dashboard)', 'tools', 'goals'],
];

function useIsTabBarVisible() {
  const segments = useSegments();
  for (const pattern of HIDE_ON_SEGMENTS) {
    if (pattern.every((seg, i) => segments[i] === seg)) return false;
  }
  return true;
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const isVisible = useIsTabBarVisible();

  if (!isVisible) return null;

  const visibleRoutes = state.routes.filter(route => {
    const options = descriptors[route.key].options as any;
    const allowedRoutes = ['index', 'tools', 'brain', 'settings'];
    return allowedRoutes.includes(route.name) && options.href !== null;
  });

  return (
    <View style={styles.container}>
      <BlurView intensity={20} tint="dark" style={styles.blurView}>
        {visibleRoutes.map((route) => {
          const index = state.routes.indexOf(route);
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
          if (route.name === 'tools') Icon = Wrench;
          if (route.name === 'brain') Icon = Bot;
          if (route.name === 'settings') Icon = Settings;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={[styles.tabButton, isFocused && styles.tabButtonActive]}
              activeOpacity={0.7}
            >
              <Icon size={22} color={isFocused ? '#f3f4f6' : '#4b5563'} strokeWidth={isFocused ? 2.5 : 2} />
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
    bottom: 28,
    left: '15%',
    right: '15%',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  blurView: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 17, 21, 0.88)',
    paddingHorizontal: 8,
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
