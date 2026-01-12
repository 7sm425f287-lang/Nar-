import { app, BrowserWindow, nativeImage, ipcMain } from "electron";
import * as path from "node:path";
import * as net from "node:net";
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

// Determine development mode safely without accessing `app.isPackaged` at module-eval time.
// Prefer explicit env overrides; fall back to checking `app.isPackaged` once app is ready.
const _envIsDev = process.env.NODE_ENV === "development" || process.env.NIRO_DESKTOP_DEV === "1";
let isDev = _envIsDev;

// Safe backend URL helper
function backendUrl() {
  return process.env.NIRO_BACKEND_URL || "http://127.0.0.1:8001";
}

// Start backend helper (optional, controlled by env)
function startBackend() {
  if (process.env.NIRO_DESKTOP_START_BACKEND === "0") return null;
  const script = process.platform === "win32" ? "dev.sh" : "./dev.sh";
  const proc = spawn(script, ["start"], {
    cwd: path.resolve(__dirname, "../../backend"),
    shell: true,
    env: { ...process.env },
  });
  proc.stdout?.on("data", (d) => console.log("[backend]", d.toString()));
  proc.stderr?.on("data", (d) => console.error("[backend]", d.toString()));
  return proc;
}

// IPC handlers for renderer (registered at module load)
ipcMain.handle("get-backend-url", () => backendUrl());
ipcMain.handle("get-principles", async () => {
  try {
    const principlesPath = path.resolve(__dirname, "../../system/principles.md");
    const content = readFileSync(principlesPath, { encoding: "utf-8" });
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

function createWindow() { 
  const iconPath = path.join(__dirname, "icons", "app.png");
  const icon = nativeImage.createFromPath(iconPath);
  // Log icon info and force-set dock icon on macOS to avoid default icon.
  try {
    console.log('[electron] iconPath=', iconPath, 'iconEmpty=', icon ? icon.isEmpty() : 'no-icon');
  } catch (e) { /* ignore logging errors */ }
  if (process.platform === "darwin" && typeof (app as any).dock !== "undefined") {
    try {
      (app as any).dock.setIcon(icon);
      console.log('[electron] dock.setIcon called');
    } catch (e) {
      console.warn('[electron] dock.setIcon failed', e);
    }
  }

  

  const preloadPath = path.join(__dirname, "preload.js");
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    icon,
    backgroundColor: "#0b0b0b",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = "http://localhost:5173";
  const prodUrl = `file://${path.join(__dirname, "../../frontend/dist/index.html")}`;
  const debugLogPath = path.resolve(app.getPath("userData"), "electron-debug.log");
  const logLoadError = (target: string, err: unknown) => {
    const detail = err instanceof Error ? (err.stack || err.message) : String(err);
    const line = `[${new Date().toISOString()}] loadURL failed (${target}): ${detail}\n`;
    try {
      appendFileSync(debugLogPath, line, { encoding: "utf-8" });
    } catch (writeErr) {
      console.error("[electron] failed to write electron-debug.log", writeErr);
    }
  };
  // Probe local dev server quickly; fall back to built `dist` if not reachable.
  const isPortOpen = (host: string, port: number, timeout = 300) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(timeout, () => {
        socket.destroy();
        resolve(false);
      });
    });

  (async () => {
    const devAvailable = (process.env.NIRO_DESKTOP_DEV === "1") || (await isPortOpen("127.0.0.1", 5173, 300));
    const url = devAvailable ? devUrl : prodUrl;
    try {
      await win.loadURL(url);
    } catch (err) {
      logLoadError(url, err);
    }
    if (devAvailable) win.webContents.openDevTools({ mode: "detach" });
  })();

  // IPC handlers are registered once at module scope; no-op here.
}

app.whenReady().then(() => {
  // refine isDev using app.isPackaged when available
  try {
    if (typeof app !== "undefined" && app && typeof (app as any).isPackaged !== "undefined") {
      isDev = _envIsDev || !(app as any).isPackaged;
    }
  } catch (err) {
    console.warn("Could not read app.isPackaged; using env-driven isDev", err);
  }
  // start backend optionally
  if (isDev) startBackend();
  createWindow();
  // Read and log principles.md at startup so we can verify Layer 0 -> Layer 3 integration
  try {
    const principlesPath = path.resolve(__dirname, "../../system/principles.md");
    const principlesContent = readFileSync(principlesPath, { encoding: "utf-8" });
    console.log('[principles] loaded (truncated 200 chars):\n', principlesContent.slice(0, 200));
  } catch (err) {
    console.warn('[principles] could not load principles.md', String(err));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
