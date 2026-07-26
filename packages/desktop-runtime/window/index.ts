// Placeholder for native window management
export interface DesktopWindow {
  setTitle(title: string): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
}
