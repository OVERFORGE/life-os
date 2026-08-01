import { generateId } from "../shared/ids";

export type DeviceType = "desktop" | "laptop" | "phone" | "tablet" | "browser" | "server";

export interface DeviceMetadata {
  deviceId: string;
  deviceType: DeviceType;
  sessionId: string;
}

export interface SyncEventMetadata extends DeviceMetadata {
  eventId: string;
  timestamp: number;
}

/**
 * DeviceIdentity Subsystem
 * 
 * SOLE OWNER of device and session identity management.
 * Attaches deterministic client device metadata to every kernel event for replication and auditing.
 */
export class DeviceIdentity {
  private static instance: DeviceIdentity;
  private deviceId: string;
  private deviceType: DeviceType;
  private sessionId: string;

  private constructor() {
    this.deviceId = generateId("dev");
    this.deviceType = "desktop";
    this.sessionId = generateId("sess");
  }

  static getInstance(): DeviceIdentity {
    if (!DeviceIdentity.instance) {
      DeviceIdentity.instance = new DeviceIdentity();
    }
    return DeviceIdentity.instance;
  }

  setIdentity(deviceId: string, deviceType: DeviceType): void {
    this.deviceId = deviceId;
    this.deviceType = deviceType;
  }

  getDeviceMetadata(): DeviceMetadata {
    return {
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      sessionId: this.sessionId,
    };
  }

  createSyncEventMetadata(): SyncEventMetadata {
    return {
      ...this.getDeviceMetadata(),
      eventId: generateId("evt"),
      timestamp: Date.now(),
    };
  }

  renewSession(): string {
    this.sessionId = generateId("sess");
    return this.sessionId;
  }
}
