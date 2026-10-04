// LifeOS Ambient Service Worker for Web Push & Notification Actions
// Follows Sovereign Kernel Execution Contract: actions dispatch directly to /api/kernel/dispatch

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Push Event: Show calm, ambient notification with canonical action buttons
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LifeOS Execution", body: event.data.text() };
  }

  const title = payload.title || "LifeOS";
  const notificationOptions = {
    body: payload.body || "Commitment execution due.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "lifeos-execution",
    renotify: true,
    data: payload.data || {},
    actions: payload.actions || [
      { action: "start", title: "Start" },
      { action: "done", title: "Done" },
      { action: "pause", title: "Pause" },
      { action: "defer_15", title: "+15m" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

// 2. Notification Click: Handle action button clicks or open/focus window
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  if (action === "done" || action === "start" || action === "pause" || action === "defer_15") {
    let actionType = "complete_task";
    let payload = { completedAtMs: Date.now() };

    if (action === "start") {
      actionType = "start_execution";
      payload = { startedAtMs: Date.now(), plannedDurationMinutes: 25 };
    } else if (action === "pause") {
      actionType = "pause_execution";
      payload = { pausedAtMs: Date.now() };
    } else if (action === "defer_15") {
      actionType = "defer_execution";
      payload = { deferMinutes: 15, reason: "Deferred 15m from web push action" };
    }

    const entityId = data.entityId || "active_execution";
    const idempotencyKey = `push_${action}_${entityId}_${Date.now()}`;

    const envelope = {
      sourceSurface: "WEB_STICKY_BAR",
      actionType,
      entityId,
      timestampMs: Date.now(),
      idempotencyKey,
      observedProjectionVersion: data.projectionVersion || 1,
      payload,
      clientSessionToken: data.sessionToken || "push_action_token",
    };

    event.waitUntil(
      fetch("/api/kernel/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      }).catch((err) => {
        console.error("[LifeOS SW] Push action dispatch failed:", err);
      })
    );
  } else {
    // Open or focus application window
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      })
    );
  }
});
