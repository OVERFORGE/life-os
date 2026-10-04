/**
 * LifeOS Mobile Realtime Event Transport (Phase 3)
 * 
 * Native-compatible Server-Sent Events (SSE) streaming transport for React Native.
 * Avoids browser-only WHATWG ReadableStream APIs by using React Native's XMLHttpRequest
 * incremental response parsing (readyState 3 / LOADING).
 */

import { fetchWithAuth, API_URL } from '../utils/api';

export interface TransportOptions {
  endpoint?: string;
  heartbeatTimeoutMs?: number;
  reconnectIntervalMs?: number;
}

export class InteractionEventTransport {
  private xhr: XMLHttpRequest | null = null;
  private onProjectionCallback: ((projection: any) => void) | null = null;
  private onStatusCallback: ((status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED') => void) | null = null;
  private lastProcessedIndex = 0;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private endpoint: string;

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
   * Starts native SSE streaming via XMLHttpRequest.
   */
  public connect(): void {
    this.isExplicitlyClosed = false;
    this.cleanup();

    try {
      const url = `${API_URL}${this.endpoint}`;
      this.xhr = new XMLHttpRequest();
      this.lastProcessedIndex = 0;

      this.xhr.open('GET', url, true);
      this.xhr.setRequestHeader('Accept', 'text/event-stream');
      this.xhr.setRequestHeader('Cache-Control', 'no-cache');

      this.xhr.onreadystatechange = () => {
        if (!this.xhr) return;

        // readyState 3 (LOADING) or 4 (DONE) has response text
        if (this.xhr.readyState === 3 || this.xhr.readyState === 4) {
          if (this.xhr.status === 200) {
            this.reconnectAttempts = 0;
            this.onStatusCallback?.('CONNECTED');
            this.processResponseText(this.xhr.responseText);
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
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const rawJson = line.slice(6).trim();
            const payload = JSON.parse(rawJson);
            if (payload && payload.projection) {
              this.onProjectionCallback?.(payload.projection);
            }
          } catch {
            // Ignore heartbeats or non-JSON comments
          }
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
}
