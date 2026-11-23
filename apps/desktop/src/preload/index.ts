import { contextBridge, ipcRenderer } from "electron";

export interface DesktopBridge {
  openExternal: (url: string) => Promise<boolean>;
  toggleHud: () => Promise<void>;
  updateTrayStatus: (status: { title: string; tooltip: string }) => Promise<void>;
  onDeepLink: (callback: (url: string) => void) => () => void;
  onAvenWake: (callback: (payload: any) => void) => () => void;
  startWakeWord: () => Promise<boolean>;
  stopWakeWord: () => Promise<boolean>;
  isWakeWordRunning: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

const desktopBridge: DesktopBridge = {
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
  toggleHud: () => ipcRenderer.invoke("desktop:toggle-hud"),
  updateTrayStatus: (status: { title: string; tooltip: string }) =>
    ipcRenderer.invoke("desktop:update-tray", status),
  onDeepLink: (callback: (url: string) => void) => {
    const handler = (_: any, url: string) => callback(url);
    ipcRenderer.on("desktop:deep-link", handler);
    return () => ipcRenderer.removeListener("desktop:deep-link", handler);
  },
  onAvenWake: (callback: (payload: any) => void) => {
    const handler = (_: any, payload: any) => callback(payload);
    ipcRenderer.on("desktop:aven-wake", handler);
    return () => ipcRenderer.removeListener("desktop:aven-wake", handler);
  },
  startWakeWord: () => ipcRenderer.invoke("desktop:start-wake-word"),
  stopWakeWord: () => ipcRenderer.invoke("desktop:stop-wake-word"),
  isWakeWordRunning: () => ipcRenderer.invoke("desktop:is-wake-word-running"),
  minimizeWindow: () => ipcRenderer.invoke("desktop:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("desktop:maximize"),
  closeWindow: () => ipcRenderer.invoke("desktop:close"),
  isMaximized: () => ipcRenderer.invoke("desktop:is-maximized"),
};

contextBridge.exposeInMainWorld("lifeosDesktop", desktopBridge);

