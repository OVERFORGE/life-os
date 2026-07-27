// server/utils/deviceDetect.ts
// Parse User-Agent to determine device type, browser, OS, and platform.

export interface DeviceInfo {
  deviceType: "mobile" | "desktop" | "tablet" | "web";
  platform: "Web Browser" | "Desktop App" | "Mobile App";
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string = ""): DeviceInfo {
  const u = ua.toLowerCase();

  // Platform detection — Tauri sets a specific UA marker
  let platform: DeviceInfo["platform"] = "Web Browser";
  if (u.includes("tauri") || u.includes("lifeos-desktop")) {
    platform = "Desktop App";
  } else if (u.includes("lifeos-mobile") || u.includes("expo") || u.includes("react-native")) {
    platform = "Mobile App";
  }

  // Device type
  let deviceType: DeviceInfo["deviceType"] = "web";
  if (platform === "Desktop App") {
    deviceType = "desktop";
  } else if (platform === "Mobile App") {
    deviceType = "mobile";
  } else if (/ipad|tablet|playbook|silk/.test(u)) {
    deviceType = "tablet";
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(u)) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  // OS detection
  let os = "Unknown";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os") || u.includes("macos")) os = "macOS";
  else if (u.includes("iphone") || u.includes("ipod")) os = "iOS";
  else if (u.includes("ipad")) os = "iPadOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("linux")) os = "Linux";

  // Browser detection
  let browser = "Unknown";
  if (u.includes("edg/") || u.includes("edge/")) browser = "Edge";
  else if (u.includes("chrome") && !u.includes("chromium")) browser = "Chrome";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";
  else if (u.includes("firefox")) browser = "Firefox";
  else if (u.includes("opr") || u.includes("opera")) browser = "Opera";
  else if (u.includes("chromium")) browser = "Chromium";
  else if (platform === "Desktop App") browser = "LifeOS App";
  else if (platform === "Mobile App") browser = "LifeOS Mobile";

  return { deviceType, platform, browser, os };
}
