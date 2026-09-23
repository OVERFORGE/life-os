const fs = require('fs');
const path = require('path');

function patchFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const { target, replacement } of transforms) {
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[patch-expo-modules] Patched ${filePath}`);
  }
}

// 1. Patch expo-av ExponentAV.js and ExponentAV.ts
const expoAvBuild = path.resolve(__dirname, '../node_modules/expo-av/build/ExponentAV.js');
const expoAvSrc = path.resolve(__dirname, '../node_modules/expo-av/src/ExponentAV.ts');

const expoAvFallback = `import { requireOptionalNativeModule } from 'expo-modules-core';

let nativeModule = null;
try {
  nativeModule = requireOptionalNativeModule('ExponentAV');
} catch (e) {
  nativeModule = null;
}

if (!nativeModule) {
  nativeModule = {
    name: 'ExponentAV',
    addListener: () => ({ remove: () => {} }),
    removeListeners: () => {},
    getPermissionsAsync: async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' }),
    requestPermissionsAsync: async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' }),
    setAudioMode: async () => {},
    setAudioIsEnabled: async () => {},
    getStatusForVideo: async () => ({}),
    loadForVideo: async () => ({}),
    unloadForVideo: async () => ({}),
    setStatusForVideo: async () => ({}),
    replayVideo: async () => ({}),
    getStatusForSound: async () => ({ isLoaded: false }),
    loadForSound: async () => {
      console.warn('[expo-av] Audio playback is not supported in Expo Go (SDK 53+ removed expo-av). Use a development build.');
      return { isLoaded: false };
    },
    unloadForSound: async () => ({ isLoaded: false }),
    setStatusForSound: async () => ({ isLoaded: false }),
    replaySound: async () => ({ isLoaded: false }),
    prepareAudioRecorder: async () => {
      console.warn('[expo-av] Audio recording is not supported in Expo Go (SDK 53+ removed expo-av). Use a development build.');
      return { canRecord: false };
    },
    startAudioRecording: async () => ({}),
    pauseAudioRecording: async () => ({}),
    stopAudioRecording: async () => ({}),
    unloadAudioRecorder: async () => ({}),
    getAudioRecordingStatus: async () => ({ isRecording: false }),
    getAvailableInputs: async () => [],
    getCurrentInput: async () => null,
    setInput: async () => {},
    Qualities: { Low: 1, Medium: 2, High: 3 },
  };
}

export default nativeModule;
`;

if (fs.existsSync(expoAvBuild)) {
  fs.writeFileSync(expoAvBuild, expoAvFallback + '//# sourceMappingURL=ExponentAV.js.map\n', 'utf8');
  console.log(`[patch-expo-modules] Ensured ${expoAvBuild}`);
}
if (fs.existsSync(expoAvSrc)) {
  fs.writeFileSync(expoAvSrc, expoAvFallback, 'utf8');
  console.log(`[patch-expo-modules] Ensured ${expoAvSrc}`);
}

// 1b. Patch expo-av ExpoVideoManager
const expoVideoMgrBuild = path.resolve(__dirname, '../node_modules/expo-av/build/ExpoVideoManager.js');
if (fs.existsSync(expoVideoMgrBuild)) {
  fs.writeFileSync(
    expoVideoMgrBuild,
    `import { requireOptionalNativeModule } from 'expo-modules-core';\nlet mod = null;\ntry { mod = requireOptionalNativeModule('ExpoVideoView'); } catch (e) { mod = null; }\nexport default mod || {};\n//# sourceMappingURL=ExpoVideoManager.js.map\n`,
    'utf8'
  );
  console.log(`[patch-expo-modules] Ensured ${expoVideoMgrBuild}`);
}

// 2. Patch expo-notifications warnOfExpoGoPushUsage
const expoNotifBuild = path.resolve(__dirname, '../node_modules/expo-notifications/build/warnOfExpoGoPushUsage.js');
const expoNotifSrc = path.resolve(__dirname, '../node_modules/expo-notifications/src/warnOfExpoGoPushUsage.ts');

patchFile(expoNotifBuild, [
  {
    target: `        if (Platform.OS === 'android') {\n            throw new Error(message);\n        }\n        else if (__DEV__) {`,
    replacement: `        if (__DEV__) {`,
  },
]);

patchFile(expoNotifSrc, [
  {
    target: `    if (Platform.OS === 'android') {\n      throw new Error(message);\n    } else if (__DEV__) {`,
    replacement: `    if (__DEV__) {`,
  },
]);

// 3. Patch expo-notifications TopicSubscriptionModule.android.js
// In Expo Go, requireNativeModule('ExpoTopicSubscriptionModule') fatally crashes.
// Replace with the same safe stub used in TopicSubscriptionModule.js (non-android).
const topicSubAndroid = path.resolve(__dirname, '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js');
if (fs.existsSync(topicSubAndroid)) {
  const safeFallback = `const module = {
    addListener: () => { },
    removeListeners: () => { },
    subscribeToTopicAsync: () => {
        return Promise.resolve(null);
    },
    unsubscribeFromTopicAsync: () => {
        return Promise.resolve(null);
    },
};
export default module;
//# sourceMappingURL=TopicSubscriptionModule.android.js.map
`;
  fs.writeFileSync(topicSubAndroid, safeFallback, 'utf8');
  console.log(`[patch-expo-modules] Patched ${topicSubAndroid}`);
}

console.log('[patch-expo-modules] Done.');
