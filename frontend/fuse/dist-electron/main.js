import { BrowserWindow as e, Menu as t, Tray as n, app as r, dialog as i, ipcMain as a, nativeImage as o, powerMonitor as s, safeStorage as c, shell as l } from "electron";
import { execFile as u, spawn as d } from "node:child_process";
import { promisify as f } from "node:util";
import { fileURLToPath as p } from "node:url";
import m from "node:path";
import h from "node:fs";
import { createRequire as g } from "module";
//#region node_modules/fflate/esm/index.mjs
var _ = g("/"), v;
try {
	v = _("worker_threads"), v.Worker, v.isMarkedAsUntransferable;
} catch {}
var y = Uint8Array, b = Uint16Array, x = Int32Array, ee = new y([
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
]), te = new y([
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
]), ne = new y([
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
]), S = function(e, t) {
	for (var n = new b(31), r = 0; r < 31; ++r) n[r] = t += 1 << e[r - 1];
	for (var i = new x(n[30]), r = 1; r < 30; ++r) for (var a = n[r]; a < n[r + 1]; ++a) i[a] = a - n[r] << 5 | r;
	return {
		b: n,
		r: i
	};
}, v = S(ee, 2), re = v.b, C = v.r;
re[28] = 258, C[258] = 28;
var w = S(te, 0), ie = w.b;
w.r;
for (var T = new b(32768), E = 0; E < 32768; ++E) {
	var D = (E & 43690) >> 1 | (E & 21845) << 1;
	D = (D & 52428) >> 2 | (D & 13107) << 2, D = (D & 61680) >> 4 | (D & 3855) << 4, T[E] = ((D & 65280) >> 8 | (D & 255) << 8) >> 1;
}
for (var O = (function(e, t, n) {
	for (var r = e.length, i = 0, a = new b(t); i < r; ++i) e[i] && ++a[e[i] - 1];
	var o = new b(t);
	for (i = 1; i < t; ++i) o[i] = o[i - 1] + a[i - 1] << 1;
	var s;
	if (n) {
		s = new b(1 << t);
		var c = 15 - t;
		for (i = 0; i < r; ++i) if (e[i]) for (var l = i << 4 | e[i], u = t - e[i], d = o[e[i] - 1]++ << u, f = d | (1 << u) - 1; d <= f; ++d) s[T[d] >> c] = l;
	} else for (s = new b(r), i = 0; i < r; ++i) e[i] && (s[i] = T[o[e[i] - 1]++] >> 15 - e[i]);
	return s;
}), k = new y(288), E = 0; E < 144; ++E) k[E] = 8;
for (var E = 144; E < 256; ++E) k[E] = 9;
for (var E = 256; E < 280; ++E) k[E] = 7;
for (var E = 280; E < 288; ++E) k[E] = 8;
for (var A = new y(32), E = 0; E < 32; ++E) A[E] = 5;
var ae = /*#__PURE__*/ O(k, 9, 1), oe = /*#__PURE__*/ O(A, 5, 1), j = function(e) {
	for (var t = e[0], n = 1; n < e.length; ++n) e[n] > t && (t = e[n]);
	return t;
}, M = function(e, t, n) {
	var r = t / 8 | 0;
	return (e[r] | e[r + 1] << 8) >> (t & 7) & n;
}, N = function(e, t) {
	var n = t / 8 | 0;
	return (e[n] | e[n + 1] << 8 | e[n + 2] << 16) >> (t & 7);
}, se = function(e) {
	return (e + 7) / 8 | 0;
}, ce = function(e, t, n) {
	return (t == null || t < 0) && (t = 0), (n == null || n > e.length) && (n = e.length), new y(e.subarray(t, n));
}, le = [
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
], P = function(e, t, n) {
	var r = Error(t || le[e]);
	if (r.code = e, Error.captureStackTrace && Error.captureStackTrace(r, P), !n) throw r;
	return r;
}, ue = function(e, t, n, r) {
	var i = e.length, a = r ? r.length : 0;
	if (!i || t.f && !t.l) return n || new y(0);
	var o = !n, s = o || t.i != 2, c = t.i;
	o && (n = new y(i * 3));
	var l = function(e) {
		var t = n.length;
		if (e > t) {
			var r = new y(Math.max(t * 2, e));
			r.set(n), n = r;
		}
	}, u = t.f || 0, d = t.p || 0, f = t.b || 0, p = t.l, m = t.d, h = t.m, g = t.n, _ = i * 8;
	do {
		if (!p) {
			u = M(e, d, 1);
			var v = M(e, d + 1, 3);
			if (d += 3, !v) {
				var b = se(d) + 4, x = e[b - 4] | e[b - 3] << 8, S = b + x;
				if (S > i) {
					c && P(0);
					break;
				}
				s && l(f + x), n.set(e.subarray(b, S), f), t.b = f += x, t.p = d = S * 8, t.f = u;
				continue;
			} else if (v == 1) p = ae, m = oe, h = 9, g = 5;
			else if (v == 2) {
				var C = M(e, d, 31) + 257, w = M(e, d + 10, 15) + 4, T = C + M(e, d + 5, 31) + 1;
				d += 14;
				for (var E = new y(T), D = new y(19), k = 0; k < w; ++k) D[ne[k]] = M(e, d + k * 3, 7);
				d += w * 3;
				for (var A = j(D), le = (1 << A) - 1, ue = O(D, A, 1), k = 0; k < T;) {
					var de = ue[M(e, d, le)];
					d += de & 15;
					var b = de >> 4;
					if (b < 16) E[k++] = b;
					else {
						var F = 0, I = 0;
						for (b == 16 ? (I = 3 + M(e, d, 3), d += 2, F = E[k - 1]) : b == 17 ? (I = 3 + M(e, d, 7), d += 3) : b == 18 && (I = 11 + M(e, d, 127), d += 7); I--;) E[k++] = F;
					}
				}
				var L = E.subarray(0, C), R = E.subarray(C);
				h = j(L), g = j(R), p = O(L, h, 1), m = O(R, g, 1);
			} else P(1);
			if (d > _) {
				c && P(0);
				break;
			}
		}
		s && l(f + 131072);
		for (var z = (1 << h) - 1, fe = (1 << g) - 1, B = d;; B = d) {
			var F = p[N(e, d) & z], V = F >> 4;
			if (d += F & 15, d > _) {
				c && P(0);
				break;
			}
			if (F || P(2), V < 256) n[f++] = V;
			else if (V == 256) {
				B = d, p = null;
				break;
			} else {
				var H = V - 254;
				if (V > 264) {
					var k = V - 257, U = ee[k];
					H = M(e, d, (1 << U) - 1) + re[k], d += U;
				}
				var W = m[N(e, d) & fe], G = W >> 4;
				W || P(3), d += W & 15;
				var R = ie[G];
				if (G > 3) {
					var U = te[G];
					R += N(e, d) & (1 << U) - 1, d += U;
				}
				if (d > _) {
					c && P(0);
					break;
				}
				s && l(f + 131072);
				var K = f + H;
				if (f < R) {
					var q = a - R, pe = Math.min(R, K);
					for (q + f < 0 && P(3); f < pe; ++f) n[f] = r[q + f];
				}
				for (; f < K; ++f) n[f] = n[f - R];
			}
		}
		t.l = p, t.p = B, t.b = f, t.f = u, p && (u = 1, t.m = h, t.d = m, t.n = g);
	} while (!u);
	return f != n.length && o ? ce(n, 0, f) : n.subarray(0, f);
}, de = /*#__PURE__*/ new y(0), F = function(e, t) {
	return e[t] | e[t + 1] << 8;
}, I = function(e, t) {
	return (e[t] | e[t + 1] << 8 | e[t + 2] << 16 | e[t + 3] << 24) >>> 0;
}, L = function(e, t) {
	return I(e, t) + I(e, t + 4) * 4294967296;
};
function R(e, t) {
	return ue(e, { i: 2 }, t && t.out, t && t.dictionary);
}
var z = typeof TextDecoder < "u" && /*#__PURE__*/ new TextDecoder();
try {
	z.decode(de, { stream: !0 });
} catch {}
var fe = function(e) {
	for (var t = "", n = 0;;) {
		var r = e[n++], i = (r > 127) + (r > 223) + (r > 239);
		if (n + i > e.length) return {
			s: t,
			r: ce(e, n - 1)
		};
		i ? i == 3 ? (r = ((r & 15) << 18 | (e[n++] & 63) << 12 | (e[n++] & 63) << 6 | e[n++] & 63) - 65536, t += String.fromCharCode(55296 | r >> 10, 56320 | r & 1023)) : i & 1 ? t += String.fromCharCode((r & 31) << 6 | e[n++] & 63) : t += String.fromCharCode((r & 15) << 12 | (e[n++] & 63) << 6 | e[n++] & 63) : t += String.fromCharCode(r);
	}
};
function B(e, t) {
	if (t) {
		for (var n = "", r = 0; r < e.length; r += 16384) n += String.fromCharCode.apply(null, e.subarray(r, r + 16384));
		return n;
	} else if (z) return z.decode(e);
	else {
		var i = fe(e), a = i.s, n = i.r;
		return n.length && P(8), a;
	}
}
var V = function(e, t) {
	return t + 30 + F(e, t + 26) + F(e, t + 28);
}, H = function(e, t, n) {
	var r = F(e, t + 28), i = F(e, t + 30), a = B(e.subarray(t + 46, t + 46 + r), !(F(e, t + 8) & 2048)), o = t + 46 + r, s = U(e, o, i, n, I(e, t + 20), I(e, t + 24), I(e, t + 42)), c = s[0], l = s[1], u = s[2];
	return [
		F(e, t + 10),
		c,
		l,
		a,
		o + i + F(e, t + 32),
		u
	];
}, U = function(e, t, n, r, i, a, o) {
	var s = i == 4294967295, c = a == 4294967295, l = o == 4294967295, u = t + n, d = s + c + l;
	if (r && d) {
		for (; t + 4 < u; t += 4 + F(e, t + 2)) if (F(e, t) == 1) return [
			s ? L(e, t + 4 + 8 * c) : i,
			c ? L(e, t + 4) : a,
			l ? L(e, t + 4 + 8 * (c + s)) : o,
			1
		];
		r < 2 && P(13);
	}
	return [
		i,
		a,
		o,
		0
	];
};
function W(e, t) {
	for (var n = {}, r = e.length - 22; I(e, r) != 101010256; --r) (!r || e.length - r > 65558) && P(13);
	var i = F(e, r + 8);
	if (!i) return {};
	var a = I(e, r + 16), o = I(e, r - 20) == 117853008;
	if (o) {
		var s = I(e, r - 12);
		o = I(e, s) == 101075792, o && (i = I(e, s + 32), a = I(e, s + 48));
	}
	for (var c = t && t.filter, l = 0; l < i; ++l) {
		var u = H(e, a, o), d = u[0], f = u[1], p = u[2], m = u[3], h = u[4], g = u[5], _ = V(e, g);
		a = h, (!c || c({
			name: m,
			size: f,
			originalSize: p,
			compression: d
		})) && (d ? d == 8 ? n[m] = R(e.subarray(_, _ + f), { out: new y(p) }) : P(14, "unknown compression type " + d) : n[m] = ce(e, _, _ + f));
	}
	return n;
}
//#endregion
//#region electron/main.ts
var G = f(u), K = m.dirname(p(import.meta.url));
process.env.APP_ROOT = m.join(K, "..");
var q = process.env.VITE_DEV_SERVER_URL, pe = m.join(process.env.APP_ROOT, "dist-electron"), me = m.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = q ? m.join(process.env.APP_ROOT, "public") : me;
function J() {
	return q ? m.join(process.env.APP_ROOT, "..", "..", "backend", "data", "configs") : m.join(r.getPath("userData"), "configs");
}
function he() {
	let e = m.join(J(), "fuse_host.json");
	return h.existsSync(e) ? JSON.parse(h.readFileSync(e, "utf-8")) : {
		disabled_plugins: [],
		enabled_plugins: null,
		extra_plugin_dirs: []
	};
}
function ge(e) {
	let t = J();
	h.existsSync(t) || h.mkdirSync(t, { recursive: !0 }), h.writeFileSync(m.join(t, "fuse_host.json"), JSON.stringify(e, null, 2), "utf-8");
}
function _e() {
	let e = !!q, t = e ? m.join(process.env.APP_ROOT, "..", "..") : process.resourcesPath;
	return {
		core: m.join(t, e ? "backend" : "", "fuse", "plugins"),
		user: m.join(t, e ? "backend" : "", "plugins")
	};
}
function ve(e) {
	return h.existsSync(e) ? h.readdirSync(e).filter((e) => e.endsWith(".fuse")).flatMap((t) => {
		try {
			let n = h.readFileSync(m.join(e, t)), r = W(new Uint8Array(n), { filter: (e) => e.name.endsWith("/manifest.json") }), i = Object.keys(r).find((e) => e.endsWith("/manifest.json"));
			if (!i) return [];
			let a = JSON.parse(B(r[i]));
			return [{
				plugin_id: a.plugin_id ?? a.id ?? m.basename(t, ".fuse"),
				name: a.name ?? m.basename(t, ".fuse"),
				version: a.version ?? "0.0.0",
				description: a.description ?? "",
				author: a.author,
				status: "pending",
				configSchema: a.config_schema ?? [],
				hotkeys: a.hotkeys ?? [],
				filePath: m.join(e, t)
			}];
		} catch {
			return [];
		}
	}) : [];
}
var Y = null, X = null, Z = !1, ye = !1, be = !1, Q = null, $ = null;
function xe() {
	if (X) return;
	let e = q ? m.join(K, "..", "build", "icon.png") : m.join(process.resourcesPath, "icon.ico");
	X = new n(o.createFromPath(e)), X.setToolTip("FUSE"), X.setContextMenu(t.buildFromTemplate([
		{
			label: "Show",
			click: () => {
				Y?.show(), Y?.focus();
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				Z = !0, r.quit();
			}
		}
	])), X.on("click", () => {
		Y?.show(), Y?.focus();
	});
}
function Se() {
	X &&= (X.destroy(), null);
}
function Ce() {
	Y = new e({
		frame: !1,
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: !0,
		fullscreenable: !1,
		transparent: !0,
		backgroundColor: "rgba(0, 0, 0, 0.0)",
		backgroundMaterial: "acrylic",
		webPreferences: {
			nodeIntegration: !1,
			contextIsolation: !0,
			devTools: !0,
			preload: m.join(K, "preload.mjs")
		}
	}), Y.webContents.on("before-input-event", (e, t) => {
		t.type === "keyDown" && t.control && t.key.toLowerCase() === "r" && e.preventDefault();
	}), Y.on("close", (e) => {
		be && Y && !Z && (e.preventDefault(), Y.hide());
	}), Y.on("hide", () => {
		Y?.webContents.send("app:suspended");
	}), Y.on("show", () => {
		Y?.webContents.send("app:resumed");
	}), Y.webContents.session.webRequest.onHeadersReceived((e, t) => {
		t({ responseHeaders: {
			...e.responseHeaders,
			"Content-Security-Policy": [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://*.betterstackdata.com https://us.i.posthog.com https://us-assets.i.posthog.com https://unpkg.com; frame-src ${q ? "http://localhost:*" : "'none'"}; object-src 'none'; base-uri 'self'`]
		} });
	}), q ? Y.loadURL(q) : Y.loadFile(m.join(me, "index.html"));
}
r.on("window-all-closed", () => {
	process.platform !== "darwin" && (r.quit(), Y = null);
});
var we = !1;
r.on("before-quit", (e) => {
	if (Z = !0, we) return;
	if (!Q) {
		we = !0;
		return;
	}
	e.preventDefault();
	let t = Q;
	Q = null, $ = null;
	let n = setTimeout(() => t.kill("SIGKILL"), 3e3);
	t.once("exit", () => {
		clearTimeout(n), we = !0, r.quit();
	}), t.kill("SIGTERM");
}), r.on("activate", () => {
	e.getAllWindows().length === 0 && Ce();
}), r.whenReady().then(() => {
	Ce(), s.on("suspend", () => {
		Y?.webContents.send("app:suspended");
	}), s.on("resume", () => {
		Y?.webContents.send("app:resumed");
	}), a.handle("window:close", () => {
		(e.getFocusedWindow() || Y)?.close();
	}), a.handle("window:minimize", () => {
		(e.getFocusedWindow() || Y)?.minimize();
	}), a.handle("window:maximize", () => {
		let t = e.getFocusedWindow() || Y;
		t && (t.isMaximized() ? t.unmaximize() : t.maximize());
	}), a.handle("fuse:spawn", async () => {
		if (Q) return {
			success: !1,
			error: "already running"
		};
		let e = !!q, t, n, r;
		if (e) {
			let e = m.join(process.env.APP_ROOT, "..", "..", "backend"), i = m.join(e, ".venv", "Scripts", "python.exe"), a = m.join(e, "fuse", "requirements.txt");
			try {
				h.existsSync(i) || await G("python", [
					"-m",
					"venv",
					m.join(e, ".venv")
				]), await G(i, [
					"-m",
					"pip",
					"install",
					"-r",
					a,
					"--quiet"
				]);
			} catch (e) {
				return {
					success: !1,
					error: `venv setup failed: ${e.message}`
				};
			}
			t = i, n = [m.join(e, "fuse", "run_fuse.py")], r = {
				...process.env,
				PYTHONPATH: e
			};
		} else t = m.join(process.resourcesPath, "fuse-backend.dist", "fuse-backend.exe"), n = [], r = {
			...process.env,
			FUSE_PLUGIN_DIRS: [m.join(process.resourcesPath, "fuse", "plugins"), m.join(process.resourcesPath, "plugins")].join(";")
		};
		return new Promise((e) => {
			let i = d(t, n, {
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: !0,
				env: r
			}), a = !1, o = "", s = "", c = setTimeout(() => {
				a || (a = !0, i.kill(), e({
					success: !1,
					error: "spawn timeout"
				}));
			}, 1e4), l = (e) => {
				if (!e) return;
				let t = e.replace(/\x1b\[[0-9;]*m/g, "");
				if (!t) return;
				let n = "info", r = t.match(/\|\s*(DEBUG|INFO|SUCCESS|WARNING|ERROR|CRITICAL)\s*\|/);
				r && (r[1] === "ERROR" || r[1] === "CRITICAL" ? n = "error" : r[1] === "WARNING" ? n = "warn" : r[1] === "DEBUG" && (n = "debug")), Y?.webContents.send("fuse:log", {
					level: n,
					text: t,
					timestamp: Date.now()
				});
			};
			i.stderr?.on("data", (e) => {
				s += e.toString();
				let t;
				for (; (t = s.indexOf("\n")) !== -1;) {
					let e = s.slice(0, t).trim();
					s = s.slice(t + 1), e && l(e);
				}
			}), i.stdout?.on("data", (t) => {
				o += t.toString();
				let n;
				for (; (n = o.indexOf("\n")) !== -1;) {
					let t = o.slice(0, n).trim();
					if (o = o.slice(n + 1), t) if (a) l(t);
					else try {
						let { port: n, connectionToken: r } = JSON.parse(t);
						n && r && (a = !0, clearTimeout(c), Q = i, $ = n, i.on("exit", (e, t) => {
							Q = null, $ = null, Z || Y?.webContents.send("fuse:exited", {
								code: e ?? null,
								signal: t ?? null
							});
						}), e({
							success: !0,
							pid: i.pid,
							port: n,
							connectionToken: r
						}));
					} catch {}
				}
			}), i.on("error", (t) => {
				a || (a = !0, clearTimeout(c), e({
					success: !1,
					error: t.message
				}));
			}), i.on("exit", (t) => {
				a || (a = !0, clearTimeout(c), e({
					success: !1,
					error: `exited early with code ${t}: ${s.trim()}`
				}));
			});
		});
	}), a.handle("fuse:kill", async () => Q ? new Promise((e) => {
		let t = Q, n = setTimeout(() => t.kill("SIGKILL"), 3e3);
		t.once("exit", () => {
			clearTimeout(n), e({ success: !0 });
		}), t.kill("SIGTERM");
	}) : { success: !0 }), a.handle("fuse:status", () => ({
		running: !!Q,
		pid: Q?.pid ?? null,
		port: $
	})), a.handle("plugins:scan", () => {
		let { core: e, user: t } = _e();
		return [...ve(e), ...ve(t)];
	}), a.handle("plugins:show-file", (e, t) => {
		l.showItemInFolder(t);
	}), a.handle("plugins:delete", (e, t) => {
		try {
			return h.unlinkSync(t), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), a.handle("dialog:select-dir", async () => {
		let e = await i.showOpenDialog(Y, { properties: ["openDirectory"] });
		return e.canceled ? null : e.filePaths[0] ?? null;
	}), a.handle("config:host:read", () => he());
	let t = m.join(J(), "fuse_host.json");
	if (h.existsSync(t)) {
		let e = null;
		h.watch(t, () => {
			e && clearTimeout(e), e = setTimeout(() => {
				Y?.webContents.send("config:host:changed", he());
			}, 150);
		});
	}
	a.handle("config:plugin:set-enabled", (e, t, n) => {
		try {
			let e = he(), r = e.disabled_plugins ?? [];
			return e.disabled_plugins = n ? r.filter((e) => e !== t) : r.includes(t) ? r : [...r, t], ge(e), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), a.handle("safe-storage:is-available", () => c.isEncryptionAvailable()), a.handle("safe-storage:encrypt", (e, t) => c.encryptString(t).toJSON()), a.handle("safe-storage:decrypt", (e, t) => c.decryptString(Buffer.from(t.data))), a.handle("app:set-autostart", (e, t) => {
		r.setLoginItemSettings({ openAtLogin: t });
	}), a.handle("app:set-minimize-to-tray-on-start", (e, t) => {
		ye = t, t ? xe() : be || Se();
	}), a.handle("app:apply-minimize-to-tray-on-start", () => {
		ye && Y && r.getLoginItemSettings().wasOpenedAtLogin && Y.hide();
	}), a.handle("app:set-minimize-to-tray-on-close", (e, t) => {
		be = t, t ? xe() : ye || Se();
	}), a.handle("app:open-backend-dir", () => {
		let e = q ? m.join(process.env.APP_ROOT, "..", "..", "backend") : process.resourcesPath;
		return l.openPath(e);
	}), a.handle("game:scan-dir", (e, t) => {
		try {
			let e, n = m.join(t, "game_info.xml");
			if (h.existsSync(n)) {
				let t = h.readFileSync(n, "utf-8").match(/<version_name>(.*?)<\/version_name>/);
				t && (e = t[1].trim());
			}
			let r = h.existsSync(m.join(t, "coldwar.project"));
			return {
				version: e,
				hasProject: r
			};
		} catch (e) {
			return { error: e.message };
		}
	}), a.handle("game:check-debugger", (e, t) => {
		try {
			let e = m.join(t, "coldwar.project"), n = h.readFileSync(e, "utf-8");
			return {
				success: !0,
				enabled: /"Enable Debugger"\s*:\s*true/.test(n)
			};
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), a.handle("game:enable-debugger", (e, t) => {
		try {
			let e = m.join(t, "coldwar.project"), n = h.readFileSync(e, "utf-8");
			return n = n.replace(/"Debugger Port"\s*:\s*\d+/g, "\"Debugger Port\": 9222"), n = n.replace(/"Enable Debugger"\s*:\s*false/g, "\"Enable Debugger\": true"), h.writeFileSync(e, n, "utf-8"), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), a.handle("game:disable-debugger", (e, t) => {
		try {
			let e = m.join(t, "coldwar.project"), n = h.readFileSync(e, "utf-8");
			return n = n.replace(/"Enable Debugger"\s*:\s*true/g, "\"Enable Debugger\": false"), h.writeFileSync(e, n, "utf-8"), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	});
});
//#endregion
export { pe as MAIN_DIST, me as RENDERER_DIST, q as VITE_DEV_SERVER_URL };
