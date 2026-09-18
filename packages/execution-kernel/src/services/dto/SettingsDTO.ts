export interface SettingsDTO {
  schemaVersion: 1;
  userId: string;
  kernelVersion: string;
  telemetryVersion: string;
  calibrationPackageId: string;
  featureFlags: Record<string, boolean>;
  preferences: {
    theme?: string;
    notificationsEnabled?: boolean;
    telemetryConsent?: boolean;
    defaultView?: string;
  };
  diagnosticsEnabled: boolean;
  timestamp: number;
}
