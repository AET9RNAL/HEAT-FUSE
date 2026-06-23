import { createRequire } from "node:module";
import { BrowserWindow, app, ipcMain, powerMonitor, safeStorage } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
//#region electron/main.ts
createRequire(import.meta.url);
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win;
function createWindow() {
	win = new BrowserWindow({
		icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		webPreferences: { preload: path.join(__dirname, "preload.mjs") }
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(RENDERER_DIST, "index.html"));
}
ipcMain.handle("safe-storage:is-available", () => {
	return safeStorage.isEncryptionAvailable();
});
ipcMain.handle("safe-storage:encrypt", (_event, value) => {
	return safeStorage.encryptString(value).toJSON();
});
ipcMain.handle("safe-storage:decrypt", (_event, buf) => {
	return safeStorage.decryptString(Buffer.from(buf.data));
});
ipcMain.handle("app:set-autostart", (_event, value) => {
	app.setLoginItemSettings({ openAtLogin: value });
});
app.whenReady().then(() => {
	createWindow();
	powerMonitor.on("suspend", () => {
		win?.webContents.send("app:suspended");
	});
	powerMonitor.on("resume", () => {
		win?.webContents.send("app:resumed");
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
