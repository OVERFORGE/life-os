/**
 * LifeOS Mobile Realtime Event Transport (Phase 3 / Step 3 V2.2)
 * 
 * Native-compatible Server-Sent Events (SSE) streaming transport for React Native.
 * Avoids browser-only WHATWG ReadableStream APIs by using React Native's XMLHttpRequest
 * incremental response parsing (readyState 3 / LOADING).
 * 
 * Step 3 V2.2 Enhancements:
 * - Injects Authorization: Bearer <mobileJwt> from AsyncStorage (Condition 1)
 * - Transmits Last-Event-ID for 5-point exact interval coverage replay
 * - Handles system.resync_required for authoritative snapshot rehydration
 * - Handles selective SWR invalidation tags
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../utils/api';

export interface TransportOptions {
  endpoint?: string;
  heartbeatTimeoutMs?: number;
  reconnectIntervalMs?: number;
}

export class InteractionEventTransport {
  private xhr: XMLHttpRequest | null = null;
  private onProjectionCallback: ((projection: any) => void) | null = null;
  private onStatusCallback: ((status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED') => void) | null = null;
  private onInvalidationCallback: ((tags: string[]) => void) | null = null;
  private onResyncRequiredCallback: (() => void) | null = null;
  private lastProcessedIndex = 0;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private endpoint: string;
  private lastAcknowledgedSeq: number = 0;

  constructor(options: TransportOptions = {}) {
    this.endpoint = options.endpoint || '/surface/events';
  }

  /**
   * Registers callback for incoming projection updates.
   */
  public onProjection(cb: (projection: any) => void): this {
    this.onProjectionCallback = cb;
    return this;
  }

  /**
   * Registers callback for transport connection status changes.
   */
  public onStatus(cb: (status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED') => void): this {
    this.onStatusCallback = cb;
    return this;
  }

  /**
   * Registers callback for selective invalidation tags.
   */
  public onInvalidation(cb: (tags: string[]) => void): this {
    this.onInvalidationCallback = cb;
    return this;
  }

  /**
   * Registers callback for full snapshot resync requests.
   */
  public onResyncRequired(cb: () => void): this {
    this.onResyncRequiredCallback = cb;
    return this;
  }

  /**
   * Starts native SSE streaming via XMLHttpRequest with Bearer token authentication.
   */
  public async connect(): Promise<void> {
    this.isExplicitlyClosed = false;
    this.cleanup();

    try {
      const url = `${API_URL}${this.endpoint}`;
      this.xhr = new XMLHttpRequest();
      this.lastProcessedIndex = 0;

      this.xhr.open('GET', url, true);
      this.xhr.setRequestHeader('Accept', 'text/event-stream');
      this.xhr.setRequestHeader('Cache-Control', 'no-cache');

      // Security Condition 1: Inject Bearer Token
      const token = await AsyncStorage.getItem('user_token');
      if (token) {
        this.xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Reconnect Token: Last-Event-ID
      if (this.lastAcknowledgedSeq > 0) {
        this.xhr.setRequestHeader('Last-Event-ID', String(this.lastAcknowledgedSeq));
      }

      this.xhr.onreadystatechange = () => {
        if (!this.xhr) return;

        // readyState 3 (LOADING) or 4 (DONE) has response text
        if (this.xhr.readyState === 3 || this.xhr.readyState === 4) {
          if (this.xhr.status === 200) {
            this.reconnectAttempts = 0;
            this.onStatusCallback?.('CONNECTED');
            this.processResponseText(this.xhr.responseText);
          } else if (this.xhr.status === 401 || this.xhr.status === 403) {
            // Authentication rejection
            this.onStatusCallback?.('DISCONNECTED');
            this.disconnect();
            return;
          }
        }

        if (this.xhr.readyState === 4) {
          if (!this.isExplicitlyClosed) {
            this.scheduleReconnect();
          }
        }
      };

      this.xhr.onerror = () => {
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.xhr.send();
    } catch (err) {
      console.warn('[InteractionEventTransport] Connection error:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Incrementally parses incoming SSE stream chunks.
   */
  private processResponseText(fullText: string): void {
    if (!fullText || fullText.length <= this.lastProcessedIndex) return;

    const newChunk = fullText.substring(this.lastProcessedIndex);
    this.lastProcessedIndex = fullText.length;

    const messages = newChunk.split('\n\n');
    for (const msg of messages) {
      const trimmed = msg.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      let eventType = 'message';
      let eventId: number | null = null;
      let rawData: string | null = null;

      for (const line of lines) {
        if (line.startsWith(':')) {
          // Keep-alive heartbeat ping or comment flush; ignore
          continue;
        }
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('id: ')) {
          const parsed = parseInt(line.slice(4).trim(), 10);
          if (!isNaN(parsed)) {
            eventId = parsed;
          }
        } else if (line.startsWith('data: ')) {
          rawData = line.slice(6).trim();
        }
      }

      if (eventId !== null && eventId > this.lastAcknowledgedSeq) {
        this.lastAcknowledgedSeq = eventId;
      }

      if (eventType === 'system.resync_required') {
        this.onResyncRequiredCallback?.();
        continue;
      }

      if (rawData) {
        try {
          const payload = JSON.parse(rawData);
          if (payload.type === 'INVALIDATE' && Array.isArray(payload.tags)) {
            this.onInvalidationCallback?.(payload.tags);
          } else if (payload.projection) {
            this.onProjectionCallback?.(payload.projection);
          }
        } catch {
          // Ignore non-JSON frames
        }
      }
    }
  }

  /**
   * Schedules reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed) return;
    this.onStatusCallback?.('RECONNECTING');

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    if (this.xhr) {
      try {
        this.xhr.abort();
      } catch {}
      this.xhr = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Disconnects the transport.
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.cleanup();
    this.onStatusCallback?.('DISCONNECTED');
  }

  public getLastAcknowledgedSeq(): number {
    return this.lastAcknowledgedSeq;
  }
}
