import "expo-router/entry";
import { AppRegistry } from 'react-native';
import AvenTransientModal from './app/aven-transient';

// Register isolated root component for dedicated AvenActivity
AppRegistry.registerComponent('AvenTransient', () => AvenTransientModal);
