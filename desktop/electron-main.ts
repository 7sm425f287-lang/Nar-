import { app, BrowserWindow, nativeImage, ipcMain } from "electron";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const isDev = !app.isPackaged;
let backendProc: ReturnType<typeof spawn> | null = null;

function backendUrl() {
  return process.env.NIRO_BACKEND_URL || "http://localhost:8001";
}

function startBackend() {
  if (process.env.NIRO_DESKTOP_START_BACKEND === "0") return;

  const script = process.platform === "win32" ? "dev.sh" : "./dev.sh";
  backendProc = spawn(script, ["start"], {
    cwd: path.resolve(__dirname, "../../backend"),
    shell: true,
    env: { ...process.env }
  });

  backendProc.stdout?.on("data", data =>
    console.log("[backend]", data.toString())
  );
  backendProc.stderr?.on("data", data =>
    console.error("[backend]", data.toString())
  );
}

function createWindow() {
  const iconPath = path.join(__dirname, "icons", "app.png");
  const icon = nativeImage.createFromPath(iconPath);
  const preloadJs = path.join(__dirname, "preload.js");
  const preloadTs = path.join(__dirname, "preload.ts");
  const preloadPath = existsSync(preloadJs) ? preloadJs : preloadTs;

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: "Niro Chat",
    icon,
    webPreferences: {
      preload: preloadPath
    }
  });

  const url = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../../frontend/dist/index.html")}`;
  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProc) {
    backendProc.kill();
    backendProc = null;
  }
});

ipcMain.handle("get-backend-url", () => backendUrl());
