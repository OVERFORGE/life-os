import { View, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Wrench, Bot, Settings } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useState, useEffect } from 'react';

// Only show tab bar on explicit root pages
function useIsTabBarVisible() {
  const pathname = usePathname();
  
  const allowedRoots = [
    '/',
    '/tools',
    '/brain',
    '/settings'
  ];
  
  return allowedRoots.includes(pathname);
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const isVisible = useIsTabBarVisible();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  if (!isVisible || keyboardVisible) return null;

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
              <Icon size={22} color={isFocused ? '#E8414A' : 'rgba(236, 231, 227, 0.5)'} strokeWidth={isFocused ? 2.5 : 2} />
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
    borderColor: '#2A2B2F',
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
    backgroundColor: 'rgba(31, 32, 35, 0.95)',
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
