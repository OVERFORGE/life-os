import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';

/**
 * Safe, crash-proof replacement for @react-navigation/native's useFocusEffect.
 * Prevents "Couldn't find a navigation object. Is your component inside NavigationContainer?"
 * Runs on mount and on route focus via Expo Router's usePathname().
 */
export function useSafeFocusEffect(effect: () => void | (() => void)) {
  const pathname = usePathname();
  const cleanupRef = useRef<void | (() => void)>(undefined);

  useEffect(() => {
    const cleanup = effect();
    if (typeof cleanup === 'function') {
      cleanupRef.current = cleanup;
    }

    return () => {
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
    };
  }, [pathname]);
}

export default useSafeFocusEffect;
