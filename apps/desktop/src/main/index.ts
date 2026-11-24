import { app, BrowserWindow, Tray, Menu, ipcMain, shell, session, nativeImage, screen } from "electron";
import path from "path";
import http from "http";
import { WakeSupervisor } from "./supervisor";
import { loadRootEnv } from "./env";

// Ensure environment variables from root .env are loaded into process.env
loadRootEnv();

// Permit automatic audio playback in HUD without requiring prior mouse click/gesture
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: WakeSupervisor | null = null;
let authServer: http.Server | null = null;
let isQuitting: boolean = false;
let isHudEnabled: boolean = true;

const WEB_URL = process.env.LIFEOS_WEB_URL || "http://localhost:3456";
const START_URL = `${WEB_URL}/login`;
const AUTH_PORT = 3457;

// Register custom protocol client for lifeos://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("lifeos", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("lifeos");
}

const OFFLINE_FALLBACK_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LifeOS Desktop</title>
  <style>
    body {
      background: #0d0f12;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      user-select: none;
    }
    .card {
      background: #161618;
      border: 1px solid #2a2b2f;
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h2 { margin: 0 0 12px; font-size: 20px; color: #fff; }
    p { margin: 0 0 24px; font-size: 14px; color: #9ca3af; line-height: 1.5; }
    .badge {
      display: inline-block;
      background: rgba(232, 65, 74, 0.15);
      color: #e8414a;
      border: 1px solid rgba(232, 65, 74, 0.3);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    button {
      background: #e8414a;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #d62c35; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">DESKTOP RUNTIME</div>
    <h2>Connecting to LifeOS...</h2>
    <p>Unable to connect to active LifeOS service at <code>${START_URL}</code>.<br/>Ensure the web service is running or check your connection.</p>
    <button id="retry-btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
  <script>
    let countdown = 3;
    const btn = document.getElementById("retry-btn");
    setInterval(() => {
      if (countdown > 0) {
        btn.textContent = "Connecting in " + countdown + "s...";
        countdown--;
      } else {
        window.location.href = "${START_URL}";
      }
    }, 1000);
  </script>
</body>
</html>
`;

function handleDeepLink(url: string): void {
  if (!url) return;
  console.log("[Electron] Handling deep link:", url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("desktop:deep-link", url);
  }
}

function startAuthLoopbackServer(): void {
  try {
    authServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const reqUrl = new URL(req.url || "/", `http://127.0.0.1:${AUTH_PORT}`);
      if (reqUrl.pathname === "/auth-callback") {
        const token = reqUrl.searchParams.get("token");
        if (token) {
          handleDeepLink(`lifeos://auth?token=${token}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Token received by LifeOS Desktop" }));
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    authServer.listen(AUTH_PORT, "127.0.0.1", () => {
      console.log(`[Electron] Auth loopback server listening on http://127.0.0.1:${AUTH_PORT}`);
    });

    authServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[Electron] Auth loopback port ${AUTH_PORT} in use; skipping loopback server.`);
      } else {
        console.warn("[Electron] Auth loopback server error:", err);
      }
    });
  } catch (err) {
    console.warn("[Electron] Failed to start auth loopback server:", err);
  }
}

function stopAuthLoopbackServer(): void {
  if (authServer) {
    authServer.close();
    authServer = null;
  }
}

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith("lifeos://"));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

// macOS open-url handler
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "LifeOS",
    show: false,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    autoHideMenuBar: true,
    backgroundColor: "#111113",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // Permanently remove default File/Edit/View menu bar
  win.removeMenu();
  win.setMenu(null);

  // Set LifeOS-Desktop identifier in User-Agent for device detection
  const defaultUA = win.webContents.userAgent;
  win.webContents.setUserAgent(`${defaultUA} LifeOS-Desktop Windows`);

  win.loadURL(START_URL);

  win.once("ready-to-show", () => {
    win.show();
  });

  let retryTimer: NodeJS.Timeout | null = null;
  win.webContents.on("did-fail-load", (_event, errorCode) => {
    // -3 is ERR_ABORTED (normal navigation cancel)
    if (errorCode !== -3) {
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_FALLBACK_HTML)}`);
      if (!retryTimer && !isQuitting) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!isQuitting && win && !win.isDestroyed()) {
            win.loadURL(START_URL);
          }
        }, 2000);
      }
    }
  });

  win.webContents.on("did-finish-load", () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });

  win.on("close", (e) => {
    if (tray && !isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createHudWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const NOTCH_WIDTH = 640;
  const NOTCH_HEIGHT = 460;
  const x = Math.round((screenWidth - NOTCH_WIDTH) / 2);

  const hud = new BrowserWindow({
    width: NOTCH_WIDTH,
    height: NOTCH_HEIGHT,
    x,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  hud.removeMenu();
  hud.setMenu(null);

  const defaultUA = hud.webContents.userAgent;
  hud.webContents.setUserAgent(`${defaultUA} LifeOS-Desktop Windows HUD`);

  hud.loadURL(`${WEB_URL}/hud`);

  hud.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[HUD WebContents] (${level}) ${message} [${sourceId}:${line}]`);
  });

  hud.on("blur", () => {
    // Only auto-hide on blur if summoned by hover and not in an active voice conversation
    if (hudSummonSource === "hover" && !supervisor?.getConversationActive()) {
      hud.hide();
      hasHoveredHud = false;
    }
  });

  hud.on("show", () => {
    // Kept for tracking
  });

  hud.on("hide", () => {
    supervisor?.setConversationActive(false);
    hasHoveredHud = false;
    hudSummonSource = "manual";
  });

  let hudRetryTimer: NodeJS.Timeout | null = null;
  hud.webContents.on("did-fail-load", (_event, errorCode) => {
    if (errorCode !== -3) {
      hud.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_FALLBACK_HTML)}`);
      if (!hudRetryTimer && !isQuitting) {
        hudRetryTimer = setTimeout(() => {
          hudRetryTimer = null;
          if (!isQuitting && hud && !hud.isDestroyed()) {
            hud.loadURL(`${WEB_URL}/hud`);
          }
        }, 2000);
      }
    }
  });

  hud.webContents.on("did-finish-load", () => {
    if (hudRetryTimer) {
      clearTimeout(hudRetryTimer);
      hudRetryTimer = null;
    }
    hud.webContents.insertCSS(`
      html, body, #__next {
        background: transparent !important;
        background-color: transparent !important;
        overflow: hidden !important;
      }
    `);
  });

  return hud;
}

function createTray(): Tray {
  const icon = nativeImage.createEmpty();
  const t = new Tray(icon);
  t.setToolTip("LifeOS: Calm");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open LifeOS",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "Toggle Spotlight HUD",
      click: () => {
        toggleHud();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        supervisor?.stop();
        app.quit();
      },
    },
  ]);

  t.setContextMenu(contextMenu);
  t.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });

  return t;
}

let hudSummonSource: "voice" | "hover" | "manual" = "manual";
let hasHoveredHud = false;

function toggleHud(force?: boolean): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  if (!isHudEnabled && force !== true) return;
  if (hudWindow.isVisible()) {
    hudWindow.hide();
    supervisor?.setConversationActive(false);
    hasHoveredHud = false;
    hudSummonSource = "manual";
  } else {
    hudSummonSource = "manual";
    hasHoveredHud = false;
    hudWindow.show();
    hudWindow.focus();
  }
}

app.whenReady().then(() => {
  // Completely disable Electron default application menu across all windows
  Menu.setApplicationMenu(null);

  // Apply CSP header dynamically accommodating configured WEB_URL
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const origin = new URL(WEB_URL).origin;
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' ${origin} http://localhost:3456 http://localhost:3000 https:; ` +
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin} http://localhost:3456 http://localhost:3000 https:; ` +
            `style-src 'self' 'unsafe-inline' https:; ` +
            `font-src 'self' https: data:; ` +
            `img-src 'self' data: https: blob:; ` +
            `connect-src 'self' ${origin} http://localhost:3456 http://localhost:3000 https: wss: ws:;`,
        ],
      },
    });
  });

  startAuthLoopbackServer();

  mainWindow = createMainWindow();
  hudWindow = createHudWindow();
  tray = createTray();

  // Dynamic Ledge: Cursor hover trigger at the top-middle of the screen
  // Auto-dismiss: When cursor moves away from the HUD, seamlessly close (for hover summons only)
  setInterval(() => {
    if (!isHudEnabled || !hudWindow || hudWindow.isDestroyed()) return;
    try {
      const cursor = screen.getCursorScreenPoint();
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenWidth = primaryDisplay.bounds.width;
      const centerX = screenWidth / 2;
      const hudBounds = hudWindow.getBounds();

      // 1. Summon trigger: cursor touches top edge at screen center notch zone (±140px)
      if (cursor.y <= 3 && Math.abs(cursor.x - centerX) < 140) {
        if (!hudWindow.isVisible()) {
          hudSummonSource = "hover";
          hasHoveredHud = false;
          hudWindow.show();
        }
      }

      // 2. Auto-close trigger: ONLY for hover summons when user moves away after hovering
      // Voice summons or manual summons MUST NOT auto-close based on cursor position!
      if (hudWindow.isVisible() && hudSummonSource === "hover") {
        const isNearHud =
          cursor.x >= hudBounds.x - 30 &&
          cursor.x <= hudBounds.x + hudBounds.width + 30 &&
          cursor.y >= 0 &&
          cursor.y <= hudBounds.y + hudBounds.height + 40;

        if (isNearHud) {
          hasHoveredHud = true;
        } else if (hasHoveredHud && !supervisor?.getConversationActive()) {
          hudWindow.hide();
          supervisor?.setConversationActive(false);
          hasHoveredHud = false;
          hudSummonSource = "manual";
        }
      }
    } catch {}
  }, 150);

  // Window Controls
  ipcMain.handle("desktop:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle("desktop:maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("desktop:close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle("desktop:is-maximized", () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  // IPC handlers
  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle("desktop:toggle-hud", async (_event, force?: boolean) => {
    toggleHud(force);
  });

  ipcMain.handle("desktop:hide-hud", async () => {
    if (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
      hudWindow.hide();
      supervisor?.setConversationActive(false);
      hasHoveredHud = false;
      hudSummonSource = "manual";
    }
  });

  ipcMain.handle("desktop:set-conversation-active", async (_event, active: boolean) => {
    supervisor?.setConversationActive(Boolean(active));
  });

  ipcMain.handle("desktop:set-hud-enabled", async (_event, enabled: boolean) => {
    isHudEnabled = Boolean(enabled);
    if (!isHudEnabled && hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
      hudWindow.hide();
    }
    return isHudEnabled;
  });

  ipcMain.handle("desktop:is-hud-enabled", async () => {
    return isHudEnabled;
  });

  ipcMain.handle(
    "desktop:update-tray",
    async (_event, status: { title: string; tooltip: string }) => {
      if (tray) {
        if (status.tooltip) tray.setToolTip(status.tooltip);
        if (status.title && process.platform === "darwin") tray.setTitle(status.title);
      }
    }
  );

  ipcMain.handle("desktop:start-wake-word", async () => {
    if (supervisor && !supervisor.isRunning()) {
      supervisor.start();
      return true;
    }
    return supervisor?.isRunning() ?? false;
  });

  ipcMain.handle("desktop:stop-wake-word", async () => {
    if (supervisor && supervisor.isRunning()) {
      supervisor.stop();
      return true;
    }
    return false;
  });

  ipcMain.handle("desktop:is-wake-word-running", async () => {
    return supervisor?.isRunning() ?? false;
  });

  // Auto-grant media/microphone permissions to LifeOS windows
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
      return;
    }
    callback(true);
  });

  // Initialize and start WakeSupervisor listening for "Hey Aven"
  supervisor = new WakeSupervisor();
  supervisor.on("ready", (info) => {
    console.log("[Electron] 🎙️ Aven Wake Word detector is active and listening for 'Hey Aven':", info);
  });

  supervisor.on("wake", (payload) => {
    // Strict keyword and confidence filter: ensure only verified "Hey Aven" activates the HUD
    if (payload.keyword !== "Hey Aven" || (typeof payload.confidence === "number" && payload.confidence < 0.78)) {
      console.log("[Electron] Discarded below-threshold wake trigger:", payload);
      return;
    }
    console.log("[Electron] ⚡ Verified 'Hey Aven' wake detected:", payload);
    if (isHudEnabled && hudWindow && !hudWindow.isDestroyed()) {
      hudSummonSource = "voice";
      hasHoveredHud = false;
      hudWindow.show();
      hudWindow.focus();
      supervisor?.setConversationActive(true);
      hudWindow.webContents.send("desktop:aven-wake", payload);
    }
    mainWindow?.webContents.send("desktop:aven-wake", payload);
  });

  supervisor.on("speech", (payload: any) => {
    console.log(`[Electron] 🗣️ Forwarding user speech to HUD: "${payload.transcribed}"`);
    if (isHudEnabled && hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
      hudWindow.webContents.send("desktop:aven-speech", payload);
    }
  });

  supervisor.on("debug", (data) => {
    console.log(
      `[Aven Ear] Speech detected: confidence=${data.confidence?.toFixed(2)} (threshold=${data.threshold}), rms=${data.rms?.toFixed(3)}`
    );
  });

  supervisor.on("error", (err) => {
    console.warn("[Electron] WakeSupervisor warning/error:", err);
  });

  supervisor.on("crashed", (info) => {
    console.warn("[Electron] WakeSupervisor halted after max retries:", info);
  });

  // Start detector process on boot
  supervisor.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopAuthLoopbackServer();
  supervisor?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in tray
  }
});
