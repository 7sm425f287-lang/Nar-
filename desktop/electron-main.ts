import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Tray } from "electron";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import * as http from "node:http";
import * as path from "node:path";
import {
  appendFileSync,
  accessSync,
  constants as fsConstants,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";

delete process.env.ELECTRON_RUN_AS_NODE;
app.disableHardwareAcceleration();

const APP_NAME = "Mφrlin";
const BACKEND_NAME = "Mφrlin-Backend";
const LOG_PREFIX = "moerlin.desktop";
const RUNTIME_LOG_FILE = "moerlin-backend.log";
const BACKEND_HOST = "127.0.0.1";
const DEFAULT_BACKEND_PORT = 8001;
const BACKEND_BOOT_TIMEOUT_MS = 60_000;
const BACKEND_POLL_INTERVAL_MS = 500;
const BACKEND_STOP_TIMEOUT_MS = 6_000;
const HTTP_REQUEST_TIMEOUT_MS = 3_000;
const FALLBACK_MODEL = "gpt-4o-mini";
const DEFAULT_LAUNCHER_SHORTCUT = process.env.MOERLIN_GLOBAL_SHORTCUT || "Option+Space";

type RuntimePaths = {
  projectRoot: string;
  appPath: string;
  desktopDir: string;
  backendDir: string;
  venvDir: string;
  frontendIndex: string;
  preloadPath: string;
  principlesPath: string;
  cloudEnvPath: string;
  pythonBin: string;
  backendLogPath: string;
};

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStartedByApp = false;
let currentBackendUrl = "";
let quitting = false;
let cleanupInProgress = false;
let bootstrapPromise: Promise<void> | null = null;
let runtimePaths: RuntimePaths | null = null;
let tray: Tray | null = null;
let runtimeLogPath = path.resolve(process.cwd(), "desktop", RUNTIME_LOG_FILE);

function logDesktop(message: string) {
  console.log(`[${LOG_PREFIX}] ${message}`);
  try {
    mkdirSync(path.dirname(runtimeLogPath), { recursive: true });
    appendFileSync(runtimeLogPath, `[${new Date().toISOString()}] ${message}\n`, "utf-8");
  } catch (error) {
    console.error(`[${LOG_PREFIX}] failed to append bootstrap log`, error);
  }
}

function logErrorWithStack(prefix: string, error: unknown) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  logDesktop(`${prefix}: ${detail}`);
}

function readLogTail(filePath: string, maxChars = 2200): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.slice(-maxChars);
  } catch {
    return "";
  }
}

function loadNativeImage(...segments: string[]) {
  return nativeImage.createFromPath(path.join(__dirname, ...segments));
}

function appIcon() {
  return loadNativeImage("icons", "app.png");
}

function trayIcon() {
  const image = loadNativeImage("icons", "narphi-icon.png");
  if (image.isEmpty()) {
    return image;
  }
  return image.resize({ width: 18, height: 18 });
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const out: Record<string, string> = {};
  const raw = readFileSync(filePath, "utf-8");
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function existingExecutable(candidates: string[]): string {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  throw new Error("No usable Python runtime found for desktop bootstrap.");
}

function resolveProjectRoot(): string {
  const appPath = path.resolve(app.getAppPath());
  const packagedRuntime = process.resourcesPath
    ? path.resolve(process.resourcesPath, "runtime")
    : "";
  const candidates = [
    process.env.NIRO_PROJECT_ROOT,
    packagedRuntime,
    path.resolve(appPath, ".."),
    path.resolve(appPath, "../.."),
    path.resolve(appPath, "../../.."),
    path.resolve(__dirname, "../.."),
    process.cwd(),
  ].filter(Boolean) as string[];

  logDesktop(`app.getAppPath()=${appPath}`);
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    logDesktop(`project-root candidate=${root}`);
    const backendApp = path.join(root, "backend", "app.py");
    const backendPkg = path.join(root, "backend", "app", "__init__.py");
    const frontendIndex = path.join(root, "frontend", "dist", "index.html");
    if ((existsSync(backendApp) || existsSync(backendPkg)) && existsSync(frontendIndex)) {
      logDesktop(`project-root selected=${root}`);
      return root;
    }
  }

  throw new Error(
    "Project root not found. Expected backend/app.py and frontend/dist/index.html near the desktop bundle."
  );
}

function resolveRuntimePaths(): RuntimePaths {
  const projectRoot = resolveProjectRoot();
  const appPath = path.resolve(app.getAppPath());
  const desktopDir = app.isPackaged ? app.getPath("userData") : path.join(projectRoot, "desktop");
  const backendDir = path.join(projectRoot, "backend");
  const venvDir = path.join(backendDir, ".venv");
  const pythonBin = existingExecutable([
    path.join(venvDir, "bin", "python"),
    path.join(venvDir, "bin", "python3.12"),
  ]);

  runtimeLogPath = path.join(desktopDir, RUNTIME_LOG_FILE);
  logDesktop(`desktop-dir=${desktopDir}`);
  logDesktop(`backend-dir=${backendDir}`);
  logDesktop(`venv-dir=${venvDir}`);
  logDesktop(`python-bin=${pythonBin}`);

  return {
    projectRoot,
    appPath,
    desktopDir,
    backendDir,
    venvDir,
    frontendIndex: path.join(projectRoot, "frontend", "dist", "index.html"),
    preloadPath: path.join(__dirname, "preload.js"),
    principlesPath: path.join(projectRoot, "system", "principles.md"),
    cloudEnvPath: path.join(backendDir, ".env.cloud"),
    pythonBin,
    backendLogPath: runtimeLogPath,
  };
}

function buildBackendEnv(paths: RuntimePaths, port: number): NodeJS.ProcessEnv {
  const runtimeKeys = [
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "SHELL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USER",
    "WINDIR",
    "REQUESTS_CA_BUNDLE",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ] as const;

  const baseEnv: NodeJS.ProcessEnv = {};
  for (const key of runtimeKeys) {
    const value = process.env[key];
    if (value) {
      baseEnv[key] = value;
    }
  }

  const cloudEnv = parseEnvFile(paths.cloudEnvPath);
  const pythonPathParts = [paths.projectRoot, process.env.PYTHONPATH].filter(Boolean);
  const merged: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...cloudEnv,
    NIRO_ENV: "cloud",
    NIRO_LLM: "openai",
    PORT: String(port),
    PYTHONPATH: pythonPathParts.join(path.delimiter),
    PYTHONUNBUFFERED: "1",
    MODEL_NAME: cloudEnv.MODEL_NAME || process.env.MODEL_NAME || FALLBACK_MODEL,
  };

  if (!merged.OPENAI_API_KEY) {
    throw new Error(
      `Cloud mode requires OPENAI_API_KEY. Missing in ${paths.cloudEnvPath} and current process environment.`
    );
  }

  return merged;
}

function backendUrl(port: number) {
  return `http://${BACKEND_HOST}:${port}`;
}

function httpGet(urlString: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.get(urlString, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({ statusCode: response.statusCode || 0, body });
      });
    });
    request.on("error", reject);
    request.setTimeout(HTTP_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timeout: ${urlString}`));
    });
  });
}

async function isBackendHealthy(port: number): Promise<boolean> {
  try {
    const response = await httpGet(`${backendUrl(port)}/health`);
    return response.statusCode >= 200 && response.statusCode < 300;
  } catch {
    return false;
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, BACKEND_HOST);
  });
}

function listPortOwners(port: number): number[] {
  if (process.platform === "win32") {
    return [];
  }

  const candidates = ["/usr/sbin/lsof", "/usr/bin/lsof"];
  for (const binary of candidates) {
    if (!existsSync(binary)) {
      continue;
    }
    const result = spawnSync(binary, ["-ti", `tcp:${port}`], { encoding: "utf-8" });
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    if (result.status !== 0 && !stdout.trim()) {
      return [];
    }
    return stdout
      .split(/\r?\n/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
  }
  return [];
}

async function ensurePortReady(port: number): Promise<{ reuseExisting: boolean }> {
  if (await isBackendHealthy(port)) {
    logDesktop(`port ${port} already serves a healthy backend; reusing existing process`);
    return { reuseExisting: true };
  }

  if (await isPortAvailable(port)) {
    logDesktop(`port ${port} is free`);
    return { reuseExisting: false };
  }

  const owners = listPortOwners(port);
  if (owners.length === 0) {
    throw new Error(`Port ${port} is occupied by an unknown process and could not be identified.`);
  }

  logDesktop(`port ${port} occupied by PID(s) ${owners.join(", ")}; attempting release`);
  for (const pid of owners) {
    try {
      process.kill(pid, "SIGKILL");
      logDesktop(`killed PID ${pid} on port ${port}`);
    } catch (error) {
      logErrorWithStack(`failed to kill PID ${pid} on port ${port}`, error);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  if (!(await isPortAvailable(port))) {
    throw new Error(`Port ${port} remains occupied after release attempt. Check ${runtimeLogPath}.`);
  }

  logDesktop(`port ${port} released successfully`);
  return { reuseExisting: false };
}

async function waitForBackend(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const port = Number(new URL(url).port);
  while (Date.now() < deadline) {
    if (await isBackendHealthy(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, BACKEND_POLL_INTERVAL_MS));
  }
  return false;
}

function attachBackendLogging(child: ChildProcess, logPath: string) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const stream = createWriteStream(logPath, { flags: "a", encoding: "utf-8" });
  stream.write(`\n[${new Date().toISOString()}] desktop bootstrap start\n`);
  child.stdout?.on("data", (chunk) => {
    stream.write(chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    stream.write(chunk.toString());
  });
  child.once("error", (error) => {
    stream.write(`[${new Date().toISOString()}] backend spawn error: ${String(error)}\n`);
  });
  child.once("exit", (code, signal) => {
    stream.write(`[${new Date().toISOString()}] backend exit code=${String(code)} signal=${String(signal)}\n`);
    stream.end();
  });
}

function showLauncherWindow(win: BrowserWindow) {
  if (win.isDestroyed()) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.center();
  win.show();
  win.focus();
  win.moveTop();
}

function hideLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.hide();
}

function toggleLauncherWindow() {
  if (!runtimePaths) {
    logDesktop("toggle requested before runtime paths were ready");
    return;
  }

  const win = ensureLauncherWindow(runtimePaths);
  if (win.isVisible() && win.isFocused()) {
    logDesktop("launcher toggle -> hide");
    hideLauncherWindow();
    return;
  }

  logDesktop("launcher toggle -> show");
  showLauncherWindow(win);
}

async function startManagedBackend(paths: RuntimePaths): Promise<string> {
  const preferredPort = Number(process.env.NIRO_BACKEND_PORT || DEFAULT_BACKEND_PORT);
  const portState = await ensurePortReady(preferredPort);
  const url = backendUrl(preferredPort);

  if (portState.reuseExisting) {
    logDesktop(`reusing existing backend at ${url}`);
    currentBackendUrl = url;
    backendStartedByApp = false;
    return url;
  }

  const env = buildBackendEnv(paths, preferredPort);
  const args = [
    "-m",
    "uvicorn",
    "--app-dir",
    paths.projectRoot,
    "backend.app:app",
    "--host",
    BACKEND_HOST,
    "--port",
    String(preferredPort),
  ];

  logDesktop(`spawn cwd=${paths.projectRoot}`);
  logDesktop(`spawn python=${paths.pythonBin}`);
  logDesktop(`spawn args=${args.join(" ")}`);
  logDesktop(`cloud env file=${paths.cloudEnvPath}`);
  logDesktop(`venv exists=${String(existsSync(paths.venvDir))}`);
  logDesktop(`starting ${BACKEND_NAME} child on ${url}`);
  const child = spawn(paths.pythonBin, args, {
    cwd: paths.projectRoot,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  attachBackendLogging(child, paths.backendLogPath);
  backendProcess = child;
  backendStartedByApp = true;
  currentBackendUrl = url;

  const exitedEarly = new Promise<never>((_, reject) => {
    child.once("exit", (code, signal) => {
      reject(new Error(`Backend exited before ready (code=${String(code)}, signal=${String(signal)}).`));
    });
  });
  const spawnError = new Promise<never>((_, reject) => {
    child.once("error", (error) => {
      reject(error);
    });
  });

  await Promise.race([
    (async () => {
      const ready = await waitForBackend(url, BACKEND_BOOT_TIMEOUT_MS);
      if (!ready) {
        throw new Error(`Backend did not answer on ${url} within ${BACKEND_BOOT_TIMEOUT_MS}ms.`);
      }
    })(),
    exitedEarly,
    spawnError,
  ]);

  return url;
}

async function stopManagedBackend(): Promise<void> {
  if (!backendProcess || !backendStartedByApp) {
    backendProcess = null;
    return;
  }

  const child = backendProcess;
  backendProcess = null;
  backendStartedByApp = false;

  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    } else if (child.pid) {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // ignore termination races
  }

  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, BACKEND_STOP_TIMEOUT_MS)),
  ]);

  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

function createLauncherWindow(paths: RuntimePaths) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const icon = appIcon();
  if (process.platform === "darwin" && !icon.isEmpty()) {
    try {
      app.dock.setIcon(icon);
    } catch {
      // ignore dock icon failures
    }
  }

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 620,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    roundedCorners: true,
    resizable: true,
    hasShadow: true,
    title: APP_NAME,
    icon,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: paths.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    logDesktop("launcher window ready");
    showLauncherWindow(win);
  });
  win.on("close", (event) => {
    if (quitting) {
      return;
    }
    event.preventDefault();
    logDesktop("launcher window close intercepted -> hide");
    win.hide();
  });
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
  win.on("blur", () => {
    if (quitting) {
      return;
    }
    setTimeout(() => {
      if (!quitting && !win.isDestroyed() && !win.isFocused()) {
        logDesktop("launcher window blur -> hide");
        win.hide();
      }
    }, 120);
  });

  win.webContents.on("did-finish-load", () => {
    logDesktop(`renderer finished load: ${paths.frontendIndex}`);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    const message = `renderer failed load code=${errorCode} url=${validatedURL} detail=${errorDescription}`;
    logDesktop(message);
    dialog.showErrorBox(`${APP_NAME} Renderer Fehler`, `${message}\n\nLog: ${runtimeLogPath}`);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logDesktop(`renderer console level=${level} source=${sourceId}:${line} message=${message}`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logDesktop(`render process gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  logDesktop(`frontend-index=${paths.frontendIndex}`);
  void win.loadFile(paths.frontendIndex).catch((error) => {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    logDesktop(`loadFile rejected: ${detail}`);
    dialog.showErrorBox(`${APP_NAME} Frontend Fehler`, `${detail}\n\nLog: ${runtimeLogPath}`);
  });
  win.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  logDesktop("launcher window created");
  mainWindow = win;
  return win;
}

function ensureLauncherWindow(paths: RuntimePaths) {
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing && !existing.isDestroyed()) {
    mainWindow = existing;
    return existing;
  }

  return createLauncherWindow(paths);
}

function createTray(paths: RuntimePaths) {
  if (tray) {
    return tray;
  }

  const icon = trayIcon();
  tray = new Tray(icon.isEmpty() ? appIcon() : icon);
  tray.setToolTip(APP_NAME);
  tray.on("click", () => {
    toggleLauncherWindow();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `${APP_NAME} anzeigen`,
        click: () => showLauncherWindow(ensureLauncherWindow(paths)),
      },
      {
        label: `${APP_NAME} ausblenden`,
        click: () => hideLauncherWindow(),
      },
      { type: "separator" },
      {
        label: "Beenden",
        click: () => {
          app.quit();
        },
      },
    ]),
  );
  logDesktop("tray initialized");
  return tray;
}

function registerLauncherShortcut() {
  globalShortcut.unregisterAll();
  const success = globalShortcut.register(DEFAULT_LAUNCHER_SHORTCUT, () => {
    toggleLauncherWindow();
  });
  if (!success) {
    logDesktop(`failed to register global shortcut ${DEFAULT_LAUNCHER_SHORTCUT}`);
    return;
  }
  logDesktop(`registered global shortcut ${DEFAULT_LAUNCHER_SHORTCUT}`);
}

function loadPrinciples(paths: RuntimePaths): { ok: true; content: string } | { ok: false; error: string } {
  try {
    return { ok: true, content: readFileSync(paths.principlesPath, { encoding: "utf-8" }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function registerProcessCleanup() {
  const cleanup = async () => {
    await stopManagedBackend();
  };

  process.once("SIGINT", () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.once("exit", () => {
    void stopManagedBackend();
  });
}

function installGlobalErrorHooks() {
  process.on("uncaughtException", (error) => {
    logErrorWithStack("uncaughtException", error);
    dialog.showErrorBox(
      `${APP_NAME} – Kritischer Fehler`,
      `${error instanceof Error ? error.stack || error.message : String(error)}\n\nLog: ${runtimeLogPath}`,
    );
  });
  process.on("unhandledRejection", (reason) => {
    logErrorWithStack("unhandledRejection", reason);
    dialog.showErrorBox(
      `${APP_NAME} – Unhandled Rejection`,
      `${reason instanceof Error ? reason.stack || reason.message : String(reason)}\n\nLog: ${runtimeLogPath}`,
    );
  });
}

async function bootstrap() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    installGlobalErrorHooks();
    const paths = resolveRuntimePaths();
    runtimePaths = paths;
    registerProcessCleanup();

    ipcMain.handle("get-backend-url", () => currentBackendUrl);
    ipcMain.handle("get-principles", async () => loadPrinciples(paths));

    try {
      currentBackendUrl = await startManagedBackend(paths);
      registerLauncherShortcut();
      createTray(paths);
      showLauncherWindow(ensureLauncherWindow(paths));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const tail = readLogTail(paths.backendLogPath);
      logErrorWithStack("bootstrap failed", error);
      await stopManagedBackend();
      dialog.showErrorBox(
        `${APP_NAME} Bootstrap fehlgeschlagen`,
        `${message}\n\nLog: ${paths.backendLogPath}${tail ? `\n\nLetzte Backend-Ausgabe:\n${tail}` : ""}`,
      );
      app.quit();
    }
  })();

  return bootstrapPromise;
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (cleanupInProgress) {
    return;
  }
  if (!quitting && backendStartedByApp) {
    event.preventDefault();
    cleanupInProgress = true;
    quitting = true;
    void stopManagedBackend().finally(() => {
      cleanupInProgress = false;
      app.quit();
    });
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
});

app.on("activate", () => {
  if (!runtimePaths) {
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0 && currentBackendUrl) {
    try {
      showLauncherWindow(ensureLauncherWindow(runtimePaths));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox(APP_NAME, message);
    }
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    showLauncherWindow(mainWindow);
  }
});
