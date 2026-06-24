import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, powerMonitor, safeStorage } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win = null;
var tray = null;
var isQuitting = false;
var minimizeToTrayOnStart = false;
var minimizeToTrayOnClose = false;
var fuseProcess = null;
var fusePort = null;
function createTray() {
	if (tray) return;
	const iconPath = VITE_DEV_SERVER_URL ? path.join(__dirname, "..", "build", "icon.png") : path.join(process.resourcesPath, "icon.ico");
	tray = new Tray(nativeImage.createFromPath(iconPath));
	tray.setToolTip("FUSE");
	tray.setContextMenu(Menu.buildFromTemplate([
		{
			label: "Show",
			click: () => {
				win?.show();
				win?.focus();
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				isQuitting = true;
				app.quit();
			}
		}
	]));
	tray.on("click", () => {
		win?.show();
		win?.focus();
	});
}
function destroyTray() {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
function createWindow() {
	win = new BrowserWindow({
		frame: false,
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: true,
		fullscreenable: false,
		transparent: true,
		backgroundColor: "rgba(0, 0, 0, 0.0)",
		backgroundMaterial: "acrylic",
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			devTools: true,
			preload: path.join(__dirname, "preload.mjs")
		}
	});
	win.webContents.on("before-input-event", (event, input) => {
		if (input.type === "keyDown" && input.control && input.key.toLowerCase() === "r") event.preventDefault();
	});
	win.on("close", (e) => {
		if (minimizeToTrayOnClose && win && !isQuitting) {
			e.preventDefault();
			win.hide();
		}
	});
	win.on("hide", () => {
		win?.webContents.send("app:suspended");
	});
	win.on("show", () => {
		win?.webContents.send("app:resumed");
	});
	win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({ responseHeaders: {
			...details.responseHeaders,
			"Content-Security-Policy": [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://*.betterstackdata.com https://us.i.posthog.com https://us-assets.i.posthog.com; frame-src ${VITE_DEV_SERVER_URL ? "http://localhost:*" : "'none'"}; object-src 'none'; base-uri 'self'`]
		} });
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(RENDERER_DIST, "index.html"));
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
var fuseCleanupDone = false;
app.on("before-quit", (event) => {
	isQuitting = true;
	if (fuseCleanupDone) return;
	if (!fuseProcess) {
		fuseCleanupDone = true;
		return;
	}
	event.preventDefault();
	const proc = fuseProcess;
	fuseProcess = null;
	fusePort = null;
	const forceKill = setTimeout(() => proc.kill("SIGKILL"), 3e3);
	proc.once("exit", () => {
		clearTimeout(forceKill);
		fuseCleanupDone = true;
		app.quit();
	});
	proc.kill("SIGTERM");
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
	createWindow();
	powerMonitor.on("suspend", () => {
		win?.webContents.send("app:suspended");
	});
	powerMonitor.on("resume", () => {
		win?.webContents.send("app:resumed");
	});
	ipcMain.handle("window:close", () => {
		(BrowserWindow.getFocusedWindow() || win)?.close();
	});
	ipcMain.handle("window:minimize", () => {
		(BrowserWindow.getFocusedWindow() || win)?.minimize();
	});
	ipcMain.handle("window:maximize", () => {
		const target = BrowserWindow.getFocusedWindow() || win;
		if (!target) return;
		target.isMaximized() ? target.unmaximize() : target.maximize();
	});
	ipcMain.handle("fuse:spawn", async () => {
		if (fuseProcess) return {
			success: false,
			error: "already running"
		};
		const isDev = !!VITE_DEV_SERVER_URL;
		const command = isDev ? "python" : path.join(process.resourcesPath, "fuse.exe");
		const args = isDev ? [path.join(process.env.APP_ROOT, "..", "..", "run_heat_overlay.py")] : [];
		return new Promise((resolve) => {
			const proc = spawn(command, args, {
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: true
			});
			let settled = false;
			let stdoutBuf = "";
			const timeout = setTimeout(() => {
				if (!settled) {
					settled = true;
					proc.kill();
					resolve({
						success: false,
						error: "spawn timeout"
					});
				}
			}, 1e4);
			proc.stdout?.on("data", (chunk) => {
				stdoutBuf += chunk.toString();
				const nl = stdoutBuf.indexOf("\n");
				if (nl === -1) return;
				const line = stdoutBuf.slice(0, nl).trim();
				try {
					const { port, connectionToken } = JSON.parse(line);
					if (port && connectionToken && !settled) {
						settled = true;
						clearTimeout(timeout);
						fuseProcess = proc;
						fusePort = port;
						proc.on("exit", (code, signal) => {
							fuseProcess = null;
							fusePort = null;
							if (!isQuitting) win?.webContents.send("fuse:exited", {
								code: code ?? null,
								signal: signal ?? null
							});
						});
						resolve({
							success: true,
							pid: proc.pid,
							port,
							connectionToken
						});
					}
				} catch {}
			});
			proc.on("error", (err) => {
				if (!settled) {
					settled = true;
					clearTimeout(timeout);
					resolve({
						success: false,
						error: err.message
					});
				}
			});
			proc.on("exit", (code) => {
				if (!settled) {
					settled = true;
					clearTimeout(timeout);
					resolve({
						success: false,
						error: `exited early with code ${code}`
					});
				}
			});
		});
	});
	ipcMain.handle("fuse:kill", async () => {
		if (!fuseProcess) return { success: true };
		return new Promise((resolve) => {
			const proc = fuseProcess;
			const t = setTimeout(() => proc.kill("SIGKILL"), 3e3);
			proc.once("exit", () => {
				clearTimeout(t);
				resolve({ success: true });
			});
			proc.kill("SIGTERM");
		});
	});
	ipcMain.handle("fuse:status", () => ({
		running: !!fuseProcess,
		pid: fuseProcess?.pid ?? null,
		port: fusePort
	}));
	ipcMain.handle("safe-storage:is-available", () => safeStorage.isEncryptionAvailable());
	ipcMain.handle("safe-storage:encrypt", (_event, value) => safeStorage.encryptString(value).toJSON());
	ipcMain.handle("safe-storage:decrypt", (_event, buf) => safeStorage.decryptString(Buffer.from(buf.data)));
	ipcMain.handle("app:set-autostart", (_event, value) => {
		app.setLoginItemSettings({ openAtLogin: value });
	});
	ipcMain.handle("app:set-minimize-to-tray-on-start", (_event, enabled) => {
		minimizeToTrayOnStart = enabled;
		if (enabled) createTray();
		else if (!minimizeToTrayOnClose) destroyTray();
	});
	ipcMain.handle("app:apply-minimize-to-tray-on-start", () => {
		if (minimizeToTrayOnStart && win && app.getLoginItemSettings().wasOpenedAtLogin) win.hide();
	});
	ipcMain.handle("app:set-minimize-to-tray-on-close", (_event, enabled) => {
		minimizeToTrayOnClose = enabled;
		if (enabled) createTray();
		else if (!minimizeToTrayOnStart) destroyTray();
	});
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
