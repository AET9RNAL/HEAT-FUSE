let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
	on(...args) {
		const [channel, listener] = args;
		return electron.ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
	},
	off(...args) {
		const [channel, ...omit] = args;
		return electron.ipcRenderer.off(channel, ...omit);
	},
	send(...args) {
		const [channel, ...omit] = args;
		return electron.ipcRenderer.send(channel, ...omit);
	},
	invoke(...args) {
		const [channel, ...omit] = args;
		return electron.ipcRenderer.invoke(channel, ...omit);
	}
});
electron.contextBridge.exposeInMainWorld("safeStorageAPI", {
	isAvailable: () => electron.ipcRenderer.invoke("safe-storage:is-available"),
	encrypt: (value) => electron.ipcRenderer.invoke("safe-storage:encrypt", value),
	decrypt: (buf) => electron.ipcRenderer.invoke("safe-storage:decrypt", buf)
});
electron.contextBridge.exposeInMainWorld("appAPI", {
	onSuspended: (cb) => electron.ipcRenderer.on("app:suspended", cb),
	onResumed: (cb) => electron.ipcRenderer.on("app:resumed", cb),
	setAutostart: (value) => electron.ipcRenderer.invoke("app:set-autostart", value),
	setMinimizeToTrayOnStart: (value) => electron.ipcRenderer.invoke("app:set-minimize-to-tray-on-start", value),
	applyMinimizeToTrayOnStart: () => electron.ipcRenderer.invoke("app:apply-minimize-to-tray-on-start"),
	setMinimizeToTrayOnClose: (value) => electron.ipcRenderer.invoke("app:set-minimize-to-tray-on-close", value),
	openBackendDir: () => electron.ipcRenderer.invoke("app:open-backend-dir"),
	closeWindow: () => electron.ipcRenderer.invoke("window:close"),
	minimizeWindow: () => electron.ipcRenderer.invoke("window:minimize"),
	maximizeWindow: () => electron.ipcRenderer.invoke("window:maximize")
});
electron.contextBridge.exposeInMainWorld("pluginsAPI", {
	scan: () => electron.ipcRenderer.invoke("plugins:scan"),
	showFile: (filePath) => electron.ipcRenderer.invoke("plugins:show-file", filePath),
	deleteFile: (filePath) => electron.ipcRenderer.invoke("plugins:delete", filePath)
});
electron.contextBridge.exposeInMainWorld("dialogAPI", { selectDir: () => electron.ipcRenderer.invoke("dialog:select-dir") });
electron.contextBridge.exposeInMainWorld("configAPI", {
	readHost: () => electron.ipcRenderer.invoke("config:host:read"),
	setPluginEnabled: (pluginId, enabled) => electron.ipcRenderer.invoke("config:plugin:set-enabled", pluginId, enabled),
	onHostChanged: (cb) => electron.ipcRenderer.on("config:host:changed", (_event, cfg) => cb(cfg)),
	offHostChanged: () => electron.ipcRenderer.removeAllListeners("config:host:changed")
});
electron.contextBridge.exposeInMainWorld("pluginConfigAPI", {
	readPlugin: (pluginId) => electron.ipcRenderer.invoke("config:plugin:read", pluginId),
	writeKey: (pluginId, key, value) => electron.ipcRenderer.invoke("config:plugin:write-key", pluginId, key, value),
	writeHotkeyOverride: (pluginId, action, combo) => electron.ipcRenderer.invoke("hotkey:write-override", pluginId, action, combo)
});
electron.contextBridge.exposeInMainWorld("updateAPI", {
	check: () => electron.ipcRenderer.invoke("update:check"),
	download: () => electron.ipcRenderer.invoke("update:download"),
	install: () => electron.ipcRenderer.invoke("update:install"),
	onChecking: (cb) => electron.ipcRenderer.on("update:checking", () => cb()),
	onAvailable: (cb) => electron.ipcRenderer.on("update:available", (_e, data) => cb(data)),
	onNotAvailable: (cb) => electron.ipcRenderer.on("update:not-available", (_e, data) => cb(data)),
	onProgress: (cb) => electron.ipcRenderer.on("update:progress", (_e, data) => cb(data)),
	onDownloaded: (cb) => electron.ipcRenderer.on("update:downloaded", (_e, data) => cb(data)),
	onError: (cb) => electron.ipcRenderer.on("update:error", (_e, data) => cb(data)),
	offAll: () => [
		"update:checking",
		"update:available",
		"update:not-available",
		"update:progress",
		"update:downloaded",
		"update:error"
	].forEach((ch) => electron.ipcRenderer.removeAllListeners(ch))
});
electron.contextBridge.exposeInMainWorld("gameAPI", {
	scanDir: (dirPath) => electron.ipcRenderer.invoke("game:scan-dir", dirPath),
	checkDebugger: (dirPath) => electron.ipcRenderer.invoke("game:check-debugger", dirPath),
	enableDebugger: (dirPath) => electron.ipcRenderer.invoke("game:enable-debugger", dirPath),
	disableDebugger: (dirPath) => electron.ipcRenderer.invoke("game:disable-debugger", dirPath)
});
electron.contextBridge.exposeInMainWorld("fuseAPI", {
	spawn: () => electron.ipcRenderer.invoke("fuse:spawn"),
	kill: () => electron.ipcRenderer.invoke("fuse:kill"),
	status: () => electron.ipcRenderer.invoke("fuse:status"),
	onExited: (cb) => electron.ipcRenderer.on("fuse:exited", (_event, data) => cb(data)),
	offExited: () => electron.ipcRenderer.removeAllListeners("fuse:exited"),
	onLog: (cb) => electron.ipcRenderer.on("fuse:log", (_event, entry) => cb(entry)),
	offLog: () => electron.ipcRenderer.removeAllListeners("fuse:log")
});
//#endregion
