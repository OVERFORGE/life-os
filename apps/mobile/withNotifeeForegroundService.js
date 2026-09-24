const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotifeeForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const app = androidManifest.manifest.application[0];
    
    // Check if service already exists
    let service = app.service?.find(
      (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
    );
    
    if (!service) {
      if (!app.service) app.service = [];
      service = {
        $: {
          'android:name': 'app.notifee.core.ForegroundService'
        }
      };
      app.service.push(service);
    }
    
    // Update or add the necessary attributes
    service.$['android:foregroundServiceType'] = 'dataSync|location';
    service.$['android:exported'] = 'false';
    service.$['tools:replace'] = 'android:foregroundServiceType';
    
    // Make sure xmlns:tools is in the manifest root
    const manifest = androidManifest.manifest;
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
};
