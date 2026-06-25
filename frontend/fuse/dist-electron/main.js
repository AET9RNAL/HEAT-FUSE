import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, powerMonitor, safeStorage, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "module";
//#region node_modules/fflate/esm/index.mjs
var require = createRequire("/");
var _a;
try {
	_a = require("worker_threads"), _a.Worker, _a.isMarkedAsUntransferable;
} catch (e) {}
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
var fleb = new u8([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]);
var fdeb = new u8([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]);
var clim = new u8([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]);
var freb = function(eb, start) {
	var b = new u16(31);
	for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
	var r = new i32(b[30]);
	for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
	return {
		b,
		r
	};
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
_b.r;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
	var x = (i & 43690) >> 1 | (i & 21845) << 1;
	x = (x & 52428) >> 2 | (x & 13107) << 2;
	x = (x & 61680) >> 4 | (x & 3855) << 4;
	rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
	var s = cd.length;
	var i = 0;
	var l = new u16(mb);
	for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
	var le = new u16(mb);
	for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
	var co;
	if (r) {
		co = new u16(1 << mb);
		var rvb = 15 - mb;
		for (i = 0; i < s; ++i) if (cd[i]) {
			var sv = i << 4 | cd[i];
			var r_1 = mb - cd[i];
			var v = le[cd[i] - 1]++ << r_1;
			for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
		}
	} else {
		co = new u16(s);
		for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
	}
	return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
var flrm = /*#__PURE__*/ hMap(flt, 9, 1), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
var max = function(a) {
	var m = a[0];
	for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
	return m;
};
var bits = function(d, p, m) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
	return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	return new u8(v.subarray(s, e));
};
var ec = [
	"unexpected EOF",
	"invalid block type",
	"invalid length/literal",
	"invalid distance",
	"stream finished",
	"no stream handler",
	,
	"no callback",
	"invalid UTF-8 data",
	"extra field too long",
	"date not in range 1980-2099",
	"filename too long",
	"stream finishing",
	"invalid zip data"
];
var err = function(ind, msg, nt) {
	var e = new Error(msg || ec[ind]);
	e.code = ind;
	if (Error.captureStackTrace) Error.captureStackTrace(e, err);
	if (!nt) throw e;
	return e;
};
var inflt = function(dat, st, buf, dict) {
	var sl = dat.length, dl = dict ? dict.length : 0;
	if (!sl || st.f && !st.l) return buf || new u8(0);
	var noBuf = !buf;
	var resize = noBuf || st.i != 2;
	var noSt = st.i;
	if (noBuf) buf = new u8(sl * 3);
	var cbuf = function(l) {
		var bl = buf.length;
		if (l > bl) {
			var nbuf = new u8(Math.max(bl * 2, l));
			nbuf.set(buf);
			buf = nbuf;
		}
	};
	var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	var tbts = sl * 8;
	do {
		if (!lm) {
			final = bits(dat, pos, 1);
			var type = bits(dat, pos + 1, 3);
			pos += 3;
			if (!type) {
				var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
				if (t > sl) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + l);
				buf.set(dat.subarray(s, t), bt);
				st.b = bt += l, st.p = pos = t * 8, st.f = final;
				continue;
			} else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
			else if (type == 2) {
				var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
				var tl = hLit + bits(dat, pos + 5, 31) + 1;
				pos += 14;
				var ldt = new u8(tl);
				var clt = new u8(19);
				for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
				pos += hcLen * 3;
				var clb = max(clt), clbmsk = (1 << clb) - 1;
				var clm = hMap(clt, clb, 1);
				for (var i = 0; i < tl;) {
					var r = clm[bits(dat, pos, clbmsk)];
					pos += r & 15;
					var s = r >> 4;
					if (s < 16) ldt[i++] = s;
					else {
						var c = 0, n = 0;
						if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
						else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
						else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
						while (n--) ldt[i++] = c;
					}
				}
				var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
				lbt = max(lt);
				dbt = max(dt);
				lm = hMap(lt, lbt, 1);
				dm = hMap(dt, dbt, 1);
			} else err(1);
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
		}
		if (resize) cbuf(bt + 131072);
		var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
		var lpos = pos;
		for (;; lpos = pos) {
			var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
			pos += c & 15;
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
			if (!c) err(2);
			if (sym < 256) buf[bt++] = sym;
			else if (sym == 256) {
				lpos = pos, lm = null;
				break;
			} else {
				var add = sym - 254;
				if (sym > 264) {
					var i = sym - 257, b = fleb[i];
					add = bits(dat, pos, (1 << b) - 1) + fl[i];
					pos += b;
				}
				var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
				if (!d) err(3);
				pos += d & 15;
				var dt = fd[dsym];
				if (dsym > 3) {
					var b = fdeb[dsym];
					dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
				}
				if (pos > tbts) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + 131072);
				var end = bt + add;
				if (bt < dt) {
					var shift = dl - dt, dend = Math.min(dt, end);
					if (shift + bt < 0) err(3);
					for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
				}
				for (; bt < end; ++bt) buf[bt] = buf[bt - dt];
			}
		}
		st.l = lm, st.p = lpos, st.b = bt, st.f = final;
		if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	} while (!final);
	return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /*#__PURE__*/ new u8(0);
var b2 = function(d, b) {
	return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
	return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
	return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
	return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
try {
	td.decode(et, { stream: true });
} catch (e) {}
var dutf8 = function(d) {
	for (var r = "", i = 0;;) {
		var c = d[i++];
		var eb = (c > 127) + (c > 223) + (c > 239);
		if (i + eb > d.length) return {
			s: r,
			r: slc(d, i - 1)
		};
		if (!eb) r += String.fromCharCode(c);
		else if (eb == 3) c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
		else if (eb & 1) r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
		else r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
	}
};
/**
* Converts a Uint8Array to a string
* @param dat The data to decode to string
* @param latin1 Whether or not to interpret the data as Latin-1. This should
*               not need to be true unless encoding to binary string.
* @returns The original UTF-8/Latin-1 string
*/
function strFromU8(dat, latin1) {
	if (latin1) {
		var r = "";
		for (var i = 0; i < dat.length; i += 16384) r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
		return r;
	} else if (td) return td.decode(dat);
	else {
		var _a = dutf8(dat), s = _a.s, r = _a.r;
		if (r.length) err(8);
		return s;
	}
}
var slzh = function(d, b) {
	return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
	var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
	var _a = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a[0], su = _a[1], off = _a[2];
	return [
		b2(d, b + 10),
		sc,
		su,
		fn,
		es + efl + b2(d, b + 32),
		off
	];
};
var z64hs = function(d, b, l, z, sc, su, off) {
	var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
	var nf = nsc + nsu + noff;
	if (z && nf) {
		for (; b + 4 < e; b += 4 + b2(d, b + 2)) if (b2(d, b) == 1) return [
			nsc ? b8(d, b + 4 + 8 * nsu) : sc,
			nsu ? b8(d, b + 4) : su,
			noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
			1
		];
		if (z < 2) err(13);
	}
	return [
		sc,
		su,
		off,
		0
	];
};
/**
* Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
* performance with more than one file.
* @param data The raw compressed ZIP file
* @param opts The ZIP extraction options
* @returns The decompressed files
*/
function unzipSync(data, opts) {
	var files = {};
	var e = data.length - 22;
	for (; b4(data, e) != 101010256; --e) if (!e || data.length - e > 65558) err(13);
	var c = b2(data, e + 8);
	if (!c) return {};
	var o = b4(data, e + 16);
	var z = b4(data, e - 20) == 117853008;
	if (z) {
		var ze = b4(data, e - 12);
		z = b4(data, ze) == 101075792;
		if (z) {
			c = b4(data, ze + 32);
			o = b4(data, ze + 48);
		}
	}
	var fltr = opts && opts.filter;
	for (var i = 0; i < c; ++i) {
		var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
		o = no;
		if (!fltr || fltr({
			name: fn,
			size: sc,
			originalSize: su,
			compression: c_2
		})) if (!c_2) files[fn] = slc(data, b, b + sc);
		else if (c_2 == 8) files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
		else err(14, "unknown compression type " + c_2);
	}
	return files;
}
//#endregion
//#region electron/main.ts
var execFileAsync = promisify(execFile);
var __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
function getConfigsDir() {
	return !!VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "..", "..", "backend", "data", "configs") : path.join(app.getPath("userData"), "configs");
}
function readHostConfig() {
	const p = path.join(getConfigsDir(), "fuse_host.json");
	if (!fs.existsSync(p)) return {
		disabled_plugins: [],
		enabled_plugins: null,
		extra_plugin_dirs: []
	};
	return JSON.parse(fs.readFileSync(p, "utf-8"));
}
function writeHostConfig(cfg) {
	const dir = getConfigsDir();
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "fuse_host.json"), JSON.stringify(cfg, null, 2), "utf-8");
}
function getPluginDirs() {
	const isDev = !!VITE_DEV_SERVER_URL;
	const root = isDev ? path.join(process.env.APP_ROOT, "..", "..") : process.resourcesPath;
	return {
		core: path.join(root, isDev ? "backend" : "", "fuse", "plugins"),
		user: path.join(root, isDev ? "backend" : "", "plugins")
	};
}
function scanPluginsDir(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir).filter((f) => f.endsWith(".fuse")).flatMap((file) => {
		try {
			const buf = fs.readFileSync(path.join(dir, file));
			const entries = unzipSync(new Uint8Array(buf), { filter: (f) => f.name.endsWith("/manifest.json") });
			const manifestKey = Object.keys(entries).find((k) => k.endsWith("/manifest.json"));
			if (!manifestKey) return [];
			const m = JSON.parse(strFromU8(entries[manifestKey]));
			return [{
				plugin_id: m.plugin_id ?? m.id ?? path.basename(file, ".fuse"),
				name: m.name ?? path.basename(file, ".fuse"),
				version: m.version ?? "0.0.0",
				description: m.description ?? "",
				author: m.author,
				status: "pending",
				configSchema: m.config_schema ?? [],
				hotkeys: m.hotkeys ?? [],
				filePath: path.join(dir, file)
			}];
		} catch {
			return [];
		}
	});
}
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
			"Content-Security-Policy": [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://*.betterstackdata.com https://us.i.posthog.com https://us-assets.i.posthog.com https://unpkg.com; frame-src ${VITE_DEV_SERVER_URL ? "http://localhost:*" : "'none'"}; object-src 'none'; base-uri 'self'`]
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
		let executable;
		let args;
		let spawnEnv;
		if (isDev) {
			const backendRoot = path.join(process.env.APP_ROOT, "..", "..", "backend");
			const venvPython = path.join(backendRoot, ".venv", "Scripts", "python.exe");
			const requirementsTxt = path.join(backendRoot, "fuse", "requirements.txt");
			try {
				if (!fs.existsSync(venvPython)) await execFileAsync("python", [
					"-m",
					"venv",
					path.join(backendRoot, ".venv")
				]);
				await execFileAsync(venvPython, [
					"-m",
					"pip",
					"install",
					"-r",
					requirementsTxt,
					"--quiet"
				]);
			} catch (e) {
				return {
					success: false,
					error: `venv setup failed: ${e.message}`
				};
			}
			executable = venvPython;
			args = [path.join(backendRoot, "fuse", "run_fuse.py")];
			spawnEnv = {
				...process.env,
				PYTHONPATH: backendRoot
			};
		} else {
			executable = path.join(process.resourcesPath, "fuse-backend.dist", "fuse-backend.exe");
			args = [];
			spawnEnv = {
				...process.env,
				FUSE_PLUGIN_DIRS: [path.join(process.resourcesPath, "fuse", "plugins"), path.join(process.resourcesPath, "plugins")].join(";")
			};
		}
		return new Promise((resolve) => {
			const proc = spawn(executable, args, {
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: true,
				env: spawnEnv
			});
			let settled = false;
			let stdoutBuf = "";
			let stderrBuf = "";
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
			const sendLog = (line) => {
				if (!line) return;
				const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
				if (!clean) return;
				let level = "info";
				const m = clean.match(/\|\s*(DEBUG|INFO|SUCCESS|WARNING|ERROR|CRITICAL)\s*\|/);
				if (m) {
					if (m[1] === "ERROR" || m[1] === "CRITICAL") level = "error";
					else if (m[1] === "WARNING") level = "warn";
					else if (m[1] === "DEBUG") level = "debug";
				}
				win?.webContents.send("fuse:log", {
					level,
					text: clean,
					timestamp: Date.now()
				});
			};
			proc.stderr?.on("data", (chunk) => {
				stderrBuf += chunk.toString();
				let nl;
				while ((nl = stderrBuf.indexOf("\n")) !== -1) {
					const line = stderrBuf.slice(0, nl).trim();
					stderrBuf = stderrBuf.slice(nl + 1);
					if (line) sendLog(line);
				}
			});
			proc.stdout?.on("data", (chunk) => {
				stdoutBuf += chunk.toString();
				let nl;
				while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
					const line = stdoutBuf.slice(0, nl).trim();
					stdoutBuf = stdoutBuf.slice(nl + 1);
					if (!line) continue;
					if (!settled) try {
						const { port, connectionToken } = JSON.parse(line);
						if (port && connectionToken) {
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
					else sendLog(line);
				}
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
						error: `exited early with code ${code}: ${stderrBuf.trim()}`
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
	ipcMain.handle("plugins:scan", () => {
		const { core, user } = getPluginDirs();
		return [...scanPluginsDir(core), ...scanPluginsDir(user)];
	});
	ipcMain.handle("plugins:show-file", (_event, filePath) => {
		shell.showItemInFolder(filePath);
	});
	ipcMain.handle("plugins:delete", (_event, filePath) => {
		try {
			fs.unlinkSync(filePath);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
	ipcMain.handle("dialog:select-dir", async () => {
		const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
		return result.canceled ? null : result.filePaths[0] ?? null;
	});
	ipcMain.handle("config:host:read", () => readHostConfig());
	const hostCfgPath = path.join(getConfigsDir(), "fuse_host.json");
	if (fs.existsSync(hostCfgPath)) {
		let debounce = null;
		fs.watch(hostCfgPath, () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				win?.webContents.send("config:host:changed", readHostConfig());
			}, 150);
		});
	}
	ipcMain.handle("config:plugin:set-enabled", (_event, pluginId, enabled) => {
		try {
			const cfg = readHostConfig();
			const disabled = cfg.disabled_plugins ?? [];
			cfg.disabled_plugins = enabled ? disabled.filter((id) => id !== pluginId) : disabled.includes(pluginId) ? disabled : [...disabled, pluginId];
			writeHostConfig(cfg);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
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
	ipcMain.handle("app:open-backend-dir", () => {
		const dir = !!VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "..", "..", "backend") : process.resourcesPath;
		return shell.openPath(dir);
	});
	ipcMain.handle("config:plugin:read", (_event, pluginId) => {
		try {
			const p = path.join(getConfigsDir(), `fuse_${pluginId}.json`);
			if (!fs.existsSync(p)) return {};
			return JSON.parse(fs.readFileSync(p, "utf-8"));
		} catch {
			return {};
		}
	});
	ipcMain.handle("config:plugin:write-key", (_event, pluginId, key, value) => {
		try {
			const dir = getConfigsDir();
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			const p = path.join(dir, `fuse_${pluginId}.json`);
			const current = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
			current[key] = value;
			fs.writeFileSync(p, JSON.stringify(current, null, 2), "utf-8");
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
	ipcMain.handle("hotkey:write-override", (_event, pluginId, action, combo) => {
		try {
			const cfg = readHostConfig();
			cfg.hotkey_overrides ??= {};
			cfg.hotkey_overrides[pluginId] ??= {};
			cfg.hotkey_overrides[pluginId][action] = combo;
			writeHostConfig(cfg);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
	ipcMain.handle("game:scan-dir", (_event, dirPath) => {
		try {
			let version;
			const gameInfoPath = path.join(dirPath, "game_info.xml");
			if (fs.existsSync(gameInfoPath)) {
				const m = fs.readFileSync(gameInfoPath, "utf-8").match(/<version_name>(.*?)<\/version_name>/);
				if (m) version = m[1].trim();
			}
			const hasProject = fs.existsSync(path.join(dirPath, "coldwar.project"));
			return {
				version,
				hasProject
			};
		} catch (e) {
			return { error: e.message };
		}
	});
	ipcMain.handle("game:check-debugger", (_event, dirPath) => {
		try {
			const projectPath = path.join(dirPath, "coldwar.project");
			const content = fs.readFileSync(projectPath, "utf-8");
			return {
				success: true,
				enabled: /"Enable Debugger"\s*:\s*true/.test(content)
			};
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
	ipcMain.handle("game:enable-debugger", (_event, dirPath) => {
		try {
			const projectPath = path.join(dirPath, "coldwar.project");
			let content = fs.readFileSync(projectPath, "utf-8");
			content = content.replace(/"Debugger Port"\s*:\s*\d+/g, "\"Debugger Port\": 9222");
			content = content.replace(/"Enable Debugger"\s*:\s*false/g, "\"Enable Debugger\": true");
			fs.writeFileSync(projectPath, content, "utf-8");
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
	ipcMain.handle("game:disable-debugger", (_event, dirPath) => {
		try {
			const projectPath = path.join(dirPath, "coldwar.project");
			let content = fs.readFileSync(projectPath, "utf-8");
			content = content.replace(/"Enable Debugger"\s*:\s*true/g, "\"Enable Debugger\": false");
			fs.writeFileSync(projectPath, content, "utf-8");
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e.message
			};
		}
	});
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
