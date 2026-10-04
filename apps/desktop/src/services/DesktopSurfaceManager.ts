/**
 * LifeOS Desktop Surface Manager (Phase 6)
 * 
 * Manages desktop-specific ambient interactions:
 * 1. Tauri System Tray updates (title, tooltip, active execution indicator)
 * 2. Spotlight HUD toggle (<100ms visibility switch)
 * 3. Cross-device event stream listener via /api/surface/events
 */

import { invoke } from "@tauri-apps/api/core";

export interface DesktopProjectionState {
  title: string;
  tooltip: string;
  mode: string;
  isActive: boolean;
}

export class DesktopSurfaceManager {
  private static instance: DesktopSurfaceManager;
  private eventSource: EventSource | null = null;
  private baseUrl: string = "http://localhost:3000";

  private constructor() {}

  public static getInstance(): DesktopSurfaceManager {
    if (!DesktopSurfaceManager.instance) {
      DesktopSurfaceManager.instance = new DesktopSurfaceManager();
    }
    return DesktopSurfaceManager.instance;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Toggles the Desktop Spotlight HUD window with sub-100ms latency.
   */
  public async toggleHud(): Promise<void> {
    try {
      await invoke("toggle_hud");
    } catch (e) {
      console.warn("[DesktopSurfaceManager] toggle_hud error:", e);
    }
  }

  /**
   * Updates Tauri tray status based on current projection.
   */
  public async updateTray(projection: any): Promise<void> {
    const active = projection?.activeExecution;

    let title = "";
    let tooltip = "LifeOS: Calm";

    if (active && active.status === "ACTIVE") {
      title = `${active.title} (${Math.round(active.remainingSeconds / 60)}m)`;
      tooltip = `LifeOS Active: ${active.title}`;
    } else if (active && active.status === "PROPOSAL_PENDING") {
      title = `Due: ${active.title}`;
      tooltip = `LifeOS: ${active.title} is due now`;
    } else if (projection?.upcomingCommitment) {
      tooltip = `LifeOS Next: ${projection.upcomingCommitment.title} (in ${projection.upcomingCommitment.minutesUntilStart}m)`;
    }

    try {
      await invoke("update_tray_status", { title, tooltip });
    } catch (e) {
      // In non-Tauri browser environments, log gracefully
      console.log("[DesktopSurfaceManager] Tray updated:", { title, tooltip });
    }
  }

  /**
   * Connects to /api/surface/events for real-time desktop synchronization.
   */
  public connectEventStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource(`${this.baseUrl}/api/surface/events`);

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.projection) {
            this.updateTray(data.projection);
          }
        } catch {
          // Ignore heartbeats or non-JSON messages
        }
      };

      this.eventSource.onerror = () => {
        console.warn("[DesktopSurfaceManager] SSE connection lost. Will reconnect automatically.");
      };
    } catch (err) {
      console.warn("[DesktopSurfaceManager] EventSource creation failed:", err);
    }
  }

  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
