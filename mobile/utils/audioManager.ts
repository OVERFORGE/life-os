import { AppState, Platform, Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let TrackPlayer: any = null;
let Capability: any = null;
let AppKilledPlaybackBehavior: any = null;
let Event: any = null;
let isNativeModuleAvailable = false;

try {
    const tp = require('react-native-track-player');
    TrackPlayer = tp.default;
    Capability = tp.Capability;
    AppKilledPlaybackBehavior = tp.AppKilledPlaybackBehavior;
    Event = tp.Event;
    isNativeModuleAvailable = !!TrackPlayer;
} catch (e: any) {
    Alert.alert("TrackPlayer Import Error", String(e));
}

let isInitialized = false;

export const checkNativeAudioAvailable = () => isNativeModuleAvailable;

export const setupAmbientAudio = async () => {
    if (!isNativeModuleAvailable || !TrackPlayer) return false;
    if (isInitialized) return true;

    try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
            android: {
                appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
            },
            capabilities: [
                Capability.Play,
                Capability.Pause,
                Capability.Stop,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
            ],
            compactCapabilities: [
                Capability.SkipToPrevious,
                Capability.SkipToNext,
            ],
            notificationCapabilities: [
                Capability.SkipToPrevious,
                Capability.SkipToNext,
            ],
        });

        // Add a dummy track to serve as the background session
        await TrackPlayer.add([
            {
                id: 'ambient-focus',
                url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_55a29c1e7a.mp3', // royalty free brown noise/ambient
                title: 'Focus: 0 Tasks',
                artist: 'LifeOS',
                artwork: require('../assets/images/logo.png'),
                duration: 3600, // 1 hour loop
            },
        ]);

        isInitialized = true;
        return true;
    } catch (error) {
        console.log('Error setting up ambient audio player:', error);
        return false;
    }
};

// Global task rotation state
let taskRotationInterval: ReturnType<typeof setInterval> | null = null;
let currentTaskIndex = 0;
let isAssistantResponding = false;
let assistantRevertTimer: ReturnType<typeof setTimeout> | null = null;

// Helper to fetch tasks
const getNextTaskText = async (): Promise<{ title: string; text: string }> => {
    try {
        const { fetchWithAuth } = await import('./api');
        const res = await fetchWithAuth('/tasks/list');
        if (res.ok) {
            const data = await res.json();
            const pendingToday = data.today?.filter((t: any) => t.status === 'pending') || [];
            const pendingOverdue = data.overdue?.filter((t: any) => t.status === 'pending') || [];
            const pendingUpcoming = data.upcoming?.filter((t: any) => t.status === 'pending') || [];
            
            const allPending = [...pendingOverdue, ...pendingToday, ...pendingUpcoming];
            if (allPending.length > 0) {
                const task = allPending[currentTaskIndex % allPending.length];
                currentTaskIndex++;
                const timeStr = task.dueTime || '';
                return {
                    title: `Focus: ${allPending.length} Tasks`,
                    text: `${task.title}${timeStr ? `  ·  ${timeStr}` : ''}`
                };
            }
        }
    } catch {}
    return { title: 'LifeOS Assistant', text: 'All caught up!' };
};

const startTaskRotation = () => {
    if (taskRotationInterval) clearInterval(taskRotationInterval);
    taskRotationInterval = setInterval(async () => {
        if (isAssistantResponding || !TrackPlayer) return;
        const info = await getNextTaskText();
        try {
            await TrackPlayer.updateMetadataForTrack(0, {
                title: info.title,
                artist: info.text,
                artwork: require('../assets/images/logo.png'),
            });
        } catch (e) {}
    }, 30_000);
};

export const playAmbientFocus = async (taskTitle?: string, taskDetails?: string) => {
    if (!isNativeModuleAvailable || !TrackPlayer) return;
    if (!isInitialized) await setupAmbientAudio();

    try {
        if (taskTitle && taskDetails) {
            isAssistantResponding = true;
            if (assistantRevertTimer) clearTimeout(assistantRevertTimer);
            
            await TrackPlayer.updateMetadataForTrack(0, {
                title: taskTitle,
                artist: taskDetails,
                artwork: require('../assets/images/logo.png'),
            });
            
            // Revert after 30 seconds
            assistantRevertTimer = setTimeout(async () => {
                isAssistantResponding = false;
                const info = await getNextTaskText();
                await TrackPlayer.updateMetadataForTrack(0, {
                    title: info.title,
                    artist: info.text,
                    artwork: require('../assets/images/logo.png'),
                });
            }, 30_000);
        } else if (!taskTitle) {
            // Initial boot
            const info = await getNextTaskText();
            await TrackPlayer.updateMetadataForTrack(0, {
                title: info.title,
                artist: info.text,
                artwork: require('../assets/images/logo.png'),
            });
            startTaskRotation();
        }

        await TrackPlayer.play();
    } catch (e) {
        console.log("Failed to play ambient focus:", e);
    }
};

export const pauseAmbientFocus = async () => {
    if (!isNativeModuleAvailable || !TrackPlayer || !isInitialized) return;
    try {
        if (taskRotationInterval) clearInterval(taskRotationInterval);
        await TrackPlayer.pause();
    } catch (e) {
        console.log("Failed to pause ambient focus:", e);
    }
};

// Register Playback Service for background event handling
if (isNativeModuleAvailable) {
    try {
        TrackPlayer.registerPlaybackService(() => async function () {
            TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
            TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
            TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
            
            // Next mapped to Chat
            TrackPlayer.addEventListener(Event.RemoteNext, () => {
                Linking.openURL('mobile://chat-modal').catch(() => {});
            });
            
            // Previous mapped to Mic
            TrackPlayer.addEventListener(Event.RemotePrevious, () => {
                // Future expansion: mobile://mic-modal
                console.log('Mic button pressed');
            });
        });
    } catch (e) {
        console.log("Failed to register track player service:", e);
    }
}
