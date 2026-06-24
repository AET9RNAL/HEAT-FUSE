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
	closeWindow: () => electron.ipcRenderer.invoke("window:close"),
	minimizeWindow: () => electron.ipcRenderer.invoke("window:minimize"),
	maximizeWindow: () => electron.ipcRenderer.invoke("window:maximize")
});
electron.contextBridge.exposeInMainWorld("fuseAPI", {
	spawn: () => electron.ipcRenderer.invoke("fuse:spawn"),
	kill: () => electron.ipcRenderer.invoke("fuse:kill"),
	status: () => electron.ipcRenderer.invoke("fuse:status"),
	onExited: (cb) => electron.ipcRenderer.on("fuse:exited", (_event, data) => cb(data)),
	offExited: () => electron.ipcRenderer.removeAllListeners("fuse:exited")
});
//#endregion
