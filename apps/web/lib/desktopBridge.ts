/**
 * desktopBridge.ts
 * 
 * LifeOS Infrastructure Evolution V3.2
 * Clean interface to native Electron desktop capabilities.
 * Eliminates all direct imports of Tauri packages from web application bundles.
 */

export interface DesktopBridge {
  openExternal?: (url: string) => Promise<boolean>;
  toggleHud?: () => Promise<void>;
  updateTrayStatus?: (status: { title: string; tooltip: string }) => Promise<void>;
  onDeepLink?: (callback: (url: string) => void) => () => void;
  onAvenWake?: (callback: (payload: any) => void) => () => void;
  startWakeWord?: () => Promise<boolean>;
  stopWakeWord?: () => Promise<boolean>;
  isWakeWordRunning?: () => Promise<boolean>;
  minimizeWindow?: () => Promise<void>;
  maximizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;
  isMaximized?: () => Promise<boolean>;
}

declare global {
  interface Window {
    lifeosDesktop?: DesktopBridge;
    __TAURI_INTERNALS__?: any;
  }
}

/**
 * Safely opens an external URL using the desktop shell if available,
 * or standard browser window.open as fallback.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.openExternal) {
    try {
      await window.lifeosDesktop.openExternal(url);
      return;
    } catch (err) {
      console.warn("[desktopBridge] Electron openExternal error:", err);
    }
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Toggles the desktop HUD overlay window.
 */
export async function toggleHudWindow(): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.toggleHud) {
    try {
      await window.lifeosDesktop.toggleHud();
    } catch (err) {
      console.warn("[desktopBridge] Electron toggleHud error:", err);
    }
  }
}

/**
 * Updates the desktop tray status and tooltip.
 */
export async function updateTrayStatus(status: { title: string; tooltip: string }): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.updateTrayStatus) {
    try {
      await window.lifeosDesktop.updateTrayStatus(status);
    } catch (err) {
      console.warn("[desktopBridge] Electron updateTrayStatus error:", err);
    }
  }
}

/**
 * Starts the local Aven wake word detector on desktop.
 */
export async function startWakeWord(): Promise<boolean> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.startWakeWord) {
    try {
      return await window.lifeosDesktop.startWakeWord();
    } catch (err) {
      console.warn("[desktopBridge] Electron startWakeWord error:", err);
    }
  }
  return false;
}

/**
 * Stops the local Aven wake word detector on desktop.
 */
export async function stopWakeWord(): Promise<boolean> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.stopWakeWord) {
    try {
      return await window.lifeosDesktop.stopWakeWord();
    } catch (err) {
      console.warn("[desktopBridge] Electron stopWakeWord error:", err);
    }
  }
  return false;
}

/**
 * Minimizes the desktop window.
 */
export async function minimizeWindow(): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.minimizeWindow) {
    try {
      await window.lifeosDesktop.minimizeWindow();
    } catch (err) {
      console.warn("[desktopBridge] minimize error:", err);
    }
  }
}

/**
 * Toggles maximize / restore on the desktop window.
 */
export async function toggleMaximizeWindow(): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.maximizeWindow) {
    try {
      await window.lifeosDesktop.maximizeWindow();
    } catch (err) {
      console.warn("[desktopBridge] maximize error:", err);
    }
  }
}

/**
 * Closes the desktop window.
 */
export async function closeWindow(): Promise<void> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.closeWindow) {
    try {
      await window.lifeosDesktop.closeWindow();
    } catch (err) {
      console.warn("[desktopBridge] close error:", err);
    }
  }
}

/**
 * Queries whether the desktop window is maximized.
 */
export async function isWindowMaximized(): Promise<boolean> {
  if (typeof window !== "undefined" && window.lifeosDesktop?.isMaximized) {
    try {
      return await window.lifeosDesktop.isMaximized();
    } catch (err) {
      console.warn("[desktopBridge] isMaximized error:", err);
    }
  }
  return false;
}

