// Placeholder for native notifications
export interface DesktopNotification {
  title: string;
  body: string;
}

export const sendNotification = async (notification: DesktopNotification) => {
  // Implementation will use Tauri's API
};
