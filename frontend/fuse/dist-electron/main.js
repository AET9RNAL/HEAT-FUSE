import { BrowserWindow as e, Menu as t, Tray as n, app as r, ipcMain as i, nativeImage as a, powerMonitor as o, safeStorage as s } from "electron";
import { spawn as c } from "node:child_process";
import { fileURLToPath as l } from "node:url";
import u from "node:path";
//#region electron/main.ts
var d = u.dirname(l(import.meta.url));
process.env.APP_ROOT = u.join(d, "..");
var f = process.env.VITE_DEV_SERVER_URL, p = u.join(process.env.APP_ROOT, "dist-electron"), m = u.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = f ? u.join(process.env.APP_ROOT, "public") : m;
var h = null, g = null, _ = !1, v = !1, y = !1, b = null, x = null;
function S() {
	if (g) return;
	let e = f ? u.join(d, "..", "build", "icon.png") : u.join(process.resourcesPath, "icon.ico");
	g = new n(a.createFromPath(e)), g.setToolTip("FUSE"), g.setContextMenu(t.buildFromTemplate([
		{
			label: "Show",
			click: () => {
				h?.show(), h?.focus();
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				_ = !0, r.quit();
			}
		}
	])), g.on("click", () => {
		h?.show(), h?.focus();
	});
}
function C() {
	g &&= (g.destroy(), null);
}
function w() {
	h = new e({
		frame: !1,
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: !0,
		fullscreenable: !1,
		transparent: !1,
		backgroundColor: "#00000000",
		backgroundMaterial: "acrylic",
		webPreferences: {
			nodeIntegration: !1,
			contextIsolation: !0,
			devTools: !0,
			preload: u.join(d, "preload.mjs")
		}
	}), h.webContents.on("before-input-event", (e, t) => {
		t.type === "keyDown" && t.control && t.key.toLowerCase() === "r" && e.preventDefault();
	}), h.on("close", (e) => {
		y && h && !_ && (e.preventDefault(), h.hide());
	}), h.on("hide", () => {
		h?.webContents.send("app:suspended");
	}), h.on("show", () => {
		h?.webContents.send("app:resumed");
	}), h.webContents.session.webRequest.onHeadersReceived((e, t) => {
		t({ responseHeaders: {
			...e.responseHeaders,
			"Content-Security-Policy": [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://*.betterstackdata.com https://us.i.posthog.com https://us-assets.i.posthog.com; frame-src ${f ? "http://localhost:*" : "'none'"}; object-src 'none'; base-uri 'self'`]
		} });
	}), f ? h.loadURL(f) : h.loadFile(u.join(m, "index.html"));
}
r.on("window-all-closed", () => {
	process.platform !== "darwin" && (r.quit(), h = null);
});
var T = !1;
r.on("before-quit", (e) => {
	if (_ = !0, T) return;
	if (!b) {
		T = !0;
		return;
	}
	e.preventDefault();
	let t = b;
	b = null, x = null;
	let n = setTimeout(() => t.kill("SIGKILL"), 3e3);
	t.once("exit", () => {
		clearTimeout(n), T = !0, r.quit();
	}), t.kill("SIGTERM");
}), r.on("activate", () => {
	e.getAllWindows().length === 0 && w();
}), r.whenReady().then(() => {
	w(), o.on("suspend", () => {
		h?.webContents.send("app:suspended");
	}), o.on("resume", () => {
		h?.webContents.send("app:resumed");
	}), i.handle("window:close", () => {
		(e.getFocusedWindow() || h)?.close();
	}), i.handle("window:minimize", () => {
		(e.getFocusedWindow() || h)?.minimize();
	}), i.handle("window:maximize", () => {
		let t = e.getFocusedWindow() || h;
		t && (t.isMaximized() ? t.unmaximize() : t.maximize());
	}), i.handle("fuse:spawn", async () => {
		if (b) return {
			success: !1,
			error: "already running"
		};
		let e = !!f, t = e ? "python" : u.join(process.resourcesPath, "fuse.exe"), n = e ? [u.join(process.env.APP_ROOT, "..", "..", "run_heat_overlay.py")] : [];
		return new Promise((e) => {
			let r = c(t, n, {
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: !0
			}), i = !1, a = "", o = setTimeout(() => {
				i || (i = !0, r.kill(), e({
					success: !1,
					error: "spawn timeout"
				}));
			}, 1e4);
			r.stdout?.on("data", (t) => {
				a += t.toString();
				let n = a.indexOf("\n");
				if (n === -1) return;
				let s = a.slice(0, n).trim();
				try {
					let { port: t, connectionToken: n } = JSON.parse(s);
					t && n && !i && (i = !0, clearTimeout(o), b = r, x = t, r.on("exit", (e, t) => {
						b = null, x = null, _ || h?.webContents.send("fuse:exited", {
							code: e ?? null,
							signal: t ?? null
						});
					}), e({
						success: !0,
						pid: r.pid,
						port: t,
						connectionToken: n
					}));
				} catch {}
			}), r.on("error", (t) => {
				i || (i = !0, clearTimeout(o), e({
					success: !1,
					error: t.message
				}));
			}), r.on("exit", (t) => {
				i || (i = !0, clearTimeout(o), e({
					success: !1,
					error: `exited early with code ${t}`
				}));
			});
		});
	}), i.handle("fuse:kill", async () => b ? new Promise((e) => {
		let t = b, n = setTimeout(() => t.kill("SIGKILL"), 3e3);
		t.once("exit", () => {
			clearTimeout(n), e({ success: !0 });
		}), t.kill("SIGTERM");
	}) : { success: !0 }), i.handle("fuse:status", () => ({
		running: !!b,
		pid: b?.pid ?? null,
		port: x
	})), i.handle("safe-storage:is-available", () => s.isEncryptionAvailable()), i.handle("safe-storage:encrypt", (e, t) => s.encryptString(t).toJSON()), i.handle("safe-storage:decrypt", (e, t) => s.decryptString(Buffer.from(t.data))), i.handle("app:set-autostart", (e, t) => {
		r.setLoginItemSettings({ openAtLogin: t });
	}), i.handle("app:set-minimize-to-tray-on-start", (e, t) => {
		v = t, t ? S() : y || C();
	}), i.handle("app:apply-minimize-to-tray-on-start", () => {
		v && h && r.getLoginItemSettings().wasOpenedAtLogin && h.hide();
	}), i.handle("app:set-minimize-to-tray-on-close", (e, t) => {
		y = t, t ? S() : v || C();
	});
});
//#endregion
export { p as MAIN_DIST, m as RENDERER_DIST, f as VITE_DEV_SERVER_URL };
