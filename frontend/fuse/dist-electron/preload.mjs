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
	setAutostart: (value) => electron.ipcRenderer.invoke("app:set-autostart", value)
});
//#endregion
