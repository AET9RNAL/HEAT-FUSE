import { createRequire as e } from "node:module";
import { BrowserWindow as t, Menu as n, Tray as r, app as i, dialog as a, ipcMain as o, nativeImage as s, powerMonitor as c, safeStorage as l, shell as u } from "electron";
import d from "stream";
import f from "url";
import p from "zlib";
import m from "http";
import { execFile as h, spawn as g } from "node:child_process";
import { promisify as _ } from "node:util";
import v from "https";
import { fileURLToPath as y } from "node:url";
import b from "node:path";
import x from "node:fs";
import { createRequire as S } from "module";
//#region \0rolldown/runtime.js
var C = Object.create, w = Object.defineProperty, T = Object.getOwnPropertyDescriptor, E = Object.getOwnPropertyNames, D = Object.getPrototypeOf, O = Object.prototype.hasOwnProperty, k = (e, t) => () => (e && (t = e(e = 0)), t), A = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), j = (e, t) => {
	let n = {};
	for (var r in e) w(n, r, {
		get: e[r],
		enumerable: !0
	});
	return t || w(n, Symbol.toStringTag, { value: "Module" }), n;
}, M = (e, t, n, r) => {
	if (t && typeof t == "object" || typeof t == "function") for (var i = E(t), a = 0, o = i.length, s; a < o; a++) s = i[a], !O.call(e, s) && s !== n && w(e, s, {
		get: ((e) => t[e]).bind(null, s),
		enumerable: !(r = T(t, s)) || r.enumerable
	});
	return e;
}, N = (e, t, n) => (n = e == null ? {} : C(D(e)), M(t || !e || !e.__esModule ? w(n, "default", {
	value: e,
	enumerable: !0
}) : n, e)), P = (e) => O.call(e, "module.exports") ? e["module.exports"] : M(w({}, "__esModule", { value: !0 }), e), F = /* @__PURE__ */ e(import.meta.url), I = /* @__PURE__ */ A(((e) => {
	e.fromCallback = function(e) {
		return Object.defineProperty(function(...t) {
			if (typeof t[t.length - 1] == "function") e.apply(this, t);
			else return new Promise((n, r) => {
				t.push((e, t) => e == null ? n(t) : r(e)), e.apply(this, t);
			});
		}, "name", { value: e.name });
	}, e.fromPromise = function(e) {
		return Object.defineProperty(function(...t) {
			let n = t[t.length - 1];
			if (typeof n != "function") return e.apply(this, t);
			t.pop(), e.apply(this, t).then((e) => n(null, e), n);
		}, "name", { value: e.name });
	};
})), ee = /* @__PURE__ */ A(((e, t) => {
	var n = F("constants"), r = process.cwd, i = null, a = process.env.GRACEFUL_FS_PLATFORM || process.platform;
	process.cwd = function() {
		return i ||= r.call(process), i;
	};
	try {
		process.cwd();
	} catch {}
	if (typeof process.chdir == "function") {
		var o = process.chdir;
		process.chdir = function(e) {
			i = null, o.call(process, e);
		}, Object.setPrototypeOf && Object.setPrototypeOf(process.chdir, o);
	}
	t.exports = s;
	function s(e) {
		n.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./) && t(e), e.lutimes || r(e), e.chown = s(e.chown), e.fchown = s(e.fchown), e.lchown = s(e.lchown), e.chmod = i(e.chmod), e.fchmod = i(e.fchmod), e.lchmod = i(e.lchmod), e.chownSync = c(e.chownSync), e.fchownSync = c(e.fchownSync), e.lchownSync = c(e.lchownSync), e.chmodSync = o(e.chmodSync), e.fchmodSync = o(e.fchmodSync), e.lchmodSync = o(e.lchmodSync), e.stat = l(e.stat), e.fstat = l(e.fstat), e.lstat = l(e.lstat), e.statSync = u(e.statSync), e.fstatSync = u(e.fstatSync), e.lstatSync = u(e.lstatSync), e.chmod && !e.lchmod && (e.lchmod = function(e, t, n) {
			n && process.nextTick(n);
		}, e.lchmodSync = function() {}), e.chown && !e.lchown && (e.lchown = function(e, t, n, r) {
			r && process.nextTick(r);
		}, e.lchownSync = function() {}), a === "win32" && (e.rename = typeof e.rename == "function" ? (function(t) {
			function n(n, r, i) {
				var a = Date.now(), o = 0;
				t(n, r, function s(c) {
					if (c && (c.code === "EACCES" || c.code === "EPERM" || c.code === "EBUSY") && Date.now() - a < 6e4) {
						setTimeout(function() {
							e.stat(r, function(e, a) {
								e && e.code === "ENOENT" ? t(n, r, s) : i(c);
							});
						}, o), o < 100 && (o += 10);
						return;
					}
					i && i(c);
				});
			}
			return Object.setPrototypeOf && Object.setPrototypeOf(n, t), n;
		})(e.rename) : e.rename), e.read = typeof e.read == "function" ? (function(t) {
			function n(n, r, i, a, o, s) {
				var c;
				if (s && typeof s == "function") {
					var l = 0;
					c = function(u, d, f) {
						if (u && u.code === "EAGAIN" && l < 10) return l++, t.call(e, n, r, i, a, o, c);
						s.apply(this, arguments);
					};
				}
				return t.call(e, n, r, i, a, o, c);
			}
			return Object.setPrototypeOf && Object.setPrototypeOf(n, t), n;
		})(e.read) : e.read, e.readSync = typeof e.readSync == "function" ? (function(t) {
			return function(n, r, i, a, o) {
				for (var s = 0;;) try {
					return t.call(e, n, r, i, a, o);
				} catch (e) {
					if (e.code === "EAGAIN" && s < 10) {
						s++;
						continue;
					}
					throw e;
				}
			};
		})(e.readSync) : e.readSync;
		function t(e) {
			e.lchmod = function(t, r, i) {
				e.open(t, n.O_WRONLY | n.O_SYMLINK, r, function(t, n) {
					if (t) {
						i && i(t);
						return;
					}
					e.fchmod(n, r, function(t) {
						e.close(n, function(e) {
							i && i(t || e);
						});
					});
				});
			}, e.lchmodSync = function(t, r) {
				var i = e.openSync(t, n.O_WRONLY | n.O_SYMLINK, r), a = !0, o;
				try {
					o = e.fchmodSync(i, r), a = !1;
				} finally {
					if (a) try {
						e.closeSync(i);
					} catch {}
					else e.closeSync(i);
				}
				return o;
			};
		}
		function r(e) {
			n.hasOwnProperty("O_SYMLINK") && e.futimes ? (e.lutimes = function(t, r, i, a) {
				e.open(t, n.O_SYMLINK, function(t, n) {
					if (t) {
						a && a(t);
						return;
					}
					e.futimes(n, r, i, function(t) {
						e.close(n, function(e) {
							a && a(t || e);
						});
					});
				});
			}, e.lutimesSync = function(t, r, i) {
				var a = e.openSync(t, n.O_SYMLINK), o, s = !0;
				try {
					o = e.futimesSync(a, r, i), s = !1;
				} finally {
					if (s) try {
						e.closeSync(a);
					} catch {}
					else e.closeSync(a);
				}
				return o;
			}) : e.futimes && (e.lutimes = function(e, t, n, r) {
				r && process.nextTick(r);
			}, e.lutimesSync = function() {});
		}
		function i(t) {
			return t && function(n, r, i) {
				return t.call(e, n, r, function(e) {
					d(e) && (e = null), i && i.apply(this, arguments);
				});
			};
		}
		function o(t) {
			return t && function(n, r) {
				try {
					return t.call(e, n, r);
				} catch (e) {
					if (!d(e)) throw e;
				}
			};
		}
		function s(t) {
			return t && function(n, r, i, a) {
				return t.call(e, n, r, i, function(e) {
					d(e) && (e = null), a && a.apply(this, arguments);
				});
			};
		}
		function c(t) {
			return t && function(n, r, i) {
				try {
					return t.call(e, n, r, i);
				} catch (e) {
					if (!d(e)) throw e;
				}
			};
		}
		function l(t) {
			return t && function(n, r, i) {
				typeof r == "function" && (i = r, r = null);
				function a(e, t) {
					t && (t.uid < 0 && (t.uid += 4294967296), t.gid < 0 && (t.gid += 4294967296)), i && i.apply(this, arguments);
				}
				return r ? t.call(e, n, r, a) : t.call(e, n, a);
			};
		}
		function u(t) {
			return t && function(n, r) {
				var i = r ? t.call(e, n, r) : t.call(e, n);
				return i && (i.uid < 0 && (i.uid += 4294967296), i.gid < 0 && (i.gid += 4294967296)), i;
			};
		}
		function d(e) {
			return !e || e.code === "ENOSYS" || (!process.getuid || process.getuid() !== 0) && (e.code === "EINVAL" || e.code === "EPERM");
		}
	}
})), L = /* @__PURE__ */ A(((e, t) => {
	var n = F("stream").Stream;
	t.exports = r;
	function r(e) {
		return {
			ReadStream: t,
			WriteStream: r
		};
		function t(r, i) {
			if (!(this instanceof t)) return new t(r, i);
			n.call(this);
			var a = this;
			this.path = r, this.fd = null, this.readable = !0, this.paused = !1, this.flags = "r", this.mode = 438, this.bufferSize = 64 * 1024, i ||= {};
			for (var o = Object.keys(i), s = 0, c = o.length; s < c; s++) {
				var l = o[s];
				this[l] = i[l];
			}
			if (this.encoding && this.setEncoding(this.encoding), this.start !== void 0) {
				if (typeof this.start != "number") throw TypeError("start must be a Number");
				if (this.end === void 0) this.end = Infinity;
				else if (typeof this.end != "number") throw TypeError("end must be a Number");
				if (this.start > this.end) throw Error("start must be <= end");
				this.pos = this.start;
			}
			if (this.fd !== null) {
				process.nextTick(function() {
					a._read();
				});
				return;
			}
			e.open(this.path, this.flags, this.mode, function(e, t) {
				if (e) {
					a.emit("error", e), a.readable = !1;
					return;
				}
				a.fd = t, a.emit("open", t), a._read();
			});
		}
		function r(t, i) {
			if (!(this instanceof r)) return new r(t, i);
			n.call(this), this.path = t, this.fd = null, this.writable = !0, this.flags = "w", this.encoding = "binary", this.mode = 438, this.bytesWritten = 0, i ||= {};
			for (var a = Object.keys(i), o = 0, s = a.length; o < s; o++) {
				var c = a[o];
				this[c] = i[c];
			}
			if (this.start !== void 0) {
				if (typeof this.start != "number") throw TypeError("start must be a Number");
				if (this.start < 0) throw Error("start must be >= zero");
				this.pos = this.start;
			}
			this.busy = !1, this._queue = [], this.fd === null && (this._open = e.open, this._queue.push([
				this._open,
				this.path,
				this.flags,
				this.mode,
				void 0
			]), this.flush());
		}
	}
})), te = /* @__PURE__ */ A(((e, t) => {
	t.exports = r;
	var n = Object.getPrototypeOf || function(e) {
		return e.__proto__;
	};
	function r(e) {
		if (typeof e != "object" || !e) return e;
		if (e instanceof Object) var t = { __proto__: n(e) };
		else var t = Object.create(null);
		return Object.getOwnPropertyNames(e).forEach(function(n) {
			Object.defineProperty(t, n, Object.getOwnPropertyDescriptor(e, n));
		}), t;
	}
})), R = /* @__PURE__ */ A(((e, t) => {
	var n = F("fs"), r = ee(), i = L(), a = te(), o = F("util"), s, c;
	/* istanbul ignore else - node 0.x polyfill */
	typeof Symbol == "function" && typeof Symbol.for == "function" ? (s = Symbol.for("graceful-fs.queue"), c = Symbol.for("graceful-fs.previous")) : (s = "___graceful-fs.queue", c = "___graceful-fs.previous");
	function l() {}
	function u(e, t) {
		Object.defineProperty(e, s, { get: function() {
			return t;
		} });
	}
	var d = l;
	o.debuglog ? d = o.debuglog("gfs4") : /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && (d = function() {
		var e = o.format.apply(o, arguments);
		e = "GFS4: " + e.split(/\n/).join("\nGFS4: "), console.error(e);
	}), n[s] || (u(n, global[s] || []), n.close = (function(e) {
		function t(t, r) {
			return e.call(n, t, function(e) {
				e || h(), typeof r == "function" && r.apply(this, arguments);
			});
		}
		return Object.defineProperty(t, c, { value: e }), t;
	})(n.close), n.closeSync = (function(e) {
		function t(t) {
			e.apply(n, arguments), h();
		}
		return Object.defineProperty(t, c, { value: e }), t;
	})(n.closeSync), /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && process.on("exit", function() {
		d(n[s]), F("assert").equal(n[s].length, 0);
	})), global[s] || u(global, n[s]), t.exports = f(a(n)), process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !n.__patched && (t.exports = f(n), n.__patched = !0);
	function f(e) {
		r(e), e.gracefulify = f, e.createReadStream = T, e.createWriteStream = E;
		var t = e.readFile;
		e.readFile = n;
		function n(e, n, r) {
			return typeof n == "function" && (r = n, n = null), i(e, n, r);
			function i(e, n, r, a) {
				return t(e, n, function(t) {
					t && (t.code === "EMFILE" || t.code === "ENFILE") ? p([
						i,
						[
							e,
							n,
							r
						],
						t,
						a || Date.now(),
						Date.now()
					]) : typeof r == "function" && r.apply(this, arguments);
				});
			}
		}
		var a = e.writeFile;
		e.writeFile = o;
		function o(e, t, n, r) {
			return typeof n == "function" && (r = n, n = null), i(e, t, n, r);
			function i(e, t, n, r, o) {
				return a(e, t, n, function(a) {
					a && (a.code === "EMFILE" || a.code === "ENFILE") ? p([
						i,
						[
							e,
							t,
							n,
							r
						],
						a,
						o || Date.now(),
						Date.now()
					]) : typeof r == "function" && r.apply(this, arguments);
				});
			}
		}
		var s = e.appendFile;
		s && (e.appendFile = c);
		function c(e, t, n, r) {
			return typeof n == "function" && (r = n, n = null), i(e, t, n, r);
			function i(e, t, n, r, a) {
				return s(e, t, n, function(o) {
					o && (o.code === "EMFILE" || o.code === "ENFILE") ? p([
						i,
						[
							e,
							t,
							n,
							r
						],
						o,
						a || Date.now(),
						Date.now()
					]) : typeof r == "function" && r.apply(this, arguments);
				});
			}
		}
		var l = e.copyFile;
		l && (e.copyFile = u);
		function u(e, t, n, r) {
			return typeof n == "function" && (r = n, n = 0), i(e, t, n, r);
			function i(e, t, n, r, a) {
				return l(e, t, n, function(o) {
					o && (o.code === "EMFILE" || o.code === "ENFILE") ? p([
						i,
						[
							e,
							t,
							n,
							r
						],
						o,
						a || Date.now(),
						Date.now()
					]) : typeof r == "function" && r.apply(this, arguments);
				});
			}
		}
		var d = e.readdir;
		e.readdir = h;
		var m = /^v[0-5]\./;
		function h(e, t, n) {
			typeof t == "function" && (n = t, t = null);
			var r = m.test(process.version) ? function(e, t, n, r) {
				return d(e, i(e, t, n, r));
			} : function(e, t, n, r) {
				return d(e, t, i(e, t, n, r));
			};
			return r(e, t, n);
			function i(e, t, n, i) {
				return function(a, o) {
					a && (a.code === "EMFILE" || a.code === "ENFILE") ? p([
						r,
						[
							e,
							t,
							n
						],
						a,
						i || Date.now(),
						Date.now()
					]) : (o && o.sort && o.sort(), typeof n == "function" && n.call(this, a, o));
				};
			}
		}
		if (process.version.substr(0, 4) === "v0.8") {
			var g = i(e);
			x = g.ReadStream, C = g.WriteStream;
		}
		var _ = e.ReadStream;
		_ && (x.prototype = Object.create(_.prototype), x.prototype.open = S);
		var v = e.WriteStream;
		v && (C.prototype = Object.create(v.prototype), C.prototype.open = w), Object.defineProperty(e, "ReadStream", {
			get: function() {
				return x;
			},
			set: function(e) {
				x = e;
			},
			enumerable: !0,
			configurable: !0
		}), Object.defineProperty(e, "WriteStream", {
			get: function() {
				return C;
			},
			set: function(e) {
				C = e;
			},
			enumerable: !0,
			configurable: !0
		});
		var y = x;
		Object.defineProperty(e, "FileReadStream", {
			get: function() {
				return y;
			},
			set: function(e) {
				y = e;
			},
			enumerable: !0,
			configurable: !0
		});
		var b = C;
		Object.defineProperty(e, "FileWriteStream", {
			get: function() {
				return b;
			},
			set: function(e) {
				b = e;
			},
			enumerable: !0,
			configurable: !0
		});
		function x(e, t) {
			return this instanceof x ? (_.apply(this, arguments), this) : x.apply(Object.create(x.prototype), arguments);
		}
		function S() {
			var e = this;
			O(e.path, e.flags, e.mode, function(t, n) {
				t ? (e.autoClose && e.destroy(), e.emit("error", t)) : (e.fd = n, e.emit("open", n), e.read());
			});
		}
		function C(e, t) {
			return this instanceof C ? (v.apply(this, arguments), this) : C.apply(Object.create(C.prototype), arguments);
		}
		function w() {
			var e = this;
			O(e.path, e.flags, e.mode, function(t, n) {
				t ? (e.destroy(), e.emit("error", t)) : (e.fd = n, e.emit("open", n));
			});
		}
		function T(t, n) {
			return new e.ReadStream(t, n);
		}
		function E(t, n) {
			return new e.WriteStream(t, n);
		}
		var D = e.open;
		e.open = O;
		function O(e, t, n, r) {
			return typeof n == "function" && (r = n, n = null), i(e, t, n, r);
			function i(e, t, n, r, a) {
				return D(e, t, n, function(o, s) {
					o && (o.code === "EMFILE" || o.code === "ENFILE") ? p([
						i,
						[
							e,
							t,
							n,
							r
						],
						o,
						a || Date.now(),
						Date.now()
					]) : typeof r == "function" && r.apply(this, arguments);
				});
			}
		}
		return e;
	}
	function p(e) {
		d("ENQUEUE", e[0].name, e[1]), n[s].push(e), g();
	}
	var m;
	function h() {
		for (var e = Date.now(), t = 0; t < n[s].length; ++t) n[s][t].length > 2 && (n[s][t][3] = e, n[s][t][4] = e);
		g();
	}
	function g() {
		if (clearTimeout(m), m = void 0, n[s].length !== 0) {
			var e = n[s].shift(), t = e[0], r = e[1], i = e[2], a = e[3], o = e[4];
			if (a === void 0) d("RETRY", t.name, r), t.apply(null, r);
			else if (Date.now() - a >= 6e4) {
				d("TIMEOUT", t.name, r);
				var c = r.pop();
				typeof c == "function" && c.call(null, i);
			} else {
				var l = Date.now() - o, u = Math.max(o - a, 1);
				l >= Math.min(u * 1.2, 100) ? (d("RETRY", t.name, r), t.apply(null, r.concat([a]))) : n[s].push(e);
			}
			m === void 0 && (m = setTimeout(g, 0));
		}
	}
})), z = /* @__PURE__ */ A(((e) => {
	var t = I().fromCallback, n = R(), r = (/* @__PURE__ */ "access.appendFile.chmod.chown.close.copyFile.fchmod.fchown.fdatasync.fstat.fsync.ftruncate.futimes.lchmod.lchown.link.lstat.mkdir.mkdtemp.open.opendir.readdir.readFile.readlink.realpath.rename.rm.rmdir.stat.symlink.truncate.unlink.utimes.writeFile".split(".")).filter((e) => typeof n[e] == "function");
	Object.assign(e, n), r.forEach((r) => {
		e[r] = t(n[r]);
	}), e.exists = function(e, t) {
		return typeof t == "function" ? n.exists(e, t) : new Promise((t) => n.exists(e, t));
	}, e.read = function(e, t, r, i, a, o) {
		return typeof o == "function" ? n.read(e, t, r, i, a, o) : new Promise((o, s) => {
			n.read(e, t, r, i, a, (e, t, n) => {
				if (e) return s(e);
				o({
					bytesRead: t,
					buffer: n
				});
			});
		});
	}, e.write = function(e, t, ...r) {
		return typeof r[r.length - 1] == "function" ? n.write(e, t, ...r) : new Promise((i, a) => {
			n.write(e, t, ...r, (e, t, n) => {
				if (e) return a(e);
				i({
					bytesWritten: t,
					buffer: n
				});
			});
		});
	}, typeof n.writev == "function" && (e.writev = function(e, t, ...r) {
		return typeof r[r.length - 1] == "function" ? n.writev(e, t, ...r) : new Promise((i, a) => {
			n.writev(e, t, ...r, (e, t, n) => {
				if (e) return a(e);
				i({
					bytesWritten: t,
					buffers: n
				});
			});
		});
	}), typeof n.realpath.native == "function" ? e.realpath.native = t(n.realpath.native) : process.emitWarning("fs.realpath.native is not a function. Is fs being monkey-patched?", "Warning", "fs-extra-WARN0003");
})), B = /* @__PURE__ */ A(((e, t) => {
	var n = F("path");
	t.exports.checkPath = function(e) {
		if (process.platform === "win32" && /[<>:"|?*]/.test(e.replace(n.parse(e).root, ""))) {
			let t = /* @__PURE__ */ Error(`Path contains invalid characters: ${e}`);
			throw t.code = "EINVAL", t;
		}
	};
})), V = /* @__PURE__ */ A(((e, t) => {
	var n = z(), { checkPath: r } = B(), i = (e) => typeof e == "number" ? e : {
		mode: 511,
		...e
	}.mode;
	t.exports.makeDir = async (e, t) => (r(e), n.mkdir(e, {
		mode: i(t),
		recursive: !0
	})), t.exports.makeDirSync = (e, t) => (r(e), n.mkdirSync(e, {
		mode: i(t),
		recursive: !0
	}));
})), H = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromPromise, { makeDir: r, makeDirSync: i } = V(), a = n(r);
	t.exports = {
		mkdirs: a,
		mkdirsSync: i,
		mkdirp: a,
		mkdirpSync: i,
		ensureDir: a,
		ensureDirSync: i
	};
})), U = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromPromise, r = z();
	function i(e) {
		return r.access(e).then(() => !0).catch(() => !1);
	}
	t.exports = {
		pathExists: n(i),
		pathExistsSync: r.existsSync
	};
})), W = /* @__PURE__ */ A(((e, t) => {
	var n = R();
	function r(e, t, r, i) {
		n.open(e, "r+", (e, a) => {
			if (e) return i(e);
			n.futimes(a, t, r, (e) => {
				n.close(a, (t) => {
					i && i(e || t);
				});
			});
		});
	}
	function i(e, t, r) {
		let i = n.openSync(e, "r+");
		return n.futimesSync(i, t, r), n.closeSync(i);
	}
	t.exports = {
		utimesMillis: r,
		utimesMillisSync: i
	};
})), G = /* @__PURE__ */ A(((e, t) => {
	var n = z(), r = F("path"), i = F("util");
	function a(e, t, r) {
		let i = r.dereference ? (e) => n.stat(e, { bigint: !0 }) : (e) => n.lstat(e, { bigint: !0 });
		return Promise.all([i(e), i(t).catch((e) => {
			if (e.code === "ENOENT") return null;
			throw e;
		})]).then(([e, t]) => ({
			srcStat: e,
			destStat: t
		}));
	}
	function o(e, t, r) {
		let i, a = r.dereference ? (e) => n.statSync(e, { bigint: !0 }) : (e) => n.lstatSync(e, { bigint: !0 }), o = a(e);
		try {
			i = a(t);
		} catch (e) {
			if (e.code === "ENOENT") return {
				srcStat: o,
				destStat: null
			};
			throw e;
		}
		return {
			srcStat: o,
			destStat: i
		};
	}
	function s(e, t, n, o, s) {
		i.callbackify(a)(e, t, o, (i, a) => {
			if (i) return s(i);
			let { srcStat: o, destStat: c } = a;
			if (c) {
				if (d(o, c)) {
					let i = r.basename(e), a = r.basename(t);
					return n === "move" && i !== a && i.toLowerCase() === a.toLowerCase() ? s(null, {
						srcStat: o,
						destStat: c,
						isChangingCase: !0
					}) : s(/* @__PURE__ */ Error("Source and destination must not be the same."));
				}
				if (o.isDirectory() && !c.isDirectory()) return s(/* @__PURE__ */ Error(`Cannot overwrite non-directory '${t}' with directory '${e}'.`));
				if (!o.isDirectory() && c.isDirectory()) return s(/* @__PURE__ */ Error(`Cannot overwrite directory '${t}' with non-directory '${e}'.`));
			}
			return o.isDirectory() && f(e, t) ? s(Error(p(e, t, n))) : s(null, {
				srcStat: o,
				destStat: c
			});
		});
	}
	function c(e, t, n, i) {
		let { srcStat: a, destStat: s } = o(e, t, i);
		if (s) {
			if (d(a, s)) {
				let i = r.basename(e), o = r.basename(t);
				if (n === "move" && i !== o && i.toLowerCase() === o.toLowerCase()) return {
					srcStat: a,
					destStat: s,
					isChangingCase: !0
				};
				throw Error("Source and destination must not be the same.");
			}
			if (a.isDirectory() && !s.isDirectory()) throw Error(`Cannot overwrite non-directory '${t}' with directory '${e}'.`);
			if (!a.isDirectory() && s.isDirectory()) throw Error(`Cannot overwrite directory '${t}' with non-directory '${e}'.`);
		}
		if (a.isDirectory() && f(e, t)) throw Error(p(e, t, n));
		return {
			srcStat: a,
			destStat: s
		};
	}
	function l(e, t, i, a, o) {
		let s = r.resolve(r.dirname(e)), c = r.resolve(r.dirname(i));
		if (c === s || c === r.parse(c).root) return o();
		n.stat(c, { bigint: !0 }, (n, r) => n ? n.code === "ENOENT" ? o() : o(n) : d(t, r) ? o(Error(p(e, i, a))) : l(e, t, c, a, o));
	}
	function u(e, t, i, a) {
		let o = r.resolve(r.dirname(e)), s = r.resolve(r.dirname(i));
		if (s === o || s === r.parse(s).root) return;
		let c;
		try {
			c = n.statSync(s, { bigint: !0 });
		} catch (e) {
			if (e.code === "ENOENT") return;
			throw e;
		}
		if (d(t, c)) throw Error(p(e, i, a));
		return u(e, t, s, a);
	}
	function d(e, t) {
		return t.ino && t.dev && t.ino === e.ino && t.dev === e.dev;
	}
	function f(e, t) {
		let n = r.resolve(e).split(r.sep).filter((e) => e), i = r.resolve(t).split(r.sep).filter((e) => e);
		return n.reduce((e, t, n) => e && i[n] === t, !0);
	}
	function p(e, t, n) {
		return `Cannot ${n} '${e}' to a subdirectory of itself, '${t}'.`;
	}
	t.exports = {
		checkPaths: s,
		checkPathsSync: c,
		checkParentPaths: l,
		checkParentPathsSync: u,
		isSrcSubdir: f,
		areIdentical: d
	};
})), ne = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = F("path"), i = H().mkdirs, a = U().pathExists, o = W().utimesMillis, s = G();
	function c(e, t, n, r) {
		typeof n == "function" && !r ? (r = n, n = {}) : typeof n == "function" && (n = { filter: n }), r ||= function() {}, n ||= {}, n.clobber = "clobber" in n ? !!n.clobber : !0, n.overwrite = "overwrite" in n ? !!n.overwrite : n.clobber, n.preserveTimestamps && process.arch === "ia32" && process.emitWarning("Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269", "Warning", "fs-extra-WARN0001"), s.checkPaths(e, t, "copy", n, (i, a) => {
			if (i) return r(i);
			let { srcStat: o, destStat: c } = a;
			s.checkParentPaths(e, o, t, "copy", (i) => i ? r(i) : n.filter ? u(l, c, e, t, n, r) : l(c, e, t, n, r));
		});
	}
	function l(e, t, n, o, s) {
		let c = r.dirname(n);
		a(c, (r, a) => {
			if (r) return s(r);
			if (a) return f(e, t, n, o, s);
			i(c, (r) => r ? s(r) : f(e, t, n, o, s));
		});
	}
	function u(e, t, n, r, i, a) {
		Promise.resolve(i.filter(n, r)).then((o) => o ? e(t, n, r, i, a) : a(), (e) => a(e));
	}
	function d(e, t, n, r, i) {
		return r.filter ? u(f, e, t, n, r, i) : f(e, t, n, r, i);
	}
	function f(e, t, r, i, a) {
		(i.dereference ? n.stat : n.lstat)(t, (n, o) => n ? a(n) : o.isDirectory() ? S(o, e, t, r, i, a) : o.isFile() || o.isCharacterDevice() || o.isBlockDevice() ? p(o, e, t, r, i, a) : o.isSymbolicLink() ? D(e, t, r, i, a) : o.isSocket() ? a(/* @__PURE__ */ Error(`Cannot copy a socket file: ${t}`)) : o.isFIFO() ? a(/* @__PURE__ */ Error(`Cannot copy a FIFO pipe: ${t}`)) : a(/* @__PURE__ */ Error(`Unknown file: ${t}`)));
	}
	function p(e, t, n, r, i, a) {
		return t ? m(e, n, r, i, a) : h(e, n, r, i, a);
	}
	function m(e, t, r, i, a) {
		if (i.overwrite) n.unlink(r, (n) => n ? a(n) : h(e, t, r, i, a));
		else if (i.errorOnExist) return a(/* @__PURE__ */ Error(`'${r}' already exists`));
		else return a();
	}
	function h(e, t, r, i, a) {
		n.copyFile(t, r, (n) => n ? a(n) : i.preserveTimestamps ? g(e.mode, t, r, a) : b(r, e.mode, a));
	}
	function g(e, t, n, r) {
		return _(e) ? v(n, e, (i) => i ? r(i) : y(e, t, n, r)) : y(e, t, n, r);
	}
	function _(e) {
		return (e & 128) == 0;
	}
	function v(e, t, n) {
		return b(e, t | 128, n);
	}
	function y(e, t, n, r) {
		x(t, n, (t) => t ? r(t) : b(n, e, r));
	}
	function b(e, t, r) {
		return n.chmod(e, t, r);
	}
	function x(e, t, r) {
		n.stat(e, (e, n) => e ? r(e) : o(t, n.atime, n.mtime, r));
	}
	function S(e, t, n, r, i, a) {
		return t ? w(n, r, i, a) : C(e.mode, n, r, i, a);
	}
	function C(e, t, r, i, a) {
		n.mkdir(r, (n) => {
			if (n) return a(n);
			w(t, r, i, (t) => t ? a(t) : b(r, e, a));
		});
	}
	function w(e, t, r, i) {
		n.readdir(e, (n, a) => n ? i(n) : T(a, e, t, r, i));
	}
	function T(e, t, n, r, i) {
		let a = e.pop();
		return a ? E(e, a, t, n, r, i) : i();
	}
	function E(e, t, n, i, a, o) {
		let c = r.join(n, t), l = r.join(i, t);
		s.checkPaths(c, l, "copy", a, (t, r) => {
			if (t) return o(t);
			let { destStat: s } = r;
			d(s, c, l, a, (t) => t ? o(t) : T(e, n, i, a, o));
		});
	}
	function D(e, t, i, a, o) {
		n.readlink(t, (t, c) => {
			if (t) return o(t);
			if (a.dereference && (c = r.resolve(process.cwd(), c)), e) n.readlink(i, (t, l) => t ? t.code === "EINVAL" || t.code === "UNKNOWN" ? n.symlink(c, i, o) : o(t) : (a.dereference && (l = r.resolve(process.cwd(), l)), s.isSrcSubdir(c, l) ? o(/* @__PURE__ */ Error(`Cannot copy '${c}' to a subdirectory of itself, '${l}'.`)) : e.isDirectory() && s.isSrcSubdir(l, c) ? o(/* @__PURE__ */ Error(`Cannot overwrite '${l}' with '${c}'.`)) : O(c, i, o)));
			else return n.symlink(c, i, o);
		});
	}
	function O(e, t, r) {
		n.unlink(t, (i) => i ? r(i) : n.symlink(e, t, r));
	}
	t.exports = c;
})), re = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = F("path"), i = H().mkdirsSync, a = W().utimesMillisSync, o = G();
	function s(e, t, n) {
		typeof n == "function" && (n = { filter: n }), n ||= {}, n.clobber = "clobber" in n ? !!n.clobber : !0, n.overwrite = "overwrite" in n ? !!n.overwrite : n.clobber, n.preserveTimestamps && process.arch === "ia32" && process.emitWarning("Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269", "Warning", "fs-extra-WARN0002");
		let { srcStat: r, destStat: i } = o.checkPathsSync(e, t, "copy", n);
		return o.checkParentPathsSync(e, r, t, "copy"), c(i, e, t, n);
	}
	function c(e, t, a, o) {
		if (o.filter && !o.filter(t, a)) return;
		let s = r.dirname(a);
		return n.existsSync(s) || i(s), u(e, t, a, o);
	}
	function l(e, t, n, r) {
		if (!(r.filter && !r.filter(t, n))) return u(e, t, n, r);
	}
	function u(e, t, r, i) {
		let a = (i.dereference ? n.statSync : n.lstatSync)(t);
		if (a.isDirectory()) return y(a, e, t, r, i);
		if (a.isFile() || a.isCharacterDevice() || a.isBlockDevice()) return d(a, e, t, r, i);
		if (a.isSymbolicLink()) return C(e, t, r, i);
		throw a.isSocket() ? Error(`Cannot copy a socket file: ${t}`) : a.isFIFO() ? Error(`Cannot copy a FIFO pipe: ${t}`) : Error(`Unknown file: ${t}`);
	}
	function d(e, t, n, r, i) {
		return t ? f(e, n, r, i) : p(e, n, r, i);
	}
	function f(e, t, r, i) {
		if (i.overwrite) return n.unlinkSync(r), p(e, t, r, i);
		if (i.errorOnExist) throw Error(`'${r}' already exists`);
	}
	function p(e, t, r, i) {
		return n.copyFileSync(t, r), i.preserveTimestamps && m(e.mode, t, r), _(r, e.mode);
	}
	function m(e, t, n) {
		return h(e) && g(n, e), v(t, n);
	}
	function h(e) {
		return (e & 128) == 0;
	}
	function g(e, t) {
		return _(e, t | 128);
	}
	function _(e, t) {
		return n.chmodSync(e, t);
	}
	function v(e, t) {
		let r = n.statSync(e);
		return a(t, r.atime, r.mtime);
	}
	function y(e, t, n, r, i) {
		return t ? x(n, r, i) : b(e.mode, n, r, i);
	}
	function b(e, t, r, i) {
		return n.mkdirSync(r), x(t, r, i), _(r, e);
	}
	function x(e, t, r) {
		n.readdirSync(e).forEach((n) => S(n, e, t, r));
	}
	function S(e, t, n, i) {
		let a = r.join(t, e), s = r.join(n, e), { destStat: c } = o.checkPathsSync(a, s, "copy", i);
		return l(c, a, s, i);
	}
	function C(e, t, i, a) {
		let s = n.readlinkSync(t);
		if (a.dereference && (s = r.resolve(process.cwd(), s)), e) {
			let e;
			try {
				e = n.readlinkSync(i);
			} catch (e) {
				if (e.code === "EINVAL" || e.code === "UNKNOWN") return n.symlinkSync(s, i);
				throw e;
			}
			if (a.dereference && (e = r.resolve(process.cwd(), e)), o.isSrcSubdir(s, e)) throw Error(`Cannot copy '${s}' to a subdirectory of itself, '${e}'.`);
			if (n.statSync(i).isDirectory() && o.isSrcSubdir(e, s)) throw Error(`Cannot overwrite '${e}' with '${s}'.`);
			return w(s, i);
		} else return n.symlinkSync(s, i);
	}
	function w(e, t) {
		return n.unlinkSync(t), n.symlinkSync(e, t);
	}
	t.exports = s;
})), ie = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback;
	t.exports = {
		copy: n(ne()),
		copySync: re()
	};
})), ae = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = F("path"), i = F("assert"), a = process.platform === "win32";
	function o(e) {
		[
			"unlink",
			"chmod",
			"stat",
			"lstat",
			"rmdir",
			"readdir"
		].forEach((t) => {
			e[t] = e[t] || n[t], t += "Sync", e[t] = e[t] || n[t];
		}), e.maxBusyTries = e.maxBusyTries || 3;
	}
	function s(e, t, n) {
		let r = 0;
		typeof t == "function" && (n = t, t = {}), i(e, "rimraf: missing path"), i.strictEqual(typeof e, "string", "rimraf: path should be a string"), i.strictEqual(typeof n, "function", "rimraf: callback function required"), i(t, "rimraf: invalid options argument provided"), i.strictEqual(typeof t, "object", "rimraf: options should be object"), o(t), c(e, t, function i(a) {
			if (a) {
				if ((a.code === "EBUSY" || a.code === "ENOTEMPTY" || a.code === "EPERM") && r < t.maxBusyTries) {
					r++;
					let n = r * 100;
					return setTimeout(() => c(e, t, i), n);
				}
				a.code === "ENOENT" && (a = null);
			}
			n(a);
		});
	}
	function c(e, t, n) {
		i(e), i(t), i(typeof n == "function"), t.lstat(e, (r, i) => {
			if (r && r.code === "ENOENT") return n(null);
			if (r && r.code === "EPERM" && a) return l(e, t, r, n);
			if (i && i.isDirectory()) return d(e, t, r, n);
			t.unlink(e, (r) => {
				if (r) {
					if (r.code === "ENOENT") return n(null);
					if (r.code === "EPERM") return a ? l(e, t, r, n) : d(e, t, r, n);
					if (r.code === "EISDIR") return d(e, t, r, n);
				}
				return n(r);
			});
		});
	}
	function l(e, t, n, r) {
		i(e), i(t), i(typeof r == "function"), t.chmod(e, 438, (i) => {
			i ? r(i.code === "ENOENT" ? null : n) : t.stat(e, (i, a) => {
				i ? r(i.code === "ENOENT" ? null : n) : a.isDirectory() ? d(e, t, n, r) : t.unlink(e, r);
			});
		});
	}
	function u(e, t, n) {
		let r;
		i(e), i(t);
		try {
			t.chmodSync(e, 438);
		} catch (e) {
			if (e.code === "ENOENT") return;
			throw n;
		}
		try {
			r = t.statSync(e);
		} catch (e) {
			if (e.code === "ENOENT") return;
			throw n;
		}
		r.isDirectory() ? m(e, t, n) : t.unlinkSync(e);
	}
	function d(e, t, n, r) {
		i(e), i(t), i(typeof r == "function"), t.rmdir(e, (i) => {
			i && (i.code === "ENOTEMPTY" || i.code === "EEXIST" || i.code === "EPERM") ? f(e, t, r) : i && i.code === "ENOTDIR" ? r(n) : r(i);
		});
	}
	function f(e, t, n) {
		i(e), i(t), i(typeof n == "function"), t.readdir(e, (i, a) => {
			if (i) return n(i);
			let o = a.length, c;
			if (o === 0) return t.rmdir(e, n);
			a.forEach((i) => {
				s(r.join(e, i), t, (r) => {
					if (!c) {
						if (r) return n(c = r);
						--o === 0 && t.rmdir(e, n);
					}
				});
			});
		});
	}
	function p(e, t) {
		let n;
		t ||= {}, o(t), i(e, "rimraf: missing path"), i.strictEqual(typeof e, "string", "rimraf: path should be a string"), i(t, "rimraf: missing options"), i.strictEqual(typeof t, "object", "rimraf: options should be object");
		try {
			n = t.lstatSync(e);
		} catch (n) {
			if (n.code === "ENOENT") return;
			n.code === "EPERM" && a && u(e, t, n);
		}
		try {
			n && n.isDirectory() ? m(e, t, null) : t.unlinkSync(e);
		} catch (n) {
			if (n.code === "ENOENT") return;
			if (n.code === "EPERM") return a ? u(e, t, n) : m(e, t, n);
			if (n.code !== "EISDIR") throw n;
			m(e, t, n);
		}
	}
	function m(e, t, n) {
		i(e), i(t);
		try {
			t.rmdirSync(e);
		} catch (r) {
			if (r.code === "ENOTDIR") throw n;
			if (r.code === "ENOTEMPTY" || r.code === "EEXIST" || r.code === "EPERM") h(e, t);
			else if (r.code !== "ENOENT") throw r;
		}
	}
	function h(e, t) {
		if (i(e), i(t), t.readdirSync(e).forEach((n) => p(r.join(e, n), t)), a) {
			let n = Date.now();
			do
				try {
					return t.rmdirSync(e, t);
				} catch {}
			while (Date.now() - n < 500);
		} else return t.rmdirSync(e, t);
	}
	t.exports = s, s.sync = p;
})), oe = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = I().fromCallback, i = ae();
	function a(e, t) {
		if (n.rm) return n.rm(e, {
			recursive: !0,
			force: !0
		}, t);
		i(e, t);
	}
	function o(e) {
		if (n.rmSync) return n.rmSync(e, {
			recursive: !0,
			force: !0
		});
		i.sync(e);
	}
	t.exports = {
		remove: r(a),
		removeSync: o
	};
})), se = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromPromise, r = z(), i = F("path"), a = H(), o = oe(), s = n(async function(e) {
		let t;
		try {
			t = await r.readdir(e);
		} catch {
			return a.mkdirs(e);
		}
		return Promise.all(t.map((t) => o.remove(i.join(e, t))));
	});
	function c(e) {
		let t;
		try {
			t = r.readdirSync(e);
		} catch {
			return a.mkdirsSync(e);
		}
		t.forEach((t) => {
			t = i.join(e, t), o.removeSync(t);
		});
	}
	t.exports = {
		emptyDirSync: c,
		emptydirSync: c,
		emptyDir: s,
		emptydir: s
	};
})), ce = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback, r = F("path"), i = R(), a = H();
	function o(e, t) {
		function n() {
			i.writeFile(e, "", (e) => {
				if (e) return t(e);
				t();
			});
		}
		i.stat(e, (o, s) => {
			if (!o && s.isFile()) return t();
			let c = r.dirname(e);
			i.stat(c, (e, r) => {
				if (e) return e.code === "ENOENT" ? a.mkdirs(c, (e) => {
					if (e) return t(e);
					n();
				}) : t(e);
				r.isDirectory() ? n() : i.readdir(c, (e) => {
					if (e) return t(e);
				});
			});
		});
	}
	function s(e) {
		let t;
		try {
			t = i.statSync(e);
		} catch {}
		if (t && t.isFile()) return;
		let n = r.dirname(e);
		try {
			i.statSync(n).isDirectory() || i.readdirSync(n);
		} catch (e) {
			if (e && e.code === "ENOENT") a.mkdirsSync(n);
			else throw e;
		}
		i.writeFileSync(e, "");
	}
	t.exports = {
		createFile: n(o),
		createFileSync: s
	};
})), le = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback, r = F("path"), i = R(), a = H(), o = U().pathExists, { areIdentical: s } = G();
	function c(e, t, n) {
		function c(e, t) {
			i.link(e, t, (e) => {
				if (e) return n(e);
				n(null);
			});
		}
		i.lstat(t, (l, u) => {
			i.lstat(e, (i, l) => {
				if (i) return i.message = i.message.replace("lstat", "ensureLink"), n(i);
				if (u && s(l, u)) return n(null);
				let d = r.dirname(t);
				o(d, (r, i) => {
					if (r) return n(r);
					if (i) return c(e, t);
					a.mkdirs(d, (r) => {
						if (r) return n(r);
						c(e, t);
					});
				});
			});
		});
	}
	function l(e, t) {
		let n;
		try {
			n = i.lstatSync(t);
		} catch {}
		try {
			let t = i.lstatSync(e);
			if (n && s(t, n)) return;
		} catch (e) {
			throw e.message = e.message.replace("lstat", "ensureLink"), e;
		}
		let o = r.dirname(t);
		return i.existsSync(o) || a.mkdirsSync(o), i.linkSync(e, t);
	}
	t.exports = {
		createLink: n(c),
		createLinkSync: l
	};
})), ue = /* @__PURE__ */ A(((e, t) => {
	var n = F("path"), r = R(), i = U().pathExists;
	function a(e, t, a) {
		if (n.isAbsolute(e)) return r.lstat(e, (t) => t ? (t.message = t.message.replace("lstat", "ensureSymlink"), a(t)) : a(null, {
			toCwd: e,
			toDst: e
		}));
		{
			let o = n.dirname(t), s = n.join(o, e);
			return i(s, (t, i) => t ? a(t) : i ? a(null, {
				toCwd: s,
				toDst: e
			}) : r.lstat(e, (t) => t ? (t.message = t.message.replace("lstat", "ensureSymlink"), a(t)) : a(null, {
				toCwd: e,
				toDst: n.relative(o, e)
			})));
		}
	}
	function o(e, t) {
		let i;
		if (n.isAbsolute(e)) {
			if (i = r.existsSync(e), !i) throw Error("absolute srcpath does not exist");
			return {
				toCwd: e,
				toDst: e
			};
		} else {
			let a = n.dirname(t), o = n.join(a, e);
			if (i = r.existsSync(o), i) return {
				toCwd: o,
				toDst: e
			};
			if (i = r.existsSync(e), !i) throw Error("relative srcpath does not exist");
			return {
				toCwd: e,
				toDst: n.relative(a, e)
			};
		}
	}
	t.exports = {
		symlinkPaths: a,
		symlinkPathsSync: o
	};
})), de = /* @__PURE__ */ A(((e, t) => {
	var n = R();
	function r(e, t, r) {
		if (r = typeof t == "function" ? t : r, t = typeof t == "function" ? !1 : t, t) return r(null, t);
		n.lstat(e, (e, n) => {
			if (e) return r(null, "file");
			t = n && n.isDirectory() ? "dir" : "file", r(null, t);
		});
	}
	function i(e, t) {
		let r;
		if (t) return t;
		try {
			r = n.lstatSync(e);
		} catch {
			return "file";
		}
		return r && r.isDirectory() ? "dir" : "file";
	}
	t.exports = {
		symlinkType: r,
		symlinkTypeSync: i
	};
})), fe = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback, r = F("path"), i = z(), a = H(), o = a.mkdirs, s = a.mkdirsSync, c = ue(), l = c.symlinkPaths, u = c.symlinkPathsSync, d = de(), f = d.symlinkType, p = d.symlinkTypeSync, m = U().pathExists, { areIdentical: h } = G();
	function g(e, t, n, r) {
		r = typeof n == "function" ? n : r, n = typeof n == "function" ? !1 : n, i.lstat(t, (a, o) => {
			!a && o.isSymbolicLink() ? Promise.all([i.stat(e), i.stat(t)]).then(([i, a]) => {
				if (h(i, a)) return r(null);
				_(e, t, n, r);
			}) : _(e, t, n, r);
		});
	}
	function _(e, t, n, a) {
		l(e, t, (s, c) => {
			if (s) return a(s);
			e = c.toDst, f(c.toCwd, n, (n, s) => {
				if (n) return a(n);
				let c = r.dirname(t);
				m(c, (n, r) => {
					if (n) return a(n);
					if (r) return i.symlink(e, t, s, a);
					o(c, (n) => {
						if (n) return a(n);
						i.symlink(e, t, s, a);
					});
				});
			});
		});
	}
	function v(e, t, n) {
		let a;
		try {
			a = i.lstatSync(t);
		} catch {}
		if (a && a.isSymbolicLink() && h(i.statSync(e), i.statSync(t))) return;
		let o = u(e, t);
		e = o.toDst, n = p(o.toCwd, n);
		let c = r.dirname(t);
		return i.existsSync(c) || s(c), i.symlinkSync(e, t, n);
	}
	t.exports = {
		createSymlink: n(g),
		createSymlinkSync: v
	};
})), pe = /* @__PURE__ */ A(((e, t) => {
	var { createFile: n, createFileSync: r } = ce(), { createLink: i, createLinkSync: a } = le(), { createSymlink: o, createSymlinkSync: s } = fe();
	t.exports = {
		createFile: n,
		createFileSync: r,
		ensureFile: n,
		ensureFileSync: r,
		createLink: i,
		createLinkSync: a,
		ensureLink: i,
		ensureLinkSync: a,
		createSymlink: o,
		createSymlinkSync: s,
		ensureSymlink: o,
		ensureSymlinkSync: s
	};
})), me = /* @__PURE__ */ A(((e, t) => {
	function n(e, { EOL: t = "\n", finalEOL: n = !0, replacer: r = null, spaces: i } = {}) {
		let a = n ? t : "", o = JSON.stringify(e, r, i);
		if (o === void 0) throw TypeError(`Converting ${typeof e} value to JSON is not supported`);
		return o.replace(/\n/g, t) + a;
	}
	function r(e) {
		return Buffer.isBuffer(e) && (e = e.toString("utf8")), e.replace(/^\uFEFF/, "");
	}
	t.exports = {
		stringify: n,
		stripBom: r
	};
})), he = /* @__PURE__ */ A(((e, t) => {
	var n;
	try {
		n = R();
	} catch {
		n = F("fs");
	}
	var r = I(), { stringify: i, stripBom: a } = me();
	async function o(e, t = {}) {
		typeof t == "string" && (t = { encoding: t });
		let i = t.fs || n, o = "throws" in t ? t.throws : !0, s = await r.fromCallback(i.readFile)(e, t);
		s = a(s);
		let c;
		try {
			c = JSON.parse(s, t ? t.reviver : null);
		} catch (t) {
			if (o) throw t.message = `${e}: ${t.message}`, t;
			return null;
		}
		return c;
	}
	var s = r.fromPromise(o);
	function c(e, t = {}) {
		typeof t == "string" && (t = { encoding: t });
		let r = t.fs || n, i = "throws" in t ? t.throws : !0;
		try {
			let n = r.readFileSync(e, t);
			return n = a(n), JSON.parse(n, t.reviver);
		} catch (t) {
			if (i) throw t.message = `${e}: ${t.message}`, t;
			return null;
		}
	}
	async function l(e, t, a = {}) {
		let o = a.fs || n, s = i(t, a);
		await r.fromCallback(o.writeFile)(e, s, a);
	}
	var u = r.fromPromise(l);
	function d(e, t, r = {}) {
		let a = r.fs || n, o = i(t, r);
		return a.writeFileSync(e, o, r);
	}
	t.exports = {
		readFile: s,
		readFileSync: c,
		writeFile: u,
		writeFileSync: d
	};
})), ge = /* @__PURE__ */ A(((e, t) => {
	var n = he();
	t.exports = {
		readJson: n.readFile,
		readJsonSync: n.readFileSync,
		writeJson: n.writeFile,
		writeJsonSync: n.writeFileSync
	};
})), _e = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback, r = R(), i = F("path"), a = H(), o = U().pathExists;
	function s(e, t, n, s) {
		typeof n == "function" && (s = n, n = "utf8");
		let c = i.dirname(e);
		o(c, (i, o) => {
			if (i) return s(i);
			if (o) return r.writeFile(e, t, n, s);
			a.mkdirs(c, (i) => {
				if (i) return s(i);
				r.writeFile(e, t, n, s);
			});
		});
	}
	function c(e, ...t) {
		let n = i.dirname(e);
		if (r.existsSync(n)) return r.writeFileSync(e, ...t);
		a.mkdirsSync(n), r.writeFileSync(e, ...t);
	}
	t.exports = {
		outputFile: n(s),
		outputFileSync: c
	};
})), ve = /* @__PURE__ */ A(((e, t) => {
	var { stringify: n } = me(), { outputFile: r } = _e();
	async function i(e, t, i = {}) {
		await r(e, n(t, i), i);
	}
	t.exports = i;
})), ye = /* @__PURE__ */ A(((e, t) => {
	var { stringify: n } = me(), { outputFileSync: r } = _e();
	function i(e, t, i) {
		r(e, n(t, i), i);
	}
	t.exports = i;
})), be = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromPromise, r = ge();
	r.outputJson = n(ve()), r.outputJsonSync = ye(), r.outputJSON = r.outputJson, r.outputJSONSync = r.outputJsonSync, r.writeJSON = r.writeJson, r.writeJSONSync = r.writeJsonSync, r.readJSON = r.readJson, r.readJSONSync = r.readJsonSync, t.exports = r;
})), xe = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = F("path"), i = ie().copy, a = oe().remove, o = H().mkdirp, s = U().pathExists, c = G();
	function l(e, t, n, i) {
		typeof n == "function" && (i = n, n = {}), n ||= {};
		let a = n.overwrite || n.clobber || !1;
		c.checkPaths(e, t, "move", n, (n, s) => {
			if (n) return i(n);
			let { srcStat: l, isChangingCase: f = !1 } = s;
			c.checkParentPaths(e, l, t, "move", (n) => {
				if (n) return i(n);
				if (u(t)) return d(e, t, a, f, i);
				o(r.dirname(t), (n) => n ? i(n) : d(e, t, a, f, i));
			});
		});
	}
	function u(e) {
		let t = r.dirname(e);
		return r.parse(t).root === t;
	}
	function d(e, t, n, r, i) {
		if (r) return f(e, t, n, i);
		if (n) return a(t, (r) => r ? i(r) : f(e, t, n, i));
		s(t, (r, a) => r ? i(r) : a ? i(/* @__PURE__ */ Error("dest already exists.")) : f(e, t, n, i));
	}
	function f(e, t, r, i) {
		n.rename(e, t, (n) => n ? n.code === "EXDEV" ? p(e, t, r, i) : i(n) : i());
	}
	function p(e, t, n, r) {
		i(e, t, {
			overwrite: n,
			errorOnExist: !0
		}, (t) => t ? r(t) : a(e, r));
	}
	t.exports = l;
})), Se = /* @__PURE__ */ A(((e, t) => {
	var n = R(), r = F("path"), i = ie().copySync, a = oe().removeSync, o = H().mkdirpSync, s = G();
	function c(e, t, n) {
		n ||= {};
		let i = n.overwrite || n.clobber || !1, { srcStat: a, isChangingCase: c = !1 } = s.checkPathsSync(e, t, "move", n);
		return s.checkParentPathsSync(e, a, t, "move"), l(t) || o(r.dirname(t)), u(e, t, i, c);
	}
	function l(e) {
		let t = r.dirname(e);
		return r.parse(t).root === t;
	}
	function u(e, t, r, i) {
		if (i) return d(e, t, r);
		if (r) return a(t), d(e, t, r);
		if (n.existsSync(t)) throw Error("dest already exists.");
		return d(e, t, r);
	}
	function d(e, t, r) {
		try {
			n.renameSync(e, t);
		} catch (n) {
			if (n.code !== "EXDEV") throw n;
			return f(e, t, r);
		}
	}
	function f(e, t, n) {
		return i(e, t, {
			overwrite: n,
			errorOnExist: !0
		}), a(e);
	}
	t.exports = c;
})), Ce = /* @__PURE__ */ A(((e, t) => {
	var n = I().fromCallback;
	t.exports = {
		move: n(xe()),
		moveSync: Se()
	};
})), we = /* @__PURE__ */ A(((e, t) => {
	t.exports = {
		...z(),
		...ie(),
		...se(),
		...pe(),
		...be(),
		...H(),
		...Ce(),
		..._e(),
		...U(),
		...oe()
	};
})), Te = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.CancellationError = e.CancellationToken = void 0;
	var t = F("events");
	e.CancellationToken = class extends t.EventEmitter {
		get cancelled() {
			return this._cancelled || this._parent != null && this._parent.cancelled;
		}
		set parent(e) {
			this.removeParentCancelHandler(), this._parent = e, this.parentCancelHandler = () => this.cancel(), this._parent.onCancel(this.parentCancelHandler);
		}
		constructor(e) {
			super(), this.parentCancelHandler = null, this._parent = null, this._cancelled = !1, e != null && (this.parent = e);
		}
		cancel() {
			this._cancelled = !0, this.emit("cancel");
		}
		onCancel(e) {
			this.cancelled ? e() : this.once("cancel", e);
		}
		createPromise(e) {
			if (this.cancelled) return Promise.reject(new n());
			let t = () => {
				if (r != null) try {
					this.removeListener("cancel", r), r = null;
				} catch {}
			}, r = null;
			return new Promise((t, i) => {
				let a = null;
				if (r = () => {
					try {
						a != null && (a(), a = null);
					} finally {
						i(new n());
					}
				}, this.cancelled) {
					r();
					return;
				}
				this.onCancel(r), e(t, i, (e) => {
					a = e;
				});
			}).then((e) => (t(), e)).catch((e) => {
				throw t(), e;
			});
		}
		removeParentCancelHandler() {
			let e = this._parent;
			e != null && this.parentCancelHandler != null && (e.removeListener("cancel", this.parentCancelHandler), this.parentCancelHandler = null);
		}
		dispose() {
			try {
				this.removeParentCancelHandler();
			} finally {
				this.removeAllListeners(), this._parent = null;
			}
		}
	};
	var n = class extends Error {
		constructor() {
			super("cancelled");
		}
	};
	e.CancellationError = n;
})), Ee = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.newError = t;
	function t(e, t) {
		let n = Error(e);
		return n.code = t, n;
	}
})), De = /* @__PURE__ */ A(((e, t) => {
	var n = 1e3, r = n * 60, i = r * 60, a = i * 24, o = a * 7, s = a * 365.25;
	t.exports = function(e, t) {
		t ||= {};
		var n = typeof e;
		if (n === "string" && e.length > 0) return c(e);
		if (n === "number" && isFinite(e)) return t.long ? u(e) : l(e);
		throw Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(e));
	};
	function c(e) {
		if (e = String(e), !(e.length > 100)) {
			var t = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(e);
			if (t) {
				var c = parseFloat(t[1]);
				switch ((t[2] || "ms").toLowerCase()) {
					case "years":
					case "year":
					case "yrs":
					case "yr":
					case "y": return c * s;
					case "weeks":
					case "week":
					case "w": return c * o;
					case "days":
					case "day":
					case "d": return c * a;
					case "hours":
					case "hour":
					case "hrs":
					case "hr":
					case "h": return c * i;
					case "minutes":
					case "minute":
					case "mins":
					case "min":
					case "m": return c * r;
					case "seconds":
					case "second":
					case "secs":
					case "sec":
					case "s": return c * n;
					case "milliseconds":
					case "millisecond":
					case "msecs":
					case "msec":
					case "ms": return c;
					default: return;
				}
			}
		}
	}
	function l(e) {
		var t = Math.abs(e);
		return t >= a ? Math.round(e / a) + "d" : t >= i ? Math.round(e / i) + "h" : t >= r ? Math.round(e / r) + "m" : t >= n ? Math.round(e / n) + "s" : e + "ms";
	}
	function u(e) {
		var t = Math.abs(e);
		return t >= a ? d(e, t, a, "day") : t >= i ? d(e, t, i, "hour") : t >= r ? d(e, t, r, "minute") : t >= n ? d(e, t, n, "second") : e + " ms";
	}
	function d(e, t, n, r) {
		var i = t >= n * 1.5;
		return Math.round(e / n) + " " + r + (i ? "s" : "");
	}
})), Oe = /* @__PURE__ */ A(((e, t) => {
	function n(e) {
		n.debug = n, n.default = n, n.coerce = c, n.disable = o, n.enable = i, n.enabled = s, n.humanize = De(), n.destroy = l, Object.keys(e).forEach((t) => {
			n[t] = e[t];
		}), n.names = [], n.skips = [], n.formatters = {};
		function t(e) {
			let t = 0;
			for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n), t |= 0;
			return n.colors[Math.abs(t) % n.colors.length];
		}
		n.selectColor = t;
		function n(e) {
			let t, i = null, a, o;
			function s(...e) {
				if (!s.enabled) return;
				let r = s, i = Number(/* @__PURE__ */ new Date());
				r.diff = i - (t || i), r.prev = t, r.curr = i, t = i, e[0] = n.coerce(e[0]), typeof e[0] != "string" && e.unshift("%O");
				let a = 0;
				e[0] = e[0].replace(/%([a-zA-Z%])/g, (t, i) => {
					if (t === "%%") return "%";
					a++;
					let o = n.formatters[i];
					if (typeof o == "function") {
						let n = e[a];
						t = o.call(r, n), e.splice(a, 1), a--;
					}
					return t;
				}), n.formatArgs.call(r, e), (r.log || n.log).apply(r, e);
			}
			return s.namespace = e, s.useColors = n.useColors(), s.color = n.selectColor(e), s.extend = r, s.destroy = n.destroy, Object.defineProperty(s, "enabled", {
				enumerable: !0,
				configurable: !1,
				get: () => i === null ? (a !== n.namespaces && (a = n.namespaces, o = n.enabled(e)), o) : i,
				set: (e) => {
					i = e;
				}
			}), typeof n.init == "function" && n.init(s), s;
		}
		function r(e, t) {
			let r = n(this.namespace + (t === void 0 ? ":" : t) + e);
			return r.log = this.log, r;
		}
		function i(e) {
			n.save(e), n.namespaces = e, n.names = [], n.skips = [];
			let t = (typeof e == "string" ? e : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
			for (let e of t) e[0] === "-" ? n.skips.push(e.slice(1)) : n.names.push(e);
		}
		function a(e, t) {
			let n = 0, r = 0, i = -1, a = 0;
			for (; n < e.length;) if (r < t.length && (t[r] === e[n] || t[r] === "*")) t[r] === "*" ? (i = r, a = n, r++) : (n++, r++);
			else if (i !== -1) r = i + 1, a++, n = a;
			else return !1;
			for (; r < t.length && t[r] === "*";) r++;
			return r === t.length;
		}
		function o() {
			let e = [...n.names, ...n.skips.map((e) => "-" + e)].join(",");
			return n.enable(""), e;
		}
		function s(e) {
			for (let t of n.skips) if (a(e, t)) return !1;
			for (let t of n.names) if (a(e, t)) return !0;
			return !1;
		}
		function c(e) {
			return e instanceof Error ? e.stack || e.message : e;
		}
		function l() {
			console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
		}
		return n.enable(n.load()), n;
	}
	t.exports = n;
})), ke = /* @__PURE__ */ A(((e, t) => {
	e.formatArgs = r, e.save = i, e.load = a, e.useColors = n, e.storage = o(), e.destroy = (() => {
		let e = !1;
		return () => {
			e || (e = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
		};
	})(), e.colors = /* @__PURE__ */ "#0000CC.#0000FF.#0033CC.#0033FF.#0066CC.#0066FF.#0099CC.#0099FF.#00CC00.#00CC33.#00CC66.#00CC99.#00CCCC.#00CCFF.#3300CC.#3300FF.#3333CC.#3333FF.#3366CC.#3366FF.#3399CC.#3399FF.#33CC00.#33CC33.#33CC66.#33CC99.#33CCCC.#33CCFF.#6600CC.#6600FF.#6633CC.#6633FF.#66CC00.#66CC33.#9900CC.#9900FF.#9933CC.#9933FF.#99CC00.#99CC33.#CC0000.#CC0033.#CC0066.#CC0099.#CC00CC.#CC00FF.#CC3300.#CC3333.#CC3366.#CC3399.#CC33CC.#CC33FF.#CC6600.#CC6633.#CC9900.#CC9933.#CCCC00.#CCCC33.#FF0000.#FF0033.#FF0066.#FF0099.#FF00CC.#FF00FF.#FF3300.#FF3333.#FF3366.#FF3399.#FF33CC.#FF33FF.#FF6600.#FF6633.#FF9900.#FF9933.#FFCC00.#FFCC33".split(".");
	function n() {
		if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return !0;
		if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return !1;
		let e;
		return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator < "u" && navigator.userAgent && (e = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(e[1], 10) >= 31 || typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
	}
	function r(e) {
		if (e[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + e[0] + (this.useColors ? "%c " : " ") + "+" + t.exports.humanize(this.diff), !this.useColors) return;
		let n = "color: " + this.color;
		e.splice(1, 0, n, "color: inherit");
		let r = 0, i = 0;
		e[0].replace(/%[a-zA-Z%]/g, (e) => {
			e !== "%%" && (r++, e === "%c" && (i = r));
		}), e.splice(i, 0, n);
	}
	e.log = console.debug || console.log || (() => {});
	function i(t) {
		try {
			t ? e.storage.setItem("debug", t) : e.storage.removeItem("debug");
		} catch {}
	}
	function a() {
		let t;
		try {
			t = e.storage.getItem("debug") || e.storage.getItem("DEBUG");
		} catch {}
		return !t && typeof process < "u" && "env" in process && (t = process.env.DEBUG), t;
	}
	function o() {
		try {
			return localStorage;
		} catch {}
	}
	t.exports = Oe()(e);
	var { formatters: s } = t.exports;
	s.j = function(e) {
		try {
			return JSON.stringify(e);
		} catch (e) {
			return "[UnexpectedJSONParseError]: " + e.message;
		}
	};
})), Ae = /* @__PURE__ */ A(((e, t) => {
	t.exports = (e, t = process.argv) => {
		let n = e.startsWith("-") ? "" : e.length === 1 ? "-" : "--", r = t.indexOf(n + e), i = t.indexOf("--");
		return r !== -1 && (i === -1 || r < i);
	};
})), je = /* @__PURE__ */ A(((e, t) => {
	var n = F("os"), r = F("tty"), i = Ae(), { env: a } = process, o;
	i("no-color") || i("no-colors") || i("color=false") || i("color=never") ? o = 0 : (i("color") || i("colors") || i("color=true") || i("color=always")) && (o = 1), "FORCE_COLOR" in a && (o = a.FORCE_COLOR === "true" ? 1 : a.FORCE_COLOR === "false" ? 0 : a.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(a.FORCE_COLOR, 10), 3));
	function s(e) {
		return e === 0 ? !1 : {
			level: e,
			hasBasic: !0,
			has256: e >= 2,
			has16m: e >= 3
		};
	}
	function c(e, t) {
		if (o === 0) return 0;
		if (i("color=16m") || i("color=full") || i("color=truecolor")) return 3;
		if (i("color=256")) return 2;
		if (e && !t && o === void 0) return 0;
		let r = o || 0;
		if (a.TERM === "dumb") return r;
		if (process.platform === "win32") {
			let e = n.release().split(".");
			return Number(e[0]) >= 10 && Number(e[2]) >= 10586 ? Number(e[2]) >= 14931 ? 3 : 2 : 1;
		}
		if ("CI" in a) return [
			"TRAVIS",
			"CIRCLECI",
			"APPVEYOR",
			"GITLAB_CI",
			"GITHUB_ACTIONS",
			"BUILDKITE"
		].some((e) => e in a) || a.CI_NAME === "codeship" ? 1 : r;
		if ("TEAMCITY_VERSION" in a) return +!!/^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(a.TEAMCITY_VERSION);
		if (a.COLORTERM === "truecolor") return 3;
		if ("TERM_PROGRAM" in a) {
			let e = parseInt((a.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
			switch (a.TERM_PROGRAM) {
				case "iTerm.app": return e >= 3 ? 3 : 2;
				case "Apple_Terminal": return 2;
			}
		}
		return /-256(color)?$/i.test(a.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(a.TERM) || "COLORTERM" in a ? 1 : r;
	}
	function l(e) {
		return s(c(e, e && e.isTTY));
	}
	t.exports = {
		supportsColor: l,
		stdout: s(c(!0, r.isatty(1))),
		stderr: s(c(!0, r.isatty(2)))
	};
})), Me = /* @__PURE__ */ A(((e, t) => {
	var n = F("tty"), r = F("util");
	e.init = u, e.log = s, e.formatArgs = a, e.save = c, e.load = l, e.useColors = i, e.destroy = r.deprecate(() => {}, "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."), e.colors = [
		6,
		2,
		3,
		4,
		5,
		1
	];
	try {
		let t = je();
		t && (t.stderr || t).level >= 2 && (e.colors = [
			20,
			21,
			26,
			27,
			32,
			33,
			38,
			39,
			40,
			41,
			42,
			43,
			44,
			45,
			56,
			57,
			62,
			63,
			68,
			69,
			74,
			75,
			76,
			77,
			78,
			79,
			80,
			81,
			92,
			93,
			98,
			99,
			112,
			113,
			128,
			129,
			134,
			135,
			148,
			149,
			160,
			161,
			162,
			163,
			164,
			165,
			166,
			167,
			168,
			169,
			170,
			171,
			172,
			173,
			178,
			179,
			184,
			185,
			196,
			197,
			198,
			199,
			200,
			201,
			202,
			203,
			204,
			205,
			206,
			207,
			208,
			209,
			214,
			215,
			220,
			221
		]);
	} catch {}
	e.inspectOpts = Object.keys(process.env).filter((e) => /^debug_/i.test(e)).reduce((e, t) => {
		let n = t.substring(6).toLowerCase().replace(/_([a-z])/g, (e, t) => t.toUpperCase()), r = process.env[t];
		return r = /^(yes|on|true|enabled)$/i.test(r) ? !0 : /^(no|off|false|disabled)$/i.test(r) ? !1 : r === "null" ? null : Number(r), e[n] = r, e;
	}, {});
	function i() {
		return "colors" in e.inspectOpts ? !!e.inspectOpts.colors : n.isatty(process.stderr.fd);
	}
	function a(e) {
		let { namespace: n, useColors: r } = this;
		if (r) {
			let r = this.color, i = "\x1B[3" + (r < 8 ? r : "8;5;" + r), a = `  ${i};1m${n} \u001B[0m`;
			e[0] = a + e[0].split("\n").join("\n" + a), e.push(i + "m+" + t.exports.humanize(this.diff) + "\x1B[0m");
		} else e[0] = o() + n + " " + e[0];
	}
	function o() {
		return e.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
	}
	function s(...t) {
		return process.stderr.write(r.formatWithOptions(e.inspectOpts, ...t) + "\n");
	}
	function c(e) {
		e ? process.env.DEBUG = e : delete process.env.DEBUG;
	}
	function l() {
		return process.env.DEBUG;
	}
	function u(t) {
		t.inspectOpts = {};
		let n = Object.keys(e.inspectOpts);
		for (let r = 0; r < n.length; r++) t.inspectOpts[n[r]] = e.inspectOpts[n[r]];
	}
	t.exports = Oe()(e);
	var { formatters: d } = t.exports;
	d.o = function(e) {
		return this.inspectOpts.colors = this.useColors, r.inspect(e, this.inspectOpts).split("\n").map((e) => e.trim()).join(" ");
	}, d.O = function(e) {
		return this.inspectOpts.colors = this.useColors, r.inspect(e, this.inspectOpts);
	};
})), Ne = /* @__PURE__ */ A(((e, t) => {
	typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? t.exports = ke() : t.exports = Me();
})), Pe = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.ProgressCallbackTransform = void 0;
	var t = F("stream");
	e.ProgressCallbackTransform = class extends t.Transform {
		constructor(e, t, n) {
			super(), this.total = e, this.cancellationToken = t, this.onProgress = n, this.start = Date.now(), this.transferred = 0, this.delta = 0, this.nextUpdate = this.start + 1e3;
		}
		_transform(e, t, n) {
			if (this.cancellationToken.cancelled) {
				n(/* @__PURE__ */ Error("cancelled"), null);
				return;
			}
			this.transferred += e.length, this.delta += e.length;
			let r = Date.now();
			r >= this.nextUpdate && this.transferred !== this.total && (this.nextUpdate = r + 1e3, this.onProgress({
				total: this.total,
				delta: this.delta,
				transferred: this.transferred,
				percent: this.transferred / this.total * 100,
				bytesPerSecond: Math.round(this.transferred / ((r - this.start) / 1e3))
			}), this.delta = 0), n(null, e);
		}
		_flush(e) {
			if (this.cancellationToken.cancelled) {
				e(/* @__PURE__ */ Error("cancelled"));
				return;
			}
			this.onProgress({
				total: this.total,
				delta: this.delta,
				transferred: this.total,
				percent: 100,
				bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
			}), this.delta = 0, e(null);
		}
	};
})), Fe = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.DigestTransform = e.HttpExecutor = e.HttpError = void 0, e.addSensitiveRedirectHeader = m, e.addSensitiveFieldPattern = h, e.createHttpError = g, e.parseJson = y, e.configureRequestOptionsFromUrl = x, e.configureRequestUrl = S, e.safeGetHeader = T, e.configureRequestOptions = D, e.isSensitiveFieldName = O, e.hashSensitiveValue = k, e.safeStringifyJson = A;
	var t = F("crypto"), n = Ne(), r = F("fs"), i = F("stream"), a = F("url"), o = Te(), s = Ee(), c = Pe(), l = (0, n.default)("electron-builder"), u = (e) => e.toLowerCase().replace(/[-_]/g, ""), d = new Set([
		"authorization",
		"proxyauthorization",
		"privatetoken",
		"xapikey",
		"xauthtoken",
		"xaccesstoken",
		"xgitlabtoken",
		"cookie",
		"xcsrftoken"
	]), f = [
		"token",
		"password",
		"secret",
		"authorization",
		"credential",
		"apikey",
		"passphrase",
		"auth"
	], p = ["key"];
	function m(e) {
		d.add(u(e));
	}
	function h(e) {
		f.push(e.toLowerCase().replace(/[-_]/g, ""));
	}
	function g(e, t = null) {
		return new v(e.statusCode || -1, `${e.statusCode} ${e.statusMessage}` + (t == null ? "" : "\n" + JSON.stringify(t, null, "  ")) + "\nHeaders: " + A(e.headers), t);
	}
	var _ = new Map([
		[429, "Too many requests"],
		[400, "Bad request"],
		[403, "Forbidden"],
		[404, "Not found"],
		[405, "Method not allowed"],
		[406, "Not acceptable"],
		[408, "Request timeout"],
		[413, "Request entity too large"],
		[500, "Internal server error"],
		[502, "Bad gateway"],
		[503, "Service unavailable"],
		[504, "Gateway timeout"],
		[505, "HTTP version not supported"]
	]), v = class extends Error {
		constructor(e, t = `HTTP error: ${_.get(e) || e}`, n = null) {
			super(t), this.statusCode = e, this.description = n, this.name = "HttpError", this.code = `HTTP_ERROR_${e}`;
		}
		isServerError() {
			return this.statusCode >= 500 && this.statusCode <= 599;
		}
	};
	e.HttpError = v;
	function y(e) {
		return e.then((e) => e == null || e.length === 0 ? null : JSON.parse(e));
	}
	e.HttpExecutor = class e {
		constructor() {
			this.maxRedirects = 10;
		}
		request(e, t = new o.CancellationToken(), n) {
			D(e);
			let r = n == null ? void 0 : JSON.stringify(n), i = r ? Buffer.from(r) : void 0;
			if (i != null) {
				l.enabled && l(A(n));
				let { headers: t, ...r } = e;
				e = {
					method: "post",
					headers: {
						"Content-Type": "application/json",
						"Content-Length": i.length,
						...t
					},
					...r
				};
			}
			return this.doApiRequest(e, t, (e) => e.end(i));
		}
		doApiRequest(e, t, n, r = 0) {
			if (l.enabled) {
				let { headers: t, auth: n, ...r } = e;
				l(`Request: ${A(r)}`);
			}
			return t.createPromise((i, a, o) => {
				let s = this.createRequest(e, (o) => {
					try {
						this.handleResponse(o, e, t, i, a, r, n);
					} catch (e) {
						a(e);
					}
				});
				this.addErrorAndTimeoutHandlers(s, a, e.timeout), this.addRedirectHandlers(s, e, a, r, (e) => {
					this.doApiRequest(e, t, n, r).then(i).catch(a);
				}), n(s, a), o(() => s.abort());
			});
		}
		addRedirectHandlers(e, t, n, r, i) {}
		addErrorAndTimeoutHandlers(e, t, n = 60 * 1e3) {
			this.addTimeOutHandler(e, t, n), e.on("error", t), e.on("aborted", () => {
				t(/* @__PURE__ */ Error("Request has been aborted by the server"));
			});
		}
		handleResponse(t, n, r, i, a, o, s) {
			if (l.enabled) {
				let { headers: e, auth: r, ...i } = n;
				l(`Response: ${t.statusCode} ${t.statusMessage}, request options: ${A(i)}`);
			}
			if (t.statusCode === 404) {
				a(g(t, `method: ${n.method || "GET"} url: ${n.protocol || "https:"}//${n.hostname}${n.port ? `:${n.port}` : ""}${n.path}

Please double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.
`));
				return;
			} else if (t.statusCode === 204) {
				i();
				return;
			}
			let c = t.statusCode ?? 0, u = c >= 300 && c < 400, d = T(t, "location");
			if (u && d != null) {
				if (o > this.maxRedirects) {
					a(this.createMaxRedirectError());
					return;
				}
				this.doApiRequest(e.prepareRedirectUrlOptions(d, n), r, s, o).then(i).catch(a);
				return;
			}
			t.setEncoding("utf8");
			let f = "";
			t.on("error", a), t.on("data", (e) => f += e), t.on("end", () => {
				try {
					if (t.statusCode != null && t.statusCode >= 400) {
						let e = T(t, "content-type"), r = e != null && (Array.isArray(e) ? e.find((e) => e.includes("json")) != null : e.includes("json"));
						a(g(t, `method: ${n.method || "GET"} url: ${n.protocol || "https:"}//${n.hostname}${n.port ? `:${n.port}` : ""}${n.path}

          Data:
          ${r ? A(JSON.parse(f)) : f}
          `));
					} else i(f.length === 0 ? null : f);
				} catch (e) {
					a(e);
				}
			});
		}
		async downloadToBuffer(e, t) {
			return await t.cancellationToken.createPromise((n, r, i) => {
				let a = [], o = {
					headers: t.headers || void 0,
					redirect: "manual"
				};
				S(e, o), D(o), this.doDownload(o, {
					destination: null,
					options: t,
					onCancel: i,
					callback: (e) => {
						e == null ? n(Buffer.concat(a)) : r(e);
					},
					responseHandler: (e, t) => {
						let n = 0;
						e.on("data", (e) => {
							if (n += e.length, n > 524288e3) {
								t(/* @__PURE__ */ Error("Maximum allowed size is 500 MB"));
								return;
							}
							a.push(e);
						}), e.on("end", () => {
							t(null);
						});
					}
				}, 0);
			});
		}
		doDownload(t, n, r) {
			let i = this.createRequest(t, (i) => {
				if (i.statusCode >= 400) {
					n.callback(/* @__PURE__ */ Error(`Cannot download "${t.protocol || "https:"}//${t.hostname}${t.path}", status ${i.statusCode}: ${i.statusMessage}`));
					return;
				}
				i.on("error", n.callback);
				let a = T(i, "location");
				if (a != null) {
					r < this.maxRedirects ? this.doDownload(e.prepareRedirectUrlOptions(a, t), n, r++) : n.callback(this.createMaxRedirectError());
					return;
				}
				n.responseHandler == null ? E(n, i) : n.responseHandler(i, n.callback);
			});
			this.addErrorAndTimeoutHandlers(i, n.callback, t.timeout), this.addRedirectHandlers(i, t, n.callback, r, (e) => {
				this.doDownload(e, n, r++);
			}), i.end();
		}
		createMaxRedirectError() {
			return /* @__PURE__ */ Error(`Too many redirects (> ${this.maxRedirects})`);
		}
		addTimeOutHandler(e, t, n) {
			e.on("socket", (r) => {
				r.setTimeout(n, () => {
					e.abort(), t(/* @__PURE__ */ Error("Request timed out"));
				});
			});
		}
		static prepareRedirectUrlOptions(t, n) {
			let r = x(t, { ...n }), i = r.headers;
			if (i == null) return r;
			let a = e.reconstructOriginalUrl(n), o = b(t, n);
			if (e.isCrossOriginRedirect(a, o)) {
				l.enabled && l(`Cross-origin redirect (${a.host} → ${o.host}): stripping sensitive headers`);
				for (let e of Object.keys(i)) d.has(u(e)) && delete i[e];
			}
			return r;
		}
		static reconstructOriginalUrl(e) {
			let t = e.protocol || "https:";
			if (!e.hostname) throw Error("Missing hostname in request options");
			let n = e.hostname, r = e.port ? `:${e.port}` : "", i = e.path || "/";
			return new a.URL(`${t}//${n}${r}${i}`);
		}
		static isCrossOriginRedirect(e, t) {
			return e.hostname.toLowerCase() === t.hostname.toLowerCase() ? e.protocol === "http:" && ["80", ""].includes(e.port) && t.protocol === "https:" && ["443", ""].includes(t.port) ? !1 : e.protocol === t.protocol ? e.port !== t.port : !0 : !0;
		}
		static async retryOnServerError(e, t = 3) {
			for (let n = 0;; n++) try {
				return await e();
			} catch (e) {
				if (n < t && (e instanceof v && e.isServerError() || e.code === "EPIPE")) {
					await new Promise((e) => setTimeout(e, 1e3 * (n + 1)));
					continue;
				}
				throw e;
			}
		}
	};
	function b(e, t) {
		try {
			return new a.URL(e);
		} catch {
			let n = t.hostname, r = `${t.protocol || "https:"}//${n}${t.port ? `:${t.port}` : ""}`;
			return new a.URL(e, r);
		}
	}
	function x(e, t) {
		let n = D(t);
		return S(b(e, t), n), n;
	}
	function S(e, t) {
		t.protocol = e.protocol, t.hostname = e.hostname, e.port ? t.port = e.port : t.port && delete t.port, t.path = e.pathname + e.search;
	}
	var C = class extends i.Transform {
		get actual() {
			return this._actual;
		}
		constructor(e, n = "sha512", r = "base64") {
			super(), this.expected = e, this.algorithm = n, this.encoding = r, this._actual = null, this.isValidateOnEnd = !0, this.digester = (0, t.createHash)(n);
		}
		_transform(e, t, n) {
			this.digester.update(e), n(null, e);
		}
		_flush(e) {
			if (this._actual = this.digester.digest(this.encoding), this.isValidateOnEnd) try {
				this.validate();
			} catch (t) {
				e(t);
				return;
			}
			e(null);
		}
		validate() {
			if (this._actual == null) throw (0, s.newError)("Not finished yet", "ERR_STREAM_NOT_FINISHED");
			if (this._actual !== this.expected) throw (0, s.newError)(`${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`, "ERR_CHECKSUM_MISMATCH");
			return null;
		}
	};
	e.DigestTransform = C;
	function w(e, t, n) {
		return e != null && t != null && e !== t ? (n(/* @__PURE__ */ Error(`checksum mismatch: expected ${t} but got ${e} (X-Checksum-Sha2 header)`)), !1) : !0;
	}
	function T(e, t) {
		let n = e.headers[t];
		return n == null ? null : Array.isArray(n) ? n.length === 0 ? null : n[n.length - 1] : n;
	}
	function E(e, t) {
		if (!w(T(t, "X-Checksum-Sha2"), e.options.sha2, e.callback)) return;
		let n = [];
		if (e.options.onProgress != null) {
			let r = T(t, "content-length");
			r != null && n.push(new c.ProgressCallbackTransform(parseInt(r, 10), e.options.cancellationToken, e.options.onProgress));
		}
		let i = e.options.sha512;
		i == null ? e.options.sha2 != null && n.push(new C(e.options.sha2, "sha256", "hex")) : n.push(new C(i, "sha512", i.length === 128 && !i.includes("+") && !i.includes("Z") && !i.includes("=") ? "hex" : "base64"));
		let a = (0, r.createWriteStream)(e.destination);
		n.push(a);
		let o = t;
		for (let t of n) t.on("error", (t) => {
			a.close(), e.options.cancellationToken.cancelled || e.callback(t);
		}), o = o.pipe(t);
		a.on("finish", () => {
			a.close(e.callback);
		});
	}
	function D(e, t, n) {
		n != null && (e.method = n), e.headers = { ...e.headers };
		let r = e.headers;
		return t != null && (r.authorization = t.startsWith("Basic") || t.startsWith("Bearer") ? t : `token ${t}`), r["User-Agent"] ??= "electron-builder", (n == null || n === "GET" || r["Cache-Control"] == null) && (r["Cache-Control"] = "no-cache"), e.protocol == null && process.versions.electron != null && (e.protocol = "https:"), e;
	}
	function O(e) {
		let t = u(e);
		return f.some((e) => t.includes(e)) || p.some((e) => t.endsWith(e));
	}
	function k(e) {
		return `${(0, t.createHash)("sha256").update(e).digest("hex")} (sha256 hash)`;
	}
	function A(e, t) {
		return JSON.stringify(e, (e, n) => O(e) || t != null && t.has(e) ? typeof n == "string" ? k(n) : "<stripped sensitive data>" : n, 2);
	}
})), Ie = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.MemoLazy = void 0, e.MemoLazy = class {
		constructor(e, t) {
			this.selector = e, this.creator = t, this.selected = void 0, this._value = void 0;
		}
		get hasValue() {
			return this._value !== void 0;
		}
		get value() {
			let e = this.selector();
			if (this._value !== void 0 && t(this.selected, e)) return this._value;
			this.selected = e;
			let n = this.creator(e);
			return this.value = n, n;
		}
		set value(e) {
			this._value = e;
		}
	};
	function t(e, n) {
		if (typeof e == "object" && e && typeof n == "object" && n) {
			let r = Object.keys(e), i = Object.keys(n);
			return r.length === i.length && r.every((r) => t(e[r], n[r]));
		}
		return e === n;
	}
})), Le = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.githubUrl = t, e.githubTagPrefix = n, e.getS3LikeProviderBaseUrl = r;
	function t(e, t = "github.com") {
		return `${e.protocol || "https"}://${e.host || t}`;
	}
	function n(e) {
		return e.tagNamePrefix ? e.tagNamePrefix : e.vPrefixedTagName ?? !0 ? "v" : "";
	}
	function r(e) {
		let t = e.provider;
		if (t === "s3") return i(e);
		if (t === "spaces") return o(e);
		throw Error(`Not supported provider: ${t}`);
	}
	function i(e) {
		let t;
		if (e.accelerate == 1) t = `https://${e.bucket}.s3-accelerate.amazonaws.com`;
		else if (e.endpoint != null) t = `${e.endpoint}/${e.bucket}`;
		else if (e.bucket.includes(".")) {
			if (e.region == null) throw Error(`Bucket name "${e.bucket}" includes a dot, but S3 region is missing`);
			t = e.region === "us-east-1" ? `https://s3.amazonaws.com/${e.bucket}` : `https://s3-${e.region}.amazonaws.com/${e.bucket}`;
		} else t = e.region === "cn-north-1" ? `https://${e.bucket}.s3.${e.region}.amazonaws.com.cn` : `https://${e.bucket}.s3.amazonaws.com`;
		return a(t, e.path);
	}
	function a(e, t) {
		return t != null && t.length > 0 && (t.startsWith("/") || (e += "/"), e += t), e;
	}
	function o(e) {
		if (e.name == null) throw Error("name is missing");
		if (e.region == null) throw Error("region is missing");
		return a(`https://${e.name}.${e.region}.digitaloceanspaces.com`, e.path);
	}
})), Re = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.retry = n;
	var t = Te();
	async function n(e, r) {
		let { retries: i, interval: a, backoff: o = 0, attempt: s = 0, shouldRetry: c, cancellationToken: l = new t.CancellationToken() } = r;
		try {
			return await e();
		} catch (t) {
			if (await Promise.resolve(c?.(t) ?? !0) && i > 0 && !l.cancelled) return await new Promise((e) => setTimeout(e, a + o * s)), await n(e, {
				...r,
				retries: i - 1,
				attempt: s + 1
			});
			throw t;
		}
	}
})), ze = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.parseDn = t;
	function t(e) {
		let t = !1, n = null, r = "", i = 0;
		e = e.trim();
		let a = /* @__PURE__ */ new Map();
		for (let o = 0; o <= e.length; o++) {
			if (o === e.length) {
				n !== null && a.set(n, r);
				break;
			}
			let s = e[o];
			if (t) {
				if (s === "\"") {
					t = !1;
					continue;
				}
			} else {
				if (s === "\"") {
					t = !0;
					continue;
				}
				if (s === "\\") {
					o++;
					let t = parseInt(e.slice(o, o + 2), 16);
					Number.isNaN(t) ? r += e[o] : (o++, r += String.fromCharCode(t));
					continue;
				}
				if (n === null && s === "=") {
					n = r, r = "";
					continue;
				}
				if (s === "," || s === ";" || s === "+") {
					n !== null && a.set(n, r), n = null, r = "";
					continue;
				}
			}
			if (s === " " && !t) {
				if (r.length === 0) continue;
				if (o > i) {
					let t = o;
					for (; e[t] === " ";) t++;
					i = t;
				}
				if (i >= e.length || e[i] === "," || e[i] === ";" || n === null && e[i] === "=" || n !== null && e[i] === "+") {
					o = i - 1;
					continue;
				}
			}
			r += s;
		}
		return a;
	}
})), Be = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.nil = e.UUID = void 0;
	var t = F("crypto"), n = Ee(), r = "options.name must be either a string or a Buffer", i = (0, t.randomBytes)(16);
	i[0] |= 1;
	var a = {}, o = [];
	for (let e = 0; e < 256; e++) {
		let t = (e + 256).toString(16).substr(1);
		a[t] = e, o[e] = t;
	}
	var s = class e {
		constructor(t) {
			this.ascii = null, this.binary = null;
			let n = e.check(t);
			if (!n) throw Error("not a UUID");
			this.version = n.version, n.format === "ascii" ? this.ascii = t : this.binary = t;
		}
		static v5(e, t) {
			return u(e, "sha1", 80, t);
		}
		toString() {
			return this.ascii ??= d(this.binary), this.ascii;
		}
		inspect() {
			return `UUID v${this.version} ${this.toString()}`;
		}
		static check(e, t = 0) {
			if (typeof e == "string") return e = e.toLowerCase(), /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-([a-f0-9]{12})$/.test(e) ? e === "00000000-0000-0000-0000-000000000000" ? {
				version: void 0,
				variant: "nil",
				format: "ascii"
			} : {
				version: (a[e[14] + e[15]] & 240) >> 4,
				variant: c((a[e[19] + e[20]] & 224) >> 5),
				format: "ascii"
			} : !1;
			if (Buffer.isBuffer(e)) {
				if (e.length < t + 16) return !1;
				let n = 0;
				for (; n < 16 && e[t + n] === 0; n++);
				return n === 16 ? {
					version: void 0,
					variant: "nil",
					format: "binary"
				} : {
					version: (e[t + 6] & 240) >> 4,
					variant: c((e[t + 8] & 224) >> 5),
					format: "binary"
				};
			}
			throw (0, n.newError)("Unknown type of uuid", "ERR_UNKNOWN_UUID_TYPE");
		}
		static parse(e) {
			let t = Buffer.allocUnsafe(16), n = 0;
			for (let r = 0; r < 16; r++) t[r] = a[e[n++] + e[n++]], (r === 3 || r === 5 || r === 7 || r === 9) && (n += 1);
			return t;
		}
	};
	e.UUID = s, s.OID = s.parse("6ba7b812-9dad-11d1-80b4-00c04fd430c8");
	function c(e) {
		switch (e) {
			case 0:
			case 1:
			case 3: return "ncs";
			case 4:
			case 5: return "rfc4122";
			case 6: return "microsoft";
			default: return "future";
		}
	}
	var l;
	(function(e) {
		e[e.ASCII = 0] = "ASCII", e[e.BINARY = 1] = "BINARY", e[e.OBJECT = 2] = "OBJECT";
	})(l ||= {});
	function u(e, i, a, c, u = l.ASCII) {
		let d = (0, t.createHash)(i);
		if (typeof e != "string" && !Buffer.isBuffer(e)) throw (0, n.newError)(r, "ERR_INVALID_UUID_NAME");
		d.update(c), d.update(e);
		let f = d.digest(), p;
		switch (u) {
			case l.BINARY:
				f[6] = f[6] & 15 | a, f[8] = f[8] & 63 | 128, p = f;
				break;
			case l.OBJECT:
				f[6] = f[6] & 15 | a, f[8] = f[8] & 63 | 128, p = new s(f);
				break;
			default:
				p = o[f[0]] + o[f[1]] + o[f[2]] + o[f[3]] + "-" + o[f[4]] + o[f[5]] + "-" + o[f[6] & 15 | a] + o[f[7]] + "-" + o[f[8] & 63 | 128] + o[f[9]] + "-" + o[f[10]] + o[f[11]] + o[f[12]] + o[f[13]] + o[f[14]] + o[f[15]];
				break;
		}
		return p;
	}
	function d(e) {
		return o[e[0]] + o[e[1]] + o[e[2]] + o[e[3]] + "-" + o[e[4]] + o[e[5]] + "-" + o[e[6]] + o[e[7]] + "-" + o[e[8]] + o[e[9]] + "-" + o[e[10]] + o[e[11]] + o[e[12]] + o[e[13]] + o[e[14]] + o[e[15]];
	}
	e.nil = new s("00000000-0000-0000-0000-000000000000");
})), Ve = /* @__PURE__ */ A(((e) => {
	(function(e) {
		e.parser = function(e, t) {
			return new n(e, t);
		}, e.SAXParser = n, e.SAXStream = u, e.createStream = c, e.MAX_BUFFER_LENGTH = 64 * 1024;
		var t = [
			"comment",
			"sgmlDecl",
			"textNode",
			"tagName",
			"doctype",
			"procInstName",
			"procInstBody",
			"entity",
			"attribName",
			"attribValue",
			"cdata",
			"script"
		];
		e.EVENTS = [
			"text",
			"processinginstruction",
			"sgmldeclaration",
			"doctype",
			"comment",
			"opentagstart",
			"attribute",
			"opentag",
			"closetag",
			"opencdata",
			"cdata",
			"closecdata",
			"error",
			"end",
			"ready",
			"script",
			"opennamespace",
			"closenamespace"
		];
		function n(t, r) {
			if (!(this instanceof n)) return new n(t, r);
			var a = this;
			i(a), a.q = a.c = "", a.bufferCheckPosition = e.MAX_BUFFER_LENGTH, a.encoding = null, a.opt = r || {}, a.opt.lowercase = a.opt.lowercase || a.opt.lowercasetags, a.looseCase = a.opt.lowercase ? "toLowerCase" : "toUpperCase", a.opt.maxEntityCount = a.opt.maxEntityCount || 512, a.opt.maxEntityDepth = a.opt.maxEntityDepth || 4, a.entityCount = a.entityDepth = 0, a.tags = [], a.closed = a.closedRoot = a.sawRoot = !1, a.tag = a.error = null, a.strict = !!t, a.noscript = !!(t || a.opt.noscript), a.state = T.BEGIN, a.strictEntities = a.opt.strictEntities, a.ENTITIES = a.strictEntities ? Object.create(e.XML_ENTITIES) : Object.create(e.ENTITIES), a.attribList = [], a.opt.xmlns && (a.ns = Object.create(h)), a.opt.unquotedAttributeValues === void 0 && (a.opt.unquotedAttributeValues = !t), a.trackPosition = a.opt.position !== !1, a.trackPosition && (a.position = a.line = a.column = 0), D(a, "onready");
		}
		Object.create || (Object.create = function(e) {
			function t() {}
			return t.prototype = e, new t();
		}), Object.keys || (Object.keys = function(e) {
			var t = [];
			for (var n in e) e.hasOwnProperty(n) && t.push(n);
			return t;
		});
		function r(n) {
			for (var r = Math.max(e.MAX_BUFFER_LENGTH, 10), i = 0, a = 0, o = t.length; a < o; a++) {
				var s = n[t[a]].length;
				if (s > r) switch (t[a]) {
					case "textNode":
						N(n);
						break;
					case "cdata":
						M(n, "oncdata", n.cdata), n.cdata = "";
						break;
					case "script":
						M(n, "onscript", n.script), n.script = "";
						break;
					default: I(n, "Max buffer length exceeded: " + t[a]);
				}
				i = Math.max(i, s);
			}
			n.bufferCheckPosition = e.MAX_BUFFER_LENGTH - i + n.position;
		}
		function i(e) {
			for (var n = 0, r = t.length; n < r; n++) e[t[n]] = "";
		}
		function a(e) {
			N(e), e.cdata !== "" && (M(e, "oncdata", e.cdata), e.cdata = ""), e.script !== "" && (M(e, "onscript", e.script), e.script = "");
		}
		n.prototype = {
			end: function() {
				ee(this);
			},
			write: G,
			resume: function() {
				return this.error = null, this;
			},
			close: function() {
				return this.write(null);
			},
			flush: function() {
				a(this);
			}
		};
		var o;
		try {
			o = F("stream").Stream;
		} catch {
			o = function() {};
		}
		o ||= function() {};
		var s = e.EVENTS.filter(function(e) {
			return e !== "error" && e !== "end";
		});
		function c(e, t) {
			return new u(e, t);
		}
		function l(e, t) {
			if (e.length >= 2) {
				if (e[0] === 255 && e[1] === 254) return "utf-16le";
				if (e[0] === 254 && e[1] === 255) return "utf-16be";
			}
			return e.length >= 3 && e[0] === 239 && e[1] === 187 && e[2] === 191 ? "utf8" : e.length >= 4 ? e[0] === 60 && e[1] === 0 && e[2] === 63 && e[3] === 0 ? "utf-16le" : e[0] === 0 && e[1] === 60 && e[2] === 0 && e[3] === 63 ? "utf-16be" : "utf8" : t ? "utf8" : null;
		}
		function u(e, t) {
			if (!(this instanceof u)) return new u(e, t);
			o.apply(this), this._parser = new n(e, t), this.writable = !0, this.readable = !0;
			var r = this;
			this._parser.onend = function() {
				r.emit("end");
			}, this._parser.onerror = function(e) {
				r.emit("error", e), r._parser.error = null;
			}, this._decoder = null, this._decoderBuffer = null, s.forEach(function(e) {
				Object.defineProperty(r, "on" + e, {
					get: function() {
						return r._parser["on" + e];
					},
					set: function(t) {
						if (!t) return r.removeAllListeners(e), r._parser["on" + e] = t, t;
						r.on(e, t);
					},
					enumerable: !0,
					configurable: !1
				});
			});
		}
		u.prototype = Object.create(o.prototype, { constructor: { value: u } }), u.prototype._decodeBuffer = function(e, t) {
			if (this._decoderBuffer &&= (e = Buffer.concat([this._decoderBuffer, e]), null), !this._decoder) {
				var n = l(e, t);
				if (!n) return this._decoderBuffer = e, "";
				this._parser.encoding = n, this._decoder = new TextDecoder(n);
			}
			return this._decoder.decode(e, { stream: !t });
		}, u.prototype.write = function(e) {
			if (typeof Buffer == "function" && typeof Buffer.isBuffer == "function" && Buffer.isBuffer(e)) e = this._decodeBuffer(e, !1);
			else if (this._decoderBuffer) {
				var t = this._decodeBuffer(Buffer.alloc(0), !0);
				t && (this._parser.write(t), this.emit("data", t));
			}
			return this._parser.write(e.toString()), this.emit("data", e), !0;
		}, u.prototype.end = function(e) {
			if (e && e.length && this.write(e), this._decoderBuffer) {
				var t = this._decodeBuffer(Buffer.alloc(0), !0);
				t && (this._parser.write(t), this.emit("data", t));
			} else if (this._decoder) {
				var n = this._decoder.decode();
				n && (this._parser.write(n), this.emit("data", n));
			}
			return this._parser.end(), !0;
		}, u.prototype.on = function(e, t) {
			var n = this;
			return !n._parser["on" + e] && s.indexOf(e) !== -1 && (n._parser["on" + e] = function() {
				var t = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
				t.splice(0, 0, e), n.emit.apply(n, t);
			}), o.prototype.on.call(n, e, t);
		};
		var d = "[CDATA[", f = "DOCTYPE", p = "http://www.w3.org/XML/1998/namespace", m = "http://www.w3.org/2000/xmlns/", h = {
			xml: p,
			xmlns: m
		}, g = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, _ = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/, v = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/, y = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
		function b(e) {
			return e === " " || e === "\n" || e === "\r" || e === "	";
		}
		function x(e) {
			return e === "\"" || e === "'";
		}
		function S(e) {
			return e === ">" || b(e);
		}
		function C(e, t) {
			return e.test(t);
		}
		function w(e, t) {
			return !C(e, t);
		}
		var T = 0;
		for (var E in e.STATE = {
			BEGIN: T++,
			BEGIN_WHITESPACE: T++,
			TEXT: T++,
			TEXT_ENTITY: T++,
			OPEN_WAKA: T++,
			SGML_DECL: T++,
			SGML_DECL_QUOTED: T++,
			DOCTYPE: T++,
			DOCTYPE_QUOTED: T++,
			DOCTYPE_DTD: T++,
			DOCTYPE_DTD_QUOTED: T++,
			COMMENT_STARTING: T++,
			COMMENT: T++,
			COMMENT_ENDING: T++,
			COMMENT_ENDED: T++,
			CDATA: T++,
			CDATA_ENDING: T++,
			CDATA_ENDING_2: T++,
			PROC_INST: T++,
			PROC_INST_BODY: T++,
			PROC_INST_ENDING: T++,
			OPEN_TAG: T++,
			OPEN_TAG_SLASH: T++,
			ATTRIB: T++,
			ATTRIB_NAME: T++,
			ATTRIB_NAME_SAW_WHITE: T++,
			ATTRIB_VALUE: T++,
			ATTRIB_VALUE_QUOTED: T++,
			ATTRIB_VALUE_CLOSED: T++,
			ATTRIB_VALUE_UNQUOTED: T++,
			ATTRIB_VALUE_ENTITY_Q: T++,
			ATTRIB_VALUE_ENTITY_U: T++,
			CLOSE_TAG: T++,
			CLOSE_TAG_SAW_WHITE: T++,
			SCRIPT: T++,
			SCRIPT_ENDING: T++
		}, e.XML_ENTITIES = {
			amp: "&",
			gt: ">",
			lt: "<",
			quot: "\"",
			apos: "'"
		}, e.ENTITIES = {
			amp: "&",
			gt: ">",
			lt: "<",
			quot: "\"",
			apos: "'",
			AElig: 198,
			Aacute: 193,
			Acirc: 194,
			Agrave: 192,
			Aring: 197,
			Atilde: 195,
			Auml: 196,
			Ccedil: 199,
			ETH: 208,
			Eacute: 201,
			Ecirc: 202,
			Egrave: 200,
			Euml: 203,
			Iacute: 205,
			Icirc: 206,
			Igrave: 204,
			Iuml: 207,
			Ntilde: 209,
			Oacute: 211,
			Ocirc: 212,
			Ograve: 210,
			Oslash: 216,
			Otilde: 213,
			Ouml: 214,
			THORN: 222,
			Uacute: 218,
			Ucirc: 219,
			Ugrave: 217,
			Uuml: 220,
			Yacute: 221,
			aacute: 225,
			acirc: 226,
			aelig: 230,
			agrave: 224,
			aring: 229,
			atilde: 227,
			auml: 228,
			ccedil: 231,
			eacute: 233,
			ecirc: 234,
			egrave: 232,
			eth: 240,
			euml: 235,
			iacute: 237,
			icirc: 238,
			igrave: 236,
			iuml: 239,
			ntilde: 241,
			oacute: 243,
			ocirc: 244,
			ograve: 242,
			oslash: 248,
			otilde: 245,
			ouml: 246,
			szlig: 223,
			thorn: 254,
			uacute: 250,
			ucirc: 251,
			ugrave: 249,
			uuml: 252,
			yacute: 253,
			yuml: 255,
			copy: 169,
			reg: 174,
			nbsp: 160,
			iexcl: 161,
			cent: 162,
			pound: 163,
			curren: 164,
			yen: 165,
			brvbar: 166,
			sect: 167,
			uml: 168,
			ordf: 170,
			laquo: 171,
			not: 172,
			shy: 173,
			macr: 175,
			deg: 176,
			plusmn: 177,
			sup1: 185,
			sup2: 178,
			sup3: 179,
			acute: 180,
			micro: 181,
			para: 182,
			middot: 183,
			cedil: 184,
			ordm: 186,
			raquo: 187,
			frac14: 188,
			frac12: 189,
			frac34: 190,
			iquest: 191,
			times: 215,
			divide: 247,
			OElig: 338,
			oelig: 339,
			Scaron: 352,
			scaron: 353,
			Yuml: 376,
			fnof: 402,
			circ: 710,
			tilde: 732,
			Alpha: 913,
			Beta: 914,
			Gamma: 915,
			Delta: 916,
			Epsilon: 917,
			Zeta: 918,
			Eta: 919,
			Theta: 920,
			Iota: 921,
			Kappa: 922,
			Lambda: 923,
			Mu: 924,
			Nu: 925,
			Xi: 926,
			Omicron: 927,
			Pi: 928,
			Rho: 929,
			Sigma: 931,
			Tau: 932,
			Upsilon: 933,
			Phi: 934,
			Chi: 935,
			Psi: 936,
			Omega: 937,
			alpha: 945,
			beta: 946,
			gamma: 947,
			delta: 948,
			epsilon: 949,
			zeta: 950,
			eta: 951,
			theta: 952,
			iota: 953,
			kappa: 954,
			lambda: 955,
			mu: 956,
			nu: 957,
			xi: 958,
			omicron: 959,
			pi: 960,
			rho: 961,
			sigmaf: 962,
			sigma: 963,
			tau: 964,
			upsilon: 965,
			phi: 966,
			chi: 967,
			psi: 968,
			omega: 969,
			thetasym: 977,
			upsih: 978,
			piv: 982,
			ensp: 8194,
			emsp: 8195,
			thinsp: 8201,
			zwnj: 8204,
			zwj: 8205,
			lrm: 8206,
			rlm: 8207,
			ndash: 8211,
			mdash: 8212,
			lsquo: 8216,
			rsquo: 8217,
			sbquo: 8218,
			ldquo: 8220,
			rdquo: 8221,
			bdquo: 8222,
			dagger: 8224,
			Dagger: 8225,
			bull: 8226,
			hellip: 8230,
			permil: 8240,
			prime: 8242,
			Prime: 8243,
			lsaquo: 8249,
			rsaquo: 8250,
			oline: 8254,
			frasl: 8260,
			euro: 8364,
			image: 8465,
			weierp: 8472,
			real: 8476,
			trade: 8482,
			alefsym: 8501,
			larr: 8592,
			uarr: 8593,
			rarr: 8594,
			darr: 8595,
			harr: 8596,
			crarr: 8629,
			lArr: 8656,
			uArr: 8657,
			rArr: 8658,
			dArr: 8659,
			hArr: 8660,
			forall: 8704,
			part: 8706,
			exist: 8707,
			empty: 8709,
			nabla: 8711,
			isin: 8712,
			notin: 8713,
			ni: 8715,
			prod: 8719,
			sum: 8721,
			minus: 8722,
			lowast: 8727,
			radic: 8730,
			prop: 8733,
			infin: 8734,
			ang: 8736,
			and: 8743,
			or: 8744,
			cap: 8745,
			cup: 8746,
			int: 8747,
			there4: 8756,
			sim: 8764,
			cong: 8773,
			asymp: 8776,
			ne: 8800,
			equiv: 8801,
			le: 8804,
			ge: 8805,
			sub: 8834,
			sup: 8835,
			nsub: 8836,
			sube: 8838,
			supe: 8839,
			oplus: 8853,
			otimes: 8855,
			perp: 8869,
			sdot: 8901,
			lceil: 8968,
			rceil: 8969,
			lfloor: 8970,
			rfloor: 8971,
			lang: 9001,
			rang: 9002,
			loz: 9674,
			spades: 9824,
			clubs: 9827,
			hearts: 9829,
			diams: 9830
		}, Object.keys(e.ENTITIES).forEach(function(t) {
			var n = e.ENTITIES[t], r = typeof n == "number" ? String.fromCharCode(n) : n;
			e.ENTITIES[t] = r;
		}), e.STATE) e.STATE[e.STATE[E]] = E;
		T = e.STATE;
		function D(e, t, n) {
			e[t] && e[t](n);
		}
		function O(e) {
			var t = e && e.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
			return t ? t[2] : null;
		}
		function k(e) {
			return e ? e.toLowerCase().replace(/[^a-z0-9]/g, "") : null;
		}
		function A(e, t) {
			let n = k(e), r = k(t);
			return !n || !r ? !0 : r === "utf16" ? n === "utf16le" || n === "utf16be" : n === r;
		}
		function j(e, t) {
			if (!(!e.strict || !e.encoding || !t || t.name !== "xml")) {
				var n = O(t.body);
				n && !A(e.encoding, n) && L(e, "XML declaration encoding " + n + " does not match detected stream encoding " + e.encoding.toUpperCase());
			}
		}
		function M(e, t, n) {
			e.textNode && N(e), D(e, t, n);
		}
		function N(e) {
			e.textNode = P(e.opt, e.textNode), e.textNode && D(e, "ontext", e.textNode), e.textNode = "";
		}
		function P(e, t) {
			return e.trim && (t = t.trim()), e.normalize && (t = t.replace(/\s+/g, " ")), t;
		}
		function I(e, t) {
			return N(e), e.trackPosition && (t += "\nLine: " + e.line + "\nColumn: " + e.column + "\nChar: " + e.c), t = Error(t), e.error = t, D(e, "onerror", t), e;
		}
		function ee(e) {
			return e.sawRoot && !e.closedRoot && L(e, "Unclosed root tag"), e.state !== T.BEGIN && e.state !== T.BEGIN_WHITESPACE && e.state !== T.TEXT && I(e, "Unexpected end"), N(e), e.c = "", e.closed = !0, D(e, "onend"), n.call(e, e.strict, e.opt), e;
		}
		function L(e, t) {
			if (typeof e != "object" || !(e instanceof n)) throw Error("bad call to strictFail");
			e.strict && I(e, t);
		}
		function te(e) {
			e.strict || (e.tagName = e.tagName[e.looseCase]());
			var t = e.tags[e.tags.length - 1] || e, n = e.tag = {
				name: e.tagName,
				attributes: {}
			};
			e.opt.xmlns && (n.ns = t.ns), e.attribList.length = 0, M(e, "onopentagstart", n);
		}
		function R(e, t) {
			var n = e.indexOf(":") < 0 ? ["", e] : e.split(":"), r = n[0], i = n[1];
			return t && e === "xmlns" && (r = "xmlns", i = ""), {
				prefix: r,
				local: i
			};
		}
		function z(e) {
			if (e.strict || (e.attribName = e.attribName[e.looseCase]()), e.attribList.indexOf(e.attribName) !== -1 || e.tag.attributes.hasOwnProperty(e.attribName)) {
				e.attribName = e.attribValue = "";
				return;
			}
			if (e.opt.xmlns) {
				var t = R(e.attribName, !0), n = t.prefix, r = t.local;
				if (n === "xmlns") if (r === "xml" && e.attribValue !== p) L(e, "xml: prefix must be bound to " + p + "\nActual: " + e.attribValue);
				else if (r === "xmlns" && e.attribValue !== m) L(e, "xmlns: prefix must be bound to " + m + "\nActual: " + e.attribValue);
				else {
					var i = e.tag, a = e.tags[e.tags.length - 1] || e;
					i.ns === a.ns && (i.ns = Object.create(a.ns)), i.ns[r] = e.attribValue;
				}
				e.attribList.push([e.attribName, e.attribValue]);
			} else e.tag.attributes[e.attribName] = e.attribValue, M(e, "onattribute", {
				name: e.attribName,
				value: e.attribValue
			});
			e.attribName = e.attribValue = "";
		}
		function B(e, t) {
			if (e.opt.xmlns) {
				var n = e.tag, r = R(e.tagName);
				n.prefix = r.prefix, n.local = r.local, n.uri = n.ns[r.prefix] || "", n.prefix && !n.uri && (L(e, "Unbound namespace prefix: " + JSON.stringify(e.tagName)), n.uri = r.prefix);
				var i = e.tags[e.tags.length - 1] || e;
				n.ns && i.ns !== n.ns && Object.keys(n.ns).forEach(function(t) {
					M(e, "onopennamespace", {
						prefix: t,
						uri: n.ns[t]
					});
				});
				for (var a = 0, o = e.attribList.length; a < o; a++) {
					var s = e.attribList[a], c = s[0], l = s[1], u = R(c, !0), d = u.prefix, f = u.local, p = d === "" ? "" : n.ns[d] || "", m = {
						name: c,
						value: l,
						prefix: d,
						local: f,
						uri: p
					};
					d && d !== "xmlns" && !p && (L(e, "Unbound namespace prefix: " + JSON.stringify(d)), m.uri = d), e.tag.attributes[c] = m, M(e, "onattribute", m);
				}
				e.attribList.length = 0;
			}
			e.tag.isSelfClosing = !!t, e.sawRoot = !0, e.tags.push(e.tag), M(e, "onopentag", e.tag), t || (!e.noscript && e.tagName.toLowerCase() === "script" ? e.state = T.SCRIPT : e.state = T.TEXT, e.tag = null, e.tagName = ""), e.attribName = e.attribValue = "", e.attribList.length = 0;
		}
		function V(e) {
			if (!e.tagName) {
				L(e, "Weird empty close tag."), e.textNode += "</>", e.state = T.TEXT;
				return;
			}
			if (e.script) {
				if (e.tagName !== "script") {
					e.script += "</" + e.tagName + ">", e.tagName = "", e.state = T.SCRIPT;
					return;
				}
				M(e, "onscript", e.script), e.script = "";
			}
			var t = e.tags.length, n = e.tagName;
			e.strict || (n = n[e.looseCase]());
			for (var r = n; t-- && e.tags[t].name !== r;) L(e, "Unexpected close tag");
			if (t < 0) {
				L(e, "Unmatched closing tag: " + e.tagName), e.textNode += "</" + e.tagName + ">", e.state = T.TEXT;
				return;
			}
			e.tagName = n;
			for (var i = e.tags.length; i-- > t;) {
				var a = e.tag = e.tags.pop();
				e.tagName = e.tag.name, M(e, "onclosetag", e.tagName);
				var o = {};
				for (var s in a.ns) o[s] = a.ns[s];
				var c = e.tags[e.tags.length - 1] || e;
				e.opt.xmlns && a.ns !== c.ns && Object.keys(a.ns).forEach(function(t) {
					var n = a.ns[t];
					M(e, "onclosenamespace", {
						prefix: t,
						uri: n
					});
				});
			}
			t === 0 && (e.closedRoot = !0), e.tagName = e.attribValue = e.attribName = "", e.attribList.length = 0, e.state = T.TEXT;
		}
		function H(e) {
			var t = e.entity, n = t.toLowerCase(), r, i = "";
			return e.ENTITIES[t] ? e.ENTITIES[t] : e.ENTITIES[n] ? e.ENTITIES[n] : (t = n, t.charAt(0) === "#" && (t.charAt(1) === "x" ? (t = t.slice(2), r = parseInt(t, 16), i = r.toString(16)) : (t = t.slice(1), r = parseInt(t, 10), i = r.toString(10))), t = t.replace(/^0+/, ""), isNaN(r) || i.toLowerCase() !== t || r < 0 || r > 1114111 ? (L(e, "Invalid character entity"), "&" + e.entity + ";") : String.fromCodePoint(r));
		}
		function U(e, t) {
			t === "<" ? (e.state = T.OPEN_WAKA, e.startTagPosition = e.position) : b(t) || (L(e, "Non-whitespace before first tag."), e.textNode = t, e.state = T.TEXT);
		}
		function W(e, t) {
			var n = "";
			return t < e.length && (n = e.charAt(t)), n;
		}
		function G(t) {
			var n = this;
			if (this.error) throw this.error;
			if (n.closed) return I(n, "Cannot write after close. Assign an onready handler.");
			if (t === null) return ee(n);
			typeof t == "object" && (t = t.toString());
			for (var i = 0, a = ""; a = W(t, i++), n.c = a, a;) switch (n.trackPosition && (n.position++, a === "\n" ? (n.line++, n.column = 0) : n.column++), n.state) {
				case T.BEGIN:
					if (n.state = T.BEGIN_WHITESPACE, a === "﻿") continue;
					U(n, a);
					continue;
				case T.BEGIN_WHITESPACE:
					U(n, a);
					continue;
				case T.TEXT:
					if (n.sawRoot && !n.closedRoot) {
						for (var o = i - 1; a && a !== "<" && a !== "&";) a = W(t, i++), a && n.trackPosition && (n.position++, a === "\n" ? (n.line++, n.column = 0) : n.column++);
						n.textNode += t.substring(o, i - 1);
					}
					a === "<" && !(n.sawRoot && n.closedRoot && !n.strict) ? (n.state = T.OPEN_WAKA, n.startTagPosition = n.position) : (!b(a) && (!n.sawRoot || n.closedRoot) && L(n, "Text data outside of root node."), a === "&" ? n.state = T.TEXT_ENTITY : n.textNode += a);
					continue;
				case T.SCRIPT:
					a === "<" ? n.state = T.SCRIPT_ENDING : n.script += a;
					continue;
				case T.SCRIPT_ENDING:
					a === "/" ? n.state = T.CLOSE_TAG : (n.script += "<" + a, n.state = T.SCRIPT);
					continue;
				case T.OPEN_WAKA:
					if (a === "!") n.state = T.SGML_DECL, n.sgmlDecl = "";
					else if (!b(a)) if (C(g, a)) n.state = T.OPEN_TAG, n.tagName = a;
					else if (a === "/") n.state = T.CLOSE_TAG, n.tagName = "";
					else if (a === "?") n.state = T.PROC_INST, n.procInstName = n.procInstBody = "";
					else {
						if (L(n, "Unencoded <"), n.startTagPosition + 1 < n.position) {
							var s = n.position - n.startTagPosition;
							a = Array(s).join(" ") + a;
						}
						n.textNode += "<" + a, n.state = T.TEXT;
					}
					continue;
				case T.SGML_DECL:
					if (n.sgmlDecl + a === "--") {
						n.state = T.COMMENT, n.comment = "", n.sgmlDecl = "";
						continue;
					}
					n.doctype && n.doctype !== !0 && n.sgmlDecl ? (n.state = T.DOCTYPE_DTD, n.doctype += "<!" + n.sgmlDecl + a, n.sgmlDecl = "") : (n.sgmlDecl + a).toUpperCase() === d ? (M(n, "onopencdata"), n.state = T.CDATA, n.sgmlDecl = "", n.cdata = "") : (n.sgmlDecl + a).toUpperCase() === f ? (n.state = T.DOCTYPE, (n.doctype || n.sawRoot) && L(n, "Inappropriately located doctype declaration"), n.doctype = "", n.sgmlDecl = "") : a === ">" ? (M(n, "onsgmldeclaration", n.sgmlDecl), n.sgmlDecl = "", n.state = T.TEXT) : (x(a) && (n.state = T.SGML_DECL_QUOTED), n.sgmlDecl += a);
					continue;
				case T.SGML_DECL_QUOTED:
					a === n.q && (n.state = T.SGML_DECL, n.q = ""), n.sgmlDecl += a;
					continue;
				case T.DOCTYPE:
					a === ">" ? (n.state = T.TEXT, M(n, "ondoctype", n.doctype), n.doctype = !0) : (n.doctype += a, a === "[" ? n.state = T.DOCTYPE_DTD : x(a) && (n.state = T.DOCTYPE_QUOTED, n.q = a));
					continue;
				case T.DOCTYPE_QUOTED:
					n.doctype += a, a === n.q && (n.q = "", n.state = T.DOCTYPE);
					continue;
				case T.DOCTYPE_DTD:
					a === "]" ? (n.doctype += a, n.state = T.DOCTYPE) : a === "<" ? (n.state = T.OPEN_WAKA, n.startTagPosition = n.position) : x(a) ? (n.doctype += a, n.state = T.DOCTYPE_DTD_QUOTED, n.q = a) : n.doctype += a;
					continue;
				case T.DOCTYPE_DTD_QUOTED:
					n.doctype += a, a === n.q && (n.state = T.DOCTYPE_DTD, n.q = "");
					continue;
				case T.COMMENT:
					a === "-" ? n.state = T.COMMENT_ENDING : n.comment += a;
					continue;
				case T.COMMENT_ENDING:
					a === "-" ? (n.state = T.COMMENT_ENDED, n.comment = P(n.opt, n.comment), n.comment && M(n, "oncomment", n.comment), n.comment = "") : (n.comment += "-" + a, n.state = T.COMMENT);
					continue;
				case T.COMMENT_ENDED:
					a === ">" ? n.doctype && n.doctype !== !0 ? n.state = T.DOCTYPE_DTD : n.state = T.TEXT : (L(n, "Malformed comment"), n.comment += "--" + a, n.state = T.COMMENT);
					continue;
				case T.CDATA:
					for (var o = i - 1; a && a !== "]";) a = W(t, i++), a && n.trackPosition && (n.position++, a === "\n" ? (n.line++, n.column = 0) : n.column++);
					n.cdata += t.substring(o, i - 1), a === "]" && (n.state = T.CDATA_ENDING);
					continue;
				case T.CDATA_ENDING:
					a === "]" ? n.state = T.CDATA_ENDING_2 : (n.cdata += "]" + a, n.state = T.CDATA);
					continue;
				case T.CDATA_ENDING_2:
					a === ">" ? (n.cdata && M(n, "oncdata", n.cdata), M(n, "onclosecdata"), n.cdata = "", n.state = T.TEXT) : a === "]" ? n.cdata += "]" : (n.cdata += "]]" + a, n.state = T.CDATA);
					continue;
				case T.PROC_INST:
					a === "?" ? n.state = T.PROC_INST_ENDING : b(a) ? n.state = T.PROC_INST_BODY : n.procInstName += a;
					continue;
				case T.PROC_INST_BODY:
					if (!n.procInstBody && b(a)) continue;
					a === "?" ? n.state = T.PROC_INST_ENDING : n.procInstBody += a;
					continue;
				case T.PROC_INST_ENDING:
					if (a === ">") {
						let e = {
							name: n.procInstName,
							body: n.procInstBody
						};
						j(n, e), M(n, "onprocessinginstruction", e), n.procInstName = n.procInstBody = "", n.state = T.TEXT;
					} else n.procInstBody += "?" + a, n.state = T.PROC_INST_BODY;
					continue;
				case T.OPEN_TAG:
					C(_, a) ? n.tagName += a : (te(n), a === ">" ? B(n) : a === "/" ? n.state = T.OPEN_TAG_SLASH : (b(a) || L(n, "Invalid character in tag name"), n.state = T.ATTRIB));
					continue;
				case T.OPEN_TAG_SLASH:
					a === ">" ? (B(n, !0), V(n)) : (L(n, "Forward-slash in opening tag not followed by >"), n.state = T.ATTRIB);
					continue;
				case T.ATTRIB:
					if (b(a)) continue;
					a === ">" ? B(n) : a === "/" ? n.state = T.OPEN_TAG_SLASH : C(g, a) ? (n.attribName = a, n.attribValue = "", n.state = T.ATTRIB_NAME) : L(n, "Invalid attribute name");
					continue;
				case T.ATTRIB_NAME:
					a === "=" ? n.state = T.ATTRIB_VALUE : a === ">" ? (L(n, "Attribute without value"), n.attribValue = n.attribName, z(n), B(n)) : b(a) ? n.state = T.ATTRIB_NAME_SAW_WHITE : C(_, a) ? n.attribName += a : L(n, "Invalid attribute name");
					continue;
				case T.ATTRIB_NAME_SAW_WHITE:
					if (a === "=") n.state = T.ATTRIB_VALUE;
					else if (b(a)) continue;
					else L(n, "Attribute without value"), n.tag.attributes[n.attribName] = "", n.attribValue = "", M(n, "onattribute", {
						name: n.attribName,
						value: ""
					}), n.attribName = "", a === ">" ? B(n) : C(g, a) ? (n.attribName = a, n.state = T.ATTRIB_NAME) : (L(n, "Invalid attribute name"), n.state = T.ATTRIB);
					continue;
				case T.ATTRIB_VALUE:
					if (b(a)) continue;
					x(a) ? (n.q = a, n.state = T.ATTRIB_VALUE_QUOTED) : (n.opt.unquotedAttributeValues || I(n, "Unquoted attribute value"), n.state = T.ATTRIB_VALUE_UNQUOTED, n.attribValue = a);
					continue;
				case T.ATTRIB_VALUE_QUOTED:
					if (a !== n.q) {
						a === "&" ? n.state = T.ATTRIB_VALUE_ENTITY_Q : n.attribValue += a;
						continue;
					}
					z(n), n.q = "", n.state = T.ATTRIB_VALUE_CLOSED;
					continue;
				case T.ATTRIB_VALUE_CLOSED:
					b(a) ? n.state = T.ATTRIB : a === ">" ? B(n) : a === "/" ? n.state = T.OPEN_TAG_SLASH : C(g, a) ? (L(n, "No whitespace between attributes"), n.attribName = a, n.attribValue = "", n.state = T.ATTRIB_NAME) : L(n, "Invalid attribute name");
					continue;
				case T.ATTRIB_VALUE_UNQUOTED:
					if (!S(a)) {
						a === "&" ? n.state = T.ATTRIB_VALUE_ENTITY_U : n.attribValue += a;
						continue;
					}
					z(n), a === ">" ? B(n) : n.state = T.ATTRIB;
					continue;
				case T.CLOSE_TAG:
					if (n.tagName) a === ">" ? V(n) : C(_, a) ? n.tagName += a : n.script ? (n.script += "</" + n.tagName + a, n.tagName = "", n.state = T.SCRIPT) : (b(a) || L(n, "Invalid tagname in closing tag"), n.state = T.CLOSE_TAG_SAW_WHITE);
					else {
						if (b(a)) continue;
						w(g, a) ? n.script ? (n.script += "</" + a, n.state = T.SCRIPT) : L(n, "Invalid tagname in closing tag.") : n.tagName = a;
					}
					continue;
				case T.CLOSE_TAG_SAW_WHITE:
					if (b(a)) continue;
					a === ">" ? V(n) : L(n, "Invalid characters in closing tag");
					continue;
				case T.TEXT_ENTITY:
				case T.ATTRIB_VALUE_ENTITY_Q:
				case T.ATTRIB_VALUE_ENTITY_U:
					var c, l;
					switch (n.state) {
						case T.TEXT_ENTITY:
							c = T.TEXT, l = "textNode";
							break;
						case T.ATTRIB_VALUE_ENTITY_Q:
							c = T.ATTRIB_VALUE_QUOTED, l = "attribValue";
							break;
						case T.ATTRIB_VALUE_ENTITY_U:
							c = T.ATTRIB_VALUE_UNQUOTED, l = "attribValue";
							break;
					}
					if (a === ";") {
						var u = H(n);
						n.opt.unparsedEntities && !Object.values(e.XML_ENTITIES).includes(u) ? ((n.entityCount += 1) > n.opt.maxEntityCount && I(n, "Parsed entity count exceeds max entity count"), (n.entityDepth += 1) > n.opt.maxEntityDepth && I(n, "Parsed entity depth exceeds max entity depth"), n.entity = "", n.state = c, n.write(u), --n.entityDepth) : (n[l] += u, n.entity = "", n.state = c);
					} else C(n.entity.length ? y : v, a) ? n.entity += a : (L(n, "Invalid character in entity name"), n[l] += "&" + n.entity + a, n.entity = "", n.state = c);
					continue;
				default: throw Error(n, "Unknown state: " + n.state);
			}
			return n.position >= n.bufferCheckPosition && r(n), n;
		}
		/* istanbul ignore next */
		String.fromCodePoint || (function() {
			var e = String.fromCharCode, t = Math.floor, n = function() {
				var n = 16384, r = [], i, a, o = -1, s = arguments.length;
				if (!s) return "";
				for (var c = ""; ++o < s;) {
					var l = Number(arguments[o]);
					if (!isFinite(l) || l < 0 || l > 1114111 || t(l) !== l) throw RangeError("Invalid code point: " + l);
					l <= 65535 ? r.push(l) : (l -= 65536, i = (l >> 10) + 55296, a = l % 1024 + 56320, r.push(i, a)), (o + 1 === s || r.length > n) && (c += e.apply(null, r), r.length = 0);
				}
				return c;
			};
			/* istanbul ignore next */
			Object.defineProperty ? Object.defineProperty(String, "fromCodePoint", {
				value: n,
				configurable: !0,
				writable: !0
			}) : String.fromCodePoint = n;
		})();
	})(e === void 0 ? e.sax = {} : e);
})), He = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.XElement = void 0, e.parseXml = s;
	var t = Ve(), n = Ee(), r = class {
		constructor(e) {
			if (this.name = e, this.value = "", this.attributes = null, this.isCData = !1, this.elements = null, !e) throw (0, n.newError)("Element name cannot be empty", "ERR_XML_ELEMENT_NAME_EMPTY");
			if (!a(e)) throw (0, n.newError)(`Invalid element name: ${e}`, "ERR_XML_ELEMENT_INVALID_NAME");
		}
		attribute(e) {
			let t = this.attributes === null ? null : this.attributes[e];
			if (t == null) throw (0, n.newError)(`No attribute "${e}"`, "ERR_XML_MISSED_ATTRIBUTE");
			return t;
		}
		removeAttribute(e) {
			this.attributes !== null && delete this.attributes[e];
		}
		element(e, t = !1, r = null) {
			let i = this.elementOrNull(e, t);
			if (i === null) throw (0, n.newError)(r || `No element "${e}"`, "ERR_XML_MISSED_ELEMENT");
			return i;
		}
		elementOrNull(e, t = !1) {
			if (this.elements === null) return null;
			for (let n of this.elements) if (o(n, e, t)) return n;
			return null;
		}
		getElements(e, t = !1) {
			return this.elements === null ? [] : this.elements.filter((n) => o(n, e, t));
		}
		elementValueOrEmpty(e, t = !1) {
			let n = this.elementOrNull(e, t);
			return n === null ? "" : n.value;
		}
	};
	e.XElement = r;
	var i = /* @__PURE__ */ new RegExp(/^[A-Za-z_][:A-Za-z0-9_-]*$/i);
	function a(e) {
		return i.test(e);
	}
	function o(e, t, n) {
		let r = e.name;
		return r === t || n === !0 && r.length === t.length && r.toLowerCase() === t.toLowerCase();
	}
	function s(e) {
		let n = null, i = t.parser(!0, {}), a = [];
		return i.onopentag = (e) => {
			let t = new r(e.name);
			if (t.attributes = e.attributes, n === null) n = t;
			else {
				let e = a[a.length - 1];
				e.elements ??= [], e.elements.push(t);
			}
			a.push(t);
		}, i.onclosetag = () => {
			a.pop();
		}, i.ontext = (e) => {
			a.length > 0 && (a[a.length - 1].value = e);
		}, i.oncdata = (e) => {
			let t = a[a.length - 1];
			t.value = e, t.isCData = !0;
		}, i.onerror = (e) => {
			throw e;
		}, i.write(e), n;
	}
})), Ue = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.mapToObject = t, e.isValidKey = n, e.asArray = r, e.deepAssign = s, e.objectToArgs = u;
	function t(e) {
		let r = {};
		for (let [i, a] of e) n(i) && (a instanceof Map ? r[i] = t(a) : r[i] = a);
		return r;
	}
	function n(e) {
		return [
			"__proto__",
			"prototype",
			"constructor"
		].includes(e) ? !1 : [
			"string",
			"number",
			"symbol",
			"boolean"
		].includes(typeof e) || e === null;
	}
	function r(e) {
		return e == null ? [] : Array.isArray(e) ? e : [e];
	}
	function i(e) {
		if (Array.isArray(e)) return !1;
		let t = typeof e;
		return t === "object" || t === "function";
	}
	function a(e, t, n) {
		let r = t[n];
		if (r === void 0) return;
		let a = e[n];
		a == null || r == null || !i(a) || !i(r) ? Array.isArray(a) && Array.isArray(r) ? e[n] = Array.from(new Set(a.concat(r))) : e[n] = r : e[n] = o(a, r);
	}
	function o(e, t) {
		if (e !== t) for (let r of Object.getOwnPropertyNames(t)) n(r) && a(e, t, r);
		return e;
	}
	function s(e, ...t) {
		for (let n of t) n != null && o(e, n);
		return e;
	}
	var c = /^[a-zA-Z][a-zA-Z0-9-]*$/, l = /[\0\r\n]/;
	function u(e) {
		let t = Object.entries(e).reduce((e, [t, r]) => {
			if (!n(t) || r == null) return e;
			if (!c.test(t)) throw Error(`objectToArgs: unsafe flag name rejected: ${JSON.stringify(t)}`);
			if (l.test(r)) throw Error(`objectToArgs: value for --${t} contains a null byte or newline`);
			return e.concat([`--${t}`, r]);
		}, []);
		return Object.freeze(t);
	}
})), K = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.CURRENT_APP_PACKAGE_FILE_NAME = e.CURRENT_APP_INSTALLER_FILE_NAME = e.objectToArgs = e.deepAssign = e.asArray = e.mapToObject = e.isValidKey = e.XElement = e.parseXml = e.UUID = e.parseDn = e.retry = e.githubTagPrefix = e.githubUrl = e.getS3LikeProviderBaseUrl = e.ProgressCallbackTransform = e.MemoLazy = e.safeStringifyJson = e.safeGetHeader = e.parseJson = e.isSensitiveFieldName = e.HttpExecutor = e.hashSensitiveValue = e.HttpError = e.DigestTransform = e.createHttpError = e.configureRequestUrl = e.configureRequestOptionsFromUrl = e.configureRequestOptions = e.newError = e.CancellationToken = e.CancellationError = void 0;
	var t = Te();
	Object.defineProperty(e, "CancellationError", {
		enumerable: !0,
		get: function() {
			return t.CancellationError;
		}
	}), Object.defineProperty(e, "CancellationToken", {
		enumerable: !0,
		get: function() {
			return t.CancellationToken;
		}
	});
	var n = Ee();
	Object.defineProperty(e, "newError", {
		enumerable: !0,
		get: function() {
			return n.newError;
		}
	});
	var r = Fe();
	Object.defineProperty(e, "configureRequestOptions", {
		enumerable: !0,
		get: function() {
			return r.configureRequestOptions;
		}
	}), Object.defineProperty(e, "configureRequestOptionsFromUrl", {
		enumerable: !0,
		get: function() {
			return r.configureRequestOptionsFromUrl;
		}
	}), Object.defineProperty(e, "configureRequestUrl", {
		enumerable: !0,
		get: function() {
			return r.configureRequestUrl;
		}
	}), Object.defineProperty(e, "createHttpError", {
		enumerable: !0,
		get: function() {
			return r.createHttpError;
		}
	}), Object.defineProperty(e, "DigestTransform", {
		enumerable: !0,
		get: function() {
			return r.DigestTransform;
		}
	}), Object.defineProperty(e, "HttpError", {
		enumerable: !0,
		get: function() {
			return r.HttpError;
		}
	}), Object.defineProperty(e, "hashSensitiveValue", {
		enumerable: !0,
		get: function() {
			return r.hashSensitiveValue;
		}
	}), Object.defineProperty(e, "HttpExecutor", {
		enumerable: !0,
		get: function() {
			return r.HttpExecutor;
		}
	}), Object.defineProperty(e, "isSensitiveFieldName", {
		enumerable: !0,
		get: function() {
			return r.isSensitiveFieldName;
		}
	}), Object.defineProperty(e, "parseJson", {
		enumerable: !0,
		get: function() {
			return r.parseJson;
		}
	}), Object.defineProperty(e, "safeGetHeader", {
		enumerable: !0,
		get: function() {
			return r.safeGetHeader;
		}
	}), Object.defineProperty(e, "safeStringifyJson", {
		enumerable: !0,
		get: function() {
			return r.safeStringifyJson;
		}
	});
	var i = Ie();
	Object.defineProperty(e, "MemoLazy", {
		enumerable: !0,
		get: function() {
			return i.MemoLazy;
		}
	});
	var a = Pe();
	Object.defineProperty(e, "ProgressCallbackTransform", {
		enumerable: !0,
		get: function() {
			return a.ProgressCallbackTransform;
		}
	});
	var o = Le();
	Object.defineProperty(e, "getS3LikeProviderBaseUrl", {
		enumerable: !0,
		get: function() {
			return o.getS3LikeProviderBaseUrl;
		}
	}), Object.defineProperty(e, "githubUrl", {
		enumerable: !0,
		get: function() {
			return o.githubUrl;
		}
	}), Object.defineProperty(e, "githubTagPrefix", {
		enumerable: !0,
		get: function() {
			return o.githubTagPrefix;
		}
	});
	var s = Re();
	Object.defineProperty(e, "retry", {
		enumerable: !0,
		get: function() {
			return s.retry;
		}
	});
	var c = ze();
	Object.defineProperty(e, "parseDn", {
		enumerable: !0,
		get: function() {
			return c.parseDn;
		}
	});
	var l = Be();
	Object.defineProperty(e, "UUID", {
		enumerable: !0,
		get: function() {
			return l.UUID;
		}
	});
	var u = He();
	Object.defineProperty(e, "parseXml", {
		enumerable: !0,
		get: function() {
			return u.parseXml;
		}
	}), Object.defineProperty(e, "XElement", {
		enumerable: !0,
		get: function() {
			return u.XElement;
		}
	});
	var d = Ue();
	Object.defineProperty(e, "isValidKey", {
		enumerable: !0,
		get: function() {
			return d.isValidKey;
		}
	}), Object.defineProperty(e, "mapToObject", {
		enumerable: !0,
		get: function() {
			return d.mapToObject;
		}
	}), Object.defineProperty(e, "asArray", {
		enumerable: !0,
		get: function() {
			return d.asArray;
		}
	}), Object.defineProperty(e, "deepAssign", {
		enumerable: !0,
		get: function() {
			return d.deepAssign;
		}
	}), Object.defineProperty(e, "objectToArgs", {
		enumerable: !0,
		get: function() {
			return d.objectToArgs;
		}
	}), e.CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe", e.CURRENT_APP_PACKAGE_FILE_NAME = "package.7z";
})), We = /* @__PURE__ */ A(((e, t) => {
	function n(e) {
		return e == null;
	}
	function r(e) {
		return typeof e == "object" && !!e;
	}
	function i(e) {
		return Array.isArray(e) ? e : n(e) ? [] : [e];
	}
	function a(e, t) {
		if (t) {
			let n = Object.keys(t);
			for (let r = 0, i = n.length; r < i; r += 1) {
				let i = n[r];
				e[i] = t[i];
			}
		}
		return e;
	}
	function o(e, t) {
		let n = "";
		for (let r = 0; r < t; r += 1) n += e;
		return n;
	}
	function s(e) {
		return e === 0 && 1 / e == -Infinity;
	}
	t.exports.isNothing = n, t.exports.isObject = r, t.exports.toArray = i, t.exports.repeat = o, t.exports.isNegativeZero = s, t.exports.extend = a;
})), Ge = /* @__PURE__ */ A(((e, t) => {
	function n(e, t) {
		let n = "", r = e.reason || "(unknown reason)";
		return e.mark ? (e.mark.name && (n += "in \"" + e.mark.name + "\" "), n += "(" + (e.mark.line + 1) + ":" + (e.mark.column + 1) + ")", !t && e.mark.snippet && (n += "\n\n" + e.mark.snippet), r + " " + n) : r;
	}
	function r(e, t) {
		Error.call(this), this.name = "YAMLException", this.reason = e, this.mark = t, this.message = n(this, !1), Error.captureStackTrace ? Error.captureStackTrace(this, this.constructor) : this.stack = (/* @__PURE__ */ Error()).stack || "";
	}
	r.prototype = Object.create(Error.prototype), r.prototype.constructor = r, r.prototype.toString = function(e) {
		return this.name + ": " + n(this, e);
	}, t.exports = r;
})), Ke = /* @__PURE__ */ A(((e, t) => {
	var n = We();
	function r(e, t, n, r, i) {
		let a = "", o = "", s = Math.floor(i / 2) - 1;
		return r - t > s && (a = " ... ", t = r - s + a.length), n - r > s && (o = " ...", n = r + s - o.length), {
			str: a + e.slice(t, n).replace(/\t/g, "→") + o,
			pos: r - t + a.length
		};
	}
	function i(e, t) {
		return n.repeat(" ", t - e.length) + e;
	}
	function a(e, t) {
		if (t = Object.create(t || null), !e.buffer) return null;
		t.maxLength ||= 79, typeof t.indent != "number" && (t.indent = 1), typeof t.linesBefore != "number" && (t.linesBefore = 3), typeof t.linesAfter != "number" && (t.linesAfter = 2);
		let a = /\r?\n|\r|\0/g, o = [0], s = [], c, l = -1;
		for (; c = a.exec(e.buffer);) s.push(c.index), o.push(c.index + c[0].length), e.position <= c.index && l < 0 && (l = o.length - 2);
		l < 0 && (l = o.length - 1);
		let u = "", d = Math.min(e.line + t.linesAfter, s.length).toString().length, f = t.maxLength - (t.indent + d + 3);
		for (let a = 1; a <= t.linesBefore && !(l - a < 0); a++) {
			let c = r(e.buffer, o[l - a], s[l - a], e.position - (o[l] - o[l - a]), f);
			u = n.repeat(" ", t.indent) + i((e.line - a + 1).toString(), d) + " | " + c.str + "\n" + u;
		}
		let p = r(e.buffer, o[l], s[l], e.position, f);
		u += n.repeat(" ", t.indent) + i((e.line + 1).toString(), d) + " | " + p.str + "\n", u += n.repeat("-", t.indent + d + 3 + p.pos) + "^\n";
		for (let a = 1; a <= t.linesAfter && !(l + a >= s.length); a++) {
			let c = r(e.buffer, o[l + a], s[l + a], e.position - (o[l] - o[l + a]), f);
			u += n.repeat(" ", t.indent) + i((e.line + a + 1).toString(), d) + " | " + c.str + "\n";
		}
		return u.replace(/\n$/, "");
	}
	t.exports = a;
})), q = /* @__PURE__ */ A(((e, t) => {
	var n = Ge(), r = [
		"kind",
		"multi",
		"resolve",
		"construct",
		"instanceOf",
		"predicate",
		"represent",
		"representName",
		"defaultStyle",
		"styleAliases"
	], i = [
		"scalar",
		"sequence",
		"mapping"
	];
	function a(e) {
		let t = {};
		return e !== null && Object.keys(e).forEach(function(n) {
			e[n].forEach(function(e) {
				t[String(e)] = n;
			});
		}), t;
	}
	function o(e, t) {
		if (t ||= {}, Object.keys(t).forEach(function(t) {
			if (r.indexOf(t) === -1) throw new n("Unknown option \"" + t + "\" is met in definition of \"" + e + "\" YAML type.");
		}), this.options = t, this.tag = e, this.kind = t.kind || null, this.resolve = t.resolve || function() {
			return !0;
		}, this.construct = t.construct || function(e) {
			return e;
		}, this.instanceOf = t.instanceOf || null, this.predicate = t.predicate || null, this.represent = t.represent || null, this.representName = t.representName || null, this.defaultStyle = t.defaultStyle || null, this.multi = t.multi || !1, this.styleAliases = a(t.styleAliases || null), i.indexOf(this.kind) === -1) throw new n("Unknown kind \"" + this.kind + "\" is specified for \"" + e + "\" YAML type.");
	}
	t.exports = o;
})), qe = /* @__PURE__ */ A(((e, t) => {
	var n = Ge(), r = q();
	function i(e, t) {
		let n = [];
		return e[t].forEach(function(e) {
			let t = n.length;
			n.forEach(function(n, r) {
				n.tag === e.tag && n.kind === e.kind && n.multi === e.multi && (t = r);
			}), n[t] = e;
		}), n;
	}
	function a() {
		let e = {
			scalar: {},
			sequence: {},
			mapping: {},
			fallback: {},
			multi: {
				scalar: [],
				sequence: [],
				mapping: [],
				fallback: []
			}
		};
		function t(t) {
			t.multi ? (e.multi[t.kind].push(t), e.multi.fallback.push(t)) : e[t.kind][t.tag] = e.fallback[t.tag] = t;
		}
		for (let e = 0, n = arguments.length; e < n; e += 1) arguments[e].forEach(t);
		return e;
	}
	function o(e) {
		return this.extend(e);
	}
	o.prototype.extend = function(e) {
		let t = [], s = [];
		if (e instanceof r) s.push(e);
		else if (Array.isArray(e)) s = s.concat(e);
		else if (e && (Array.isArray(e.implicit) || Array.isArray(e.explicit))) e.implicit && (t = t.concat(e.implicit)), e.explicit && (s = s.concat(e.explicit));
		else throw new n("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
		t.forEach(function(e) {
			if (!(e instanceof r)) throw new n("Specified list of YAML types (or a single Type object) contains a non-Type object.");
			if (e.loadKind && e.loadKind !== "scalar") throw new n("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
			if (e.multi) throw new n("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
		}), s.forEach(function(e) {
			if (!(e instanceof r)) throw new n("Specified list of YAML types (or a single Type object) contains a non-Type object.");
		});
		let c = Object.create(o.prototype);
		return c.implicit = (this.implicit || []).concat(t), c.explicit = (this.explicit || []).concat(s), c.compiledImplicit = i(c, "implicit"), c.compiledExplicit = i(c, "explicit"), c.compiledTypeMap = a(c.compiledImplicit, c.compiledExplicit), c;
	}, t.exports = o;
})), Je = /* @__PURE__ */ A(((e, t) => {
	t.exports = new (q())("tag:yaml.org,2002:str", {
		kind: "scalar",
		construct: function(e) {
			return e === null ? "" : e;
		}
	});
})), Ye = /* @__PURE__ */ A(((e, t) => {
	t.exports = new (q())("tag:yaml.org,2002:seq", {
		kind: "sequence",
		construct: function(e) {
			return e === null ? [] : e;
		}
	});
})), Xe = /* @__PURE__ */ A(((e, t) => {
	t.exports = new (q())("tag:yaml.org,2002:map", {
		kind: "mapping",
		construct: function(e) {
			return e === null ? {} : e;
		}
	});
})), Ze = /* @__PURE__ */ A(((e, t) => {
	t.exports = new (qe())({ explicit: [
		Je(),
		Ye(),
		Xe()
	] });
})), Qe = /* @__PURE__ */ A(((e, t) => {
	var n = q();
	function r(e) {
		if (e === null) return !0;
		let t = e.length;
		return t === 1 && e === "~" || t === 4 && (e === "null" || e === "Null" || e === "NULL");
	}
	function i() {
		return null;
	}
	function a(e) {
		return e === null;
	}
	t.exports = new n("tag:yaml.org,2002:null", {
		kind: "scalar",
		resolve: r,
		construct: i,
		predicate: a,
		represent: {
			canonical: function() {
				return "~";
			},
			lowercase: function() {
				return "null";
			},
			uppercase: function() {
				return "NULL";
			},
			camelcase: function() {
				return "Null";
			},
			empty: function() {
				return "";
			}
		},
		defaultStyle: "lowercase"
	});
})), $e = /* @__PURE__ */ A(((e, t) => {
	var n = q();
	function r(e) {
		if (e === null) return !1;
		let t = e.length;
		return t === 4 && (e === "true" || e === "True" || e === "TRUE") || t === 5 && (e === "false" || e === "False" || e === "FALSE");
	}
	function i(e) {
		return e === "true" || e === "True" || e === "TRUE";
	}
	function a(e) {
		return Object.prototype.toString.call(e) === "[object Boolean]";
	}
	t.exports = new n("tag:yaml.org,2002:bool", {
		kind: "scalar",
		resolve: r,
		construct: i,
		predicate: a,
		represent: {
			lowercase: function(e) {
				return e ? "true" : "false";
			},
			uppercase: function(e) {
				return e ? "TRUE" : "FALSE";
			},
			camelcase: function(e) {
				return e ? "True" : "False";
			}
		},
		defaultStyle: "lowercase"
	});
})), et = /* @__PURE__ */ A(((e, t) => {
	var n = We(), r = q();
	function i(e) {
		return e >= 48 && e <= 57 || e >= 65 && e <= 70 || e >= 97 && e <= 102;
	}
	function a(e) {
		return e >= 48 && e <= 55;
	}
	function o(e) {
		return e >= 48 && e <= 57;
	}
	function s(e) {
		if (e === null) return !1;
		let t = e.length, n = 0, r = !1;
		if (!t) return !1;
		let s = e[n];
		if ((s === "-" || s === "+") && (s = e[++n]), s === "0") {
			if (n + 1 === t) return !0;
			if (s = e[++n], s === "b") {
				for (n++; n < t; n++) {
					if (s = e[n], s !== "0" && s !== "1") return !1;
					r = !0;
				}
				return r && Number.isFinite(c(e));
			}
			if (s === "x") {
				for (n++; n < t; n++) {
					if (!i(e.charCodeAt(n))) return !1;
					r = !0;
				}
				return r && Number.isFinite(c(e));
			}
			if (s === "o") {
				for (n++; n < t; n++) {
					if (!a(e.charCodeAt(n))) return !1;
					r = !0;
				}
				return r && Number.isFinite(c(e));
			}
		}
		for (; n < t; n++) {
			if (!o(e.charCodeAt(n))) return !1;
			r = !0;
		}
		return r ? Number.isFinite(c(e)) : !1;
	}
	function c(e) {
		let t = e, n = 1, r = t[0];
		if ((r === "-" || r === "+") && (r === "-" && (n = -1), t = t.slice(1), r = t[0]), t === "0") return 0;
		if (r === "0") {
			if (t[1] === "b") return n * parseInt(t.slice(2), 2);
			if (t[1] === "x") return n * parseInt(t.slice(2), 16);
			if (t[1] === "o") return n * parseInt(t.slice(2), 8);
		}
		return n * parseInt(t, 10);
	}
	function l(e) {
		return c(e);
	}
	function u(e) {
		return Object.prototype.toString.call(e) === "[object Number]" && e % 1 == 0 && !n.isNegativeZero(e);
	}
	t.exports = new r("tag:yaml.org,2002:int", {
		kind: "scalar",
		resolve: s,
		construct: l,
		predicate: u,
		represent: {
			binary: function(e) {
				return e >= 0 ? "0b" + e.toString(2) : "-0b" + e.toString(2).slice(1);
			},
			octal: function(e) {
				return e >= 0 ? "0o" + e.toString(8) : "-0o" + e.toString(8).slice(1);
			},
			decimal: function(e) {
				return e.toString(10);
			},
			hexadecimal: function(e) {
				return e >= 0 ? "0x" + e.toString(16).toUpperCase() : "-0x" + e.toString(16).toUpperCase().slice(1);
			}
		},
		defaultStyle: "decimal",
		styleAliases: {
			binary: [2, "bin"],
			octal: [8, "oct"],
			decimal: [10, "dec"],
			hexadecimal: [16, "hex"]
		}
	});
})), tt = /* @__PURE__ */ A(((e, t) => {
	var n = We(), r = q(), i = /* @__PURE__ */ RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), a = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	function o(e) {
		return e === null || !i.test(e) ? !1 : Number.isFinite(parseFloat(e, 10)) ? !0 : a.test(e);
	}
	function s(e) {
		let t = e.toLowerCase(), n = t[0] === "-" ? -1 : 1;
		return "+-".indexOf(t[0]) >= 0 && (t = t.slice(1)), t === ".inf" ? n === 1 ? Infinity : -Infinity : t === ".nan" ? NaN : n * parseFloat(t, 10);
	}
	var c = /^[-+]?[0-9]+e/;
	function l(e, t) {
		if (isNaN(e)) switch (t) {
			case "lowercase": return ".nan";
			case "uppercase": return ".NAN";
			case "camelcase": return ".NaN";
		}
		else if (e === Infinity) switch (t) {
			case "lowercase": return ".inf";
			case "uppercase": return ".INF";
			case "camelcase": return ".Inf";
		}
		else if (e === -Infinity) switch (t) {
			case "lowercase": return "-.inf";
			case "uppercase": return "-.INF";
			case "camelcase": return "-.Inf";
		}
		else if (n.isNegativeZero(e)) return "-0.0";
		let r = e.toString(10);
		return c.test(r) ? r.replace("e", ".e") : r;
	}
	function u(e) {
		return Object.prototype.toString.call(e) === "[object Number]" && (e % 1 != 0 || n.isNegativeZero(e));
	}
	t.exports = new r("tag:yaml.org,2002:float", {
		kind: "scalar",
		resolve: o,
		construct: s,
		predicate: u,
		represent: l,
		defaultStyle: "lowercase"
	});
})), nt = /* @__PURE__ */ A(((e, t) => {
	t.exports = Ze().extend({ implicit: [
		Qe(),
		$e(),
		et(),
		tt()
	] });
})), rt = /* @__PURE__ */ A(((e, t) => {
	t.exports = nt();
})), it = /* @__PURE__ */ A(((e, t) => {
	var n = q(), r = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"), i = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
	function a(e) {
		return e === null ? !1 : r.exec(e) !== null || i.exec(e) !== null;
	}
	function o(e) {
		let t = 0, n = null, a = r.exec(e);
		if (a === null && (a = i.exec(e)), a === null) throw Error("Date resolve error");
		let o = +a[1], s = a[2] - 1, c = +a[3];
		if (!a[4]) return new Date(Date.UTC(o, s, c));
		let l = +a[4], u = +a[5], d = +a[6];
		if (a[7]) {
			for (t = a[7].slice(0, 3); t.length < 3;) t += "0";
			t = +t;
		}
		if (a[9]) {
			let e = +a[10], t = +(a[11] || 0);
			n = (e * 60 + t) * 6e4, a[9] === "-" && (n = -n);
		}
		let f = new Date(Date.UTC(o, s, c, l, u, d, t));
		return n && f.setTime(f.getTime() - n), f;
	}
	function s(e) {
		return e.toISOString();
	}
	t.exports = new n("tag:yaml.org,2002:timestamp", {
		kind: "scalar",
		resolve: a,
		construct: o,
		instanceOf: Date,
		represent: s
	});
})), at = /* @__PURE__ */ A(((e, t) => {
	var n = q();
	function r(e) {
		return e === "<<" || e === null;
	}
	t.exports = new n("tag:yaml.org,2002:merge", {
		kind: "scalar",
		resolve: r
	});
})), ot = /* @__PURE__ */ A(((e, t) => {
	var n = q(), r = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
	function i(e) {
		if (e === null) return !1;
		let t = 0, n = e.length, i = r;
		for (let r = 0; r < n; r++) {
			let n = i.indexOf(e.charAt(r));
			if (!(n > 64)) {
				if (n < 0) return !1;
				t += 6;
			}
		}
		return t % 8 == 0;
	}
	function a(e) {
		let t = e.replace(/[\r\n=]/g, ""), n = t.length, i = r, a = 0, o = [];
		for (let e = 0; e < n; e++) e % 4 == 0 && e && (o.push(a >> 16 & 255), o.push(a >> 8 & 255), o.push(a & 255)), a = a << 6 | i.indexOf(t.charAt(e));
		let s = n % 4 * 6;
		return s === 0 ? (o.push(a >> 16 & 255), o.push(a >> 8 & 255), o.push(a & 255)) : s === 18 ? (o.push(a >> 10 & 255), o.push(a >> 2 & 255)) : s === 12 && o.push(a >> 4 & 255), new Uint8Array(o);
	}
	function o(e) {
		let t = "", n = 0, i = e.length, a = r;
		for (let r = 0; r < i; r++) r % 3 == 0 && r && (t += a[n >> 18 & 63], t += a[n >> 12 & 63], t += a[n >> 6 & 63], t += a[n & 63]), n = (n << 8) + e[r];
		let o = i % 3;
		return o === 0 ? (t += a[n >> 18 & 63], t += a[n >> 12 & 63], t += a[n >> 6 & 63], t += a[n & 63]) : o === 2 ? (t += a[n >> 10 & 63], t += a[n >> 4 & 63], t += a[n << 2 & 63], t += a[64]) : o === 1 && (t += a[n >> 2 & 63], t += a[n << 4 & 63], t += a[64], t += a[64]), t;
	}
	function s(e) {
		return Object.prototype.toString.call(e) === "[object Uint8Array]";
	}
	t.exports = new n("tag:yaml.org,2002:binary", {
		kind: "scalar",
		resolve: i,
		construct: a,
		predicate: s,
		represent: o
	});
})), st = /* @__PURE__ */ A(((e, t) => {
	var n = q(), r = Object.prototype.hasOwnProperty, i = Object.prototype.toString;
	function a(e) {
		if (e === null) return !0;
		let t = [], n = e;
		for (let e = 0, a = n.length; e < a; e += 1) {
			let a = n[e], o = !1;
			if (i.call(a) !== "[object Object]") return !1;
			let s;
			for (s in a) if (r.call(a, s)) if (!o) o = !0;
			else return !1;
			if (!o) return !1;
			if (t.indexOf(s) === -1) t.push(s);
			else return !1;
		}
		return !0;
	}
	function o(e) {
		return e === null ? [] : e;
	}
	t.exports = new n("tag:yaml.org,2002:omap", {
		kind: "sequence",
		resolve: a,
		construct: o
	});
})), ct = /* @__PURE__ */ A(((e, t) => {
	var n = q(), r = Object.prototype.toString;
	function i(e) {
		if (e === null) return !0;
		let t = e, n = Array(t.length);
		for (let e = 0, i = t.length; e < i; e += 1) {
			let i = t[e];
			if (r.call(i) !== "[object Object]") return !1;
			let a = Object.keys(i);
			if (a.length !== 1) return !1;
			n[e] = [a[0], i[a[0]]];
		}
		return !0;
	}
	function a(e) {
		if (e === null) return [];
		let t = e, n = Array(t.length);
		for (let e = 0, r = t.length; e < r; e += 1) {
			let r = t[e], i = Object.keys(r);
			n[e] = [i[0], r[i[0]]];
		}
		return n;
	}
	t.exports = new n("tag:yaml.org,2002:pairs", {
		kind: "sequence",
		resolve: i,
		construct: a
	});
})), lt = /* @__PURE__ */ A(((e, t) => {
	var n = q(), r = Object.prototype.hasOwnProperty;
	function i(e) {
		if (e === null) return !0;
		let t = e;
		for (let e in t) if (r.call(t, e) && t[e] !== null) return !1;
		return !0;
	}
	function a(e) {
		return e === null ? {} : e;
	}
	t.exports = new n("tag:yaml.org,2002:set", {
		kind: "mapping",
		resolve: i,
		construct: a
	});
})), ut = /* @__PURE__ */ A(((e, t) => {
	t.exports = rt().extend({
		implicit: [it(), at()],
		explicit: [
			ot(),
			st(),
			ct(),
			lt()
		]
	});
})), dt = /* @__PURE__ */ A(((e, t) => {
	var n = We(), r = Ge(), i = Ke(), a = ut(), o = Object.prototype.hasOwnProperty, s = 1, c = 2, l = 3, u = 4, d = 1, f = 2, p = 3, m = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, h = /[\x85\u2028\u2029]/, g = /[,\[\]{}]/, _ = /^(?:!|!!|![0-9A-Za-z-]+!)$/, v = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
	function y(e) {
		return Object.prototype.toString.call(e);
	}
	function b(e) {
		return e === 10 || e === 13;
	}
	function x(e) {
		return e === 9 || e === 32;
	}
	function S(e) {
		return e === 9 || e === 32 || e === 10 || e === 13;
	}
	function C(e) {
		return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
	}
	function w(e) {
		if (e >= 48 && e <= 57) return e - 48;
		let t = e | 32;
		return t >= 97 && t <= 102 ? t - 97 + 10 : -1;
	}
	function T(e) {
		return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
	}
	function E(e) {
		return e >= 48 && e <= 57 ? e - 48 : -1;
	}
	function D(e) {
		switch (e) {
			case 48: return "\0";
			case 97: return "\x07";
			case 98: return "\b";
			case 116: return "	";
			case 9: return "	";
			case 110: return "\n";
			case 118: return "\v";
			case 102: return "\f";
			case 114: return "\r";
			case 101: return "\x1B";
			case 32: return " ";
			case 34: return "\"";
			case 47: return "/";
			case 92: return "\\";
			case 78: return "";
			case 95: return "\xA0";
			case 76: return "\u2028";
			case 80: return "\u2029";
			default: return "";
		}
	}
	function O(e) {
		return e <= 65535 ? String.fromCharCode(e) : String.fromCharCode((e - 65536 >> 10) + 55296, (e - 65536 & 1023) + 56320);
	}
	function k(e, t, n) {
		t === "__proto__" ? Object.defineProperty(e, t, {
			configurable: !0,
			enumerable: !0,
			writable: !0,
			value: n
		}) : e[t] = n;
	}
	var A = Array(256), j = Array(256);
	for (let e = 0; e < 256; e++) A[e] = +!!D(e), j[e] = D(e);
	function M(e, t) {
		this.input = e, this.filename = t.filename || null, this.schema = t.schema || a, this.onWarning = t.onWarning || null, this.legacy = t.legacy || !1, this.json = t.json || !1, this.listener = t.listener || null, this.maxDepth = typeof t.maxDepth == "number" ? t.maxDepth : 100, this.maxMergeSeqLength = typeof t.maxMergeSeqLength == "number" ? t.maxMergeSeqLength : 20, this.implicitTypes = this.schema.compiledImplicit, this.typeMap = this.schema.compiledTypeMap, this.length = e.length, this.position = 0, this.line = 0, this.lineStart = 0, this.lineIndent = 0, this.depth = 0, this.firstTabInLine = -1, this.documents = [], this.anchorMapTransactions = [];
	}
	function N(e, t) {
		let n = {
			name: e.filename,
			buffer: e.input.slice(0, -1),
			position: e.position,
			line: e.line,
			column: e.position - e.lineStart
		};
		return n.snippet = i(n), new r(t, n);
	}
	function P(e, t) {
		throw N(e, t);
	}
	function F(e, t) {
		e.onWarning && e.onWarning.call(null, N(e, t));
	}
	function I(e, t, n) {
		let r = e.anchorMapTransactions;
		if (r.length !== 0) {
			let n = r[r.length - 1];
			o.call(n, t) || (n[t] = {
				existed: o.call(e.anchorMap, t),
				value: e.anchorMap[t]
			});
		}
		e.anchorMap[t] = n;
	}
	function ee(e) {
		e.anchorMapTransactions.push(Object.create(null));
	}
	function L(e) {
		let t = e.anchorMapTransactions.pop(), n = e.anchorMapTransactions;
		if (n.length === 0) return;
		let r = n[n.length - 1], i = Object.keys(t);
		for (let e = 0, n = i.length; e < n; e += 1) {
			let n = i[e];
			o.call(r, n) || (r[n] = t[n]);
		}
	}
	function te(e) {
		let t = e.anchorMapTransactions.pop(), n = Object.keys(t);
		for (let r = n.length - 1; r >= 0; --r) {
			let i = t[n[r]];
			i.existed ? e.anchorMap[n[r]] = i.value : delete e.anchorMap[n[r]];
		}
	}
	function R(e) {
		return {
			position: e.position,
			line: e.line,
			lineStart: e.lineStart,
			lineIndent: e.lineIndent,
			firstTabInLine: e.firstTabInLine,
			tag: e.tag,
			anchor: e.anchor,
			kind: e.kind,
			result: e.result
		};
	}
	function z(e, t) {
		e.position = t.position, e.line = t.line, e.lineStart = t.lineStart, e.lineIndent = t.lineIndent, e.firstTabInLine = t.firstTabInLine, e.tag = t.tag, e.anchor = t.anchor, e.kind = t.kind, e.result = t.result;
	}
	var B = {
		YAML: function(e, t, n) {
			e.version !== null && P(e, "duplication of %YAML directive"), n.length !== 1 && P(e, "YAML directive accepts exactly one argument");
			let r = /^([0-9]+)\.([0-9]+)$/.exec(n[0]);
			r === null && P(e, "ill-formed argument of the YAML directive");
			let i = parseInt(r[1], 10), a = parseInt(r[2], 10);
			i !== 1 && P(e, "unacceptable YAML version of the document"), e.version = n[0], e.checkLineBreaks = a < 2, a !== 1 && a !== 2 && F(e, "unsupported YAML version of the document");
		},
		TAG: function(e, t, n) {
			let r;
			n.length !== 2 && P(e, "TAG directive accepts exactly two arguments");
			let i = n[0];
			r = n[1], _.test(i) || P(e, "ill-formed tag handle (first argument) of the TAG directive"), o.call(e.tagMap, i) && P(e, "there is a previously declared suffix for \"" + i + "\" tag handle"), v.test(r) || P(e, "ill-formed tag prefix (second argument) of the TAG directive");
			try {
				r = decodeURIComponent(r);
			} catch {
				P(e, "tag prefix is malformed: " + r);
			}
			e.tagMap[i] = r;
		}
	};
	function V(e, t, n, r) {
		if (t < n) {
			let i = e.input.slice(t, n);
			if (r) for (let t = 0, n = i.length; t < n; t += 1) {
				let n = i.charCodeAt(t);
				n === 9 || n >= 32 && n <= 1114111 || P(e, "expected valid JSON character");
			}
			else m.test(i) && P(e, "the stream contains non-printable characters");
			e.result += i;
		}
	}
	function H(e, t, r, i) {
		n.isObject(r) || P(e, "cannot merge mappings; the provided source object is unacceptable");
		let a = Object.keys(r);
		for (let e = 0, n = a.length; e < n; e += 1) {
			let n = a[e];
			o.call(t, n) || (k(t, n, r[n]), i[n] = !0);
		}
	}
	function U(e, t, n, r, i, a, s, c, l) {
		if (Array.isArray(i)) {
			i = Array.prototype.slice.call(i);
			for (let t = 0, n = i.length; t < n; t += 1) Array.isArray(i[t]) && P(e, "nested arrays are not supported inside keys"), typeof i == "object" && y(i[t]) === "[object Object]" && (i[t] = "[object Object]");
		}
		if (typeof i == "object" && y(i) === "[object Object]" && (i = "[object Object]"), i = String(i), t === null && (t = {}), r === "tag:yaml.org,2002:merge") if (Array.isArray(a)) {
			a.length > e.maxMergeSeqLength && P(e, "merge sequence length exceeded maxMergeSeqLength (" + e.maxMergeSeqLength + ")");
			let r = /* @__PURE__ */ new Set();
			for (let i = 0, o = a.length; i < o; i += 1) {
				let o = a[i];
				r.has(o) || (r.add(o), H(e, t, o, n));
			}
		} else H(e, t, a, n);
		else !e.json && !o.call(n, i) && o.call(t, i) && (e.line = s || e.line, e.lineStart = c || e.lineStart, e.position = l || e.position, P(e, "duplicated mapping key")), k(t, i, a), delete n[i];
		return t;
	}
	function W(e) {
		let t = e.input.charCodeAt(e.position);
		t === 10 ? e.position++ : t === 13 ? (e.position++, e.input.charCodeAt(e.position) === 10 && e.position++) : P(e, "a line break is expected"), e.line += 1, e.lineStart = e.position, e.firstTabInLine = -1;
	}
	function G(e, t, n) {
		let r = 0, i = e.input.charCodeAt(e.position);
		for (; i !== 0;) {
			for (; x(i);) i === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position), i = e.input.charCodeAt(++e.position);
			if (t && i === 35) do
				i = e.input.charCodeAt(++e.position);
			while (i !== 10 && i !== 13 && i !== 0);
			if (b(i)) for (W(e), i = e.input.charCodeAt(e.position), r++, e.lineIndent = 0; i === 32;) e.lineIndent++, i = e.input.charCodeAt(++e.position);
			else break;
		}
		return n !== -1 && r !== 0 && e.lineIndent < n && F(e, "deficient indentation"), r;
	}
	function ne(e) {
		let t = e.position, n = e.input.charCodeAt(t);
		return !!((n === 45 || n === 46) && n === e.input.charCodeAt(t + 1) && n === e.input.charCodeAt(t + 2) && (t += 3, n = e.input.charCodeAt(t), n === 0 || S(n)));
	}
	function re(e, t) {
		t === 1 ? e.result += " " : t > 1 && (e.result += n.repeat("\n", t - 1));
	}
	function ie(e, t, n) {
		let r, i, a, o, s, c, l = e.kind, u = e.result, d = e.input.charCodeAt(e.position);
		if (S(d) || C(d) || d === 35 || d === 38 || d === 42 || d === 33 || d === 124 || d === 62 || d === 39 || d === 34 || d === 37 || d === 64 || d === 96) return !1;
		if (d === 63 || d === 45) {
			let t = e.input.charCodeAt(e.position + 1);
			if (S(t) || n && C(t)) return !1;
		}
		for (e.kind = "scalar", e.result = "", r = i = e.position, a = !1; d !== 0;) {
			if (d === 58) {
				let t = e.input.charCodeAt(e.position + 1);
				if (S(t) || n && C(t)) break;
			} else if (d === 35) {
				if (S(e.input.charCodeAt(e.position - 1))) break;
			} else if (e.position === e.lineStart && ne(e) || n && C(d)) break;
			else if (b(d)) if (o = e.line, s = e.lineStart, c = e.lineIndent, G(e, !1, -1), e.lineIndent >= t) {
				a = !0, d = e.input.charCodeAt(e.position);
				continue;
			} else {
				e.position = i, e.line = o, e.lineStart = s, e.lineIndent = c;
				break;
			}
			a &&= (V(e, r, i, !1), re(e, e.line - o), r = i = e.position, !1), x(d) || (i = e.position + 1), d = e.input.charCodeAt(++e.position);
		}
		return V(e, r, i, !1), e.result ? !0 : (e.kind = l, e.result = u, !1);
	}
	function ae(e, t) {
		let n, r, i = e.input.charCodeAt(e.position);
		if (i !== 39) return !1;
		for (e.kind = "scalar", e.result = "", e.position++, n = r = e.position; (i = e.input.charCodeAt(e.position)) !== 0;) if (i === 39) if (V(e, n, e.position, !0), i = e.input.charCodeAt(++e.position), i === 39) n = e.position, e.position++, r = e.position;
		else return !0;
		else b(i) ? (V(e, n, r, !0), re(e, G(e, !1, t)), n = r = e.position) : e.position === e.lineStart && ne(e) ? P(e, "unexpected end of the document within a single quoted scalar") : (e.position++, x(i) || (r = e.position));
		P(e, "unexpected end of the stream within a single quoted scalar");
	}
	function oe(e, t) {
		let n, r, i, a = e.input.charCodeAt(e.position);
		if (a !== 34) return !1;
		for (e.kind = "scalar", e.result = "", e.position++, n = r = e.position; (a = e.input.charCodeAt(e.position)) !== 0;) if (a === 34) return V(e, n, e.position, !0), e.position++, !0;
		else if (a === 92) {
			if (V(e, n, e.position, !0), a = e.input.charCodeAt(++e.position), b(a)) G(e, !1, t);
			else if (a < 256 && A[a]) e.result += j[a], e.position++;
			else if ((i = T(a)) > 0) {
				let t = i, n = 0;
				for (; t > 0; t--) a = e.input.charCodeAt(++e.position), (i = w(a)) >= 0 ? n = (n << 4) + i : P(e, "expected hexadecimal character");
				e.result += O(n), e.position++;
			} else P(e, "unknown escape sequence");
			n = r = e.position;
		} else b(a) ? (V(e, n, r, !0), re(e, G(e, !1, t)), n = r = e.position) : e.position === e.lineStart && ne(e) ? P(e, "unexpected end of the document within a double quoted scalar") : (e.position++, x(a) || (r = e.position));
		P(e, "unexpected end of the stream within a double quoted scalar");
	}
	function se(e, t) {
		let n = !0, r, i, a, o = e.tag, c, l = e.anchor, u, d, f, p, m = Object.create(null), h, g, _, v = e.input.charCodeAt(e.position);
		if (v === 91) u = 93, p = !1, c = [];
		else if (v === 123) u = 125, p = !0, c = {};
		else return !1;
		for (e.anchor !== null && I(e, e.anchor, c), v = e.input.charCodeAt(++e.position); v !== 0;) {
			if (G(e, !0, t), v = e.input.charCodeAt(e.position), v === u) return e.position++, e.tag = o, e.anchor = l, e.kind = p ? "mapping" : "sequence", e.result = c, !0;
			n ? v === 44 && P(e, "expected the node content, but found ','") : P(e, "missed comma between flow collection entries"), g = h = _ = null, d = f = !1, v === 63 && S(e.input.charCodeAt(e.position + 1)) && (d = f = !0, e.position++, G(e, !0, t)), r = e.line, i = e.lineStart, a = e.position, he(e, t, s, !1, !0), g = e.tag, h = e.result, G(e, !0, t), v = e.input.charCodeAt(e.position), (f || e.line === r) && v === 58 && (d = !0, v = e.input.charCodeAt(++e.position), G(e, !0, t), he(e, t, s, !1, !0), _ = e.result), p ? U(e, c, m, g, h, _, r, i, a) : d ? c.push(U(e, null, m, g, h, _, r, i, a)) : c.push(h), G(e, !0, t), v = e.input.charCodeAt(e.position), v === 44 ? (n = !0, v = e.input.charCodeAt(++e.position)) : n = !1;
		}
		P(e, "unexpected end of the stream within a flow collection");
	}
	function ce(e, t) {
		let r, i = d, a = !1, o = !1, s = t, c = 0, l = !1, u, m = e.input.charCodeAt(e.position);
		if (m === 124) r = !1;
		else if (m === 62) r = !0;
		else return !1;
		for (e.kind = "scalar", e.result = ""; m !== 0;) if (m = e.input.charCodeAt(++e.position), m === 43 || m === 45) d === i ? i = m === 43 ? p : f : P(e, "repeat of a chomping mode identifier");
		else if ((u = E(m)) >= 0) u === 0 ? P(e, "bad explicit indentation width of a block scalar; it cannot be less than one") : o ? P(e, "repeat of an indentation width identifier") : (s = t + u - 1, o = !0);
		else break;
		if (x(m)) {
			do
				m = e.input.charCodeAt(++e.position);
			while (x(m));
			if (m === 35) do
				m = e.input.charCodeAt(++e.position);
			while (!b(m) && m !== 0);
		}
		for (; m !== 0;) {
			for (W(e), e.lineIndent = 0, m = e.input.charCodeAt(e.position); (!o || e.lineIndent < s) && m === 32;) e.lineIndent++, m = e.input.charCodeAt(++e.position);
			if (!o && e.lineIndent > s && (s = e.lineIndent), b(m)) {
				c++;
				continue;
			}
			if (!o && s === 0 && P(e, "missing indentation for block scalar"), e.lineIndent < s) {
				i === p ? e.result += n.repeat("\n", a ? 1 + c : c) : i === d && a && (e.result += "\n");
				break;
			}
			r ? x(m) ? (l = !0, e.result += n.repeat("\n", a ? 1 + c : c)) : l ? (l = !1, e.result += n.repeat("\n", c + 1)) : c === 0 ? a && (e.result += " ") : e.result += n.repeat("\n", c) : e.result += n.repeat("\n", a ? 1 + c : c), a = !0, o = !0, c = 0;
			let t = e.position;
			for (; !b(m) && m !== 0;) m = e.input.charCodeAt(++e.position);
			V(e, t, e.position, !1);
		}
		return !0;
	}
	function le(e, t) {
		let n = e.tag, r = e.anchor, i = [], a = !1;
		if (e.firstTabInLine !== -1) return !1;
		e.anchor !== null && I(e, e.anchor, i);
		let o = e.input.charCodeAt(e.position);
		for (; o !== 0 && (e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, P(e, "tab characters must not be used in indentation")), !(o !== 45 || !S(e.input.charCodeAt(e.position + 1))));) {
			if (a = !0, e.position++, G(e, !0, -1) && e.lineIndent <= t) {
				i.push(null), o = e.input.charCodeAt(e.position);
				continue;
			}
			let n = e.line;
			if (he(e, t, l, !1, !0), i.push(e.result), G(e, !0, -1), o = e.input.charCodeAt(e.position), (e.line === n || e.lineIndent > t) && o !== 0) P(e, "bad indentation of a sequence entry");
			else if (e.lineIndent < t) break;
		}
		return a ? (e.tag = n, e.anchor = r, e.kind = "sequence", e.result = i, !0) : !1;
	}
	function ue(e, t, n) {
		let r, i, a, o, s = e.tag, l = e.anchor, d = {}, f = Object.create(null), p = null, m = null, h = null, g = !1, _ = !1;
		if (e.firstTabInLine !== -1) return !1;
		e.anchor !== null && I(e, e.anchor, d);
		let v = e.input.charCodeAt(e.position);
		for (; v !== 0;) {
			!g && e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, P(e, "tab characters must not be used in indentation"));
			let y = e.input.charCodeAt(e.position + 1), b = e.line;
			if ((v === 63 || v === 58) && S(y)) v === 63 ? (g && (U(e, d, f, p, m, null, i, a, o), p = m = h = null), _ = !0, g = !0, r = !0) : g ? (g = !1, r = !0) : P(e, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"), e.position += 1, v = y;
			else {
				if (i = e.line, a = e.lineStart, o = e.position, !he(e, n, c, !1, !0)) break;
				if (e.line === b) {
					for (v = e.input.charCodeAt(e.position); x(v);) v = e.input.charCodeAt(++e.position);
					if (v === 58) v = e.input.charCodeAt(++e.position), S(v) || P(e, "a whitespace character is expected after the key-value separator within a block mapping"), g && (U(e, d, f, p, m, null, i, a, o), p = m = h = null), _ = !0, g = !1, r = !1, p = e.tag, m = e.result;
					else if (_) P(e, "can not read an implicit mapping pair; a colon is missed");
					else return e.tag = s, e.anchor = l, !0;
				} else if (_) P(e, "can not read a block mapping entry; a multiline key may not be an implicit key");
				else return e.tag = s, e.anchor = l, !0;
			}
			if ((e.line === b || e.lineIndent > t) && (g && (i = e.line, a = e.lineStart, o = e.position), he(e, t, u, !0, r) && (g ? m = e.result : h = e.result), g || (U(e, d, f, p, m, h, i, a, o), p = m = h = null), G(e, !0, -1), v = e.input.charCodeAt(e.position)), (e.line === b || e.lineIndent > t) && v !== 0) P(e, "bad indentation of a mapping entry");
			else if (e.lineIndent < t) break;
		}
		return g && U(e, d, f, p, m, null, i, a, o), _ && (e.tag = s, e.anchor = l, e.kind = "mapping", e.result = d), _;
	}
	function de(e) {
		let t = !1, n = !1, r, i, a = e.input.charCodeAt(e.position);
		if (a !== 33) return !1;
		e.tag !== null && P(e, "duplication of a tag property"), a = e.input.charCodeAt(++e.position), a === 60 ? (t = !0, a = e.input.charCodeAt(++e.position)) : a === 33 ? (n = !0, r = "!!", a = e.input.charCodeAt(++e.position)) : r = "!";
		let s = e.position;
		if (t) {
			do
				a = e.input.charCodeAt(++e.position);
			while (a !== 0 && a !== 62);
			e.position < e.length ? (i = e.input.slice(s, e.position), a = e.input.charCodeAt(++e.position)) : P(e, "unexpected end of the stream within a verbatim tag");
		} else {
			for (; a !== 0 && !S(a);) a === 33 && (n ? P(e, "tag suffix cannot contain exclamation marks") : (r = e.input.slice(s - 1, e.position + 1), _.test(r) || P(e, "named tag handle cannot contain such characters"), n = !0, s = e.position + 1)), a = e.input.charCodeAt(++e.position);
			i = e.input.slice(s, e.position), g.test(i) && P(e, "tag suffix cannot contain flow indicator characters");
		}
		i && !v.test(i) && P(e, "tag name cannot contain such characters: " + i);
		try {
			i = decodeURIComponent(i);
		} catch {
			P(e, "tag name is malformed: " + i);
		}
		return t ? e.tag = i : o.call(e.tagMap, r) ? e.tag = e.tagMap[r] + i : r === "!" ? e.tag = "!" + i : r === "!!" ? e.tag = "tag:yaml.org,2002:" + i : P(e, "undeclared tag handle \"" + r + "\""), !0;
	}
	function fe(e) {
		let t = e.input.charCodeAt(e.position);
		if (t !== 38) return !1;
		e.anchor !== null && P(e, "duplication of an anchor property"), t = e.input.charCodeAt(++e.position);
		let n = e.position;
		for (; t !== 0 && !S(t) && !C(t);) t = e.input.charCodeAt(++e.position);
		return e.position === n && P(e, "name of an anchor node must contain at least one character"), e.anchor = e.input.slice(n, e.position), !0;
	}
	function pe(e) {
		let t = e.input.charCodeAt(e.position);
		if (t !== 42) return !1;
		t = e.input.charCodeAt(++e.position);
		let n = e.position;
		for (; t !== 0 && !S(t) && !C(t);) t = e.input.charCodeAt(++e.position);
		e.position === n && P(e, "name of an alias node must contain at least one character");
		let r = e.input.slice(n, e.position);
		return o.call(e.anchorMap, r) || P(e, "unidentified alias \"" + r + "\""), e.result = e.anchorMap[r], G(e, !0, -1), !0;
	}
	function me(e, t, n, r) {
		let i = R(e);
		return ee(e), z(e, t), e.tag = null, e.anchor = null, e.kind = null, e.result = null, ue(e, n, r) && e.kind === "mapping" ? (L(e), !0) : (te(e), z(e, i), !1);
	}
	function he(e, t, n, r, i) {
		let a, d, f = 1, p = !1, m = !1, h = null, g, _, v;
		e.depth >= e.maxDepth && P(e, "nesting exceeded maxDepth (" + e.maxDepth + ")"), e.depth += 1, e.listener !== null && e.listener("open", e), e.tag = null, e.anchor = null, e.kind = null, e.result = null;
		let y = a = d = u === n || l === n;
		if (r && G(e, !0, -1) && (p = !0, e.lineIndent > t ? f = 1 : e.lineIndent === t ? f = 0 : e.lineIndent < t && (f = -1)), f === 1) for (;;) {
			let n = e.input.charCodeAt(e.position), r = R(e);
			if (p && (n === 33 && e.tag !== null || n === 38 && e.anchor !== null) || !de(e) && !fe(e)) break;
			h === null && (h = r), G(e, !0, -1) ? (p = !0, d = y, e.lineIndent > t ? f = 1 : e.lineIndent === t ? f = 0 : e.lineIndent < t && (f = -1)) : d = !1;
		}
		if (d &&= p || i, f === 1 || u === n) if (_ = s === n || c === n ? t : t + 1, v = e.position - e.lineStart, f === 1) if (d && (le(e, v) || ue(e, v, _)) || se(e, _)) m = !0;
		else {
			let t = e.input.charCodeAt(e.position);
			h !== null && y && !d && t !== 124 && t !== 62 && me(e, h, h.position - h.lineStart, _) || a && ce(e, _) || ae(e, _) || oe(e, _) ? m = !0 : pe(e) ? (m = !0, (e.tag !== null || e.anchor !== null) && P(e, "alias node should not have any properties")) : ie(e, _, s === n) && (m = !0, e.tag === null && (e.tag = "?")), e.anchor !== null && I(e, e.anchor, e.result);
		}
		else f === 0 && (m = d && le(e, v));
		if (e.tag === null) e.anchor !== null && I(e, e.anchor, e.result);
		else if (e.tag === "?") {
			e.result !== null && e.kind !== "scalar" && P(e, "unacceptable node kind for !<?> tag; it should be \"scalar\", not \"" + e.kind + "\"");
			for (let t = 0, n = e.implicitTypes.length; t < n; t += 1) if (g = e.implicitTypes[t], g.resolve(e.result)) {
				e.result = g.construct(e.result), e.tag = g.tag, e.anchor !== null && I(e, e.anchor, e.result);
				break;
			}
		} else if (e.tag !== "!") {
			if (o.call(e.typeMap[e.kind || "fallback"], e.tag)) g = e.typeMap[e.kind || "fallback"][e.tag];
			else {
				g = null;
				let t = e.typeMap.multi[e.kind || "fallback"];
				for (let n = 0, r = t.length; n < r; n += 1) if (e.tag.slice(0, t[n].tag.length) === t[n].tag) {
					g = t[n];
					break;
				}
			}
			g || P(e, "unknown tag !<" + e.tag + ">"), e.result !== null && g.kind !== e.kind && P(e, "unacceptable node kind for !<" + e.tag + "> tag; it should be \"" + g.kind + "\", not \"" + e.kind + "\""), g.resolve(e.result, e.tag) ? (e.result = g.construct(e.result, e.tag), e.anchor !== null && I(e, e.anchor, e.result)) : P(e, "cannot resolve a node with !<" + e.tag + "> explicit tag");
		}
		return e.listener !== null && e.listener("close", e), --e.depth, e.tag !== null || e.anchor !== null || m;
	}
	function ge(e) {
		let t = e.position, n = !1, r;
		for (e.version = null, e.checkLineBreaks = e.legacy, e.tagMap = Object.create(null), e.anchorMap = Object.create(null); (r = e.input.charCodeAt(e.position)) !== 0 && (G(e, !0, -1), r = e.input.charCodeAt(e.position), !(e.lineIndent > 0 || r !== 37));) {
			n = !0, r = e.input.charCodeAt(++e.position);
			let t = e.position;
			for (; r !== 0 && !S(r);) r = e.input.charCodeAt(++e.position);
			let i = e.input.slice(t, e.position), a = [];
			for (i.length < 1 && P(e, "directive name must not be less than one character in length"); r !== 0;) {
				for (; x(r);) r = e.input.charCodeAt(++e.position);
				if (r === 35) {
					do
						r = e.input.charCodeAt(++e.position);
					while (r !== 0 && !b(r));
					break;
				}
				if (b(r)) break;
				for (t = e.position; r !== 0 && !S(r);) r = e.input.charCodeAt(++e.position);
				a.push(e.input.slice(t, e.position));
			}
			r !== 0 && W(e), o.call(B, i) ? B[i](e, i, a) : F(e, "unknown document directive \"" + i + "\"");
		}
		if (G(e, !0, -1), e.lineIndent === 0 && e.input.charCodeAt(e.position) === 45 && e.input.charCodeAt(e.position + 1) === 45 && e.input.charCodeAt(e.position + 2) === 45 ? (e.position += 3, G(e, !0, -1)) : n && P(e, "directives end mark is expected"), he(e, e.lineIndent - 1, u, !1, !0), G(e, !0, -1), e.checkLineBreaks && h.test(e.input.slice(t, e.position)) && F(e, "non-ASCII line breaks are interpreted as content"), e.documents.push(e.result), e.position === e.lineStart && ne(e)) {
			e.input.charCodeAt(e.position) === 46 && (e.position += 3, G(e, !0, -1));
			return;
		}
		e.position < e.length - 1 && P(e, "end of the stream or a document separator is expected");
	}
	function _e(e, t) {
		e = String(e), t ||= {}, e.length !== 0 && (e.charCodeAt(e.length - 1) !== 10 && e.charCodeAt(e.length - 1) !== 13 && (e += "\n"), e.charCodeAt(0) === 65279 && (e = e.slice(1)));
		let n = new M(e, t), r = e.indexOf("\0");
		for (r !== -1 && (n.position = r, P(n, "null byte is not allowed in input")), n.input += "\0"; n.input.charCodeAt(n.position) === 32;) n.lineIndent += 1, n.position += 1;
		for (; n.position < n.length - 1;) ge(n);
		return n.documents;
	}
	function ve(e, t, n) {
		typeof t == "object" && t && n === void 0 && (n = t, t = null);
		let r = _e(e, n);
		if (typeof t != "function") return r;
		for (let e = 0, n = r.length; e < n; e += 1) t(r[e]);
	}
	function ye(e, t) {
		let n = _e(e, t);
		if (n.length !== 0) {
			if (n.length === 1) return n[0];
			throw new r("expected a single document in the stream, but found more");
		}
	}
	t.exports.loadAll = ve, t.exports.load = ye;
})), ft = /* @__PURE__ */ A(((e, t) => {
	var n = We(), r = Ge(), i = ut(), a = Object.prototype.toString, o = Object.prototype.hasOwnProperty, s = 65279, c = 9, l = 10, u = 13, d = 32, f = 33, p = 34, m = 35, h = 37, g = 38, _ = 39, v = 42, y = 44, b = 45, x = 58, S = 61, C = 62, w = 63, T = 64, E = 91, D = 93, O = 96, k = 123, A = 124, j = 125, M = {};
	M[0] = "\\0", M[7] = "\\a", M[8] = "\\b", M[9] = "\\t", M[10] = "\\n", M[11] = "\\v", M[12] = "\\f", M[13] = "\\r", M[27] = "\\e", M[34] = "\\\"", M[92] = "\\\\", M[133] = "\\N", M[160] = "\\_", M[8232] = "\\L", M[8233] = "\\P";
	var N = [
		"y",
		"Y",
		"yes",
		"Yes",
		"YES",
		"on",
		"On",
		"ON",
		"n",
		"N",
		"no",
		"No",
		"NO",
		"off",
		"Off",
		"OFF"
	], P = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
	function F(e, t) {
		if (t === null) return {};
		let n = {}, r = Object.keys(t);
		for (let i = 0, a = r.length; i < a; i += 1) {
			let a = r[i], s = String(t[a]);
			a.slice(0, 2) === "!!" && (a = "tag:yaml.org,2002:" + a.slice(2));
			let c = e.compiledTypeMap.fallback[a];
			c && o.call(c.styleAliases, s) && (s = c.styleAliases[s]), n[a] = s;
		}
		return n;
	}
	function I(e) {
		let t, i, a = e.toString(16).toUpperCase();
		if (e <= 255) t = "x", i = 2;
		else if (e <= 65535) t = "u", i = 4;
		else if (e <= 4294967295) t = "U", i = 8;
		else throw new r("code point within a string may not be greater than 0xFFFFFFFF");
		return "\\" + t + n.repeat("0", i - a.length) + a;
	}
	var ee = 1, L = 2;
	function te(e) {
		this.schema = e.schema || i, this.indent = Math.max(1, e.indent || 2), this.noArrayIndent = e.noArrayIndent || !1, this.skipInvalid = e.skipInvalid || !1, this.flowLevel = n.isNothing(e.flowLevel) ? -1 : e.flowLevel, this.styleMap = F(this.schema, e.styles || null), this.sortKeys = e.sortKeys || !1, this.lineWidth = e.lineWidth || 80, this.noRefs = e.noRefs || !1, this.noCompatMode = e.noCompatMode || !1, this.condenseFlow = e.condenseFlow || !1, this.quotingType = e.quotingType === "\"" ? L : ee, this.forceQuotes = e.forceQuotes || !1, this.replacer = typeof e.replacer == "function" ? e.replacer : null, this.implicitTypes = this.schema.compiledImplicit, this.explicitTypes = this.schema.compiledExplicit, this.tag = null, this.result = "", this.duplicates = [], this.usedDuplicates = null;
	}
	function R(e, t) {
		let r = n.repeat(" ", t), i = 0, a = "", o = e.length;
		for (; i < o;) {
			let t, n = e.indexOf("\n", i);
			n === -1 ? (t = e.slice(i), i = o) : (t = e.slice(i, n + 1), i = n + 1), t.length && t !== "\n" && (a += r), a += t;
		}
		return a;
	}
	function z(e, t) {
		return "\n" + n.repeat(" ", e.indent * t);
	}
	function B(e, t) {
		for (let n = 0, r = e.implicitTypes.length; n < r; n += 1) if (e.implicitTypes[n].resolve(t)) return !0;
		return !1;
	}
	function V(e) {
		return e === d || e === c;
	}
	function H(e) {
		return e >= 32 && e <= 126 || e >= 161 && e <= 55295 && e !== 8232 && e !== 8233 || e >= 57344 && e <= 65533 && e !== s || e >= 65536 && e <= 1114111;
	}
	function U(e) {
		return H(e) && e !== s && e !== u && e !== l;
	}
	function W(e, t, n) {
		let r = U(e), i = r && !V(e);
		return (n ? r : r && e !== y && e !== E && e !== D && e !== k && e !== j) && e !== m && !(t === x && !i) || U(t) && !V(t) && e === m || t === x && i;
	}
	function G(e) {
		return H(e) && e !== s && !V(e) && e !== b && e !== w && e !== x && e !== y && e !== E && e !== D && e !== k && e !== j && e !== m && e !== g && e !== v && e !== f && e !== A && e !== S && e !== C && e !== _ && e !== p && e !== h && e !== T && e !== O;
	}
	function ne(e) {
		return !V(e) && e !== x;
	}
	function re(e, t) {
		let n = e.charCodeAt(t), r;
		return n >= 55296 && n <= 56319 && t + 1 < e.length && (r = e.charCodeAt(t + 1), r >= 56320 && r <= 57343) ? (n - 55296) * 1024 + r - 56320 + 65536 : n;
	}
	function ie(e) {
		return /^\n* /.test(e);
	}
	var ae = 1, oe = 2, se = 3, ce = 4, le = 5;
	function ue(e, t, n, r, i, a, o, s) {
		let c, u = 0, d = null, f = !1, p = !1, m = r !== -1, h = -1, g = G(re(e, 0)) && ne(re(e, e.length - 1));
		if (t || o) for (c = 0; c < e.length; u >= 65536 ? c += 2 : c++) {
			if (u = re(e, c), !H(u)) return le;
			g &&= W(u, d, s), d = u;
		}
		else {
			for (c = 0; c < e.length; u >= 65536 ? c += 2 : c++) {
				if (u = re(e, c), u === l) f = !0, m && (p ||= c - h - 1 > r && e[h + 1] !== " ", h = c);
				else if (!H(u)) return le;
				g &&= W(u, d, s), d = u;
			}
			p ||= m && c - h - 1 > r && e[h + 1] !== " ";
		}
		return !f && !p ? g && !o && !i(e) ? ae : a === L ? le : oe : n > 9 && ie(e) ? le : o ? a === L ? le : oe : p ? ce : se;
	}
	function de(e, t, n, i, a) {
		e.dump = function() {
			if (t.length === 0) return e.quotingType === L ? "\"\"" : "''";
			if (!e.noCompatMode && (N.indexOf(t) !== -1 || P.test(t))) return e.quotingType === L ? "\"" + t + "\"" : "'" + t + "'";
			let o = e.indent * Math.max(1, n), s = e.lineWidth === -1 ? -1 : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - o), c = i || e.flowLevel > -1 && n >= e.flowLevel;
			function l(t) {
				return B(e, t);
			}
			switch (ue(t, c, e.indent, s, l, e.quotingType, e.forceQuotes && !i, a)) {
				case ae: return t;
				case oe: return "'" + t.replace(/'/g, "''") + "'";
				case se: return "|" + fe(t, e.indent) + pe(R(t, o));
				case ce: return ">" + fe(t, e.indent) + pe(R(me(t, s), o));
				case le: return "\"" + ge(t, s) + "\"";
				default: throw new r("impossible error: invalid scalar style");
			}
		}();
	}
	function fe(e, t) {
		let n = ie(e) ? String(t) : "", r = e[e.length - 1] === "\n";
		return n + (r && (e[e.length - 2] === "\n" || e === "\n") ? "+" : r ? "" : "-") + "\n";
	}
	function pe(e) {
		return e[e.length - 1] === "\n" ? e.slice(0, -1) : e;
	}
	function me(e, t) {
		let n = /(\n+)([^\n]*)/g, r = function() {
			let r = e.indexOf("\n");
			return r = r === -1 ? e.length : r, n.lastIndex = r, he(e.slice(0, r), t);
		}(), i = e[0] === "\n" || e[0] === " ", a, o;
		for (; o = n.exec(e);) {
			let e = o[1], n = o[2];
			a = n[0] === " ", r += e + (!i && !a && n !== "" ? "\n" : "") + he(n, t), i = a;
		}
		return r;
	}
	function he(e, t) {
		if (e === "" || e[0] === " ") return e;
		let n = / [^ ]/g, r, i = 0, a, o = 0, s = 0, c = "";
		for (; r = n.exec(e);) s = r.index, s - i > t && (a = o > i ? o : s, c += "\n" + e.slice(i, a), i = a + 1), o = s;
		return c += "\n", e.length - i > t && o > i ? c += e.slice(i, o) + "\n" + e.slice(o + 1) : c += e.slice(i), c.slice(1);
	}
	function ge(e) {
		let t = "", n = 0;
		for (let r = 0; r < e.length; n >= 65536 ? r += 2 : r++) {
			n = re(e, r);
			let i = M[n];
			!i && H(n) ? (t += e[r], n >= 65536 && (t += e[r + 1])) : t += i || I(n);
		}
		return t;
	}
	function _e(e, t, n) {
		let r = "", i = e.tag;
		for (let i = 0, a = n.length; i < a; i += 1) {
			let a = n[i];
			e.replacer && (a = e.replacer.call(n, String(i), a)), (Se(e, t, a, !1, !1) || a === void 0 && Se(e, t, null, !1, !1)) && (r !== "" && (r += "," + (e.condenseFlow ? "" : " ")), r += e.dump);
		}
		e.tag = i, e.dump = "[" + r + "]";
	}
	function ve(e, t, n, r) {
		let i = "", a = e.tag;
		for (let a = 0, o = n.length; a < o; a += 1) {
			let o = n[a];
			e.replacer && (o = e.replacer.call(n, String(a), o)), (Se(e, t + 1, o, !0, !0, !1, !0) || o === void 0 && Se(e, t + 1, null, !0, !0, !1, !0)) && ((!r || i !== "") && (i += z(e, t)), e.dump && l === e.dump.charCodeAt(0) ? i += "-" : i += "- ", i += e.dump);
		}
		e.tag = a, e.dump = i || "[]";
	}
	function ye(e, t, n) {
		let r = "", i = e.tag, a = Object.keys(n);
		for (let i = 0, o = a.length; i < o; i += 1) {
			let o = "";
			r !== "" && (o += ", "), e.condenseFlow && (o += "\"");
			let s = a[i], c = n[s];
			e.replacer && (c = e.replacer.call(n, s, c)), Se(e, t, s, !1, !1) && (e.dump.length > 1024 && (o += "? "), o += e.dump + (e.condenseFlow ? "\"" : "") + ":" + (e.condenseFlow ? "" : " "), Se(e, t, c, !1, !1) && (o += e.dump, r += o));
		}
		e.tag = i, e.dump = "{" + r + "}";
	}
	function be(e, t, n, i) {
		let a = "", o = e.tag, s = Object.keys(n);
		if (e.sortKeys === !0) s.sort();
		else if (typeof e.sortKeys == "function") s.sort(e.sortKeys);
		else if (e.sortKeys) throw new r("sortKeys must be a boolean or a function");
		for (let r = 0, o = s.length; r < o; r += 1) {
			let o = "";
			(!i || a !== "") && (o += z(e, t));
			let c = s[r], u = n[c];
			if (e.replacer && (u = e.replacer.call(n, c, u)), !Se(e, t + 1, c, !0, !0, !0)) continue;
			let d = e.tag !== null && e.tag !== "?" || e.dump && e.dump.length > 1024;
			d && (e.dump && l === e.dump.charCodeAt(0) ? o += "?" : o += "? "), o += e.dump, d && (o += z(e, t)), Se(e, t + 1, u, !0, d) && (e.dump && l === e.dump.charCodeAt(0) ? o += ":" : o += ": ", o += e.dump, a += o);
		}
		e.tag = o, e.dump = a || "{}";
	}
	function xe(e, t, n) {
		let i = n ? e.explicitTypes : e.implicitTypes;
		for (let s = 0, c = i.length; s < c; s += 1) {
			let c = i[s];
			if ((c.instanceOf || c.predicate) && (!c.instanceOf || typeof t == "object" && t instanceof c.instanceOf) && (!c.predicate || c.predicate(t))) {
				if (n ? c.multi && c.representName ? e.tag = c.representName(t) : e.tag = c.tag : e.tag = "?", c.represent) {
					let n = e.styleMap[c.tag] || c.defaultStyle, i;
					if (a.call(c.represent) === "[object Function]") i = c.represent(t, n);
					else if (o.call(c.represent, n)) i = c.represent[n](t, n);
					else throw new r("!<" + c.tag + "> tag resolver accepts not \"" + n + "\" style");
					e.dump = i;
				}
				return !0;
			}
		}
		return !1;
	}
	function Se(e, t, n, i, o, s, c) {
		e.tag = null, e.dump = n, xe(e, n, !1) || xe(e, n, !0);
		let l = a.call(e.dump), u = i;
		i &&= e.flowLevel < 0 || e.flowLevel > t;
		let d = l === "[object Object]" || l === "[object Array]", f, p;
		if (d && (f = e.duplicates.indexOf(n), p = f !== -1), (e.tag !== null && e.tag !== "?" || p || e.indent !== 2 && t > 0) && (o = !1), p && e.usedDuplicates[f]) e.dump = "*ref_" + f;
		else {
			if (d && p && !e.usedDuplicates[f] && (e.usedDuplicates[f] = !0), l === "[object Object]") i && Object.keys(e.dump).length !== 0 ? (be(e, t, e.dump, o), p && (e.dump = "&ref_" + f + e.dump)) : (ye(e, t, e.dump), p && (e.dump = "&ref_" + f + " " + e.dump));
			else if (l === "[object Array]") i && e.dump.length !== 0 ? (e.noArrayIndent && !c && t > 0 ? ve(e, t - 1, e.dump, o) : ve(e, t, e.dump, o), p && (e.dump = "&ref_" + f + e.dump)) : (_e(e, t, e.dump), p && (e.dump = "&ref_" + f + " " + e.dump));
			else if (l === "[object String]") e.tag !== "?" && de(e, e.dump, t, s, u);
			else if (l === "[object Undefined]") return !1;
			else {
				if (e.skipInvalid) return !1;
				throw new r("unacceptable kind of an object to dump " + l);
			}
			if (e.tag !== null && e.tag !== "?") {
				let t = encodeURI(e.tag[0] === "!" ? e.tag.slice(1) : e.tag).replace(/!/g, "%21");
				t = e.tag[0] === "!" ? "!" + t : t.slice(0, 18) === "tag:yaml.org,2002:" ? "!!" + t.slice(18) : "!<" + t + ">", e.dump = t + " " + e.dump;
			}
		}
		return !0;
	}
	function Ce(e, t) {
		let n = [], r = [];
		we(e, n, r);
		let i = r.length;
		for (let e = 0; e < i; e += 1) t.duplicates.push(n[r[e]]);
		t.usedDuplicates = Array(i);
	}
	function we(e, t, n) {
		if (typeof e == "object" && e) {
			let r = t.indexOf(e);
			if (r !== -1) n.indexOf(r) === -1 && n.push(r);
			else if (t.push(e), Array.isArray(e)) for (let r = 0, i = e.length; r < i; r += 1) we(e[r], t, n);
			else {
				let r = Object.keys(e);
				for (let i = 0, a = r.length; i < a; i += 1) we(e[r[i]], t, n);
			}
		}
	}
	function Te(e, t) {
		t ||= {};
		let n = new te(t);
		n.noRefs || Ce(e, n);
		let r = e;
		return n.replacer && (r = n.replacer.call({ "": r }, "", r)), Se(n, 0, r, !0, !0) ? n.dump + "\n" : "";
	}
	t.exports.dump = Te;
})), pt = /* @__PURE__ */ A(((e, t) => {
	var n = dt(), r = ft();
	function i(e, t) {
		return function() {
			throw Error("Function yaml." + e + " is removed in js-yaml 4. Use yaml." + t + " instead, which is now safe by default.");
		};
	}
	t.exports.Type = q(), t.exports.Schema = qe(), t.exports.FAILSAFE_SCHEMA = Ze(), t.exports.JSON_SCHEMA = nt(), t.exports.CORE_SCHEMA = rt(), t.exports.DEFAULT_SCHEMA = ut(), t.exports.load = n.load, t.exports.loadAll = n.loadAll, t.exports.dump = r.dump, t.exports.YAMLException = Ge(), t.exports.types = {
		binary: ot(),
		float: tt(),
		map: Xe(),
		null: Qe(),
		pairs: ct(),
		set: lt(),
		timestamp: it(),
		bool: $e(),
		int: et(),
		merge: at(),
		omap: st(),
		seq: Ye(),
		str: Je()
	}, t.exports.safeLoad = i("safeLoad", "load"), t.exports.safeLoadAll = i("safeLoadAll", "loadAll"), t.exports.safeDump = i("safeDump", "dump");
})), mt = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.Lazy = void 0, e.Lazy = class {
		constructor(e) {
			this._value = null, this.creator = e;
		}
		get hasValue() {
			return this.creator == null;
		}
		get value() {
			if (this.creator == null) return this._value;
			let e = this.creator();
			return this.value = e, e;
		}
		set value(e) {
			this._value = e, this.creator = null;
		}
	};
})), ht = /* @__PURE__ */ A(((e, t) => {
	var n = "2.0.0", r = 256;
	t.exports = {
		MAX_LENGTH: r,
		MAX_SAFE_COMPONENT_LENGTH: 16,
		MAX_SAFE_BUILD_LENGTH: r - 6,
		MAX_SAFE_INTEGER: 2 ** 53 - 1 || 9007199254740991,
		RELEASE_TYPES: [
			"major",
			"premajor",
			"minor",
			"preminor",
			"patch",
			"prepatch",
			"prerelease"
		],
		SEMVER_SPEC_VERSION: n,
		FLAG_INCLUDE_PRERELEASE: 1,
		FLAG_LOOSE: 2
	};
})), gt = /* @__PURE__ */ A(((e, t) => {
	t.exports = typeof process == "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...e) => console.error("SEMVER", ...e) : () => {};
})), _t = /* @__PURE__ */ A(((e, t) => {
	var { MAX_SAFE_COMPONENT_LENGTH: n, MAX_SAFE_BUILD_LENGTH: r, MAX_LENGTH: i } = ht(), a = gt();
	e = t.exports = {};
	var o = e.re = [], s = e.safeRe = [], c = e.src = [], l = e.safeSrc = [], u = e.t = {}, d = 0, f = "[a-zA-Z0-9-]", p = [
		["\\s", 1],
		["\\d", i],
		[f, r]
	], m = (e) => {
		for (let [t, n] of p) e = e.split(`${t}*`).join(`${t}{0,${n}}`).split(`${t}+`).join(`${t}{1,${n}}`);
		return e;
	}, h = (e, t, n) => {
		let r = m(t), i = d++;
		a(e, i, t), u[e] = i, c[i] = t, l[i] = r, o[i] = new RegExp(t, n ? "g" : void 0), s[i] = new RegExp(r, n ? "g" : void 0);
	};
	h("NUMERICIDENTIFIER", "0|[1-9]\\d*"), h("NUMERICIDENTIFIERLOOSE", "\\d+"), h("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${f}*`), h("MAINVERSION", `(${c[u.NUMERICIDENTIFIER]})\\.(${c[u.NUMERICIDENTIFIER]})\\.(${c[u.NUMERICIDENTIFIER]})`), h("MAINVERSIONLOOSE", `(${c[u.NUMERICIDENTIFIERLOOSE]})\\.(${c[u.NUMERICIDENTIFIERLOOSE]})\\.(${c[u.NUMERICIDENTIFIERLOOSE]})`), h("PRERELEASEIDENTIFIER", `(?:${c[u.NONNUMERICIDENTIFIER]}|${c[u.NUMERICIDENTIFIER]})`), h("PRERELEASEIDENTIFIERLOOSE", `(?:${c[u.NONNUMERICIDENTIFIER]}|${c[u.NUMERICIDENTIFIERLOOSE]})`), h("PRERELEASE", `(?:-(${c[u.PRERELEASEIDENTIFIER]}(?:\\.${c[u.PRERELEASEIDENTIFIER]})*))`), h("PRERELEASELOOSE", `(?:-?(${c[u.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${c[u.PRERELEASEIDENTIFIERLOOSE]})*))`), h("BUILDIDENTIFIER", `${f}+`), h("BUILD", `(?:\\+(${c[u.BUILDIDENTIFIER]}(?:\\.${c[u.BUILDIDENTIFIER]})*))`), h("FULLPLAIN", `v?${c[u.MAINVERSION]}${c[u.PRERELEASE]}?${c[u.BUILD]}?`), h("FULL", `^${c[u.FULLPLAIN]}$`), h("LOOSEPLAIN", `[v=\\s]*${c[u.MAINVERSIONLOOSE]}${c[u.PRERELEASELOOSE]}?${c[u.BUILD]}?`), h("LOOSE", `^${c[u.LOOSEPLAIN]}$`), h("GTLT", "((?:<|>)?=?)"), h("XRANGEIDENTIFIERLOOSE", `${c[u.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`), h("XRANGEIDENTIFIER", `${c[u.NUMERICIDENTIFIER]}|x|X|\\*`), h("XRANGEPLAIN", `[v=\\s]*(${c[u.XRANGEIDENTIFIER]})(?:\\.(${c[u.XRANGEIDENTIFIER]})(?:\\.(${c[u.XRANGEIDENTIFIER]})(?:${c[u.PRERELEASE]})?${c[u.BUILD]}?)?)?`), h("XRANGEPLAINLOOSE", `[v=\\s]*(${c[u.XRANGEIDENTIFIERLOOSE]})(?:\\.(${c[u.XRANGEIDENTIFIERLOOSE]})(?:\\.(${c[u.XRANGEIDENTIFIERLOOSE]})(?:${c[u.PRERELEASELOOSE]})?${c[u.BUILD]}?)?)?`), h("XRANGE", `^${c[u.GTLT]}\\s*${c[u.XRANGEPLAIN]}$`), h("XRANGELOOSE", `^${c[u.GTLT]}\\s*${c[u.XRANGEPLAINLOOSE]}$`), h("COERCEPLAIN", `(^|[^\\d])(\\d{1,${n}})(?:\\.(\\d{1,${n}}))?(?:\\.(\\d{1,${n}}))?`), h("COERCE", `${c[u.COERCEPLAIN]}(?:$|[^\\d])`), h("COERCEFULL", c[u.COERCEPLAIN] + `(?:${c[u.PRERELEASE]})?(?:${c[u.BUILD]})?(?:$|[^\\d])`), h("COERCERTL", c[u.COERCE], !0), h("COERCERTLFULL", c[u.COERCEFULL], !0), h("LONETILDE", "(?:~>?)"), h("TILDETRIM", `(\\s*)${c[u.LONETILDE]}\\s+`, !0), e.tildeTrimReplace = "$1~", h("TILDE", `^${c[u.LONETILDE]}${c[u.XRANGEPLAIN]}$`), h("TILDELOOSE", `^${c[u.LONETILDE]}${c[u.XRANGEPLAINLOOSE]}$`), h("LONECARET", "(?:\\^)"), h("CARETTRIM", `(\\s*)${c[u.LONECARET]}\\s+`, !0), e.caretTrimReplace = "$1^", h("CARET", `^${c[u.LONECARET]}${c[u.XRANGEPLAIN]}$`), h("CARETLOOSE", `^${c[u.LONECARET]}${c[u.XRANGEPLAINLOOSE]}$`), h("COMPARATORLOOSE", `^${c[u.GTLT]}\\s*(${c[u.LOOSEPLAIN]})$|^$`), h("COMPARATOR", `^${c[u.GTLT]}\\s*(${c[u.FULLPLAIN]})$|^$`), h("COMPARATORTRIM", `(\\s*)${c[u.GTLT]}\\s*(${c[u.LOOSEPLAIN]}|${c[u.XRANGEPLAIN]})`, !0), e.comparatorTrimReplace = "$1$2$3", h("HYPHENRANGE", `^\\s*(${c[u.XRANGEPLAIN]})\\s+-\\s+(${c[u.XRANGEPLAIN]})\\s*$`), h("HYPHENRANGELOOSE", `^\\s*(${c[u.XRANGEPLAINLOOSE]})\\s+-\\s+(${c[u.XRANGEPLAINLOOSE]})\\s*$`), h("STAR", "(<|>)?=?\\s*\\*"), h("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$"), h("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
})), vt = /* @__PURE__ */ A(((e, t) => {
	var n = Object.freeze({ loose: !0 }), r = Object.freeze({});
	t.exports = (e) => e ? typeof e == "object" ? e : n : r;
})), yt = /* @__PURE__ */ A(((e, t) => {
	var n = /^[0-9]+$/, r = (e, t) => {
		if (typeof e == "number" && typeof t == "number") return e === t ? 0 : e < t ? -1 : 1;
		let r = n.test(e), i = n.test(t);
		return r && i && (e = +e, t = +t), e === t ? 0 : r && !i ? -1 : i && !r ? 1 : e < t ? -1 : 1;
	};
	t.exports = {
		compareIdentifiers: r,
		rcompareIdentifiers: (e, t) => r(t, e)
	};
})), J = /* @__PURE__ */ A(((e, t) => {
	var n = gt(), { MAX_LENGTH: r, MAX_SAFE_INTEGER: i } = ht(), { safeRe: a, t: o } = _t(), s = vt(), { compareIdentifiers: c } = yt();
	t.exports = class e {
		constructor(t, c) {
			if (c = s(c), t instanceof e) {
				if (t.loose === !!c.loose && t.includePrerelease === !!c.includePrerelease) return t;
				t = t.version;
			} else if (typeof t != "string") throw TypeError(`Invalid version. Must be a string. Got type "${typeof t}".`);
			if (t.length > r) throw TypeError(`version is longer than ${r} characters`);
			n("SemVer", t, c), this.options = c, this.loose = !!c.loose, this.includePrerelease = !!c.includePrerelease;
			let l = t.trim().match(c.loose ? a[o.LOOSE] : a[o.FULL]);
			if (!l) throw TypeError(`Invalid Version: ${t}`);
			if (this.raw = t, this.major = +l[1], this.minor = +l[2], this.patch = +l[3], this.major > i || this.major < 0) throw TypeError("Invalid major version");
			if (this.minor > i || this.minor < 0) throw TypeError("Invalid minor version");
			if (this.patch > i || this.patch < 0) throw TypeError("Invalid patch version");
			l[4] ? this.prerelease = l[4].split(".").map((e) => {
				if (/^[0-9]+$/.test(e)) {
					let t = +e;
					if (t >= 0 && t < i) return t;
				}
				return e;
			}) : this.prerelease = [], this.build = l[5] ? l[5].split(".") : [], this.format();
		}
		format() {
			return this.version = `${this.major}.${this.minor}.${this.patch}`, this.prerelease.length && (this.version += `-${this.prerelease.join(".")}`), this.version;
		}
		toString() {
			return this.version;
		}
		compare(t) {
			if (n("SemVer.compare", this.version, this.options, t), !(t instanceof e)) {
				if (typeof t == "string" && t === this.version) return 0;
				t = new e(t, this.options);
			}
			return t.version === this.version ? 0 : this.compareMain(t) || this.comparePre(t);
		}
		compareMain(t) {
			return t instanceof e || (t = new e(t, this.options)), this.major < t.major ? -1 : this.major > t.major ? 1 : this.minor < t.minor ? -1 : this.minor > t.minor ? 1 : this.patch < t.patch ? -1 : +(this.patch > t.patch);
		}
		comparePre(t) {
			if (t instanceof e || (t = new e(t, this.options)), this.prerelease.length && !t.prerelease.length) return -1;
			if (!this.prerelease.length && t.prerelease.length) return 1;
			if (!this.prerelease.length && !t.prerelease.length) return 0;
			let r = 0;
			do {
				let e = this.prerelease[r], i = t.prerelease[r];
				if (n("prerelease compare", r, e, i), e === void 0 && i === void 0) return 0;
				if (i === void 0) return 1;
				if (e === void 0) return -1;
				if (e === i) continue;
				return c(e, i);
			} while (++r);
		}
		compareBuild(t) {
			t instanceof e || (t = new e(t, this.options));
			let r = 0;
			do {
				let e = this.build[r], i = t.build[r];
				if (n("build compare", r, e, i), e === void 0 && i === void 0) return 0;
				if (i === void 0) return 1;
				if (e === void 0) return -1;
				if (e === i) continue;
				return c(e, i);
			} while (++r);
		}
		inc(e, t, n) {
			if (e.startsWith("pre")) {
				if (!t && n === !1) throw Error("invalid increment argument: identifier is empty");
				if (t) {
					let e = `-${t}`.match(this.options.loose ? a[o.PRERELEASELOOSE] : a[o.PRERELEASE]);
					if (!e || e[1] !== t) throw Error(`invalid identifier: ${t}`);
				}
			}
			switch (e) {
				case "premajor":
					this.prerelease.length = 0, this.patch = 0, this.minor = 0, this.major++, this.inc("pre", t, n);
					break;
				case "preminor":
					this.prerelease.length = 0, this.patch = 0, this.minor++, this.inc("pre", t, n);
					break;
				case "prepatch":
					this.prerelease.length = 0, this.inc("patch", t, n), this.inc("pre", t, n);
					break;
				case "prerelease":
					this.prerelease.length === 0 && this.inc("patch", t, n), this.inc("pre", t, n);
					break;
				case "release":
					if (this.prerelease.length === 0) throw Error(`version ${this.raw} is not a prerelease`);
					this.prerelease.length = 0;
					break;
				case "major":
					(this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) && this.major++, this.minor = 0, this.patch = 0, this.prerelease = [];
					break;
				case "minor":
					(this.patch !== 0 || this.prerelease.length === 0) && this.minor++, this.patch = 0, this.prerelease = [];
					break;
				case "patch":
					this.prerelease.length === 0 && this.patch++, this.prerelease = [];
					break;
				case "pre": {
					let e = +!!Number(n);
					if (this.prerelease.length === 0) this.prerelease = [e];
					else {
						let r = this.prerelease.length;
						for (; --r >= 0;) typeof this.prerelease[r] == "number" && (this.prerelease[r]++, r = -2);
						if (r === -1) {
							if (t === this.prerelease.join(".") && n === !1) throw Error("invalid increment argument: identifier already exists");
							this.prerelease.push(e);
						}
					}
					if (t) {
						let r = [t, e];
						n === !1 && (r = [t]), c(this.prerelease[0], t) === 0 ? isNaN(this.prerelease[1]) && (this.prerelease = r) : this.prerelease = r;
					}
					break;
				}
				default: throw Error(`invalid increment argument: ${e}`);
			}
			return this.raw = this.format(), this.build.length && (this.raw += `+${this.build.join(".")}`), this;
		}
	};
})), bt = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t, r = !1) => {
		if (e instanceof n) return e;
		try {
			return new n(e, t);
		} catch (e) {
			if (!r) return null;
			throw e;
		}
	};
})), xt = /* @__PURE__ */ A(((e, t) => {
	var n = bt();
	t.exports = (e, t) => {
		let r = n(e, t);
		return r ? r.version : null;
	};
})), St = /* @__PURE__ */ A(((e, t) => {
	var n = bt();
	t.exports = (e, t) => {
		let r = n(e.trim().replace(/^[=v]+/, ""), t);
		return r ? r.version : null;
	};
})), Ct = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t, r, i, a) => {
		typeof r == "string" && (a = i, i = r, r = void 0);
		try {
			return new n(e instanceof n ? e.version : e, r).inc(t, i, a).version;
		} catch {
			return null;
		}
	};
})), wt = /* @__PURE__ */ A(((e, t) => {
	var n = bt();
	t.exports = (e, t) => {
		let r = n(e, null, !0), i = n(t, null, !0), a = r.compare(i);
		if (a === 0) return null;
		let o = a > 0, s = o ? r : i, c = o ? i : r, l = !!s.prerelease.length;
		if (c.prerelease.length && !l) {
			if (!c.patch && !c.minor) return "major";
			if (c.compareMain(s) === 0) return c.minor && !c.patch ? "minor" : "patch";
		}
		let u = l ? "pre" : "";
		return r.major === i.major ? r.minor === i.minor ? r.patch === i.patch ? "prerelease" : u + "patch" : u + "minor" : u + "major";
	};
})), Tt = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t) => new n(e, t).major;
})), Et = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t) => new n(e, t).minor;
})), Dt = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t) => new n(e, t).patch;
})), Ot = /* @__PURE__ */ A(((e, t) => {
	var n = bt();
	t.exports = (e, t) => {
		let r = n(e, t);
		return r && r.prerelease.length ? r.prerelease : null;
	};
})), kt = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t, r) => new n(e, r).compare(new n(t, r));
})), At = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(t, e, r);
})), jt = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t) => n(e, t, !0);
})), Mt = /* @__PURE__ */ A(((e, t) => {
	var n = J();
	t.exports = (e, t, r) => {
		let i = new n(e, r), a = new n(t, r);
		return i.compare(a) || i.compareBuild(a);
	};
})), Nt = /* @__PURE__ */ A(((e, t) => {
	var n = Mt();
	t.exports = (e, t) => e.sort((e, r) => n(e, r, t));
})), Pt = /* @__PURE__ */ A(((e, t) => {
	var n = Mt();
	t.exports = (e, t) => e.sort((e, r) => n(r, e, t));
})), Ft = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) > 0;
})), It = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) < 0;
})), Lt = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) === 0;
})), Rt = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) !== 0;
})), zt = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) >= 0;
})), Bt = /* @__PURE__ */ A(((e, t) => {
	var n = kt();
	t.exports = (e, t, r) => n(e, t, r) <= 0;
})), Vt = /* @__PURE__ */ A(((e, t) => {
	var n = Lt(), r = Rt(), i = Ft(), a = zt(), o = It(), s = Bt();
	t.exports = (e, t, c, l) => {
		switch (t) {
			case "===": return typeof e == "object" && (e = e.version), typeof c == "object" && (c = c.version), e === c;
			case "!==": return typeof e == "object" && (e = e.version), typeof c == "object" && (c = c.version), e !== c;
			case "":
			case "=":
			case "==": return n(e, c, l);
			case "!=": return r(e, c, l);
			case ">": return i(e, c, l);
			case ">=": return a(e, c, l);
			case "<": return o(e, c, l);
			case "<=": return s(e, c, l);
			default: throw TypeError(`Invalid operator: ${t}`);
		}
	};
})), Ht = /* @__PURE__ */ A(((e, t) => {
	var n = J(), r = bt(), { safeRe: i, t: a } = _t();
	t.exports = (e, t) => {
		if (e instanceof n) return e;
		if (typeof e == "number" && (e = String(e)), typeof e != "string") return null;
		t ||= {};
		let o = null;
		if (!t.rtl) o = e.match(t.includePrerelease ? i[a.COERCEFULL] : i[a.COERCE]);
		else {
			let n = t.includePrerelease ? i[a.COERCERTLFULL] : i[a.COERCERTL], r;
			for (; (r = n.exec(e)) && (!o || o.index + o[0].length !== e.length);) (!o || r.index + r[0].length !== o.index + o[0].length) && (o = r), n.lastIndex = r.index + r[1].length + r[2].length;
			n.lastIndex = -1;
		}
		if (o === null) return null;
		let s = o[2];
		return r(`${s}.${o[3] || "0"}.${o[4] || "0"}${t.includePrerelease && o[5] ? `-${o[5]}` : ""}${t.includePrerelease && o[6] ? `+${o[6]}` : ""}`, t);
	};
})), Ut = /* @__PURE__ */ A(((e, t) => {
	t.exports = class {
		constructor() {
			this.max = 1e3, this.map = /* @__PURE__ */ new Map();
		}
		get(e) {
			let t = this.map.get(e);
			if (t !== void 0) return this.map.delete(e), this.map.set(e, t), t;
		}
		delete(e) {
			return this.map.delete(e);
		}
		set(e, t) {
			if (!this.delete(e) && t !== void 0) {
				if (this.map.size >= this.max) {
					let e = this.map.keys().next().value;
					this.delete(e);
				}
				this.map.set(e, t);
			}
			return this;
		}
	};
})), Wt = /* @__PURE__ */ A(((e, t) => {
	var n = /\s+/g;
	t.exports = class e {
		constructor(t, r) {
			if (r = i(r), t instanceof e) return t.loose === !!r.loose && t.includePrerelease === !!r.includePrerelease ? t : new e(t.raw, r);
			if (t instanceof a) return this.raw = t.value, this.set = [[t]], this.formatted = void 0, this;
			if (this.options = r, this.loose = !!r.loose, this.includePrerelease = !!r.includePrerelease, this.raw = t.trim().replace(n, " "), this.set = this.raw.split("||").map((e) => this.parseRange(e.trim())).filter((e) => e.length), !this.set.length) throw TypeError(`Invalid SemVer Range: ${this.raw}`);
			if (this.set.length > 1) {
				let e = this.set[0];
				if (this.set = this.set.filter((e) => !h(e[0])), this.set.length === 0) this.set = [e];
				else if (this.set.length > 1) {
					for (let e of this.set) if (e.length === 1 && g(e[0])) {
						this.set = [e];
						break;
					}
				}
			}
			this.formatted = void 0;
		}
		get range() {
			if (this.formatted === void 0) {
				this.formatted = "";
				for (let e = 0; e < this.set.length; e++) {
					e > 0 && (this.formatted += "||");
					let t = this.set[e];
					for (let e = 0; e < t.length; e++) e > 0 && (this.formatted += " "), this.formatted += t[e].toString().trim();
				}
			}
			return this.formatted;
		}
		format() {
			return this.range;
		}
		toString() {
			return this.range;
		}
		parseRange(e) {
			let t = ((this.options.includePrerelease && p) | (this.options.loose && m)) + ":" + e, n = r.get(t);
			if (n) return n;
			let i = this.options.loose, s = i ? c[l.HYPHENRANGELOOSE] : c[l.HYPHENRANGE];
			e = e.replace(s, O(this.options.includePrerelease)), o("hyphen replace", e), e = e.replace(c[l.COMPARATORTRIM], u), o("comparator trim", e), e = e.replace(c[l.TILDETRIM], d), o("tilde trim", e), e = e.replace(c[l.CARETTRIM], f), o("caret trim", e);
			let g = e.split(" ").map((e) => v(e, this.options)).join(" ").split(/\s+/).map((e) => D(e, this.options));
			i && (g = g.filter((e) => (o("loose invalid filter", e, this.options), !!e.match(c[l.COMPARATORLOOSE])))), o("range list", g);
			let _ = /* @__PURE__ */ new Map(), y = g.map((e) => new a(e, this.options));
			for (let e of y) {
				if (h(e)) return [e];
				_.set(e.value, e);
			}
			_.size > 1 && _.has("") && _.delete("");
			let b = [..._.values()];
			return r.set(t, b), b;
		}
		intersects(t, n) {
			if (!(t instanceof e)) throw TypeError("a Range is required");
			return this.set.some((e) => _(e, n) && t.set.some((t) => _(t, n) && e.every((e) => t.every((t) => e.intersects(t, n)))));
		}
		test(e) {
			if (!e) return !1;
			if (typeof e == "string") try {
				e = new s(e, this.options);
			} catch {
				return !1;
			}
			for (let t = 0; t < this.set.length; t++) if (k(this.set[t], e, this.options)) return !0;
			return !1;
		}
	};
	var r = new (Ut())(), i = vt(), a = Gt(), o = gt(), s = J(), { safeRe: c, t: l, comparatorTrimReplace: u, tildeTrimReplace: d, caretTrimReplace: f } = _t(), { FLAG_INCLUDE_PRERELEASE: p, FLAG_LOOSE: m } = ht(), h = (e) => e.value === "<0.0.0-0", g = (e) => e.value === "", _ = (e, t) => {
		let n = !0, r = e.slice(), i = r.pop();
		for (; n && r.length;) n = r.every((e) => i.intersects(e, t)), i = r.pop();
		return n;
	}, v = (e, t) => (e = e.replace(c[l.BUILD], ""), o("comp", e, t), e = S(e, t), o("caret", e), e = b(e, t), o("tildes", e), e = w(e, t), o("xrange", e), e = E(e, t), o("stars", e), e), y = (e) => !e || e.toLowerCase() === "x" || e === "*", b = (e, t) => e.trim().split(/\s+/).map((e) => x(e, t)).join(" "), x = (e, t) => {
		let n = t.loose ? c[l.TILDELOOSE] : c[l.TILDE];
		return e.replace(n, (t, n, r, i, a) => {
			o("tilde", e, t, n, r, i, a);
			let s;
			return y(n) ? s = "" : y(r) ? s = `>=${n}.0.0 <${+n + 1}.0.0-0` : y(i) ? s = `>=${n}.${r}.0 <${n}.${+r + 1}.0-0` : a ? (o("replaceTilde pr", a), s = `>=${n}.${r}.${i}-${a} <${n}.${+r + 1}.0-0`) : s = `>=${n}.${r}.${i} <${n}.${+r + 1}.0-0`, o("tilde return", s), s;
		});
	}, S = (e, t) => e.trim().split(/\s+/).map((e) => C(e, t)).join(" "), C = (e, t) => {
		o("caret", e, t);
		let n = t.loose ? c[l.CARETLOOSE] : c[l.CARET], r = t.includePrerelease ? "-0" : "";
		return e.replace(n, (t, n, i, a, s) => {
			o("caret", e, t, n, i, a, s);
			let c;
			return y(n) ? c = "" : y(i) ? c = `>=${n}.0.0${r} <${+n + 1}.0.0-0` : y(a) ? c = n === "0" ? `>=${n}.${i}.0${r} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.0${r} <${+n + 1}.0.0-0` : s ? (o("replaceCaret pr", s), c = n === "0" ? i === "0" ? `>=${n}.${i}.${a}-${s} <${n}.${i}.${+a + 1}-0` : `>=${n}.${i}.${a}-${s} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.${a}-${s} <${+n + 1}.0.0-0`) : (o("no pr"), c = n === "0" ? i === "0" ? `>=${n}.${i}.${a}${r} <${n}.${i}.${+a + 1}-0` : `>=${n}.${i}.${a}${r} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.${a} <${+n + 1}.0.0-0`), o("caret return", c), c;
		});
	}, w = (e, t) => (o("replaceXRanges", e, t), e.split(/\s+/).map((e) => T(e, t)).join(" ")), T = (e, t) => {
		e = e.trim();
		let n = t.loose ? c[l.XRANGELOOSE] : c[l.XRANGE];
		return e.replace(n, (n, r, i, a, s, c) => {
			o("xRange", e, n, r, i, a, s, c);
			let l = y(i), u = l || y(a), d = u || y(s), f = d;
			return r === "=" && f && (r = ""), c = t.includePrerelease ? "-0" : "", l ? n = r === ">" || r === "<" ? "<0.0.0-0" : "*" : r && f ? (u && (a = 0), s = 0, r === ">" ? (r = ">=", u ? (i = +i + 1, a = 0, s = 0) : (a = +a + 1, s = 0)) : r === "<=" && (r = "<", u ? i = +i + 1 : a = +a + 1), r === "<" && (c = "-0"), n = `${r + i}.${a}.${s}${c}`) : u ? n = `>=${i}.0.0${c} <${+i + 1}.0.0-0` : d && (n = `>=${i}.${a}.0${c} <${i}.${+a + 1}.0-0`), o("xRange return", n), n;
		});
	}, E = (e, t) => (o("replaceStars", e, t), e.trim().replace(c[l.STAR], "")), D = (e, t) => (o("replaceGTE0", e, t), e.trim().replace(c[t.includePrerelease ? l.GTE0PRE : l.GTE0], "")), O = (e) => (t, n, r, i, a, o, s, c, l, u, d, f) => (n = y(r) ? "" : y(i) ? `>=${r}.0.0${e ? "-0" : ""}` : y(a) ? `>=${r}.${i}.0${e ? "-0" : ""}` : o ? `>=${n}` : `>=${n}${e ? "-0" : ""}`, c = y(l) ? "" : y(u) ? `<${+l + 1}.0.0-0` : y(d) ? `<${l}.${+u + 1}.0-0` : f ? `<=${l}.${u}.${d}-${f}` : e ? `<${l}.${u}.${+d + 1}-0` : `<=${c}`, `${n} ${c}`.trim()), k = (e, t, n) => {
		for (let n = 0; n < e.length; n++) if (!e[n].test(t)) return !1;
		if (t.prerelease.length && !n.includePrerelease) {
			for (let n = 0; n < e.length; n++) if (o(e[n].semver), e[n].semver !== a.ANY && e[n].semver.prerelease.length > 0) {
				let r = e[n].semver;
				if (r.major === t.major && r.minor === t.minor && r.patch === t.patch) return !0;
			}
			return !1;
		}
		return !0;
	};
})), Gt = /* @__PURE__ */ A(((e, t) => {
	var n = Symbol("SemVer ANY");
	t.exports = class e {
		static get ANY() {
			return n;
		}
		constructor(t, i) {
			if (i = r(i), t instanceof e) {
				if (t.loose === !!i.loose) return t;
				t = t.value;
			}
			t = t.trim().split(/\s+/).join(" "), s("comparator", t, i), this.options = i, this.loose = !!i.loose, this.parse(t), this.semver === n ? this.value = "" : this.value = this.operator + this.semver.version, s("comp", this);
		}
		parse(e) {
			let t = this.options.loose ? i[a.COMPARATORLOOSE] : i[a.COMPARATOR], r = e.match(t);
			if (!r) throw TypeError(`Invalid comparator: ${e}`);
			this.operator = r[1] === void 0 ? "" : r[1], this.operator === "=" && (this.operator = ""), r[2] ? this.semver = new c(r[2], this.options.loose) : this.semver = n;
		}
		toString() {
			return this.value;
		}
		test(e) {
			if (s("Comparator.test", e, this.options.loose), this.semver === n || e === n) return !0;
			if (typeof e == "string") try {
				e = new c(e, this.options);
			} catch {
				return !1;
			}
			return o(e, this.operator, this.semver, this.options);
		}
		intersects(t, n) {
			if (!(t instanceof e)) throw TypeError("a Comparator is required");
			return this.operator === "" ? this.value === "" ? !0 : new l(t.value, n).test(this.value) : t.operator === "" ? t.value === "" ? !0 : new l(this.value, n).test(t.semver) : (n = r(n), n.includePrerelease && (this.value === "<0.0.0-0" || t.value === "<0.0.0-0") || !n.includePrerelease && (this.value.startsWith("<0.0.0") || t.value.startsWith("<0.0.0")) ? !1 : !!(this.operator.startsWith(">") && t.operator.startsWith(">") || this.operator.startsWith("<") && t.operator.startsWith("<") || this.semver.version === t.semver.version && this.operator.includes("=") && t.operator.includes("=") || o(this.semver, "<", t.semver, n) && this.operator.startsWith(">") && t.operator.startsWith("<") || o(this.semver, ">", t.semver, n) && this.operator.startsWith("<") && t.operator.startsWith(">")));
		}
	};
	var r = vt(), { safeRe: i, t: a } = _t(), o = Vt(), s = gt(), c = J(), l = Wt();
})), Kt = /* @__PURE__ */ A(((e, t) => {
	var n = Wt();
	t.exports = (e, t, r) => {
		try {
			t = new n(t, r);
		} catch {
			return !1;
		}
		return t.test(e);
	};
})), qt = /* @__PURE__ */ A(((e, t) => {
	var n = Wt();
	t.exports = (e, t) => new n(e, t).set.map((e) => e.map((e) => e.value).join(" ").trim().split(" "));
})), Jt = /* @__PURE__ */ A(((e, t) => {
	var n = J(), r = Wt();
	t.exports = (e, t, i) => {
		let a = null, o = null, s = null;
		try {
			s = new r(t, i);
		} catch {
			return null;
		}
		return e.forEach((e) => {
			s.test(e) && (!a || o.compare(e) === -1) && (a = e, o = new n(a, i));
		}), a;
	};
})), Yt = /* @__PURE__ */ A(((e, t) => {
	var n = J(), r = Wt();
	t.exports = (e, t, i) => {
		let a = null, o = null, s = null;
		try {
			s = new r(t, i);
		} catch {
			return null;
		}
		return e.forEach((e) => {
			s.test(e) && (!a || o.compare(e) === 1) && (a = e, o = new n(a, i));
		}), a;
	};
})), Xt = /* @__PURE__ */ A(((e, t) => {
	var n = J(), r = Wt(), i = Ft();
	t.exports = (e, t) => {
		e = new r(e, t);
		let a = new n("0.0.0");
		if (e.test(a) || (a = new n("0.0.0-0"), e.test(a))) return a;
		a = null;
		for (let t = 0; t < e.set.length; ++t) {
			let r = e.set[t], o = null;
			r.forEach((e) => {
				let t = new n(e.semver.version);
				switch (e.operator) {
					case ">": t.prerelease.length === 0 ? t.patch++ : t.prerelease.push(0), t.raw = t.format();
					case "":
					case ">=":
						(!o || i(t, o)) && (o = t);
						break;
					case "<":
					case "<=": break;
					/* istanbul ignore next */
					default: throw Error(`Unexpected operation: ${e.operator}`);
				}
			}), o && (!a || i(a, o)) && (a = o);
		}
		return a && e.test(a) ? a : null;
	};
})), Zt = /* @__PURE__ */ A(((e, t) => {
	var n = Wt();
	t.exports = (e, t) => {
		try {
			return new n(e, t).range || "*";
		} catch {
			return null;
		}
	};
})), Qt = /* @__PURE__ */ A(((e, t) => {
	var n = J(), r = Gt(), { ANY: i } = r, a = Wt(), o = Kt(), s = Ft(), c = It(), l = Bt(), u = zt();
	t.exports = (e, t, d, f) => {
		e = new n(e, f), t = new a(t, f);
		let p, m, h, g, _;
		switch (d) {
			case ">":
				p = s, m = l, h = c, g = ">", _ = ">=";
				break;
			case "<":
				p = c, m = u, h = s, g = "<", _ = "<=";
				break;
			default: throw TypeError("Must provide a hilo val of \"<\" or \">\"");
		}
		if (o(e, t, f)) return !1;
		for (let n = 0; n < t.set.length; ++n) {
			let a = t.set[n], o = null, s = null;
			if (a.forEach((e) => {
				e.semver === i && (e = new r(">=0.0.0")), o ||= e, s ||= e, p(e.semver, o.semver, f) ? o = e : h(e.semver, s.semver, f) && (s = e);
			}), o.operator === g || o.operator === _ || (!s.operator || s.operator === g) && m(e, s.semver) || s.operator === _ && h(e, s.semver)) return !1;
		}
		return !0;
	};
})), $t = /* @__PURE__ */ A(((e, t) => {
	var n = Qt();
	t.exports = (e, t, r) => n(e, t, ">", r);
})), en = /* @__PURE__ */ A(((e, t) => {
	var n = Qt();
	t.exports = (e, t, r) => n(e, t, "<", r);
})), tn = /* @__PURE__ */ A(((e, t) => {
	var n = Wt();
	t.exports = (e, t, r) => (e = new n(e, r), t = new n(t, r), e.intersects(t, r));
})), nn = /* @__PURE__ */ A(((e, t) => {
	var n = Kt(), r = kt();
	t.exports = (e, t, i) => {
		let a = [], o = null, s = null, c = e.sort((e, t) => r(e, t, i));
		for (let e of c) n(e, t, i) ? (s = e, o ||= e) : (s && a.push([o, s]), s = null, o = null);
		o && a.push([o, null]);
		let l = [];
		for (let [e, t] of a) e === t ? l.push(e) : !t && e === c[0] ? l.push("*") : t ? e === c[0] ? l.push(`<=${t}`) : l.push(`${e} - ${t}`) : l.push(`>=${e}`);
		let u = l.join(" || "), d = typeof t.raw == "string" ? t.raw : String(t);
		return u.length < d.length ? u : t;
	};
})), rn = /* @__PURE__ */ A(((e, t) => {
	var n = Wt(), r = Gt(), { ANY: i } = r, a = Kt(), o = kt(), s = (e, t, r = {}) => {
		if (e === t) return !0;
		e = new n(e, r), t = new n(t, r);
		let i = !1;
		OUTER: for (let n of e.set) {
			for (let e of t.set) {
				let t = u(n, e, r);
				if (i ||= t !== null, t) continue OUTER;
			}
			if (i) return !1;
		}
		return !0;
	}, c = [new r(">=0.0.0-0")], l = [new r(">=0.0.0")], u = (e, t, n) => {
		if (e === t) return !0;
		if (e.length === 1 && e[0].semver === i) {
			if (t.length === 1 && t[0].semver === i) return !0;
			e = n.includePrerelease ? c : l;
		}
		if (t.length === 1 && t[0].semver === i) {
			if (n.includePrerelease) return !0;
			t = l;
		}
		let r = /* @__PURE__ */ new Set(), s, u;
		for (let t of e) t.operator === ">" || t.operator === ">=" ? s = d(s, t, n) : t.operator === "<" || t.operator === "<=" ? u = f(u, t, n) : r.add(t.semver);
		if (r.size > 1) return null;
		let p;
		if (s && u && (p = o(s.semver, u.semver, n), p > 0 || p === 0 && (s.operator !== ">=" || u.operator !== "<="))) return null;
		for (let e of r) {
			if (s && !a(e, String(s), n) || u && !a(e, String(u), n)) return null;
			for (let r of t) if (!a(e, String(r), n)) return !1;
			return !0;
		}
		let m, h, g, _, v = u && !n.includePrerelease && u.semver.prerelease.length ? u.semver : !1, y = s && !n.includePrerelease && s.semver.prerelease.length ? s.semver : !1;
		v && v.prerelease.length === 1 && u.operator === "<" && v.prerelease[0] === 0 && (v = !1);
		for (let e of t) {
			if (_ = _ || e.operator === ">" || e.operator === ">=", g = g || e.operator === "<" || e.operator === "<=", s) {
				if (y && e.semver.prerelease && e.semver.prerelease.length && e.semver.major === y.major && e.semver.minor === y.minor && e.semver.patch === y.patch && (y = !1), e.operator === ">" || e.operator === ">=") {
					if (m = d(s, e, n), m === e && m !== s) return !1;
				} else if (s.operator === ">=" && !a(s.semver, String(e), n)) return !1;
			}
			if (u) {
				if (v && e.semver.prerelease && e.semver.prerelease.length && e.semver.major === v.major && e.semver.minor === v.minor && e.semver.patch === v.patch && (v = !1), e.operator === "<" || e.operator === "<=") {
					if (h = f(u, e, n), h === e && h !== u) return !1;
				} else if (u.operator === "<=" && !a(u.semver, String(e), n)) return !1;
			}
			if (!e.operator && (u || s) && p !== 0) return !1;
		}
		return !(s && g && !u && p !== 0 || u && _ && !s && p !== 0 || y || v);
	}, d = (e, t, n) => {
		if (!e) return t;
		let r = o(e.semver, t.semver, n);
		return r > 0 ? e : r < 0 || t.operator === ">" && e.operator === ">=" ? t : e;
	}, f = (e, t, n) => {
		if (!e) return t;
		let r = o(e.semver, t.semver, n);
		return r < 0 ? e : r > 0 || t.operator === "<" && e.operator === "<=" ? t : e;
	};
	t.exports = s;
})), an = /* @__PURE__ */ A(((e, t) => {
	var n = _t(), r = ht(), i = J(), a = yt();
	t.exports = {
		parse: bt(),
		valid: xt(),
		clean: St(),
		inc: Ct(),
		diff: wt(),
		major: Tt(),
		minor: Et(),
		patch: Dt(),
		prerelease: Ot(),
		compare: kt(),
		rcompare: At(),
		compareLoose: jt(),
		compareBuild: Mt(),
		sort: Nt(),
		rsort: Pt(),
		gt: Ft(),
		lt: It(),
		eq: Lt(),
		neq: Rt(),
		gte: zt(),
		lte: Bt(),
		cmp: Vt(),
		coerce: Ht(),
		Comparator: Gt(),
		Range: Wt(),
		satisfies: Kt(),
		toComparators: qt(),
		maxSatisfying: Jt(),
		minSatisfying: Yt(),
		minVersion: Xt(),
		validRange: Zt(),
		outside: Qt(),
		gtr: $t(),
		ltr: en(),
		intersects: tn(),
		simplifyRange: nn(),
		subset: rn(),
		SemVer: i,
		re: n.re,
		src: n.src,
		tokens: n.t,
		SEMVER_SPEC_VERSION: r.SEMVER_SPEC_VERSION,
		RELEASE_TYPES: r.RELEASE_TYPES,
		compareIdentifiers: a.compareIdentifiers,
		rcompareIdentifiers: a.rcompareIdentifiers
	};
})), on = /* @__PURE__ */ A(((e, t) => {
	var n = 200, r = "__lodash_hash_undefined__", i = 1, a = 2, o = 9007199254740991, s = "[object Arguments]", c = "[object Array]", l = "[object AsyncFunction]", u = "[object Boolean]", d = "[object Date]", f = "[object Error]", p = "[object Function]", m = "[object GeneratorFunction]", h = "[object Map]", g = "[object Number]", _ = "[object Null]", v = "[object Object]", y = "[object Promise]", b = "[object Proxy]", x = "[object RegExp]", S = "[object Set]", C = "[object String]", w = "[object Symbol]", T = "[object Undefined]", E = "[object WeakMap]", D = "[object ArrayBuffer]", O = "[object DataView]", k = "[object Float32Array]", A = "[object Float64Array]", j = "[object Int8Array]", M = "[object Int16Array]", N = "[object Int32Array]", P = "[object Uint8Array]", F = "[object Uint8ClampedArray]", I = "[object Uint16Array]", ee = "[object Uint32Array]", L = /[\\^$.*+?()[\]{}|]/g, te = /^\[object .+?Constructor\]$/, R = /^(?:0|[1-9]\d*)$/, z = {};
	z[k] = z[A] = z[j] = z[M] = z[N] = z[P] = z[F] = z[I] = z[ee] = !0, z[s] = z[c] = z[D] = z[u] = z[O] = z[d] = z[f] = z[p] = z[h] = z[g] = z[v] = z[x] = z[S] = z[C] = z[E] = !1;
	var B = typeof global == "object" && global && global.Object === Object && global, V = typeof self == "object" && self && self.Object === Object && self, H = B || V || Function("return this")(), U = typeof e == "object" && e && !e.nodeType && e, W = U && typeof t == "object" && t && !t.nodeType && t, G = W && W.exports === U, ne = G && B.process, re = function() {
		try {
			return ne && ne.binding && ne.binding("util");
		} catch {}
	}(), ie = re && re.isTypedArray;
	function ae(e, t) {
		for (var n = -1, r = e == null ? 0 : e.length, i = 0, a = []; ++n < r;) {
			var o = e[n];
			t(o, n, e) && (a[i++] = o);
		}
		return a;
	}
	function oe(e, t) {
		for (var n = -1, r = t.length, i = e.length; ++n < r;) e[i + n] = t[n];
		return e;
	}
	function se(e, t) {
		for (var n = -1, r = e == null ? 0 : e.length; ++n < r;) if (t(e[n], n, e)) return !0;
		return !1;
	}
	function ce(e, t) {
		for (var n = -1, r = Array(e); ++n < e;) r[n] = t(n);
		return r;
	}
	function le(e) {
		return function(t) {
			return e(t);
		};
	}
	function ue(e, t) {
		return e.has(t);
	}
	function de(e, t) {
		return e?.[t];
	}
	function fe(e) {
		var t = -1, n = Array(e.size);
		return e.forEach(function(e, r) {
			n[++t] = [r, e];
		}), n;
	}
	function pe(e, t) {
		return function(n) {
			return e(t(n));
		};
	}
	function me(e) {
		var t = -1, n = Array(e.size);
		return e.forEach(function(e) {
			n[++t] = e;
		}), n;
	}
	var he = Array.prototype, ge = Function.prototype, _e = Object.prototype, ve = H["__core-js_shared__"], ye = ge.toString, be = _e.hasOwnProperty, xe = function() {
		var e = /[^.]+$/.exec(ve && ve.keys && ve.keys.IE_PROTO || "");
		return e ? "Symbol(src)_1." + e : "";
	}(), Se = _e.toString, Ce = RegExp("^" + ye.call(be).replace(L, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"), we = G ? H.Buffer : void 0, Te = H.Symbol, Ee = H.Uint8Array, De = _e.propertyIsEnumerable, Oe = he.splice, ke = Te ? Te.toStringTag : void 0, Ae = Object.getOwnPropertySymbols, je = we ? we.isBuffer : void 0, Me = pe(Object.keys, Object), Ne = jt(H, "DataView"), Pe = jt(H, "Map"), Fe = jt(H, "Promise"), Ie = jt(H, "Set"), Le = jt(H, "WeakMap"), Re = jt(Object, "create"), ze = Bt(Ne), Be = Bt(Pe), Ve = Bt(Fe), He = Bt(Ie), Ue = Bt(Le), K = Te ? Te.prototype : void 0, We = K ? K.valueOf : void 0;
	function Ge(e) {
		var t = -1, n = e == null ? 0 : e.length;
		for (this.clear(); ++t < n;) {
			var r = e[t];
			this.set(r[0], r[1]);
		}
	}
	function Ke() {
		this.__data__ = Re ? Re(null) : {}, this.size = 0;
	}
	function q(e) {
		var t = this.has(e) && delete this.__data__[e];
		return this.size -= +!!t, t;
	}
	function qe(e) {
		var t = this.__data__;
		if (Re) {
			var n = t[e];
			return n === r ? void 0 : n;
		}
		return be.call(t, e) ? t[e] : void 0;
	}
	function Je(e) {
		var t = this.__data__;
		return Re ? t[e] !== void 0 : be.call(t, e);
	}
	function Ye(e, t) {
		var n = this.__data__;
		return this.size += +!this.has(e), n[e] = Re && t === void 0 ? r : t, this;
	}
	Ge.prototype.clear = Ke, Ge.prototype.delete = q, Ge.prototype.get = qe, Ge.prototype.has = Je, Ge.prototype.set = Ye;
	function Xe(e) {
		var t = -1, n = e == null ? 0 : e.length;
		for (this.clear(); ++t < n;) {
			var r = e[t];
			this.set(r[0], r[1]);
		}
	}
	function Ze() {
		this.__data__ = [], this.size = 0;
	}
	function Qe(e) {
		var t = this.__data__, n = vt(t, e);
		return n < 0 ? !1 : (n == t.length - 1 ? t.pop() : Oe.call(t, n, 1), --this.size, !0);
	}
	function $e(e) {
		var t = this.__data__, n = vt(t, e);
		return n < 0 ? void 0 : t[n][1];
	}
	function et(e) {
		return vt(this.__data__, e) > -1;
	}
	function tt(e, t) {
		var n = this.__data__, r = vt(n, e);
		return r < 0 ? (++this.size, n.push([e, t])) : n[r][1] = t, this;
	}
	Xe.prototype.clear = Ze, Xe.prototype.delete = Qe, Xe.prototype.get = $e, Xe.prototype.has = et, Xe.prototype.set = tt;
	function nt(e) {
		var t = -1, n = e == null ? 0 : e.length;
		for (this.clear(); ++t < n;) {
			var r = e[t];
			this.set(r[0], r[1]);
		}
	}
	function rt() {
		this.size = 0, this.__data__ = {
			hash: new Ge(),
			map: new (Pe || Xe)(),
			string: new Ge()
		};
	}
	function it(e) {
		var t = At(this, e).delete(e);
		return this.size -= +!!t, t;
	}
	function at(e) {
		return At(this, e).get(e);
	}
	function ot(e) {
		return At(this, e).has(e);
	}
	function st(e, t) {
		var n = At(this, e), r = n.size;
		return n.set(e, t), this.size += n.size == r ? 0 : 1, this;
	}
	nt.prototype.clear = rt, nt.prototype.delete = it, nt.prototype.get = at, nt.prototype.has = ot, nt.prototype.set = st;
	function ct(e) {
		var t = -1, n = e == null ? 0 : e.length;
		for (this.__data__ = new nt(); ++t < n;) this.add(e[t]);
	}
	function lt(e) {
		return this.__data__.set(e, r), this;
	}
	function ut(e) {
		return this.__data__.has(e);
	}
	ct.prototype.add = ct.prototype.push = lt, ct.prototype.has = ut;
	function dt(e) {
		var t = this.__data__ = new Xe(e);
		this.size = t.size;
	}
	function ft() {
		this.__data__ = new Xe(), this.size = 0;
	}
	function pt(e) {
		var t = this.__data__, n = t.delete(e);
		return this.size = t.size, n;
	}
	function mt(e) {
		return this.__data__.get(e);
	}
	function ht(e) {
		return this.__data__.has(e);
	}
	function gt(e, t) {
		var r = this.__data__;
		if (r instanceof Xe) {
			var i = r.__data__;
			if (!Pe || i.length < n - 1) return i.push([e, t]), this.size = ++r.size, this;
			r = this.__data__ = new nt(i);
		}
		return r.set(e, t), this.size = r.size, this;
	}
	dt.prototype.clear = ft, dt.prototype.delete = pt, dt.prototype.get = mt, dt.prototype.has = ht, dt.prototype.set = gt;
	function _t(e, t) {
		var n = Ut(e), r = !n && Ht(e), i = !n && !r && Gt(e), a = !n && !r && !i && Zt(e), o = n || r || i || a, s = o ? ce(e.length, String) : [], c = s.length;
		for (var l in e) (t || be.call(e, l)) && !(o && (l == "length" || i && (l == "offset" || l == "parent") || a && (l == "buffer" || l == "byteLength" || l == "byteOffset") || Ft(l, c))) && s.push(l);
		return s;
	}
	function vt(e, t) {
		for (var n = e.length; n--;) if (Vt(e[n][0], t)) return n;
		return -1;
	}
	function yt(e, t, n) {
		var r = t(e);
		return Ut(e) ? r : oe(r, n(e));
	}
	function J(e) {
		return e == null ? e === void 0 ? T : _ : ke && ke in Object(e) ? Mt(e) : zt(e);
	}
	function bt(e) {
		return Xt(e) && J(e) == s;
	}
	function xt(e, t, n, r, i) {
		return e === t ? !0 : e == null || t == null || !Xt(e) && !Xt(t) ? e !== e && t !== t : St(e, t, n, r, xt, i);
	}
	function St(e, t, n, r, a, o) {
		var l = Ut(e), u = Ut(t), d = l ? c : Pt(e), f = u ? c : Pt(t);
		d = d == s ? v : d, f = f == s ? v : f;
		var p = d == v, m = f == v, h = d == f;
		if (h && Gt(e)) {
			if (!Gt(t)) return !1;
			l = !0, p = !1;
		}
		if (h && !p) return o ||= new dt(), l || Zt(e) ? Et(e, t, n, r, a, o) : Dt(e, t, d, n, r, a, o);
		if (!(n & i)) {
			var g = p && be.call(e, "__wrapped__"), _ = m && be.call(t, "__wrapped__");
			if (g || _) {
				var y = g ? e.value() : e, b = _ ? t.value() : t;
				return o ||= new dt(), a(y, b, n, r, o);
			}
		}
		return h ? (o ||= new dt(), Ot(e, t, n, r, a, o)) : !1;
	}
	function Ct(e) {
		return !Yt(e) || Lt(e) ? !1 : (qt(e) ? Ce : te).test(Bt(e));
	}
	function wt(e) {
		return Xt(e) && Jt(e.length) && !!z[J(e)];
	}
	function Tt(e) {
		if (!Rt(e)) return Me(e);
		var t = [];
		for (var n in Object(e)) be.call(e, n) && n != "constructor" && t.push(n);
		return t;
	}
	function Et(e, t, n, r, o, s) {
		var c = n & i, l = e.length, u = t.length;
		if (l != u && !(c && u > l)) return !1;
		var d = s.get(e);
		if (d && s.get(t)) return d == t;
		var f = -1, p = !0, m = n & a ? new ct() : void 0;
		for (s.set(e, t), s.set(t, e); ++f < l;) {
			var h = e[f], g = t[f];
			if (r) var _ = c ? r(g, h, f, t, e, s) : r(h, g, f, e, t, s);
			if (_ !== void 0) {
				if (_) continue;
				p = !1;
				break;
			}
			if (m) {
				if (!se(t, function(e, t) {
					if (!ue(m, t) && (h === e || o(h, e, n, r, s))) return m.push(t);
				})) {
					p = !1;
					break;
				}
			} else if (!(h === g || o(h, g, n, r, s))) {
				p = !1;
				break;
			}
		}
		return s.delete(e), s.delete(t), p;
	}
	function Dt(e, t, n, r, o, s, c) {
		switch (n) {
			case O:
				if (e.byteLength != t.byteLength || e.byteOffset != t.byteOffset) return !1;
				e = e.buffer, t = t.buffer;
			case D: return !(e.byteLength != t.byteLength || !s(new Ee(e), new Ee(t)));
			case u:
			case d:
			case g: return Vt(+e, +t);
			case f: return e.name == t.name && e.message == t.message;
			case x:
			case C: return e == t + "";
			case h: var l = fe;
			case S:
				var p = r & i;
				if (l ||= me, e.size != t.size && !p) return !1;
				var m = c.get(e);
				if (m) return m == t;
				r |= a, c.set(e, t);
				var _ = Et(l(e), l(t), r, o, s, c);
				return c.delete(e), _;
			case w: if (We) return We.call(e) == We.call(t);
		}
		return !1;
	}
	function Ot(e, t, n, r, a, o) {
		var s = n & i, c = kt(e), l = c.length;
		if (l != kt(t).length && !s) return !1;
		for (var u = l; u--;) {
			var d = c[u];
			if (!(s ? d in t : be.call(t, d))) return !1;
		}
		var f = o.get(e);
		if (f && o.get(t)) return f == t;
		var p = !0;
		o.set(e, t), o.set(t, e);
		for (var m = s; ++u < l;) {
			d = c[u];
			var h = e[d], g = t[d];
			if (r) var _ = s ? r(g, h, d, t, e, o) : r(h, g, d, e, t, o);
			if (!(_ === void 0 ? h === g || a(h, g, n, r, o) : _)) {
				p = !1;
				break;
			}
			m ||= d == "constructor";
		}
		if (p && !m) {
			var v = e.constructor, y = t.constructor;
			v != y && "constructor" in e && "constructor" in t && !(typeof v == "function" && v instanceof v && typeof y == "function" && y instanceof y) && (p = !1);
		}
		return o.delete(e), o.delete(t), p;
	}
	function kt(e) {
		return yt(e, Qt, Nt);
	}
	function At(e, t) {
		var n = e.__data__;
		return It(t) ? n[typeof t == "string" ? "string" : "hash"] : n.map;
	}
	function jt(e, t) {
		var n = de(e, t);
		return Ct(n) ? n : void 0;
	}
	function Mt(e) {
		var t = be.call(e, ke), n = e[ke];
		try {
			e[ke] = void 0;
			var r = !0;
		} catch {}
		var i = Se.call(e);
		return r && (t ? e[ke] = n : delete e[ke]), i;
	}
	var Nt = Ae ? function(e) {
		return e == null ? [] : (e = Object(e), ae(Ae(e), function(t) {
			return De.call(e, t);
		}));
	} : $t, Pt = J;
	(Ne && Pt(new Ne(/* @__PURE__ */ new ArrayBuffer(1))) != O || Pe && Pt(new Pe()) != h || Fe && Pt(Fe.resolve()) != y || Ie && Pt(new Ie()) != S || Le && Pt(new Le()) != E) && (Pt = function(e) {
		var t = J(e), n = t == v ? e.constructor : void 0, r = n ? Bt(n) : "";
		if (r) switch (r) {
			case ze: return O;
			case Be: return h;
			case Ve: return y;
			case He: return S;
			case Ue: return E;
		}
		return t;
	});
	function Ft(e, t) {
		return t ??= o, !!t && (typeof e == "number" || R.test(e)) && e > -1 && e % 1 == 0 && e < t;
	}
	function It(e) {
		var t = typeof e;
		return t == "string" || t == "number" || t == "symbol" || t == "boolean" ? e !== "__proto__" : e === null;
	}
	function Lt(e) {
		return !!xe && xe in e;
	}
	function Rt(e) {
		var t = e && e.constructor;
		return e === (typeof t == "function" && t.prototype || _e);
	}
	function zt(e) {
		return Se.call(e);
	}
	function Bt(e) {
		if (e != null) {
			try {
				return ye.call(e);
			} catch {}
			try {
				return e + "";
			} catch {}
		}
		return "";
	}
	function Vt(e, t) {
		return e === t || e !== e && t !== t;
	}
	var Ht = bt(function() {
		return arguments;
	}()) ? bt : function(e) {
		return Xt(e) && be.call(e, "callee") && !De.call(e, "callee");
	}, Ut = Array.isArray;
	function Wt(e) {
		return e != null && Jt(e.length) && !qt(e);
	}
	var Gt = je || en;
	function Kt(e, t) {
		return xt(e, t);
	}
	function qt(e) {
		if (!Yt(e)) return !1;
		var t = J(e);
		return t == p || t == m || t == l || t == b;
	}
	function Jt(e) {
		return typeof e == "number" && e > -1 && e % 1 == 0 && e <= o;
	}
	function Yt(e) {
		var t = typeof e;
		return e != null && (t == "object" || t == "function");
	}
	function Xt(e) {
		return typeof e == "object" && !!e;
	}
	var Zt = ie ? le(ie) : wt;
	function Qt(e) {
		return Wt(e) ? _t(e) : Tt(e);
	}
	function $t() {
		return [];
	}
	function en() {
		return !1;
	}
	t.exports = Kt;
})), sn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.DownloadedUpdateHelper = void 0, e.createTempUpdateFile = s;
	var t = F("crypto"), n = F("fs"), r = on(), i = we(), a = F("path");
	e.DownloadedUpdateHelper = class {
		constructor(e) {
			this.cacheDir = e, this._file = null, this._packageFile = null, this.versionInfo = null, this.fileInfo = null, this._downloadedFileInfo = null;
		}
		get downloadedFileInfo() {
			return this._downloadedFileInfo;
		}
		get file() {
			return this._file;
		}
		get packageFile() {
			return this._packageFile;
		}
		get cacheDirForPendingUpdate() {
			return a.join(this.cacheDir, "pending");
		}
		async validateDownloadedPath(e, t, n, a) {
			if (this.versionInfo != null && this.file === e && this.fileInfo != null) return r(this.versionInfo, t) && r(this.fileInfo.info, n.info) && await (0, i.pathExists)(e) ? e : null;
			let o = await this.getValidCachedUpdateFile(n, a);
			return o === null ? null : (a.info(`Update has already been downloaded to ${e}).`), this._file = o, o);
		}
		async setDownloadedFile(e, t, n, r, a, o) {
			this._file = e, this._packageFile = t, this.versionInfo = n, this.fileInfo = r, this._downloadedFileInfo = {
				fileName: a,
				sha512: r.info.sha512,
				isAdminRightsRequired: r.info.isAdminRightsRequired === !0
			}, o && await (0, i.outputJson)(this.getUpdateInfoFile(), this._downloadedFileInfo);
		}
		async clear() {
			this._file = null, this._packageFile = null, this.versionInfo = null, this.fileInfo = null, await this.cleanCacheDirForPendingUpdate();
		}
		async cleanCacheDirForPendingUpdate() {
			try {
				await (0, i.emptyDir)(this.cacheDirForPendingUpdate);
			} catch {}
		}
		async getValidCachedUpdateFile(e, t) {
			let n = this.getUpdateInfoFile();
			if (!await (0, i.pathExists)(n)) return null;
			let r;
			try {
				r = await (0, i.readJson)(n);
			} catch (e) {
				let n = "No cached update info available";
				return e.code !== "ENOENT" && (await this.cleanCacheDirForPendingUpdate(), n += ` (error on read: ${e.message})`), t.info(n), null;
			}
			if (r?.fileName === null) return t.warn("Cached update info is corrupted: no fileName, directory for cached update will be cleaned"), await this.cleanCacheDirForPendingUpdate(), null;
			if (e.info.sha512 !== r.sha512) return t.info(`Cached update sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${r.sha512}, expected: ${e.info.sha512}. Directory for cached update will be cleaned`), await this.cleanCacheDirForPendingUpdate(), null;
			let s = a.join(this.cacheDirForPendingUpdate, r.fileName);
			if (!await (0, i.pathExists)(s)) return t.info("Cached update file doesn't exist"), null;
			let c = await o(s);
			return e.info.sha512 === c ? (this._downloadedFileInfo = r, s) : (t.warn(`Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${c}, expected: ${e.info.sha512}`), await this.cleanCacheDirForPendingUpdate(), null);
		}
		getUpdateInfoFile() {
			return a.join(this.cacheDirForPendingUpdate, "update-info.json");
		}
	};
	function o(e, r = "sha512", i = "base64", a) {
		return new Promise((o, s) => {
			let c = (0, t.createHash)(r);
			c.on("error", s).setEncoding(i), (0, n.createReadStream)(e, {
				...a,
				highWaterMark: 1024 * 1024
			}).on("error", s).on("end", () => {
				c.end(), o(c.read());
			}).pipe(c, { end: !1 });
		});
	}
	async function s(e, t, n) {
		let r = 0, o = a.join(t, e);
		for (let s = 0; s < 3; s++) try {
			return await (0, i.unlink)(o), o;
		} catch (i) {
			if (i.code === "ENOENT") return o;
			n.warn(`Error on remove temp update file: ${i}`), o = a.join(t, `${r++}-${e}`);
		}
		return o;
	}
})), cn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.getAppCacheDir = r;
	var t = F("path"), n = F("os");
	function r() {
		let e = (0, n.homedir)(), r;
		return r = process.platform === "win32" ? process.env.LOCALAPPDATA || t.join(e, "AppData", "Local") : process.platform === "darwin" ? t.join(e, "Library", "Caches") : process.env.XDG_CACHE_HOME || t.join(e, ".cache"), r;
	}
})), ln = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.ElectronAppAdapter = void 0;
	var t = F("path"), n = cn();
	e.ElectronAppAdapter = class {
		constructor(e = F("electron").app) {
			this.app = e;
		}
		whenReady() {
			return this.app.whenReady();
		}
		get version() {
			return this.app.getVersion();
		}
		get name() {
			return this.app.getName();
		}
		get isPackaged() {
			return this.app.isPackaged === !0;
		}
		get appUpdateConfigPath() {
			return this.isPackaged ? t.join(process.resourcesPath, "app-update.yml") : t.join(this.app.getAppPath(), "dev-app-update.yml");
		}
		get userDataPath() {
			return this.app.getPath("userData");
		}
		get baseCachePath() {
			return (0, n.getAppCacheDir)();
		}
		quit() {
			this.app.quit();
		}
		relaunch() {
			this.app.relaunch();
		}
		onQuit(e) {
			this.app.once("quit", (t, n) => e(n));
		}
	};
})), un = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.ElectronHttpExecutor = e.NET_SESSION_NAME = void 0, e.getNetSession = n;
	var t = K();
	e.NET_SESSION_NAME = "electron-updater";
	function n() {
		return F("electron").session.fromPartition(e.NET_SESSION_NAME, { cache: !1 });
	}
	e.ElectronHttpExecutor = class extends t.HttpExecutor {
		constructor(e) {
			super(), this.proxyLoginCallback = e, this.cachedSession = null;
		}
		async download(e, n, r) {
			return await r.cancellationToken.createPromise((i, a, o) => {
				let s = {
					headers: r.headers || void 0,
					redirect: "manual"
				};
				(0, t.configureRequestUrl)(e, s), (0, t.configureRequestOptions)(s), this.doDownload(s, {
					destination: n,
					options: r,
					onCancel: o,
					callback: (e) => {
						e == null ? i(n) : a(e);
					},
					responseHandler: null
				}, 0);
			});
		}
		createRequest(e, t) {
			e.headers && e.headers.Host && (e.host = e.headers.Host, delete e.headers.Host), this.cachedSession ??= n();
			let r = F("electron").net.request({
				...e,
				session: this.cachedSession
			});
			return r.on("response", t), this.proxyLoginCallback != null && r.on("login", this.proxyLoginCallback), r;
		}
		addRedirectHandlers(e, n, r, i, a) {
			e.on("redirect", (o, s, c) => {
				e.abort(), i > this.maxRedirects ? r(this.createMaxRedirectError()) : a(t.HttpExecutor.prepareRedirectUrlOptions(c, n));
			});
		}
	};
})), dn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.newBaseUrl = n, e.newUrlFromBase = r, e.getChannelFilename = i;
	var t = F("url");
	function n(e) {
		let n = new t.URL(e);
		return n.pathname.endsWith("/") || (n.pathname += "/"), n;
	}
	function r(e, n, r = !1) {
		let i = new t.URL(e, n), a = n.search;
		return a != null && a.length !== 0 ? i.search = a : r && (i.search = `noCache=${Date.now().toString(32)}`), i;
	}
	function i(e) {
		return `${e}.yml`;
	}
})), fn = /* @__PURE__ */ A(((e, t) => {
	var n = Infinity, r = "[object Symbol]", i = /[\\^$.*+?()[\]{}|]/g, a = RegExp(i.source), o = typeof global == "object" && global && global.Object === Object && global, s = typeof self == "object" && self && self.Object === Object && self, c = o || s || Function("return this")(), l = Object.prototype.toString, u = c.Symbol, d = u ? u.prototype : void 0, f = d ? d.toString : void 0;
	function p(e) {
		if (typeof e == "string") return e;
		if (h(e)) return f ? f.call(e) : "";
		var t = e + "";
		return t == "0" && 1 / e == -n ? "-0" : t;
	}
	function m(e) {
		return !!e && typeof e == "object";
	}
	function h(e) {
		return typeof e == "symbol" || m(e) && l.call(e) == r;
	}
	function g(e) {
		return e == null ? "" : p(e);
	}
	function _(e) {
		return e = g(e), e && a.test(e) ? e.replace(i, "\\$&") : e;
	}
	t.exports = _;
})), pn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.Provider = void 0, e.findFile = o, e.parseUpdateInfo = s, e.getFileList = c, e.resolveFiles = l;
	var t = K(), n = pt(), r = F("url"), i = dn(), a = fn();
	e.Provider = class {
		constructor(e) {
			this.runtimeOptions = e, this.requestHeaders = null, this.executor = e.executor;
		}
		getBlockMapFiles(e, t, n, o = null) {
			let s = (0, i.newUrlFromBase)(`${e.pathname}.blockmap`, e);
			return [(0, i.newUrlFromBase)(`${e.pathname.replace(new RegExp(a(n), "g"), t)}.blockmap`, o ? new r.URL(o) : e), s];
		}
		get isUseMultipleRangeRequest() {
			return this.runtimeOptions.isUseMultipleRangeRequest !== !1;
		}
		getChannelFilePrefix() {
			if (this.runtimeOptions.platform === "linux") {
				let e = process.env.TEST_UPDATER_ARCH || process.arch;
				return "-linux" + (e === "x64" ? "" : `-${e}`);
			} else return this.runtimeOptions.platform === "darwin" ? "-mac" : "";
		}
		getDefaultChannelName() {
			return this.getCustomChannelName("latest");
		}
		getCustomChannelName(e) {
			return `${e}${this.getChannelFilePrefix()}`;
		}
		get fileExtraDownloadHeaders() {
			return null;
		}
		setRequestHeaders(e) {
			this.requestHeaders = e;
		}
		httpRequest(e, t, n) {
			return this.executor.request(this.createRequestOptions(e, t), n);
		}
		createRequestOptions(e, n) {
			let r = {};
			return this.requestHeaders == null ? n != null && (r.headers = n) : r.headers = n == null ? this.requestHeaders : {
				...this.requestHeaders,
				...n
			}, (0, t.configureRequestUrl)(e, r), r;
		}
	};
	function o(e, n, r) {
		if (e.length === 0) throw (0, t.newError)("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED");
		let i = e.filter((e) => e.url.pathname.toLowerCase().endsWith(`.${n.toLowerCase()}`));
		return (i.find((e) => [e.url.pathname, e.info.url].some((e) => e.includes(process.arch))) ?? i.shift()) || (r == null ? e[0] : e.find((e) => !r.some((t) => e.url.pathname.toLowerCase().endsWith(`.${t.toLowerCase()}`))));
	}
	function s(e, r, i) {
		if (e == null) throw (0, t.newError)(`Cannot parse update info from ${r} in the latest release artifacts (${i}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO");
		let a;
		try {
			a = (0, n.load)(e);
		} catch (n) {
			throw (0, t.newError)(`Cannot parse update info from ${r} in the latest release artifacts (${i}): ${n.stack || n.message}, rawData: ${e}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
		}
		return a;
	}
	function c(e) {
		let n = e.files;
		if (n != null && n.length > 0) return n;
		if (e.path != null) return [{
			url: e.path,
			sha2: e.sha2,
			sha512: e.sha512
		}];
		throw (0, t.newError)(`No files provided: ${(0, t.safeStringifyJson)(e)}`, "ERR_UPDATER_NO_FILES_PROVIDED");
	}
	function l(e, n, r = (e) => e) {
		let a = c(e).map((e) => {
			if (e.sha2 == null && e.sha512 == null) throw (0, t.newError)(`Update info doesn't contain nor sha256 neither sha512 checksum: ${(0, t.safeStringifyJson)(e)}`, "ERR_UPDATER_NO_CHECKSUM");
			return {
				url: (0, i.newUrlFromBase)(r(e.url), n),
				info: e
			};
		}), o = e.packages, s = o == null ? null : o[process.arch] || o.ia32;
		return s != null && (a[0].packageInfo = {
			...s,
			path: (0, i.newUrlFromBase)(r(s.path), n).href
		}), a;
	}
})), mn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.GenericProvider = void 0;
	var t = K(), n = dn(), r = pn();
	e.GenericProvider = class extends r.Provider {
		constructor(e, t, r) {
			super(r), this.configuration = e, this.updater = t, this.baseUrl = (0, n.newBaseUrl)(this.configuration.url);
		}
		get channel() {
			let e = this.updater.channel || this.configuration.channel;
			return e == null ? this.getDefaultChannelName() : this.getCustomChannelName(e);
		}
		async getLatestVersion() {
			let e = (0, n.getChannelFilename)(this.channel), i = (0, n.newUrlFromBase)(e, this.baseUrl, this.updater.isAddNoCacheQuery);
			for (let n = 0;; n++) try {
				return (0, r.parseUpdateInfo)(await this.httpRequest(i), e, i);
			} catch (r) {
				if (r instanceof t.HttpError && r.statusCode === 404) throw (0, t.newError)(`Cannot find channel "${e}" update info: ${r.stack || r.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
				if (r.code === "ECONNREFUSED" && n < 3) {
					await new Promise((e, t) => {
						try {
							setTimeout(e, 1e3 * n);
						} catch (e) {
							t(e);
						}
					});
					continue;
				}
				throw r;
			}
		}
		resolveFiles(e) {
			return (0, r.resolveFiles)(e, this.baseUrl);
		}
	};
})), hn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.BitbucketProvider = void 0;
	var t = K(), n = dn(), r = pn();
	e.BitbucketProvider = class extends r.Provider {
		constructor(e, t, r) {
			super({
				...r,
				isUseMultipleRangeRequest: !1
			}), this.configuration = e, this.updater = t;
			let { owner: i, slug: a } = e;
			this.baseUrl = (0, n.newBaseUrl)(`https://api.bitbucket.org/2.0/repositories/${i}/${a}/downloads`);
		}
		get channel() {
			return this.updater.channel || this.configuration.channel || "latest";
		}
		async getLatestVersion() {
			let e = new t.CancellationToken(), i = (0, n.getChannelFilename)(this.getCustomChannelName(this.channel)), a = (0, n.newUrlFromBase)(i, this.baseUrl, this.updater.isAddNoCacheQuery);
			try {
				let t = await this.httpRequest(a, void 0, e);
				return (0, r.parseUpdateInfo)(t, i, a);
			} catch (e) {
				throw (0, t.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
		}
		resolveFiles(e) {
			return (0, r.resolveFiles)(e, this.baseUrl);
		}
		toString() {
			let { owner: e, slug: t } = this.configuration;
			return `Bitbucket (owner: ${e}, slug: ${t}, channel: ${this.channel})`;
		}
	};
})), gn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.GitHubProvider = e.BaseGitHubProvider = void 0, e.computeReleaseNotes = l;
	var t = K(), n = an(), r = F("url"), i = dn(), a = pn(), o = /\/tag\/(v?[^/]+)$/, s = class extends a.Provider {
		constructor(e, n, r) {
			super({
				...r,
				isUseMultipleRangeRequest: !1
			}), this.options = e, this.baseUrl = (0, i.newBaseUrl)((0, t.githubUrl)(e, n));
			let a = n === "github.com" ? "api.github.com" : n;
			this.baseApiUrl = (0, i.newBaseUrl)((0, t.githubUrl)(e, a));
		}
		computeGithubBasePath(e) {
			let t = this.options.host;
			return t && !["github.com", "api.github.com"].includes(t) ? `/api/v3${e}` : e;
		}
	};
	e.BaseGitHubProvider = s, e.GitHubProvider = class extends s {
		constructor(e, t, n) {
			super(e, "github.com", n), this.options = e, this.updater = t;
		}
		get channel() {
			let e = this.updater.channel || this.options.channel;
			return e == null ? this.getDefaultChannelName() : this.getCustomChannelName(e);
		}
		async getLatestVersion() {
			let e = new t.CancellationToken(), r = await this.httpRequest((0, i.newUrlFromBase)(`${this.basePath}.atom`, this.baseUrl), { accept: "application/xml, application/atom+xml, text/xml, */*" }, e), s = (0, t.parseXml)(r), c = s.element("entry", !1, "No published versions on GitHub"), u = null;
			try {
				if (this.updater.allowPrerelease) {
					let e = this.updater?.channel || n.prerelease(this.updater.currentVersion)?.[0] || null;
					if (e === null) u = o.exec(c.element("link").attribute("href"))[1];
					else for (let t of s.getElements("entry")) {
						let r = o.exec(t.element("link").attribute("href"));
						if (r === null) continue;
						let i = r[1];
						if (!n.valid(i)) continue;
						let a = n.prerelease(i)?.[0] || null, s = !e || ["alpha", "beta"].includes(e), l = a !== null && !["alpha", "beta"].includes(String(a));
						if (s && !l && !(e === "beta" && a === "alpha")) {
							u = i, c = t;
							break;
						}
						if (a && a === e) {
							u = i, c = t;
							break;
						}
					}
				} else {
					u = await this.getLatestTagName(e);
					for (let e of s.getElements("entry")) {
						let t = o.exec(e.element("link").attribute("href"));
						if (t != null && t[1] === u) {
							c = e;
							break;
						}
					}
				}
			} catch (e) {
				throw (0, t.newError)(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${r}`, "ERR_UPDATER_INVALID_RELEASE_FEED");
			}
			if (u == null) throw (0, t.newError)("No published versions on GitHub", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
			let d, f = "", p = "", m = async (n) => {
				f = (0, i.getChannelFilename)(n), p = (0, i.newUrlFromBase)(this.getBaseDownloadPath(String(u), f), this.baseUrl);
				let r = this.createRequestOptions(p);
				try {
					return await this.executor.request(r, e);
				} catch (e) {
					throw e instanceof t.HttpError && e.statusCode === 404 ? (0, t.newError)(`Cannot find ${f} in the latest release artifacts (${p}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : e;
				}
			};
			try {
				let e = this.channel;
				this.updater.allowPrerelease && n.prerelease(u)?.[0] && (e = this.getCustomChannelName(String(n.prerelease(u)?.[0]))), d = await m(e);
			} catch (e) {
				if (this.updater.allowPrerelease) d = await m(this.getDefaultChannelName());
				else throw e;
			}
			let h = (0, a.parseUpdateInfo)(d, f, p);
			return h.releaseName ??= c.elementValueOrEmpty("title"), h.releaseNotes ??= l(this.updater.currentVersion, this.updater.fullChangelog, s, c), {
				tag: u,
				...h
			};
		}
		async getLatestTagName(e) {
			let n = this.options, a = n.host == null || n.host === "github.com" ? (0, i.newUrlFromBase)(`${this.basePath}/latest`, this.baseUrl) : new r.URL(`${this.computeGithubBasePath(`/repos/${n.owner}/${n.repo}/releases`)}/latest`, this.baseApiUrl);
			try {
				let t = await this.httpRequest(a, { Accept: "application/json" }, e);
				return t == null ? null : JSON.parse(t).tag_name;
			} catch (e) {
				throw (0, t.newError)(`Unable to find latest version on GitHub (${a}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
		}
		get basePath() {
			return `/${this.options.owner}/${this.options.repo}/releases`;
		}
		resolveFiles(e) {
			return (0, a.resolveFiles)(e, this.baseUrl, (t) => this.getBaseDownloadPath(e.tag, t.replace(/ /g, "-")));
		}
		getBaseDownloadPath(e, t) {
			return `${this.basePath}/download/${e}/${t}`;
		}
	};
	function c(e) {
		let t = e.elementValueOrEmpty("content");
		return t === "No content." ? "" : t;
	}
	function l(e, t, r, i) {
		if (!t) return c(i);
		let a = /\/tag\/v?([^/]+)$/, o;
		try {
			o = a.exec(i.element("link").attribute("href"))[1], o = n.valid(o) ? o : void 0;
		} catch {}
		if (o == null) return null;
		let s = [];
		for (let t of r.getElements("entry")) {
			let r;
			try {
				let e = a.exec(t.element("link").attribute("href"));
				if (!e) continue;
				r = e[1];
			} catch {
				continue;
			}
			if (!n.valid(r)) continue;
			let i = n.gt(r, e.raw), l = n.lte(r, o);
			i && l && s.push({
				version: r,
				note: c(t)
			});
		}
		return s.sort((e, t) => n.rcompare(e.version, t.version));
	}
})), _n = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.GitLabProvider = void 0;
	var t = K(), n = F("url"), r = fn(), i = dn(), a = pn();
	e.GitLabProvider = class extends a.Provider {
		normalizeFilename(e) {
			return e.replace(/ |_/g, "-");
		}
		constructor(e, t, n) {
			super({
				...n,
				isUseMultipleRangeRequest: !1
			}), this.options = e, this.updater = t, this.cachedLatestVersion = null;
			let r = e.host || "gitlab.com";
			this.baseApiUrl = (0, i.newBaseUrl)(`https://${r}/api/v4`);
		}
		createRequestOptions(e, t) {
			let n = super.createRequestOptions(e, t);
			return n.redirect = "manual", n;
		}
		get channel() {
			let e = this.updater.channel || this.options.channel;
			return e == null ? this.getDefaultChannelName() : this.getCustomChannelName(e);
		}
		async getLatestVersion() {
			let e = new t.CancellationToken(), r = (0, i.newUrlFromBase)(`projects/${this.options.projectId}/releases/permalink/latest`, this.baseApiUrl), o = {
				Accept: "application/json",
				...this.setAuthHeaderForToken(this.options.token || null)
			}, s;
			try {
				s = await this.httpRequest(r, o, e);
			} catch (e) {
				throw (0, t.newError)(`Unable to find latest release on GitLab (${r}): ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
			if (!s) throw (0, t.newError)("No published releases on GitLab", "ERR_UPDATER_NO_PUBLISHED_VERSIONS");
			let c;
			try {
				c = JSON.parse(s);
			} catch (e) {
				throw (0, t.newError)(`Unable to parse latest release response from GitLab (${r}): response was not valid JSON: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
			if (c.upcoming_release) throw (0, t.newError)("Latest GitLab release is scheduled but not yet published", "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			let l = c.tag_name, u = null, d = "", f = null, p = async (r) => {
				d = (0, i.getChannelFilename)(r);
				let a = c.assets.links.find((e) => e.name === d);
				if (!a) throw (0, t.newError)(`Cannot find ${d} in the latest release assets`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
				f = new n.URL(a.direct_asset_url);
				let o = this.setAuthHeaderForToken(this.options.token || null), s = Object.keys(o).length ? o : void 0;
				try {
					let n = await this.httpRequest(f, s, e);
					if (!n) throw (0, t.newError)(`Empty response from ${f}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
					return n;
				} catch (e) {
					throw e instanceof t.HttpError && e.statusCode === 404 ? (0, t.newError)(`Cannot find ${d} in the latest release artifacts (${f}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : e;
				}
			};
			try {
				u = await p(this.channel);
			} catch (e) {
				if (this.channel !== this.getDefaultChannelName()) u = await p(this.getDefaultChannelName());
				else throw e;
			}
			if (!u) throw (0, t.newError)(`Unable to parse channel data from ${d}`, "ERR_UPDATER_INVALID_UPDATE_INFO");
			let m = (0, a.parseUpdateInfo)(u, d, f);
			m.releaseName ??= c.name, m.releaseNotes ??= c.description || null;
			let h = {
				tag: l,
				assets: this.convertAssetsToMap(c.assets),
				...m
			};
			return this.cachedLatestVersion = h, h;
		}
		convertAssetsToMap(e) {
			let t = /* @__PURE__ */ new Map();
			for (let n of e.links) t.set(this.normalizeFilename(n.name), n.direct_asset_url);
			return t;
		}
		findBlockMapInAssets(e, t) {
			let r = [`${t}.blockmap`, `${this.normalizeFilename(t)}.blockmap`];
			for (let t of r) {
				let r = e.get(t);
				if (r) return new n.URL(r);
			}
			return null;
		}
		async fetchReleaseInfoByVersion(e) {
			let n = new t.CancellationToken(), r = [`v${e}`, e];
			for (let e of r) {
				let r = (0, i.newUrlFromBase)(`projects/${this.options.projectId}/releases/${encodeURIComponent(e)}`, this.baseApiUrl);
				try {
					let e = {
						Accept: "application/json",
						...this.setAuthHeaderForToken(this.options.token || null)
					}, t = await this.httpRequest(r, e, n);
					if (t) return JSON.parse(t);
				} catch (n) {
					if (n instanceof t.HttpError && n.statusCode === 404) continue;
					throw (0, t.newError)(`Unable to find release ${e} on GitLab (${r}): ${n.stack || n.message}`, "ERR_UPDATER_RELEASE_NOT_FOUND");
				}
			}
			throw (0, t.newError)(`Unable to find release with version ${e} (tried: ${r.join(", ")}) on GitLab`, "ERR_UPDATER_RELEASE_NOT_FOUND");
		}
		setAuthHeaderForToken(e) {
			let t = {};
			return e != null && (e.startsWith("Bearer") ? t.authorization = e : t["PRIVATE-TOKEN"] = e), t;
		}
		async getVersionInfoForBlockMap(e) {
			if (this.cachedLatestVersion && this.cachedLatestVersion.version === e) return this.cachedLatestVersion.assets;
			let t = await this.fetchReleaseInfoByVersion(e);
			return t && t.assets ? this.convertAssetsToMap(t.assets) : null;
		}
		async findBlockMapUrlsFromAssets(e, t, n) {
			let i = null, a = null, o = await this.getVersionInfoForBlockMap(t);
			o && (i = this.findBlockMapInAssets(o, n));
			let s = await this.getVersionInfoForBlockMap(e);
			if (s) {
				let i = n.replace(new RegExp(r(t), "g"), e);
				a = this.findBlockMapInAssets(s, i);
			}
			return [a, i];
		}
		async getBlockMapFiles(e, n, r, i = null) {
			if (this.options.uploadTarget === "project_upload") {
				let i = e.pathname.split("/").pop() || "", [a, o] = await this.findBlockMapUrlsFromAssets(n, r, i);
				if (!o) throw (0, t.newError)(`Cannot find blockmap file for ${r} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
				if (!a) throw (0, t.newError)(`Cannot find blockmap file for ${n} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND");
				return [a, o];
			} else return super.getBlockMapFiles(e, n, r, i);
		}
		resolveFiles(e) {
			return (0, a.getFileList)(e).map((r) => {
				let i = [r.url, this.normalizeFilename(r.url)].find((t) => e.assets.has(t)), a = i ? e.assets.get(i) : void 0;
				if (!a) throw (0, t.newError)(`Cannot find asset "${r.url}" in GitLab release assets. Available assets: ${Array.from(e.assets.keys()).join(", ")}`, "ERR_UPDATER_ASSET_NOT_FOUND");
				return {
					url: new n.URL(a),
					info: r
				};
			});
		}
		toString() {
			return `GitLab (projectId: ${this.options.projectId}, channel: ${this.channel})`;
		}
	};
})), vn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.KeygenProvider = void 0;
	var t = K(), n = dn(), r = pn();
	e.KeygenProvider = class extends r.Provider {
		constructor(e, t, r) {
			super({
				...r,
				isUseMultipleRangeRequest: !1
			}), this.configuration = e, this.updater = t, this.defaultHostname = "api.keygen.sh";
			let i = this.configuration.host || this.defaultHostname;
			this.baseUrl = (0, n.newBaseUrl)(`https://${i}/v1/accounts/${this.configuration.account}/artifacts?product=${this.configuration.product}`);
		}
		get channel() {
			return this.updater.channel || this.configuration.channel || "stable";
		}
		async getLatestVersion() {
			let e = new t.CancellationToken(), i = (0, n.getChannelFilename)(this.getCustomChannelName(this.channel)), a = (0, n.newUrlFromBase)(i, this.baseUrl, this.updater.isAddNoCacheQuery);
			try {
				let t = await this.httpRequest(a, {
					Accept: "application/vnd.api+json",
					"Keygen-Version": "1.1"
				}, e);
				return (0, r.parseUpdateInfo)(t, i, a);
			} catch (e) {
				throw (0, t.newError)(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
		}
		resolveFiles(e) {
			return (0, r.resolveFiles)(e, this.baseUrl);
		}
		toString() {
			let { account: e, product: t, platform: n } = this.configuration;
			return `Keygen (account: ${e}, product: ${t}, platform: ${n}, channel: ${this.channel})`;
		}
	};
})), yn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.PrivateGitHubProvider = void 0;
	var t = K(), n = pt(), r = F("path"), i = F("url"), a = dn(), o = gn(), s = pn();
	e.PrivateGitHubProvider = class extends o.BaseGitHubProvider {
		constructor(e, t, n, r) {
			super(e, "api.github.com", r), this.updater = t, this.token = n;
		}
		createRequestOptions(e, t) {
			let n = super.createRequestOptions(e, t);
			return n.redirect = "manual", n;
		}
		async getLatestVersion() {
			let e = new t.CancellationToken(), r = (0, a.getChannelFilename)(this.getDefaultChannelName()), o = await this.getLatestVersionInfo(e), s = o.assets.find((e) => e.name === r);
			if (s == null) throw (0, t.newError)(`Cannot find ${r} in the release ${o.html_url || o.name}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");
			let c = new i.URL(s.url), l;
			try {
				l = (0, n.load)(await this.httpRequest(c, this.configureHeaders("application/octet-stream"), e));
			} catch (e) {
				throw e instanceof t.HttpError && e.statusCode === 404 ? (0, t.newError)(`Cannot find ${r} in the latest release artifacts (${c}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") : e;
			}
			return l.assets = o.assets, l;
		}
		get fileExtraDownloadHeaders() {
			return this.configureHeaders("application/octet-stream");
		}
		configureHeaders(e) {
			return {
				accept: e,
				authorization: `token ${this.token}`
			};
		}
		async getLatestVersionInfo(e) {
			let n = this.updater.allowPrerelease, r = this.basePath;
			n || (r = `${r}/latest`);
			let i = (0, a.newUrlFromBase)(r, this.baseUrl);
			try {
				let t = JSON.parse(await this.httpRequest(i, this.configureHeaders("application/vnd.github.v3+json"), e));
				if (n) {
					let e = t.filter((e) => !e.draft);
					return e.find((e) => e.prerelease) || e[0];
				} else return t;
			} catch (e) {
				throw (0, t.newError)(`Unable to find latest version on GitHub (${i}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND");
			}
		}
		get basePath() {
			return this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases`);
		}
		resolveFiles(e) {
			return (0, s.getFileList)(e).map((n) => {
				let a = r.posix.basename(n.url).replace(/ /g, "-"), o = e.assets.find((e) => e != null && e.name === a);
				if (o == null) throw (0, t.newError)(`Cannot find asset "${a}" in: ${JSON.stringify(e.assets, null, 2)}`, "ERR_UPDATER_ASSET_NOT_FOUND");
				return {
					url: new i.URL(o.url),
					info: n
				};
			});
		}
	};
})), bn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.isUrlProbablySupportMultiRangeRequests = c, e.createClient = l;
	var t = K(), n = hn(), r = mn(), i = gn(), a = _n(), o = vn(), s = yn();
	function c(e) {
		return !e.includes("s3.amazonaws.com");
	}
	function l(e, l, u) {
		if (typeof e == "string") throw (0, t.newError)("Please pass PublishConfiguration object", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
		let d = e.provider;
		switch (d) {
			case "github": {
				let t = e, n = (t.private ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN : null) || t.token;
				return n == null ? new i.GitHubProvider(t, l, u) : new s.PrivateGitHubProvider(t, l, n, u);
			}
			case "bitbucket": return new n.BitbucketProvider(e, l, u);
			case "gitlab": return new a.GitLabProvider(e, l, u);
			case "keygen": return new o.KeygenProvider(e, l, u);
			case "s3":
			case "spaces": return new r.GenericProvider({
				provider: "generic",
				url: (0, t.getS3LikeProviderBaseUrl)(e),
				channel: e.channel || null
			}, l, {
				...u,
				isUseMultipleRangeRequest: !1
			});
			case "generic": {
				let t = e;
				return new r.GenericProvider(t, l, {
					...u,
					isUseMultipleRangeRequest: t.useMultipleRangeRequest !== !1 && c(t.url)
				});
			}
			case "custom": {
				let n = e, r = n.updateProvider;
				if (!r) throw (0, t.newError)("Custom provider not specified", "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION");
				return new r(n, l, u);
			}
			default: throw (0, t.newError)(`Unsupported provider: ${d}`, "ERR_UPDATER_UNSUPPORTED_PROVIDER");
		}
	}
})), xn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.OperationKind = void 0, e.computeOperations = n;
	var t;
	(function(e) {
		e[e.COPY = 0] = "COPY", e[e.DOWNLOAD = 1] = "DOWNLOAD";
	})(t || (e.OperationKind = t = {}));
	function n(e, n, r) {
		let s = o(e.files), c = o(n.files), l = null, u = n.files[0], d = [], f = u.name, p = s.get(f);
		if (p == null) throw Error(`no file ${f} in old blockmap`);
		let m = c.get(f), h = 0, { checksumToOffset: g, checksumToOldSize: _ } = a(s.get(f), p.offset, r), v = u.offset;
		for (let e = 0; e < m.checksums.length; v += m.sizes[e], e++) {
			let n = m.sizes[e], a = m.checksums[e], o = g.get(a);
			o != null && _.get(a) !== n && (r.warn(`Checksum ("${a}") matches, but size differs (old: ${_.get(a)}, new: ${n})`), o = void 0), o === void 0 ? (h++, l != null && l.kind === t.DOWNLOAD && l.end === v ? l.end += n : (l = {
				kind: t.DOWNLOAD,
				start: v,
				end: v + n
			}, i(l, d, a, e))) : l != null && l.kind === t.COPY && l.end === o ? l.end += n : (l = {
				kind: t.COPY,
				start: o,
				end: o + n
			}, i(l, d, a, e));
		}
		return h > 0 && r.info(`File${u.name === "file" ? "" : " " + u.name} has ${h} changed blocks`), d;
	}
	var r = process.env.DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES === "true";
	function i(e, n, i, a) {
		if (r && n.length !== 0) {
			let r = n[n.length - 1];
			if (r.kind === e.kind && e.start < r.end && e.start > r.start) {
				let n = [
					r.start,
					r.end,
					e.start,
					e.end
				].reduce((e, t) => e < t ? e : t);
				throw Error(`operation (block index: ${a}, checksum: ${i}, kind: ${t[e.kind]}) overlaps previous operation (checksum: ${i}):\nabs: ${r.start} until ${r.end} and ${e.start} until ${e.end}\nrel: ${r.start - n} until ${r.end - n} and ${e.start - n} until ${e.end - n}`);
			}
		}
		n.push(e);
	}
	function a(e, t, n) {
		let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = t;
		for (let t = 0; t < e.checksums.length; t++) {
			let o = e.checksums[t], s = e.sizes[t], c = i.get(o);
			if (c === void 0) r.set(o, a), i.set(o, s);
			else if (n.debug != null) {
				let e = c === s ? "(same size)" : `(size: ${c}, this size: ${s})`;
				n.debug(`${o} duplicated in blockmap ${e}, it doesn't lead to broken differential downloader, just corresponding block will be skipped)`);
			}
			a += s;
		}
		return {
			checksumToOffset: r,
			checksumToOldSize: i
		};
	}
	function o(e) {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) t.set(n.name, n);
		return t;
	}
})), Sn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.DataSplitter = void 0, e.copyData = s;
	var t = K(), n = F("fs"), r = F("stream"), i = xn(), a = Buffer.from("\r\n\r\n"), o;
	(function(e) {
		e[e.INIT = 0] = "INIT", e[e.HEADER = 1] = "HEADER", e[e.BODY = 2] = "BODY";
	})(o ||= {});
	function s(e, t, r, i, a) {
		let o = (0, n.createReadStream)("", {
			fd: r,
			autoClose: !1,
			start: e.start,
			end: e.end - 1
		});
		o.on("error", i), o.once("end", a), o.pipe(t, { end: !1 });
	}
	e.DataSplitter = class extends r.Writable {
		constructor(e, t, n, r, i, a, s, c) {
			super(), this.out = e, this.options = t, this.partIndexToTaskIndex = n, this.partIndexToLength = i, this.finishHandler = a, this.grandTotalBytes = s, this.onProgress = c, this.start = Date.now(), this.nextUpdate = this.start + 1e3, this.transferred = 0, this.delta = 0, this.partIndex = -1, this.headerListBuffer = null, this.readState = o.INIT, this.ignoreByteCount = 0, this.remainingPartDataCount = 0, this.actualPartLength = 0, this.boundaryLength = r.length + 4, this.ignoreByteCount = this.boundaryLength - 2;
		}
		get isFinished() {
			return this.partIndex === this.partIndexToLength.length;
		}
		_write(e, t, n) {
			if (this.isFinished) {
				console.error(`Trailing ignored data: ${e.length} bytes`);
				return;
			}
			this.handleData(e).then(() => {
				if (this.onProgress) {
					let e = Date.now();
					(e >= this.nextUpdate || this.transferred === this.grandTotalBytes) && this.grandTotalBytes && (e - this.start) / 1e3 && (this.nextUpdate = e + 1e3, this.onProgress({
						total: this.grandTotalBytes,
						delta: this.delta,
						transferred: this.transferred,
						percent: this.transferred / this.grandTotalBytes * 100,
						bytesPerSecond: Math.round(this.transferred / ((e - this.start) / 1e3))
					}), this.delta = 0);
				}
				n();
			}).catch(n);
		}
		async handleData(e) {
			let n = 0;
			if (this.ignoreByteCount !== 0 && this.remainingPartDataCount !== 0) throw (0, t.newError)("Internal error", "ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH");
			if (this.ignoreByteCount > 0) {
				let t = Math.min(this.ignoreByteCount, e.length);
				this.ignoreByteCount -= t, n = t;
			} else if (this.remainingPartDataCount > 0) {
				let t = Math.min(this.remainingPartDataCount, e.length);
				this.remainingPartDataCount -= t, await this.processPartData(e, 0, t), n = t;
			}
			if (n !== e.length) {
				if (this.readState === o.HEADER) {
					let t = this.searchHeaderListEnd(e, n);
					if (t === -1) return;
					n = t, this.readState = o.BODY, this.headerListBuffer = null;
				}
				for (;;) {
					if (this.readState === o.BODY) this.readState = o.INIT;
					else {
						this.partIndex++;
						let r = this.partIndexToTaskIndex.get(this.partIndex);
						if (r == null) if (this.isFinished) r = this.options.end;
						else throw (0, t.newError)("taskIndex is null", "ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL");
						let i = this.partIndex === 0 ? this.options.start : this.partIndexToTaskIndex.get(this.partIndex - 1) + 1;
						if (i < r) await this.copyExistingData(i, r);
						else if (i > r) throw (0, t.newError)("prevTaskIndex must be < taskIndex", "ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED");
						if (this.isFinished) {
							this.onPartEnd(), this.finishHandler();
							return;
						}
						if (n = this.searchHeaderListEnd(e, n), n === -1) {
							this.readState = o.HEADER;
							return;
						}
					}
					let r = this.partIndexToLength[this.partIndex], i = n + r, a = Math.min(i, e.length);
					if (await this.processPartStarted(e, n, a), this.remainingPartDataCount = r - (a - n), this.remainingPartDataCount > 0) return;
					if (n = i + this.boundaryLength, n >= e.length) {
						this.ignoreByteCount = this.boundaryLength - (e.length - i);
						return;
					}
				}
			}
		}
		copyExistingData(e, t) {
			return new Promise((n, r) => {
				let a = () => {
					if (e === t) {
						n();
						return;
					}
					let o = this.options.tasks[e];
					if (o.kind !== i.OperationKind.COPY) {
						r(/* @__PURE__ */ Error("Task kind must be COPY"));
						return;
					}
					s(o, this.out, this.options.oldFileFd, r, () => {
						e++, a();
					});
				};
				a();
			});
		}
		searchHeaderListEnd(e, t) {
			let n = e.indexOf(a, t);
			if (n !== -1) return n + a.length;
			let r = t === 0 ? e : e.slice(t);
			return this.headerListBuffer == null ? this.headerListBuffer = r : this.headerListBuffer = Buffer.concat([this.headerListBuffer, r]), -1;
		}
		onPartEnd() {
			let e = this.partIndexToLength[this.partIndex - 1];
			if (this.actualPartLength !== e) throw (0, t.newError)(`Expected length: ${e} differs from actual: ${this.actualPartLength}`, "ERR_DATA_SPLITTER_LENGTH_MISMATCH");
			this.actualPartLength = 0;
		}
		processPartStarted(e, t, n) {
			return this.partIndex !== 0 && this.onPartEnd(), this.processPartData(e, t, n);
		}
		processPartData(e, t, n) {
			this.actualPartLength += n - t, this.transferred += n - t, this.delta += n - t;
			let r = this.out;
			return r.write(t === 0 && e.length === n ? e : e.slice(t, n)) ? Promise.resolve() : new Promise((e, t) => {
				r.on("error", t), r.once("drain", () => {
					r.removeListener("error", t), e();
				});
			});
		}
	};
})), Cn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.executeTasksUsingMultipleRangeRequests = i, e.checkIsRangesSupported = o;
	var t = K(), n = Sn(), r = xn();
	function i(e, t, n, r, i) {
		let o = (s) => {
			if (s >= t.length) {
				e.fileMetadataBuffer != null && n.write(e.fileMetadataBuffer), n.end();
				return;
			}
			let c = s + 1e3;
			a(e, {
				tasks: t,
				start: s,
				end: Math.min(t.length, c),
				oldFileFd: r
			}, n, () => o(c), i);
		};
		return o;
	}
	function a(e, i, a, s, c) {
		let l = "bytes=", u = 0, d = 0, f = /* @__PURE__ */ new Map(), p = [];
		for (let e = i.start; e < i.end; e++) {
			let t = i.tasks[e];
			t.kind === r.OperationKind.DOWNLOAD && (l += `${t.start}-${t.end - 1}, `, f.set(u, e), u++, p.push(t.end - t.start), d += t.end - t.start);
		}
		if (u <= 1) {
			let t = (l) => {
				if (l >= i.end) {
					s();
					return;
				}
				let u = i.tasks[l++];
				if (u.kind === r.OperationKind.COPY) (0, n.copyData)(u, a, i.oldFileFd, c, () => t(l));
				else {
					let n = e.createRequestOptions();
					n.headers.Range = `bytes=${u.start}-${u.end - 1}`;
					let r = e.httpExecutor.createRequest(n, (e) => {
						e.on("error", c), o(e, c) && (e.pipe(a, { end: !1 }), e.once("end", () => t(l)));
					});
					e.httpExecutor.addErrorAndTimeoutHandlers(r, c), r.end();
				}
			};
			t(i.start);
			return;
		}
		let m = e.createRequestOptions();
		m.headers.Range = l.substring(0, l.length - 2);
		let h = e.httpExecutor.createRequest(m, (r) => {
			if (!o(r, c)) return;
			let l = (0, t.safeGetHeader)(r, "content-type"), u = /^multipart\/.+?\s*;\s*boundary=(?:"([^"]+)"|([^\s";]+))\s*$/i.exec(l);
			if (u == null) {
				c(/* @__PURE__ */ Error(`Content-Type "multipart/byteranges" is expected, but got "${l}"`));
				return;
			}
			let m = new n.DataSplitter(a, i, f, u[1] || u[2], p, s, d, e.options.onProgress);
			m.on("error", c), r.pipe(m), r.on("end", () => {
				setTimeout(() => {
					h.abort(), c(/* @__PURE__ */ Error("Response ends without calling any handlers"));
				}, 1e4);
			});
		});
		e.httpExecutor.addErrorAndTimeoutHandlers(h, c), h.end();
	}
	function o(e, n) {
		if (e.statusCode >= 400) return n((0, t.createHttpError)(e)), !1;
		if (e.statusCode !== 206) {
			let r = (0, t.safeGetHeader)(e, "accept-ranges");
			if (r == null || r === "none") return n(/* @__PURE__ */ Error(`Server doesn't support Accept-Ranges (response code ${e.statusCode})`)), !1;
		}
		return !0;
	}
})), wn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.ProgressDifferentialDownloadCallbackTransform = void 0;
	var t = F("stream"), n;
	(function(e) {
		e[e.COPY = 0] = "COPY", e[e.DOWNLOAD = 1] = "DOWNLOAD";
	})(n ||= {}), e.ProgressDifferentialDownloadCallbackTransform = class extends t.Transform {
		constructor(e, t, r) {
			super(), this.progressDifferentialDownloadInfo = e, this.cancellationToken = t, this.onProgress = r, this.start = Date.now(), this.transferred = 0, this.delta = 0, this.expectedBytes = 0, this.index = 0, this.operationType = n.COPY, this.nextUpdate = this.start + 1e3;
		}
		_transform(e, t, r) {
			if (this.cancellationToken.cancelled) {
				r(/* @__PURE__ */ Error("cancelled"), null);
				return;
			}
			if (this.operationType == n.COPY) {
				r(null, e);
				return;
			}
			this.transferred += e.length, this.delta += e.length;
			let i = Date.now();
			i >= this.nextUpdate && this.transferred !== this.expectedBytes && this.transferred !== this.progressDifferentialDownloadInfo.grandTotal && (this.nextUpdate = i + 1e3, this.onProgress({
				total: this.progressDifferentialDownloadInfo.grandTotal,
				delta: this.delta,
				transferred: this.transferred,
				percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
				bytesPerSecond: Math.round(this.transferred / ((i - this.start) / 1e3))
			}), this.delta = 0), r(null, e);
		}
		beginFileCopy() {
			this.operationType = n.COPY;
		}
		beginRangeDownload() {
			this.operationType = n.DOWNLOAD, this.expectedBytes += this.progressDifferentialDownloadInfo.expectedByteCounts[this.index++];
		}
		endRangeDownload() {
			this.transferred !== this.progressDifferentialDownloadInfo.grandTotal && this.onProgress({
				total: this.progressDifferentialDownloadInfo.grandTotal,
				delta: this.delta,
				transferred: this.transferred,
				percent: this.transferred / this.progressDifferentialDownloadInfo.grandTotal * 100,
				bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
			});
		}
		_flush(e) {
			if (this.cancellationToken.cancelled) {
				e(/* @__PURE__ */ Error("cancelled"));
				return;
			}
			this.onProgress({
				total: this.progressDifferentialDownloadInfo.grandTotal,
				delta: this.delta,
				transferred: this.transferred,
				percent: 100,
				bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1e3))
			}), this.delta = 0, this.transferred = 0, e(null);
		}
	};
})), Tn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.DifferentialDownloader = void 0;
	var t = K(), n = we(), r = F("fs"), i = Sn(), a = F("url"), o = xn(), s = Cn(), c = wn();
	e.DifferentialDownloader = class {
		constructor(e, t, n) {
			this.blockAwareFileInfo = e, this.httpExecutor = t, this.options = n, this.fileMetadataBuffer = null, this.logger = n.logger;
		}
		createRequestOptions() {
			let e = { headers: {
				...this.options.requestHeaders,
				accept: "*/*"
			} };
			return (0, t.configureRequestUrl)(this.options.newUrl, e), (0, t.configureRequestOptions)(e), e;
		}
		doDownload(e, t) {
			if (e.version !== t.version) throw Error(`version is different (${e.version} - ${t.version}), full download is required`);
			let n = this.logger, r = (0, o.computeOperations)(e, t, n);
			n.debug != null && n.debug(JSON.stringify(r, null, 2));
			let i = 0, a = 0;
			for (let e of r) {
				let t = e.end - e.start;
				e.kind === o.OperationKind.DOWNLOAD ? i += t : a += t;
			}
			let s = this.blockAwareFileInfo.size;
			if (i + a + (this.fileMetadataBuffer == null ? 0 : this.fileMetadataBuffer.length) !== s) throw Error(`Internal error, size mismatch: downloadSize: ${i}, copySize: ${a}, newSize: ${s}`);
			return n.info(`Full: ${l(s)}, To download: ${l(i)} (${Math.round(i / (s / 100))}%)`), this.downloadFile(r);
		}
		downloadFile(e) {
			let t = [], r = () => Promise.all(t.map((e) => (0, n.close)(e.descriptor).catch((t) => {
				this.logger.error(`cannot close file "${e.path}": ${t}`);
			})));
			return this.doDownloadFile(e, t).then(r).catch((e) => r().catch((t) => {
				try {
					this.logger.error(`cannot close files: ${t}`);
				} catch (e) {
					try {
						console.error(e);
					} catch {}
				}
				throw e;
			}).then(() => {
				throw e;
			}));
		}
		async doDownloadFile(e, l) {
			let d = await (0, n.open)(this.options.oldFile, "r");
			l.push({
				descriptor: d,
				path: this.options.oldFile
			});
			let f = await (0, n.open)(this.options.newFile, "w");
			l.push({
				descriptor: f,
				path: this.options.newFile
			});
			let p = (0, r.createWriteStream)(this.options.newFile, { fd: f });
			await new Promise((n, r) => {
				let f = [], m;
				if (!this.options.isUseMultipleRangeRequest && this.options.onProgress) {
					let t = [], n = 0;
					for (let r of e) r.kind === o.OperationKind.DOWNLOAD && (t.push(r.end - r.start), n += r.end - r.start);
					let r = {
						expectedByteCounts: t,
						grandTotal: n
					};
					m = new c.ProgressDifferentialDownloadCallbackTransform(r, this.options.cancellationToken, this.options.onProgress), f.push(m);
				}
				let h = new t.DigestTransform(this.blockAwareFileInfo.sha512);
				h.isValidateOnEnd = !1, f.push(h), p.on("finish", () => {
					p.close(() => {
						l.splice(1, 1);
						try {
							h.validate();
						} catch (e) {
							r(e);
							return;
						}
						n(void 0);
					});
				}), f.push(p);
				let g = null;
				for (let e of f) e.on("error", r), g = g == null ? e : g.pipe(e);
				let _ = f[0], v;
				if (this.options.isUseMultipleRangeRequest) {
					v = (0, s.executeTasksUsingMultipleRangeRequests)(this, e, _, d, r), v(0);
					return;
				}
				let y = 0, b = null;
				this.logger.info(`Differential download: ${this.options.newUrl}`);
				let x = this.createRequestOptions();
				x.redirect = "manual", v = (n) => {
					var s, c;
					if (n >= e.length) {
						this.fileMetadataBuffer != null && _.write(this.fileMetadataBuffer), _.end();
						return;
					}
					let l = e[n++];
					if (l.kind === o.OperationKind.COPY) {
						m && m.beginFileCopy(), (0, i.copyData)(l, _, d, r, () => v(n));
						return;
					}
					let f = `bytes=${l.start}-${l.end - 1}`;
					x.headers.range = f, (c = (s = this.logger)?.debug) == null || c.call(s, `download range: ${f}`), m && m.beginRangeDownload();
					let p = this.httpExecutor.createRequest(x, (e) => {
						e.on("error", r), e.on("aborted", () => {
							r(/* @__PURE__ */ Error("response has been aborted by the server"));
						}), e.statusCode >= 400 && r((0, t.createHttpError)(e)), e.pipe(_, { end: !1 }), e.once("end", () => {
							m && m.endRangeDownload(), ++y === 100 ? (y = 0, setTimeout(() => v(n), 1e3)) : v(n);
						});
					});
					p.on("redirect", (e, n, r) => {
						this.logger.info(`Redirect to ${u(r)}`), b = r, (0, t.configureRequestUrl)(new a.URL(b), x), p.followRedirect();
					}), this.httpExecutor.addErrorAndTimeoutHandlers(p, r), p.end();
				}, v(0);
			});
		}
		async readRemoteBytes(e, t) {
			let n = Buffer.allocUnsafe(t + 1 - e), r = this.createRequestOptions();
			r.headers.range = `bytes=${e}-${t}`;
			let i = 0;
			if (await this.request(r, (e) => {
				e.copy(n, i), i += e.length;
			}), i !== n.length) throw Error(`Received data length ${i} is not equal to expected ${n.length}`);
			return n;
		}
		request(e, t) {
			return new Promise((n, r) => {
				let i = this.httpExecutor.createRequest(e, (e) => {
					(0, s.checkIsRangesSupported)(e, r) && (e.on("error", r), e.on("aborted", () => {
						r(/* @__PURE__ */ Error("response has been aborted by the server"));
					}), e.on("data", t), e.on("end", () => n()));
				});
				this.httpExecutor.addErrorAndTimeoutHandlers(i, r), i.end();
			});
		}
	};
	function l(e, t = " KB") {
		return new Intl.NumberFormat("en").format((e / 1024).toFixed(2)) + t;
	}
	function u(e) {
		let t = e.indexOf("?");
		return t < 0 ? e : e.substring(0, t);
	}
})), En = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.GenericDifferentialDownloader = void 0;
	var t = Tn();
	e.GenericDifferentialDownloader = class extends t.DifferentialDownloader {
		download(e, t) {
			return this.doDownload(e, t);
		}
	};
})), Dn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.UpdaterSignal = e.UPDATE_DOWNLOADED = e.DOWNLOAD_PROGRESS = e.CancellationToken = void 0, e.addHandler = n;
	var t = K();
	Object.defineProperty(e, "CancellationToken", {
		enumerable: !0,
		get: function() {
			return t.CancellationToken;
		}
	}), e.DOWNLOAD_PROGRESS = "download-progress", e.UPDATE_DOWNLOADED = "update-downloaded", e.UpdaterSignal = class {
		constructor(e) {
			this.emitter = e;
		}
		login(e) {
			n(this.emitter, "login", e);
		}
		progress(t) {
			n(this.emitter, e.DOWNLOAD_PROGRESS, t);
		}
		updateDownloaded(t) {
			n(this.emitter, e.UPDATE_DOWNLOADED, t);
		}
		updateCancelled(e) {
			n(this.emitter, "update-cancelled", e);
		}
	};
	function n(e, t, n) {
		e.on(t, n);
	}
})), On = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.NoOpLogger = e.AppUpdater = void 0;
	var t = K(), n = F("crypto"), r = F("os"), i = F("events"), a = we(), o = pt(), s = mt(), c = F("path"), l = an(), u = sn(), d = ln(), f = un(), p = mn(), m = bn(), h = F("zlib"), g = En(), _ = Dn();
	e.AppUpdater = class e extends i.EventEmitter {
		get channel() {
			return this._channel;
		}
		set channel(e) {
			if (this._channel != null) {
				if (typeof e != "string") throw (0, t.newError)(`Channel must be a string, but got: ${e}`, "ERR_UPDATER_INVALID_CHANNEL");
				if (e.length === 0) throw (0, t.newError)("Channel must be not an empty string", "ERR_UPDATER_INVALID_CHANNEL");
			}
			this._channel = e, this.allowDowngrade = !0;
		}
		addAuthHeader(e) {
			this.requestHeaders = Object.assign({}, this.requestHeaders, { authorization: e });
		}
		get netSession() {
			return (0, f.getNetSession)();
		}
		get logger() {
			return this._logger;
		}
		set logger(e) {
			this._logger = e ?? new y();
		}
		set updateConfigPath(e) {
			this.clientPromise = null, this._appUpdateConfigPath = e, this.configOnDisk = new s.Lazy(() => this.loadUpdateConfig());
		}
		get isUpdateSupported() {
			return this._isUpdateSupported;
		}
		set isUpdateSupported(e) {
			e && (this._isUpdateSupported = e);
		}
		get isUserWithinRollout() {
			return this._isUserWithinRollout;
		}
		set isUserWithinRollout(e) {
			e && (this._isUserWithinRollout = e);
		}
		constructor(e, n) {
			super(), this.autoDownload = !0, this.autoInstallOnAppQuit = !0, this.autoRunAppAfterInstall = !0, this.allowPrerelease = !1, this.fullChangelog = !1, this.allowDowngrade = !1, this.disableWebInstaller = !1, this.disableDifferentialDownload = !1, this.forceDevUpdateConfig = !1, this.previousBlockmapBaseUrlOverride = null, this._channel = null, this.downloadedUpdateHelper = null, this.requestHeaders = null, this._logger = console, this.signals = new _.UpdaterSignal(this), this._appUpdateConfigPath = null, this._isUpdateSupported = (e) => this.checkIfUpdateSupported(e), this._isUserWithinRollout = (e) => this.isStagingMatch(e), this.clientPromise = null, this.stagingUserIdPromise = new s.Lazy(() => this.getOrCreateStagingUserId()), this.configOnDisk = new s.Lazy(() => this.loadUpdateConfig()), this.checkForUpdatesPromise = null, this.downloadPromise = null, this.updateInfoAndProvider = null, this._testOnlyOptions = null, this.on("error", (e) => {
				this._logger.error(`Error: ${e.stack || e.message}`);
			}), n == null ? (this.app = new d.ElectronAppAdapter(), this.httpExecutor = new f.ElectronHttpExecutor((e, t) => this.emit("login", e, t))) : (this.app = n, this.httpExecutor = null);
			let r = this.app.version, i = (0, l.parse)(r);
			if (i == null) throw (0, t.newError)(`App version is not a valid semver version: "${r}"`, "ERR_UPDATER_INVALID_VERSION");
			this.currentVersion = i, this.allowPrerelease = v(i), e != null && (this.setFeedURL(e), typeof e != "string" && e.requestHeaders && (this.requestHeaders = e.requestHeaders));
		}
		getFeedURL() {
			return "Deprecated. Do not use it.";
		}
		setFeedURL(e) {
			let t = this.createProviderRuntimeOptions(), n;
			n = typeof e == "string" ? new p.GenericProvider({
				provider: "generic",
				url: e
			}, this, {
				...t,
				isUseMultipleRangeRequest: (0, m.isUrlProbablySupportMultiRangeRequests)(e)
			}) : (0, m.createClient)(e, this, t), this.clientPromise = Promise.resolve(n);
		}
		checkForUpdates() {
			if (!this.isUpdaterActive()) return Promise.resolve(null);
			let e = this.checkForUpdatesPromise;
			if (e != null) return this._logger.info("Checking for update (already in progress)"), e;
			let t = () => this.checkForUpdatesPromise = null;
			return this._logger.info("Checking for update"), e = this.doCheckForUpdates().then((e) => (t(), e)).catch((e) => {
				throw t(), this.emit("error", e, `Cannot check for updates: ${(e.stack || e).toString()}`), e;
			}), this.checkForUpdatesPromise = e, e;
		}
		isUpdaterActive() {
			return this.app.isPackaged || this.forceDevUpdateConfig ? !0 : (this._logger.info("Skip checkForUpdates because application is not packed and dev update config is not forced"), !1);
		}
		checkForUpdatesAndNotify(t) {
			return this.checkForUpdates().then((n) => n?.downloadPromise ? (n.downloadPromise.then(() => {
				let r = e.formatDownloadNotification(n.updateInfo.version, this.app.name, t);
				new (F("electron")).Notification(r).show();
			}), n) : (this._logger.debug != null && this._logger.debug("checkForUpdatesAndNotify called, downloadPromise is null"), n));
		}
		static formatDownloadNotification(e, t, n) {
			return n ??= {
				title: "A new update is ready to install",
				body: "{appName} version {version} has been downloaded and will be automatically installed on exit"
			}, n = {
				title: n.title.replace("{appName}", t).replace("{version}", e),
				body: n.body.replace("{appName}", t).replace("{version}", e)
			}, n;
		}
		async isStagingMatch(e) {
			let n = e.stagingPercentage, r = n;
			if (r == null) return !0;
			if (r = parseInt(r, 10), isNaN(r)) return this._logger.warn(`Staging percentage is NaN: ${n}`), !0;
			r /= 100;
			let i = await this.stagingUserIdPromise.value, a = t.UUID.parse(i).readUInt32BE(12) / 4294967295;
			return this._logger.info(`Staging percentage: ${r}, percentage: ${a}, user id: ${i}`), a < r;
		}
		computeFinalHeaders(e) {
			return this.requestHeaders != null && Object.assign(e, this.requestHeaders), e;
		}
		async isUpdateAvailable(e) {
			let n = (0, l.parse)(e.version);
			if (n == null) throw (0, t.newError)(`This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: "${e.version}"`, "ERR_UPDATER_INVALID_VERSION");
			let r = this.currentVersion;
			if ((0, l.eq)(n, r) || !await Promise.resolve(this.isUpdateSupported(e)) || !await Promise.resolve(this.isUserWithinRollout(e))) return !1;
			let i = (0, l.gt)(n, r), a = (0, l.lt)(n, r);
			return i ? !0 : this.allowDowngrade && a;
		}
		checkIfUpdateSupported(e) {
			let t = e?.minimumSystemVersion, n = (0, r.release)();
			if (t) try {
				if ((0, l.lt)(n, t)) return this._logger.info(`Current OS version ${n} is less than the minimum OS version required ${t} for version ${n}`), !1;
			} catch (e) {
				this._logger.warn(`Failed to compare current OS version(${n}) with minimum OS version(${t}): ${(e.message || e).toString()}`);
			}
			return !0;
		}
		async getUpdateInfoAndProvider() {
			await this.app.whenReady(), this.clientPromise ??= this.configOnDisk.value.then((e) => (0, m.createClient)(e, this, this.createProviderRuntimeOptions()));
			let e = await this.clientPromise, t = await this.stagingUserIdPromise.value;
			return e.setRequestHeaders(this.computeFinalHeaders({ "x-user-staging-id": t })), {
				info: await e.getLatestVersion(),
				provider: e
			};
		}
		createProviderRuntimeOptions() {
			return {
				isUseMultipleRangeRequest: !0,
				platform: this._testOnlyOptions == null ? process.platform : this._testOnlyOptions.platform,
				executor: this.httpExecutor
			};
		}
		async doCheckForUpdates() {
			this.emit("checking-for-update");
			let e = await this.getUpdateInfoAndProvider(), n = e.info;
			if (!await this.isUpdateAvailable(n)) return this._logger.info(`Update for version ${this.currentVersion.format()} is not available (latest version: ${n.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}).`), this.emit("update-not-available", n), {
				isUpdateAvailable: !1,
				versionInfo: n,
				updateInfo: n
			};
			this.updateInfoAndProvider = e, this.onUpdateAvailable(n);
			let r = new t.CancellationToken();
			return {
				isUpdateAvailable: !0,
				versionInfo: n,
				updateInfo: n,
				cancellationToken: r,
				downloadPromise: this.autoDownload ? this.downloadUpdate(r) : null
			};
		}
		onUpdateAvailable(e) {
			this._logger.info(`Found version ${e.version} (url: ${(0, t.asArray)(e.files).map((e) => e.url).join(", ")})`), this.emit("update-available", e);
		}
		downloadUpdate(e = new t.CancellationToken()) {
			let n = this.updateInfoAndProvider;
			if (n == null) {
				let e = /* @__PURE__ */ Error("Please check update first");
				return this.dispatchError(e), Promise.reject(e);
			}
			if (this.downloadPromise != null) return this._logger.info("Downloading update (already in progress)"), this.downloadPromise;
			this._logger.info(`Downloading update from ${(0, t.asArray)(n.info.files).map((e) => e.url).join(", ")}`);
			let r = (e) => {
				if (!(e instanceof t.CancellationError)) try {
					this.dispatchError(e);
				} catch (e) {
					this._logger.warn(`Cannot dispatch error event: ${e.stack || e}`);
				}
				return e;
			};
			return this.downloadPromise = this.doDownloadUpdate({
				updateInfoAndProvider: n,
				requestHeaders: this.computeRequestHeaders(n.provider),
				cancellationToken: e,
				disableWebInstaller: this.disableWebInstaller,
				disableDifferentialDownload: this.disableDifferentialDownload
			}).catch((e) => {
				throw r(e);
			}).finally(() => {
				this.downloadPromise = null;
			}), this.downloadPromise;
		}
		dispatchError(e) {
			this.emit("error", e, (e.stack || e).toString());
		}
		dispatchUpdateDownloaded(e) {
			this.emit(_.UPDATE_DOWNLOADED, e);
		}
		async loadUpdateConfig() {
			return this._appUpdateConfigPath ??= this.app.appUpdateConfigPath, (0, o.load)(await (0, a.readFile)(this._appUpdateConfigPath, "utf-8"));
		}
		computeRequestHeaders(e) {
			let t = e.fileExtraDownloadHeaders;
			if (t != null) {
				let e = this.requestHeaders;
				return e == null ? t : {
					...t,
					...e
				};
			}
			return this.computeFinalHeaders({ accept: "*/*" });
		}
		async getOrCreateStagingUserId() {
			let e = c.join(this.app.userDataPath, ".updaterId");
			try {
				let n = await (0, a.readFile)(e, "utf-8");
				if (t.UUID.check(n)) return n;
				this._logger.warn(`Staging user id file exists, but content was invalid: ${n}`);
			} catch (e) {
				e.code !== "ENOENT" && this._logger.warn(`Couldn't read staging user ID, creating a blank one: ${e}`);
			}
			let r = t.UUID.v5((0, n.randomBytes)(4096), t.UUID.OID);
			this._logger.info(`Generated new staging user ID: ${r}`);
			try {
				await (0, a.outputFile)(e, r);
			} catch (e) {
				this._logger.warn(`Couldn't write out staging user ID: ${e}`);
			}
			return r;
		}
		get isAddNoCacheQuery() {
			let e = this.requestHeaders;
			if (e == null) return !0;
			for (let t of Object.keys(e)) {
				let e = t.toLowerCase();
				if (e === "authorization" || e === "private-token") return !1;
			}
			return !0;
		}
		async getOrCreateDownloadHelper() {
			let e = this.downloadedUpdateHelper;
			if (e == null) {
				let t = (await this.configOnDisk.value).updaterCacheDirName, n = this._logger;
				t ?? n.error("updaterCacheDirName is not specified in app-update.yml Was app build using at least electron-builder 20.34.0?");
				let r = c.join(this.app.baseCachePath, t || this.app.name);
				n.debug != null && n.debug(`updater cache dir: ${r}`), e = new u.DownloadedUpdateHelper(r), this.downloadedUpdateHelper = e;
			}
			return e;
		}
		async executeDownload(e) {
			let n = e.fileInfo, r = {
				headers: e.downloadUpdateOptions.requestHeaders,
				cancellationToken: e.downloadUpdateOptions.cancellationToken,
				sha2: n.info.sha2,
				sha512: n.info.sha512
			};
			this.listenerCount(_.DOWNLOAD_PROGRESS) > 0 && (r.onProgress = (e) => this.emit(_.DOWNLOAD_PROGRESS, e));
			let i = e.downloadUpdateOptions.updateInfoAndProvider.info, o = i.version, s = n.packageInfo;
			function l() {
				let t = decodeURIComponent(e.fileInfo.url.pathname);
				return t.toLowerCase().endsWith(`.${e.fileExtension.toLowerCase()}`) ? c.basename(t) : c.basename(e.fileInfo.info.url);
			}
			let d = await this.getOrCreateDownloadHelper(), f = d.cacheDirForPendingUpdate;
			await (0, a.mkdir)(f, { recursive: !0 });
			let p = l(), m = c.join(f, p), h = s == null ? null : c.join(f, `package-${o}${c.extname(s.path) || ".7z"}`), g = async (t) => {
				await d.setDownloadedFile(m, h, i, n, p, t), await e.done({
					...i,
					downloadedFile: m
				});
				let r = c.join(f, "current.blockmap");
				return await (0, a.pathExists)(r) && await (0, a.copyFile)(r, c.join(d.cacheDir, "current.blockmap")), h == null ? [m] : [m, h];
			}, v = this._logger, y = await d.validateDownloadedPath(m, i, n, v);
			if (y != null) return m = y, await g(!1);
			let b = async () => (await d.clear().catch(() => {}), await (0, a.unlink)(m).catch(() => {})), x = await (0, u.createTempUpdateFile)(`temp-${p}`, f, v);
			try {
				await e.task(x, r, h, b), await (0, t.retry)(() => (0, a.rename)(x, m), {
					retries: 60,
					interval: 500,
					shouldRetry: (e) => e instanceof Error && /^EBUSY:/.test(e.message) ? !0 : (v.warn(`Cannot rename temp file to final file: ${e.message || e.stack}`), !1)
				});
			} catch (e) {
				throw await b(), e instanceof t.CancellationError && (v.info("cancelled"), this.emit("update-cancelled", i)), e;
			}
			return v.info(`New version ${o} has been downloaded to ${m}`), await g(!0);
		}
		async differentialDownloadInstaller(e, t, n, r, i) {
			try {
				if (this._testOnlyOptions != null && !this._testOnlyOptions.isUseDifferentialDownload) return !0;
				let r = t.updateInfoAndProvider.provider, o = await r.getBlockMapFiles(e.url, this.app.version, t.updateInfoAndProvider.info.version, this.previousBlockmapBaseUrlOverride);
				this._logger.info(`Download block maps (old: "${o[0]}", new: ${o[1]})`);
				let s = async (e) => {
					let n = await this.httpExecutor.downloadToBuffer(e, {
						headers: t.requestHeaders,
						cancellationToken: t.cancellationToken
					});
					if (n == null || n.length === 0) throw Error(`Blockmap "${e.href}" is empty`);
					try {
						return JSON.parse((0, h.gunzipSync)(n).toString());
					} catch (t) {
						throw Error(`Cannot parse blockmap "${e.href}", error: ${t}`);
					}
				}, l = {
					newUrl: e.url,
					oldFile: c.join(this.downloadedUpdateHelper.cacheDir, i),
					logger: this._logger,
					newFile: n,
					isUseMultipleRangeRequest: r.isUseMultipleRangeRequest,
					requestHeaders: t.requestHeaders,
					cancellationToken: t.cancellationToken
				};
				this.listenerCount(_.DOWNLOAD_PROGRESS) > 0 && (l.onProgress = (e) => this.emit(_.DOWNLOAD_PROGRESS, e));
				let u = async (e, t) => {
					let n = c.join(t, "current.blockmap");
					await (0, a.outputFile)(n, (0, h.gzipSync)(JSON.stringify(e)));
				}, d = async (e) => {
					let t = c.join(e, "current.blockmap");
					try {
						if (await (0, a.pathExists)(t)) return JSON.parse((0, h.gunzipSync)(await (0, a.readFile)(t)).toString());
					} catch (e) {
						this._logger.warn(`Cannot parse blockmap "${t}", error: ${e}`);
					}
					return null;
				}, f = await s(o[1]);
				await u(f, this.downloadedUpdateHelper.cacheDirForPendingUpdate);
				let p = await d(this.downloadedUpdateHelper.cacheDir);
				return p ??= await s(o[0]), await new g.GenericDifferentialDownloader(e.info, this.httpExecutor, l).download(p, f), !1;
			} catch (e) {
				if (this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`), this._testOnlyOptions != null) throw e;
				return !0;
			}
		}
	};
	function v(e) {
		let t = (0, l.prerelease)(e);
		return t != null && t.length > 0;
	}
	var y = class {
		info(e) {}
		warn(e) {}
		error(e) {}
	};
	e.NoOpLogger = y;
})), kn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.BaseUpdater = void 0;
	var t = F("child_process"), n = F("path"), r = On();
	e.BaseUpdater = class extends r.AppUpdater {
		constructor(e, t) {
			super(e, t), this.quitAndInstallCalled = !1, this.quitHandlerAdded = !1;
		}
		quitAndInstall(e = !1, t = !1) {
			this._logger.info("Install on explicit quitAndInstall"), this.install(e, e ? t : this.autoRunAppAfterInstall) ? setImmediate(() => {
				F("electron").autoUpdater.emit("before-quit-for-update"), this.app.quit();
			}) : this.quitAndInstallCalled = !1;
		}
		executeDownload(e) {
			return super.executeDownload({
				...e,
				done: (e) => (this.dispatchUpdateDownloaded(e), this.addQuitHandler(), Promise.resolve())
			});
		}
		get installerPath() {
			return this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.file;
		}
		install(e = !1, t = !1) {
			if (this.quitAndInstallCalled) return this._logger.warn("install call ignored: quitAndInstallCalled is set to true"), !1;
			let n = this.downloadedUpdateHelper, r = this.installerPath, i = n == null ? null : n.downloadedFileInfo;
			if (r == null || i == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			this.quitAndInstallCalled = !0;
			try {
				return this._logger.info(`Install: isSilent: ${e}, isForceRunAfter: ${t}`), this.doInstall({
					isSilent: e,
					isForceRunAfter: t,
					isAdminRightsRequired: i.isAdminRightsRequired
				});
			} catch (e) {
				return this.dispatchError(e), !1;
			}
		}
		addQuitHandler() {
			this.quitHandlerAdded || !this.autoInstallOnAppQuit || (this.quitHandlerAdded = !0, this.app.onQuit((e) => {
				if (this.quitAndInstallCalled) {
					this._logger.info("Update installer has already been triggered. Quitting application.");
					return;
				}
				if (!this.autoInstallOnAppQuit) {
					this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.");
					return;
				}
				if (e !== 0) {
					this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${e}`);
					return;
				}
				this._logger.info("Auto install update on quit"), this.install(!0, !1);
			}));
		}
		sanitizeEnvPath(e) {
			return e.split(n.delimiter).filter((e) => n.isAbsolute(e)).join(n.delimiter);
		}
		spawnSyncLog(e, n = [], r = {}) {
			this._logger.info(`Executing: ${e} with args: ${n}`);
			let i = {
				...process.env,
				...r
			}, { error: a, status: o, stdout: s, stderr: c } = (0, t.spawnSync)(e, n, {
				env: {
					...i,
					PATH: this.sanitizeEnvPath(i.PATH ?? "")
				},
				encoding: "utf-8",
				shell: !0
			});
			if (a != null) throw this._logger.error(c), a;
			if (o != null && o !== 0) throw this._logger.error(c), Error(`Command ${e} exited with code ${o}`);
			return s.trim();
		}
		async spawnLog(e, n = [], r = void 0, i = "ignore") {
			return this._logger.info(`Executing: ${e} with args: ${n}`), new Promise((a, o) => {
				try {
					let s = {
						stdio: i,
						env: r,
						detached: !0
					}, c = (0, t.spawn)(e, n, s);
					c.on("error", (e) => {
						o(e);
					}), c.unref(), c.pid !== void 0 && a(!0);
				} catch (e) {
					o(e);
				}
			});
		}
	};
})), An = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.FileWithEmbeddedBlockMapDifferentialDownloader = void 0;
	var t = we(), n = Tn(), r = F("zlib");
	e.FileWithEmbeddedBlockMapDifferentialDownloader = class extends n.DifferentialDownloader {
		async download() {
			let e = this.blockAwareFileInfo, t = e.size, n = t - (e.blockMapSize + 4);
			this.fileMetadataBuffer = await this.readRemoteBytes(n, t - 1);
			let r = i(this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4));
			await this.doDownload(await a(this.options.oldFile), r);
		}
	};
	function i(e) {
		return JSON.parse((0, r.inflateRawSync)(e).toString());
	}
	async function a(e) {
		let n = await (0, t.open)(e, "r");
		try {
			let e = (await (0, t.fstat)(n)).size, r = Buffer.allocUnsafe(4);
			await (0, t.read)(n, r, 0, r.length, e - r.length);
			let a = Buffer.allocUnsafe(r.readUInt32BE(0));
			return await (0, t.read)(n, a, 0, a.length, e - r.length - a.length), await (0, t.close)(n), i(a);
		} catch (e) {
			throw await (0, t.close)(n), e;
		}
	}
})), jn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.AppImageUpdater = void 0;
	var t = K(), n = F("child_process"), r = we(), i = F("fs"), a = F("path"), o = kn(), s = An(), c = pn(), l = Dn();
	e.AppImageUpdater = class extends o.BaseUpdater {
		constructor(e, t) {
			super(e, t);
		}
		isUpdaterActive() {
			return process.env.APPIMAGE == null && !this.forceDevUpdateConfig ? (process.env.SNAP == null ? this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage") : this._logger.info("SNAP env is defined, updater is disabled"), !1) : super.isUpdaterActive();
		}
		doDownloadUpdate(e) {
			let n = e.updateInfoAndProvider.provider, i = (0, c.findFile)(n.resolveFiles(e.updateInfoAndProvider.info), "AppImage", [
				"rpm",
				"deb",
				"pacman"
			]);
			return this.executeDownload({
				fileExtension: "AppImage",
				fileInfo: i,
				downloadUpdateOptions: e,
				task: async (a, o) => {
					let s = process.env.APPIMAGE;
					if (s == null) throw (0, t.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
					(e.disableDifferentialDownload || await this.downloadDifferential(i, s, a, n, e)) && await this.httpExecutor.download(i.url, a, o), await (0, r.chmod)(a, 493);
				}
			});
		}
		async downloadDifferential(e, t, n, r, i) {
			try {
				let a = {
					newUrl: e.url,
					oldFile: t,
					logger: this._logger,
					newFile: n,
					isUseMultipleRangeRequest: r.isUseMultipleRangeRequest,
					requestHeaders: i.requestHeaders,
					cancellationToken: i.cancellationToken
				};
				return this.listenerCount(l.DOWNLOAD_PROGRESS) > 0 && (a.onProgress = (e) => this.emit(l.DOWNLOAD_PROGRESS, e)), await new s.FileWithEmbeddedBlockMapDifferentialDownloader(e.info, this.httpExecutor, a).download(), !1;
			} catch (e) {
				return this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`), process.platform === "linux";
			}
		}
		doInstall(e) {
			let r = process.env.APPIMAGE;
			if (r == null) throw (0, t.newError)("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND");
			if (!a.isAbsolute(r) || r.includes("\0")) throw (0, t.newError)(`APPIMAGE env is not a valid absolute path: "${r}"`, "ERR_UPDATER_OLD_FILE_NOT_FOUND");
			(0, i.unlinkSync)(r);
			let o, s = a.basename(r), c = this.installerPath;
			if (c == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			o = a.basename(c) === s || !/\d+\.\d+\.\d+/.test(s) ? r : a.join(a.dirname(r), a.basename(c)), (0, n.execFileSync)("mv", [
				"-f",
				c,
				o
			]), o !== r && this.emit("appimage-filename-updated", o);
			let l = {
				...process.env,
				APPIMAGE_SILENT_INSTALL: "true"
			};
			return e.isForceRunAfter ? this.spawnLog(o, [], l) : (l.APPIMAGE_EXIT_AFTER_INSTALL = "true", (0, n.execFileSync)(o, [], { env: l })), !0;
		}
	};
})), Mn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.LinuxUpdater = void 0;
	var t = kn(), n = /^[a-zA-Z0-9_-]+$/;
	e.LinuxUpdater = class extends t.BaseUpdater {
		constructor(e, t) {
			super(e, t);
		}
		isRunningAsRoot() {
			return process.getuid?.call(process) === 0;
		}
		get installerPath() {
			let e = super.installerPath;
			return e == null ? null : e.replace(/\\/g, "\\\\").replace(/([`$!" ;|&()<>])/g, "\\$1").replace(/[\n\r]/g, "");
		}
		runCommandWithSudoIfNeeded(e) {
			if (this.isRunningAsRoot()) return this._logger.info("Running as root, no need to use sudo"), this.spawnSyncLog(e[0], e.slice(1));
			let { name: t } = this.app, n = `"${t.replace(/["`$\\!\n\r;|&<>(){}*?[\]#~]/g, "")} would like to update"`, r = this.sudoWithArgs(n);
			this._logger.info(`Running as non-root user, using sudo to install: ${r}`);
			let i = "\"";
			return (/pkexec/i.test(r[0]) || r[0] === "sudo") && (i = ""), this.spawnSyncLog(r[0], [
				...r.length > 1 ? r.slice(1) : [],
				`${i}/bin/bash`,
				"-c",
				`'${e.join(" ")}'${i}`
			]);
		}
		sudoWithArgs(e) {
			let t = this.determineSudoCommand(), n = [t];
			return /kdesudo/i.test(t) ? (n.push("--comment", e), n.push("-c")) : /gksudo/i.test(t) ? n.push("--message", e) : /pkexec/i.test(t) && n.push("--disable-internal-agent"), n;
		}
		hasCommand(e) {
			try {
				return this.spawnSyncLog("command", ["-v", e]), !0;
			} catch {
				return !1;
			}
		}
		determineSudoCommand() {
			for (let e of [
				"gksudo",
				"kdesudo",
				"pkexec",
				"beesu"
			]) if (this.hasCommand(e)) return e;
			return "sudo";
		}
		detectPackageManager(e) {
			let t = e, r = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER?.trim();
			r && (n.test(r) ? t = [r] : this._logger.warn(`ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER "${r}" contains unsafe characters. Ignoring override.`));
			for (let e of t) if (this.hasCommand(e)) return e;
			let i = r ? `ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER override "${r}", ` : "", a = e[0];
			return this._logger.warn(`No package manager found in the list: ${i}${e.join(", ")}. Utilizing default: ${a}`), a;
		}
	};
})), Nn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.DebUpdater = void 0;
	var t = pn(), n = Dn(), r = Mn();
	e.DebUpdater = class e extends r.LinuxUpdater {
		constructor(e, t) {
			super(e, t);
		}
		doDownloadUpdate(e) {
			let r = e.updateInfoAndProvider.provider, i = (0, t.findFile)(r.resolveFiles(e.updateInfoAndProvider.info), "deb", [
				"AppImage",
				"rpm",
				"pacman"
			]);
			return this.executeDownload({
				fileExtension: "deb",
				fileInfo: i,
				downloadUpdateOptions: e,
				task: async (e, t) => {
					this.listenerCount(n.DOWNLOAD_PROGRESS) > 0 && (t.onProgress = (e) => this.emit(n.DOWNLOAD_PROGRESS, e)), await this.httpExecutor.download(i.url, e, t);
				}
			});
		}
		doInstall(t) {
			let n = this.installerPath;
			if (n == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			if (!this.hasCommand("dpkg") && !this.hasCommand("apt")) return this.dispatchError(/* @__PURE__ */ Error("Neither dpkg nor apt command found. Cannot install .deb package.")), !1;
			let r = this.detectPackageManager(["dpkg", "apt"]);
			try {
				e.installWithCommandRunner(r, n, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
			} catch (e) {
				return this.dispatchError(e), !1;
			}
			return t.isForceRunAfter && this.app.relaunch(), !0;
		}
		static installWithCommandRunner(e, t, n, r) {
			if (e === "dpkg") try {
				n([
					"dpkg",
					"-i",
					t
				]);
			} catch (e) {
				r.warn(e.message ?? e), r.warn("dpkg installation failed, trying to fix broken dependencies with apt-get"), n([
					"apt-get",
					"install",
					"-f",
					"-y"
				]);
			}
			else if (e === "apt") r.warn("Using apt to install a local .deb. This may fail for unsigned packages unless properly configured."), n([
				"apt",
				"install",
				"-y",
				"--allow-unauthenticated",
				"--allow-downgrades",
				"--allow-change-held-packages",
				t
			]);
			else throw Error(`Package manager ${e} not supported`);
		}
	};
})), Pn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.PacmanUpdater = void 0;
	var t = Dn(), n = pn(), r = Mn();
	e.PacmanUpdater = class e extends r.LinuxUpdater {
		constructor(e, t) {
			super(e, t);
		}
		doDownloadUpdate(e) {
			let r = e.updateInfoAndProvider.provider, i = (0, n.findFile)(r.resolveFiles(e.updateInfoAndProvider.info), "pacman", [
				"AppImage",
				"deb",
				"rpm"
			]);
			return this.executeDownload({
				fileExtension: "pacman",
				fileInfo: i,
				downloadUpdateOptions: e,
				task: async (e, n) => {
					this.listenerCount(t.DOWNLOAD_PROGRESS) > 0 && (n.onProgress = (e) => this.emit(t.DOWNLOAD_PROGRESS, e)), await this.httpExecutor.download(i.url, e, n);
				}
			});
		}
		doInstall(t) {
			let n = this.installerPath;
			if (n == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			try {
				e.installWithCommandRunner(n, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
			} catch (e) {
				return this.dispatchError(e), !1;
			}
			return t.isForceRunAfter && this.app.relaunch(), !0;
		}
		static installWithCommandRunner(e, t, n) {
			try {
				t([
					"pacman",
					"-U",
					"--noconfirm",
					e
				]);
			} catch (r) {
				n.warn(r.message ?? r), n.warn("pacman installation failed, attempting to update package database and retry");
				try {
					t([
						"pacman",
						"-Sy",
						"--noconfirm"
					]), t([
						"pacman",
						"-U",
						"--noconfirm",
						e
					]);
				} catch (e) {
					throw n.error("Retry after pacman -Sy failed"), e;
				}
			}
		}
	};
})), Fn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.RpmUpdater = void 0;
	var t = Dn(), n = pn(), r = Mn();
	e.RpmUpdater = class e extends r.LinuxUpdater {
		constructor(e, t) {
			super(e, t);
		}
		doDownloadUpdate(e) {
			let r = e.updateInfoAndProvider.provider, i = (0, n.findFile)(r.resolveFiles(e.updateInfoAndProvider.info), "rpm", [
				"AppImage",
				"deb",
				"pacman"
			]);
			return this.executeDownload({
				fileExtension: "rpm",
				fileInfo: i,
				downloadUpdateOptions: e,
				task: async (e, n) => {
					this.listenerCount(t.DOWNLOAD_PROGRESS) > 0 && (n.onProgress = (e) => this.emit(t.DOWNLOAD_PROGRESS, e)), await this.httpExecutor.download(i.url, e, n);
				}
			});
		}
		doInstall(t) {
			let n = this.installerPath;
			if (n == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			let r = this.detectPackageManager([
				"zypper",
				"dnf",
				"yum",
				"rpm"
			]);
			try {
				e.installWithCommandRunner(r, n, this.runCommandWithSudoIfNeeded.bind(this), this._logger);
			} catch (e) {
				return this.dispatchError(e), !1;
			}
			return t.isForceRunAfter && this.app.relaunch(), !0;
		}
		static installWithCommandRunner(e, t, n, r) {
			if (e === "zypper") return n([
				"zypper",
				"--non-interactive",
				"--no-refresh",
				"install",
				"--allow-unsigned-rpm",
				"-f",
				t
			]);
			if (e === "dnf") return n([
				"dnf",
				"install",
				"--nogpgcheck",
				"-y",
				t
			]);
			if (e === "yum") return n([
				"yum",
				"install",
				"--nogpgcheck",
				"-y",
				t
			]);
			if (e === "rpm") return r.warn("Installing with rpm only (no dependency resolution)."), n([
				"rpm",
				"-Uvh",
				"--replacepkgs",
				"--replacefiles",
				"--nodeps",
				t
			]);
			throw Error(`Package manager ${e} not supported`);
		}
	};
})), In = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.MacUpdater = void 0;
	var t = K(), n = we(), r = F("fs"), i = F("path"), a = F("http"), o = On(), s = pn(), c = F("child_process"), l = F("crypto");
	e.MacUpdater = class e extends o.AppUpdater {
		constructor(e, t) {
			super(e, t), this.nativeUpdater = F("electron").autoUpdater, this.squirrelDownloadedUpdate = !1, this.nativeUpdater.on("error", (e) => {
				this._logger.warn(e), this.emit("error", e);
			}), this.nativeUpdater.on("update-downloaded", () => {
				this.squirrelDownloadedUpdate = !0, this.debug("nativeUpdater.update-downloaded");
			});
		}
		static filterFilesForArch(e, t) {
			let n = (e) => e.url.pathname.includes("arm64") || e.info.url?.includes("arm64");
			return t && e.some(n) ? e.filter((e) => t === n(e)) : e.filter((e) => !n(e));
		}
		debug(e) {
			this._logger.debug != null && this._logger.debug(e);
		}
		closeServerIfExists() {
			this.server && (this.debug("Closing proxy server"), this.server.close((e) => {
				e && this.debug("proxy server wasn't already open, probably attempted closing again as a safety check before quit");
			}));
		}
		async doDownloadUpdate(r) {
			let a = r.updateInfoAndProvider.provider.resolveFiles(r.updateInfoAndProvider.info), o = this._logger, l = "sysctl.proc_translated", u = !1;
			try {
				this.debug("Checking for macOS Rosetta environment"), u = (0, c.execFileSync)("sysctl", [l], { encoding: "utf8" }).includes(`${l}: 1`), o.info(`Checked for macOS Rosetta environment (isRosetta=${u})`);
			} catch (e) {
				o.warn(`sysctl shell command to check for macOS Rosetta environment failed: ${e}`);
			}
			let d = !1;
			try {
				this.debug("Checking for arm64 in uname");
				let e = (0, c.execFileSync)("uname", ["-a"], { encoding: "utf8" }).includes("ARM");
				o.info(`Checked 'uname -a': arm64=${e}`), d ||= e;
			} catch (e) {
				o.warn(`uname shell command to check for arm64 failed: ${e}`);
			}
			d = d || process.arch === "arm64" || u, a = e.filterFilesForArch(a, d);
			let f = (0, s.findFile)(a, "zip", ["pkg", "dmg"]);
			if (f == null) throw (0, t.newError)(`ZIP file not provided: ${(0, t.safeStringifyJson)(a)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND");
			let p = r.updateInfoAndProvider.provider, m = "update.zip";
			return this.executeDownload({
				fileExtension: "zip",
				fileInfo: f,
				downloadUpdateOptions: r,
				task: async (e, t) => {
					let a = i.join(this.downloadedUpdateHelper.cacheDir, m), s = () => (0, n.pathExistsSync)(a) ? !r.disableDifferentialDownload : (o.info("Unable to locate previous update.zip for differential download (is this first install?), falling back to full download"), !1), c = !0;
					s() && (c = await this.differentialDownloadInstaller(f, r, e, p, m)), c && await this.httpExecutor.download(f.url, e, t);
				},
				done: async (e) => {
					if (!r.disableDifferentialDownload) try {
						let t = i.join(this.downloadedUpdateHelper.cacheDir, m);
						await (0, n.copyFile)(e.downloadedFile, t);
					} catch (e) {
						this._logger.warn(`Unable to copy file for caching for future differential downloads: ${e.message}`);
					}
					return this.updateDownloaded(f, e);
				}
			});
		}
		async updateDownloaded(e, t) {
			let i = t.downloadedFile, o = e.info.size ?? (await (0, n.stat)(i)).size, s = this._logger, c = `fileToProxy=${e.url.href}`;
			this.closeServerIfExists(), this.debug(`Creating proxy server for native Squirrel.Mac (${c})`), this.server = (0, a.createServer)(), this.debug(`Proxy server for native Squirrel.Mac is created (${c})`), this.server.on("close", () => {
				s.info(`Proxy server for native Squirrel.Mac is closed (${c})`);
			});
			let u = (e) => {
				let t = e.address();
				return typeof t == "string" ? t : `http://127.0.0.1:${t?.port}`;
			};
			return await new Promise((e, n) => {
				let a = (0, l.randomBytes)(64).toString("base64").replace(/\//g, "_").replace(/\+/g, "-"), d = Buffer.from(`autoupdater:${a}`, "ascii"), f = `/${(0, l.randomBytes)(64).toString("hex")}.zip`;
				this.server.on("request", (t, c) => {
					let l = t.url;
					if (s.info(`${l} requested`), l === "/") {
						if (!t.headers.authorization || t.headers.authorization.indexOf("Basic ") === -1) {
							c.statusCode = 401, c.statusMessage = "Invalid Authentication Credentials", c.end(), s.warn("No authenthication info");
							return;
						}
						let e = t.headers.authorization.split(" ")[1], [n, r] = Buffer.from(e, "base64").toString("ascii").split(":");
						if (n !== "autoupdater" || r !== a) {
							c.statusCode = 401, c.statusMessage = "Invalid Authentication Credentials", c.end(), s.warn("Invalid authenthication credentials");
							return;
						}
						let i = Buffer.from(`{ "url": "${u(this.server)}${f}" }`);
						c.writeHead(200, {
							"Content-Type": "application/json",
							"Content-Length": i.length
						}), c.end(i);
						return;
					}
					if (!l.startsWith(f)) {
						s.warn(`${l} requested, but not supported`), c.writeHead(404), c.end();
						return;
					}
					s.info(`${f} requested by Squirrel.Mac, pipe ${i}`);
					let d = !1;
					c.on("finish", () => {
						d || (this.nativeUpdater.removeListener("error", n), e([]));
					});
					let p = (0, r.createReadStream)(i);
					p.on("error", (e) => {
						try {
							c.end();
						} catch (e) {
							s.warn(`cannot end response: ${e}`);
						}
						d = !0, this.nativeUpdater.removeListener("error", n), n(/* @__PURE__ */ Error(`Cannot pipe "${i}": ${e}`));
					}), c.writeHead(200, {
						"Content-Type": "application/zip",
						"Content-Length": o
					}), p.pipe(c);
				}), this.debug(`Proxy server for native Squirrel.Mac is starting to listen (${c})`), this.server.listen(0, "127.0.0.1", () => {
					this.debug(`Proxy server for native Squirrel.Mac is listening (address=${u(this.server)}, ${c})`), this.nativeUpdater.setFeedURL({
						url: u(this.server),
						headers: {
							"Cache-Control": "no-cache",
							Authorization: `Basic ${d.toString("base64")}`
						}
					}), this.dispatchUpdateDownloaded(t), this.autoInstallOnAppQuit ? (this.nativeUpdater.once("error", n), this.nativeUpdater.checkForUpdates()) : e([]);
				});
			});
		}
		handleUpdateDownloaded() {
			this.autoRunAppAfterInstall ? this.nativeUpdater.quitAndInstall() : this.app.quit(), this.closeServerIfExists();
		}
		quitAndInstall() {
			this.squirrelDownloadedUpdate ? this.handleUpdateDownloaded() : (this.nativeUpdater.on("update-downloaded", () => this.handleUpdateDownloaded()), this.autoInstallOnAppQuit || this.nativeUpdater.checkForUpdates());
		}
	};
})), Ln = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.verifySignature = o;
	var t = K(), n = F("child_process"), r = F("os"), i = F("path");
	function a(e, t) {
		return [
			"set \"PSModulePath=\" & chcp 65001 >NUL & powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-InputFormat",
				"None",
				"-Command",
				e
			],
			{
				shell: !0,
				timeout: t
			}
		];
	}
	function o(e, r, o) {
		return new Promise((l, u) => {
			let d = r.replace(/'/g, "''");
			o.info(`Verifying signature ${d}`), (0, n.execFile)(...a(`"Get-AuthenticodeSignature -LiteralPath '${d}' | ConvertTo-Json -Compress"`, 20 * 1e3), (n, a, d) => {
				try {
					if (n != null || d) {
						c(o, n, d, u), l(null);
						return;
					}
					let f = s(a);
					if (f.Status === 0) {
						try {
							let e = i.normalize(f.Path), t = i.normalize(r);
							if (o.info(`LiteralPath: ${e}. Update Path: ${t}`), e !== t) {
								c(o, /* @__PURE__ */ Error(`LiteralPath of ${e} is different than ${t}`), d, u), l(null);
								return;
							}
						} catch (e) {
							o.warn(`Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: ${e.message ?? e.stack}`);
						}
						let n = (0, t.parseDn)(f.SignerCertificate.Subject), a = !1;
						for (let r of e) {
							let e = (0, t.parseDn)(r);
							if (e.size ? a = Array.from(e.keys()).every((t) => e.get(t) === n.get(t)) : r === n.get("CN") && (o.warn(`Signature validated using only CN ${r}. Please add your full Distinguished Name (DN) to publisherNames configuration`), a = !0), a) {
								l(null);
								return;
							}
						}
					}
					let p = `publisherNames: ${e.join(" | ")}, raw info: ` + JSON.stringify(f, (e, t) => e === "RawData" ? void 0 : t, 2);
					o.warn(`Sign verification failed, installer signed with incorrect certificate: ${p}`), l(p);
				} catch (e) {
					c(o, e, null, u), l(null);
					return;
				}
			});
		});
	}
	function s(e) {
		let t = JSON.parse(e);
		delete t.PrivateKey, delete t.IsOSBinary, delete t.SignatureType;
		let n = t.SignerCertificate;
		return n != null && (delete n.Archived, delete n.Extensions, delete n.Handle, delete n.HasPrivateKey, delete n.SubjectName), t;
	}
	function c(e, t, r, i) {
		if (l()) {
			e.warn(`Cannot execute Get-AuthenticodeSignature: ${t || r}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
			return;
		}
		try {
			(0, n.execFileSync)(...a("ConvertTo-Json test", 10 * 1e3));
		} catch (t) {
			e.warn(`Cannot execute ConvertTo-Json: ${t.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`);
			return;
		}
		t != null && i(t), r && i(/* @__PURE__ */ Error(`Cannot execute Get-AuthenticodeSignature, stderr: ${r}. Failing signature validation due to unknown stderr.`));
	}
	function l() {
		let e = r.release();
		return e.startsWith("6.") && !e.startsWith("6.3");
	}
})), Rn = /* @__PURE__ */ A(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.NsisUpdater = void 0;
	var t = K(), n = F("path"), r = kn(), i = An(), a = Dn(), o = pn(), s = we(), c = Ln(), l = F("url");
	e.NsisUpdater = class extends r.BaseUpdater {
		constructor(e, t) {
			super(e, t), this._verifyUpdateCodeSignature = (e, t) => (0, c.verifySignature)(e, t, this._logger);
		}
		get verifyUpdateCodeSignature() {
			return this._verifyUpdateCodeSignature;
		}
		set verifyUpdateCodeSignature(e) {
			e && (this._verifyUpdateCodeSignature = e);
		}
		doDownloadUpdate(e) {
			let n = e.updateInfoAndProvider.provider, r = (0, o.findFile)(n.resolveFiles(e.updateInfoAndProvider.info), "exe");
			return this.executeDownload({
				fileExtension: "exe",
				downloadUpdateOptions: e,
				fileInfo: r,
				task: async (i, a, o, c) => {
					let u = r.packageInfo, d = u != null && o != null;
					if (d && e.disableWebInstaller) throw (0, t.newError)(`Unable to download new version ${e.updateInfoAndProvider.info.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED");
					!d && !e.disableWebInstaller && this._logger.warn("disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version."), (d || e.disableDifferentialDownload || await this.differentialDownloadInstaller(r, e, i, n, t.CURRENT_APP_INSTALLER_FILE_NAME)) && await this.httpExecutor.download(r.url, i, a);
					let f = await this.verifySignature(i);
					if (f != null) throw await c(), (0, t.newError)(`New version ${e.updateInfoAndProvider.info.version} is not signed by the application owner: ${f}`, "ERR_UPDATER_INVALID_SIGNATURE");
					if (d && await this.differentialDownloadWebPackage(e, u, o, n)) try {
						await this.httpExecutor.download(new l.URL(u.path), o, {
							headers: e.requestHeaders,
							cancellationToken: e.cancellationToken,
							sha512: u.sha512
						});
					} catch (e) {
						try {
							await (0, s.unlink)(o);
						} catch {}
						throw e;
					}
				}
			});
		}
		async verifySignature(e) {
			let t;
			try {
				if (t = (await this.configOnDisk.value).publisherName, t == null) return null;
			} catch (e) {
				if (e.code === "ENOENT") return null;
				throw e;
			}
			return await this._verifyUpdateCodeSignature(Array.isArray(t) ? t : [t], e);
		}
		doInstall(e) {
			let t = this.installerPath;
			if (t == null) return this.dispatchError(/* @__PURE__ */ Error("No update filepath provided, can't quit and install")), !1;
			let r = ["--updated"];
			e.isSilent && r.push("/S"), e.isForceRunAfter && r.push("--force-run"), this.installDirectory && r.push(`/D=${this.installDirectory}`);
			let i = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile;
			i != null && r.push(`--package-file=${i}`);
			let a = () => {
				this.spawnLog(n.join(process.resourcesPath, "elevate.exe"), [t].concat(r)).catch((e) => this.dispatchError(e));
			};
			return e.isAdminRightsRequired ? (this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe"), a(), !0) : (this.spawnLog(t, r).catch((e) => {
				let n = e.code;
				this._logger.info(`Cannot run installer: error code: ${n}, error message: "${e.message}", will be executed again using elevate if EACCES, and will try to use electron.shell.openItem if ENOENT`), n === "UNKNOWN" || n === "EACCES" ? a() : n === "ENOENT" ? F("electron").shell.openPath(t).catch((e) => this.dispatchError(e)) : this.dispatchError(e);
			}), !0);
		}
		async differentialDownloadWebPackage(e, r, o, s) {
			if (r.blockMapSize == null) return !0;
			try {
				let c = {
					newUrl: new l.URL(r.path),
					oldFile: n.join(this.downloadedUpdateHelper.cacheDir, t.CURRENT_APP_PACKAGE_FILE_NAME),
					logger: this._logger,
					newFile: o,
					requestHeaders: this.requestHeaders,
					isUseMultipleRangeRequest: s.isUseMultipleRangeRequest,
					cancellationToken: e.cancellationToken
				};
				this.listenerCount(a.DOWNLOAD_PROGRESS) > 0 && (c.onProgress = (e) => this.emit(a.DOWNLOAD_PROGRESS, e)), await new i.FileWithEmbeddedBlockMapDifferentialDownloader(r, this.httpExecutor, c).download();
			} catch (e) {
				return this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`), process.platform === "win32";
			}
			return !1;
		}
	};
})), zn = /* @__PURE__ */ A(((e) => {
	var t = e && e.__createBinding || (Object.create ? (function(e, t, n, r) {
		r === void 0 && (r = n);
		var i = Object.getOwnPropertyDescriptor(t, n);
		(!i || ("get" in i ? !t.__esModule : i.writable || i.configurable)) && (i = {
			enumerable: !0,
			get: function() {
				return t[n];
			}
		}), Object.defineProperty(e, r, i);
	}) : (function(e, t, n, r) {
		r === void 0 && (r = n), e[r] = t[n];
	})), n = e && e.__exportStar || function(e, n) {
		for (var r in e) r !== "default" && !Object.prototype.hasOwnProperty.call(n, r) && t(n, e, r);
	};
	Object.defineProperty(e, "__esModule", { value: !0 }), e.NsisUpdater = e.MacUpdater = e.RpmUpdater = e.PacmanUpdater = e.DebUpdater = e.AppImageUpdater = e.Provider = e.NoOpLogger = e.AppUpdater = e.BaseUpdater = void 0;
	var r = we(), i = F("path"), a = kn();
	Object.defineProperty(e, "BaseUpdater", {
		enumerable: !0,
		get: function() {
			return a.BaseUpdater;
		}
	});
	var o = On();
	Object.defineProperty(e, "AppUpdater", {
		enumerable: !0,
		get: function() {
			return o.AppUpdater;
		}
	}), Object.defineProperty(e, "NoOpLogger", {
		enumerable: !0,
		get: function() {
			return o.NoOpLogger;
		}
	});
	var s = pn();
	Object.defineProperty(e, "Provider", {
		enumerable: !0,
		get: function() {
			return s.Provider;
		}
	});
	var c = jn();
	Object.defineProperty(e, "AppImageUpdater", {
		enumerable: !0,
		get: function() {
			return c.AppImageUpdater;
		}
	});
	var l = Nn();
	Object.defineProperty(e, "DebUpdater", {
		enumerable: !0,
		get: function() {
			return l.DebUpdater;
		}
	});
	var u = Pn();
	Object.defineProperty(e, "PacmanUpdater", {
		enumerable: !0,
		get: function() {
			return u.PacmanUpdater;
		}
	});
	var d = Fn();
	Object.defineProperty(e, "RpmUpdater", {
		enumerable: !0,
		get: function() {
			return d.RpmUpdater;
		}
	});
	var f = In();
	Object.defineProperty(e, "MacUpdater", {
		enumerable: !0,
		get: function() {
			return f.MacUpdater;
		}
	});
	var p = Rn();
	Object.defineProperty(e, "NsisUpdater", {
		enumerable: !0,
		get: function() {
			return p.NsisUpdater;
		}
	}), n(Dn(), e);
	var m;
	function h() {
		if (process.platform === "win32") m = new (Rn()).NsisUpdater();
		else if (process.platform === "darwin") m = new (In()).MacUpdater();
		else {
			m = new (jn()).AppImageUpdater();
			try {
				let e = i.join(process.resourcesPath, "package-type");
				if (!(0, r.existsSync)(e)) return m;
				switch ((0, r.readFileSync)(e).toString().trim()) {
					case "deb":
						m = new (Nn()).DebUpdater();
						break;
					case "rpm":
						m = new (Fn()).RpmUpdater();
						break;
					case "pacman":
						m = new (Pn()).PacmanUpdater();
						break;
					default: break;
				}
			} catch (e) {
				console.warn("Unable to detect 'package-type' for autoUpdater (rpm/deb/pacman support). If you'd like to expand support, please consider contributing to electron-builder", e.message);
			}
		}
		return m;
	}
	Object.defineProperty(e, "autoUpdater", {
		enumerable: !0,
		get: () => m || h()
	});
})), Bn = /* @__PURE__ */ A(((e, t) => {
	var n = F("path").sep || "/";
	t.exports = r;
	function r(e) {
		if (typeof e != "string" || e.length <= 7 || e.substring(0, 7) != "file://") throw TypeError("must pass in a file:// URI to convert to a file path");
		var t = decodeURI(e.substring(7)), r = t.indexOf("/"), i = t.substring(0, r), a = t.substring(r + 1);
		return i == "localhost" && (i = ""), i &&= n + n + i, a = a.replace(/^(.+)\|/, "$1:"), n == "\\" && (a = a.replace(/\//g, "\\")), /^.+\:/.test(a) || (a = n + a), i + a;
	}
})), Vn = /* @__PURE__ */ A(((e, t) => {
	var n = F("fs"), r = F("path"), i = Bn(), a = r.join, o = r.dirname, s = n.accessSync && function(e) {
		try {
			n.accessSync(e);
		} catch {
			return !1;
		}
		return !0;
	} || n.existsSync || r.existsSync, c = {
		arrow: process.env.NODE_BINDINGS_ARROW || " → ",
		compiled: process.env.NODE_BINDINGS_COMPILED_DIR || "compiled",
		platform: process.platform,
		arch: process.arch,
		nodePreGyp: "node-v" + process.versions.modules + "-" + process.platform + "-" + process.arch,
		version: process.versions.node,
		bindings: "bindings.node",
		try: [
			[
				"module_root",
				"build",
				"bindings"
			],
			[
				"module_root",
				"build",
				"Debug",
				"bindings"
			],
			[
				"module_root",
				"build",
				"Release",
				"bindings"
			],
			[
				"module_root",
				"out",
				"Debug",
				"bindings"
			],
			[
				"module_root",
				"Debug",
				"bindings"
			],
			[
				"module_root",
				"out",
				"Release",
				"bindings"
			],
			[
				"module_root",
				"Release",
				"bindings"
			],
			[
				"module_root",
				"build",
				"default",
				"bindings"
			],
			[
				"module_root",
				"compiled",
				"version",
				"platform",
				"arch",
				"bindings"
			],
			[
				"module_root",
				"addon-build",
				"release",
				"install-root",
				"bindings"
			],
			[
				"module_root",
				"addon-build",
				"debug",
				"install-root",
				"bindings"
			],
			[
				"module_root",
				"addon-build",
				"default",
				"install-root",
				"bindings"
			],
			[
				"module_root",
				"lib",
				"binding",
				"nodePreGyp",
				"bindings"
			]
		]
	};
	function l(t) {
		typeof t == "string" ? t = { bindings: t } : t ||= {}, Object.keys(c).map(function(e) {
			e in t || (t[e] = c[e]);
		}), t.module_root ||= e.getRoot(e.getFileName()), r.extname(t.bindings) != ".node" && (t.bindings += ".node");
		for (var n = typeof __webpack_require__ == "function" ? __non_webpack_require__ : F, i = [], o = 0, s = t.try.length, l, u, d; o < s; o++) {
			l = a.apply(null, t.try[o].map(function(e) {
				return t[e] || e;
			})), i.push(l);
			try {
				return u = t.path ? n.resolve(l) : n(l), t.path || (u.path = l), u;
			} catch (e) {
				if (e.code !== "MODULE_NOT_FOUND" && e.code !== "QUALIFIED_PATH_RESOLUTION_FAILED" && !/not find/i.test(e.message)) throw e;
			}
		}
		throw d = /* @__PURE__ */ Error("Could not locate the bindings file. Tried:\n" + i.map(function(e) {
			return t.arrow + e;
		}).join("\n")), d.tries = i, d;
	}
	t.exports = e = l, e.getFileName = function(e) {
		var t = Error.prepareStackTrace, n = Error.stackTraceLimit, r = {}, a;
		return Error.stackTraceLimit = 10, Error.prepareStackTrace = function(t, n) {
			for (var r = 0, i = n.length; r < i; r++) if (a = n[r].getFileName(), a !== __filename) if (e) {
				if (a !== e) return;
			} else return;
		}, Error.captureStackTrace(r), r.stack, Error.prepareStackTrace = t, Error.stackTraceLimit = n, a.indexOf("file://") === 0 && (a = i(a)), a;
	}, e.getRoot = function(e) {
		for (var t = o(e), n;;) {
			if (t === "." && (t = process.cwd()), s(a(t, "package.json")) || s(a(t, "node_modules"))) return t;
			if (n === t) throw Error("Could not find module root given file: \"" + e + "\". Do you have a `package.json` file? ");
			n = t, t = a(t, "..");
		}
	};
})), Hn = /* @__PURE__ */ A(((e, t) => {
	t.exports = Vn()("register-protocol-handler").registerProtocolHandler;
})), Un = /* @__PURE__ */ A(((e, t) => {
	var n;
	try {
		let { app: e } = F("electron");
		n = e.setAsDefaultProtocolClient.bind(e);
	} catch {
		try {
			n = Hn();
		} catch {}
	}
	typeof n != "function" && (n = () => !1);
	function r() {
		return typeof process < "u" ? process.pid : null;
	}
	t.exports = {
		pid: r,
		register: n,
		uuid: () => {
			let e = "";
			for (let t = 0; t < 32; t += 1) {
				(t === 8 || t === 12 || t === 16 || t === 20) && (e += "-");
				let n;
				if (t === 12) n = 4;
				else {
					let e = Math.random() * 16 | 0;
					n = t === 16 ? e & 3 | 0 : e;
				}
				e += n.toString(16);
			}
			return e;
		}
	};
})), Wn = /* @__PURE__ */ A(((e, t) => {
	var n = {};
	t.exports = n;
	function r(e) {
		return e < 0 ? -1 : 1;
	}
	function i(e) {
		return e % 1 == .5 && !(e & 1) ? Math.floor(e) : Math.round(e);
	}
	function a(e, t) {
		t.unsigned || --e;
		let n = t.unsigned ? 0 : -(2 ** e), a = 2 ** e - 1, o = t.moduloBitLength ? 2 ** t.moduloBitLength : 2 ** e, s = t.moduloBitLength ? 2 ** (t.moduloBitLength - 1) : 2 ** (e - 1);
		return function(e, c) {
			c ||= {};
			let l = +e;
			if (c.enforceRange) {
				if (!Number.isFinite(l)) throw TypeError("Argument is not a finite number");
				if (l = r(l) * Math.floor(Math.abs(l)), l < n || l > a) throw TypeError("Argument is not in byte range");
				return l;
			}
			if (!isNaN(l) && c.clamp) return l = i(l), l < n && (l = n), l > a && (l = a), l;
			if (!Number.isFinite(l) || l === 0) return 0;
			if (l = r(l) * Math.floor(Math.abs(l)), l %= o, !t.unsigned && l >= s) return l - o;
			if (t.unsigned) {
				if (l < 0) l += o;
				else if (l === -0) return 0;
			}
			return l;
		};
	}
	n.void = function() {}, n.boolean = function(e) {
		return !!e;
	}, n.byte = a(8, { unsigned: !1 }), n.octet = a(8, { unsigned: !0 }), n.short = a(16, { unsigned: !1 }), n["unsigned short"] = a(16, { unsigned: !0 }), n.long = a(32, { unsigned: !1 }), n["unsigned long"] = a(32, { unsigned: !0 }), n["long long"] = a(32, {
		unsigned: !1,
		moduloBitLength: 64
	}), n["unsigned long long"] = a(32, {
		unsigned: !0,
		moduloBitLength: 64
	}), n.double = function(e) {
		let t = +e;
		if (!Number.isFinite(t)) throw TypeError("Argument is not a finite floating-point value");
		return t;
	}, n["unrestricted double"] = function(e) {
		let t = +e;
		if (isNaN(t)) throw TypeError("Argument is NaN");
		return t;
	}, n.float = n.double, n["unrestricted float"] = n["unrestricted double"], n.DOMString = function(e, t) {
		return t ||= {}, t.treatNullAsEmptyString && e === null ? "" : String(e);
	}, n.ByteString = function(e, t) {
		let n = String(e), r;
		for (let e = 0; (r = n.codePointAt(e)) !== void 0; ++e) if (r > 255) throw TypeError("Argument is not a valid bytestring");
		return n;
	}, n.USVString = function(e) {
		let t = String(e), n = t.length, r = [];
		for (let e = 0; e < n; ++e) {
			let i = t.charCodeAt(e);
			if (i < 55296 || i > 57343) r.push(String.fromCodePoint(i));
			else if (56320 <= i && i <= 57343) r.push(String.fromCodePoint(65533));
			else if (e === n - 1) r.push(String.fromCodePoint(65533));
			else {
				let n = t.charCodeAt(e + 1);
				if (56320 <= n && n <= 57343) {
					let t = i & 1023, a = n & 1023;
					r.push(String.fromCodePoint(65536 + 1024 * t + a)), ++e;
				} else r.push(String.fromCodePoint(65533));
			}
		}
		return r.join("");
	}, n.Date = function(e, t) {
		if (!(e instanceof Date)) throw TypeError("Argument is not a Date object");
		if (!isNaN(e)) return e;
	}, n.RegExp = function(e, t) {
		return e instanceof RegExp || (e = new RegExp(e)), e;
	};
})), Gn = /* @__PURE__ */ A(((e, t) => {
	t.exports.mixin = function(e, t) {
		let n = Object.getOwnPropertyNames(t);
		for (let r = 0; r < n.length; ++r) Object.defineProperty(e, n[r], Object.getOwnPropertyDescriptor(t, n[r]));
	}, t.exports.wrapperSymbol = Symbol("wrapper"), t.exports.implSymbol = Symbol("impl"), t.exports.wrapperForImpl = function(e) {
		return e[t.exports.wrapperSymbol];
	}, t.exports.implForWrapper = function(e) {
		return e[t.exports.implSymbol];
	};
})), Kn = /* @__PURE__ */ j({ default: () => qn }), qn, Jn = k((() => {
	qn = /*#__PURE__*/ JSON.parse("[[[0,44],\"disallowed_STD3_valid\"],[[45,46],\"valid\"],[[47,47],\"disallowed_STD3_valid\"],[[48,57],\"valid\"],[[58,64],\"disallowed_STD3_valid\"],[[65,65],\"mapped\",[97]],[[66,66],\"mapped\",[98]],[[67,67],\"mapped\",[99]],[[68,68],\"mapped\",[100]],[[69,69],\"mapped\",[101]],[[70,70],\"mapped\",[102]],[[71,71],\"mapped\",[103]],[[72,72],\"mapped\",[104]],[[73,73],\"mapped\",[105]],[[74,74],\"mapped\",[106]],[[75,75],\"mapped\",[107]],[[76,76],\"mapped\",[108]],[[77,77],\"mapped\",[109]],[[78,78],\"mapped\",[110]],[[79,79],\"mapped\",[111]],[[80,80],\"mapped\",[112]],[[81,81],\"mapped\",[113]],[[82,82],\"mapped\",[114]],[[83,83],\"mapped\",[115]],[[84,84],\"mapped\",[116]],[[85,85],\"mapped\",[117]],[[86,86],\"mapped\",[118]],[[87,87],\"mapped\",[119]],[[88,88],\"mapped\",[120]],[[89,89],\"mapped\",[121]],[[90,90],\"mapped\",[122]],[[91,96],\"disallowed_STD3_valid\"],[[97,122],\"valid\"],[[123,127],\"disallowed_STD3_valid\"],[[128,159],\"disallowed\"],[[160,160],\"disallowed_STD3_mapped\",[32]],[[161,167],\"valid\",[],\"NV8\"],[[168,168],\"disallowed_STD3_mapped\",[32,776]],[[169,169],\"valid\",[],\"NV8\"],[[170,170],\"mapped\",[97]],[[171,172],\"valid\",[],\"NV8\"],[[173,173],\"ignored\"],[[174,174],\"valid\",[],\"NV8\"],[[175,175],\"disallowed_STD3_mapped\",[32,772]],[[176,177],\"valid\",[],\"NV8\"],[[178,178],\"mapped\",[50]],[[179,179],\"mapped\",[51]],[[180,180],\"disallowed_STD3_mapped\",[32,769]],[[181,181],\"mapped\",[956]],[[182,182],\"valid\",[],\"NV8\"],[[183,183],\"valid\"],[[184,184],\"disallowed_STD3_mapped\",[32,807]],[[185,185],\"mapped\",[49]],[[186,186],\"mapped\",[111]],[[187,187],\"valid\",[],\"NV8\"],[[188,188],\"mapped\",[49,8260,52]],[[189,189],\"mapped\",[49,8260,50]],[[190,190],\"mapped\",[51,8260,52]],[[191,191],\"valid\",[],\"NV8\"],[[192,192],\"mapped\",[224]],[[193,193],\"mapped\",[225]],[[194,194],\"mapped\",[226]],[[195,195],\"mapped\",[227]],[[196,196],\"mapped\",[228]],[[197,197],\"mapped\",[229]],[[198,198],\"mapped\",[230]],[[199,199],\"mapped\",[231]],[[200,200],\"mapped\",[232]],[[201,201],\"mapped\",[233]],[[202,202],\"mapped\",[234]],[[203,203],\"mapped\",[235]],[[204,204],\"mapped\",[236]],[[205,205],\"mapped\",[237]],[[206,206],\"mapped\",[238]],[[207,207],\"mapped\",[239]],[[208,208],\"mapped\",[240]],[[209,209],\"mapped\",[241]],[[210,210],\"mapped\",[242]],[[211,211],\"mapped\",[243]],[[212,212],\"mapped\",[244]],[[213,213],\"mapped\",[245]],[[214,214],\"mapped\",[246]],[[215,215],\"valid\",[],\"NV8\"],[[216,216],\"mapped\",[248]],[[217,217],\"mapped\",[249]],[[218,218],\"mapped\",[250]],[[219,219],\"mapped\",[251]],[[220,220],\"mapped\",[252]],[[221,221],\"mapped\",[253]],[[222,222],\"mapped\",[254]],[[223,223],\"deviation\",[115,115]],[[224,246],\"valid\"],[[247,247],\"valid\",[],\"NV8\"],[[248,255],\"valid\"],[[256,256],\"mapped\",[257]],[[257,257],\"valid\"],[[258,258],\"mapped\",[259]],[[259,259],\"valid\"],[[260,260],\"mapped\",[261]],[[261,261],\"valid\"],[[262,262],\"mapped\",[263]],[[263,263],\"valid\"],[[264,264],\"mapped\",[265]],[[265,265],\"valid\"],[[266,266],\"mapped\",[267]],[[267,267],\"valid\"],[[268,268],\"mapped\",[269]],[[269,269],\"valid\"],[[270,270],\"mapped\",[271]],[[271,271],\"valid\"],[[272,272],\"mapped\",[273]],[[273,273],\"valid\"],[[274,274],\"mapped\",[275]],[[275,275],\"valid\"],[[276,276],\"mapped\",[277]],[[277,277],\"valid\"],[[278,278],\"mapped\",[279]],[[279,279],\"valid\"],[[280,280],\"mapped\",[281]],[[281,281],\"valid\"],[[282,282],\"mapped\",[283]],[[283,283],\"valid\"],[[284,284],\"mapped\",[285]],[[285,285],\"valid\"],[[286,286],\"mapped\",[287]],[[287,287],\"valid\"],[[288,288],\"mapped\",[289]],[[289,289],\"valid\"],[[290,290],\"mapped\",[291]],[[291,291],\"valid\"],[[292,292],\"mapped\",[293]],[[293,293],\"valid\"],[[294,294],\"mapped\",[295]],[[295,295],\"valid\"],[[296,296],\"mapped\",[297]],[[297,297],\"valid\"],[[298,298],\"mapped\",[299]],[[299,299],\"valid\"],[[300,300],\"mapped\",[301]],[[301,301],\"valid\"],[[302,302],\"mapped\",[303]],[[303,303],\"valid\"],[[304,304],\"mapped\",[105,775]],[[305,305],\"valid\"],[[306,307],\"mapped\",[105,106]],[[308,308],\"mapped\",[309]],[[309,309],\"valid\"],[[310,310],\"mapped\",[311]],[[311,312],\"valid\"],[[313,313],\"mapped\",[314]],[[314,314],\"valid\"],[[315,315],\"mapped\",[316]],[[316,316],\"valid\"],[[317,317],\"mapped\",[318]],[[318,318],\"valid\"],[[319,320],\"mapped\",[108,183]],[[321,321],\"mapped\",[322]],[[322,322],\"valid\"],[[323,323],\"mapped\",[324]],[[324,324],\"valid\"],[[325,325],\"mapped\",[326]],[[326,326],\"valid\"],[[327,327],\"mapped\",[328]],[[328,328],\"valid\"],[[329,329],\"mapped\",[700,110]],[[330,330],\"mapped\",[331]],[[331,331],\"valid\"],[[332,332],\"mapped\",[333]],[[333,333],\"valid\"],[[334,334],\"mapped\",[335]],[[335,335],\"valid\"],[[336,336],\"mapped\",[337]],[[337,337],\"valid\"],[[338,338],\"mapped\",[339]],[[339,339],\"valid\"],[[340,340],\"mapped\",[341]],[[341,341],\"valid\"],[[342,342],\"mapped\",[343]],[[343,343],\"valid\"],[[344,344],\"mapped\",[345]],[[345,345],\"valid\"],[[346,346],\"mapped\",[347]],[[347,347],\"valid\"],[[348,348],\"mapped\",[349]],[[349,349],\"valid\"],[[350,350],\"mapped\",[351]],[[351,351],\"valid\"],[[352,352],\"mapped\",[353]],[[353,353],\"valid\"],[[354,354],\"mapped\",[355]],[[355,355],\"valid\"],[[356,356],\"mapped\",[357]],[[357,357],\"valid\"],[[358,358],\"mapped\",[359]],[[359,359],\"valid\"],[[360,360],\"mapped\",[361]],[[361,361],\"valid\"],[[362,362],\"mapped\",[363]],[[363,363],\"valid\"],[[364,364],\"mapped\",[365]],[[365,365],\"valid\"],[[366,366],\"mapped\",[367]],[[367,367],\"valid\"],[[368,368],\"mapped\",[369]],[[369,369],\"valid\"],[[370,370],\"mapped\",[371]],[[371,371],\"valid\"],[[372,372],\"mapped\",[373]],[[373,373],\"valid\"],[[374,374],\"mapped\",[375]],[[375,375],\"valid\"],[[376,376],\"mapped\",[255]],[[377,377],\"mapped\",[378]],[[378,378],\"valid\"],[[379,379],\"mapped\",[380]],[[380,380],\"valid\"],[[381,381],\"mapped\",[382]],[[382,382],\"valid\"],[[383,383],\"mapped\",[115]],[[384,384],\"valid\"],[[385,385],\"mapped\",[595]],[[386,386],\"mapped\",[387]],[[387,387],\"valid\"],[[388,388],\"mapped\",[389]],[[389,389],\"valid\"],[[390,390],\"mapped\",[596]],[[391,391],\"mapped\",[392]],[[392,392],\"valid\"],[[393,393],\"mapped\",[598]],[[394,394],\"mapped\",[599]],[[395,395],\"mapped\",[396]],[[396,397],\"valid\"],[[398,398],\"mapped\",[477]],[[399,399],\"mapped\",[601]],[[400,400],\"mapped\",[603]],[[401,401],\"mapped\",[402]],[[402,402],\"valid\"],[[403,403],\"mapped\",[608]],[[404,404],\"mapped\",[611]],[[405,405],\"valid\"],[[406,406],\"mapped\",[617]],[[407,407],\"mapped\",[616]],[[408,408],\"mapped\",[409]],[[409,411],\"valid\"],[[412,412],\"mapped\",[623]],[[413,413],\"mapped\",[626]],[[414,414],\"valid\"],[[415,415],\"mapped\",[629]],[[416,416],\"mapped\",[417]],[[417,417],\"valid\"],[[418,418],\"mapped\",[419]],[[419,419],\"valid\"],[[420,420],\"mapped\",[421]],[[421,421],\"valid\"],[[422,422],\"mapped\",[640]],[[423,423],\"mapped\",[424]],[[424,424],\"valid\"],[[425,425],\"mapped\",[643]],[[426,427],\"valid\"],[[428,428],\"mapped\",[429]],[[429,429],\"valid\"],[[430,430],\"mapped\",[648]],[[431,431],\"mapped\",[432]],[[432,432],\"valid\"],[[433,433],\"mapped\",[650]],[[434,434],\"mapped\",[651]],[[435,435],\"mapped\",[436]],[[436,436],\"valid\"],[[437,437],\"mapped\",[438]],[[438,438],\"valid\"],[[439,439],\"mapped\",[658]],[[440,440],\"mapped\",[441]],[[441,443],\"valid\"],[[444,444],\"mapped\",[445]],[[445,451],\"valid\"],[[452,454],\"mapped\",[100,382]],[[455,457],\"mapped\",[108,106]],[[458,460],\"mapped\",[110,106]],[[461,461],\"mapped\",[462]],[[462,462],\"valid\"],[[463,463],\"mapped\",[464]],[[464,464],\"valid\"],[[465,465],\"mapped\",[466]],[[466,466],\"valid\"],[[467,467],\"mapped\",[468]],[[468,468],\"valid\"],[[469,469],\"mapped\",[470]],[[470,470],\"valid\"],[[471,471],\"mapped\",[472]],[[472,472],\"valid\"],[[473,473],\"mapped\",[474]],[[474,474],\"valid\"],[[475,475],\"mapped\",[476]],[[476,477],\"valid\"],[[478,478],\"mapped\",[479]],[[479,479],\"valid\"],[[480,480],\"mapped\",[481]],[[481,481],\"valid\"],[[482,482],\"mapped\",[483]],[[483,483],\"valid\"],[[484,484],\"mapped\",[485]],[[485,485],\"valid\"],[[486,486],\"mapped\",[487]],[[487,487],\"valid\"],[[488,488],\"mapped\",[489]],[[489,489],\"valid\"],[[490,490],\"mapped\",[491]],[[491,491],\"valid\"],[[492,492],\"mapped\",[493]],[[493,493],\"valid\"],[[494,494],\"mapped\",[495]],[[495,496],\"valid\"],[[497,499],\"mapped\",[100,122]],[[500,500],\"mapped\",[501]],[[501,501],\"valid\"],[[502,502],\"mapped\",[405]],[[503,503],\"mapped\",[447]],[[504,504],\"mapped\",[505]],[[505,505],\"valid\"],[[506,506],\"mapped\",[507]],[[507,507],\"valid\"],[[508,508],\"mapped\",[509]],[[509,509],\"valid\"],[[510,510],\"mapped\",[511]],[[511,511],\"valid\"],[[512,512],\"mapped\",[513]],[[513,513],\"valid\"],[[514,514],\"mapped\",[515]],[[515,515],\"valid\"],[[516,516],\"mapped\",[517]],[[517,517],\"valid\"],[[518,518],\"mapped\",[519]],[[519,519],\"valid\"],[[520,520],\"mapped\",[521]],[[521,521],\"valid\"],[[522,522],\"mapped\",[523]],[[523,523],\"valid\"],[[524,524],\"mapped\",[525]],[[525,525],\"valid\"],[[526,526],\"mapped\",[527]],[[527,527],\"valid\"],[[528,528],\"mapped\",[529]],[[529,529],\"valid\"],[[530,530],\"mapped\",[531]],[[531,531],\"valid\"],[[532,532],\"mapped\",[533]],[[533,533],\"valid\"],[[534,534],\"mapped\",[535]],[[535,535],\"valid\"],[[536,536],\"mapped\",[537]],[[537,537],\"valid\"],[[538,538],\"mapped\",[539]],[[539,539],\"valid\"],[[540,540],\"mapped\",[541]],[[541,541],\"valid\"],[[542,542],\"mapped\",[543]],[[543,543],\"valid\"],[[544,544],\"mapped\",[414]],[[545,545],\"valid\"],[[546,546],\"mapped\",[547]],[[547,547],\"valid\"],[[548,548],\"mapped\",[549]],[[549,549],\"valid\"],[[550,550],\"mapped\",[551]],[[551,551],\"valid\"],[[552,552],\"mapped\",[553]],[[553,553],\"valid\"],[[554,554],\"mapped\",[555]],[[555,555],\"valid\"],[[556,556],\"mapped\",[557]],[[557,557],\"valid\"],[[558,558],\"mapped\",[559]],[[559,559],\"valid\"],[[560,560],\"mapped\",[561]],[[561,561],\"valid\"],[[562,562],\"mapped\",[563]],[[563,563],\"valid\"],[[564,566],\"valid\"],[[567,569],\"valid\"],[[570,570],\"mapped\",[11365]],[[571,571],\"mapped\",[572]],[[572,572],\"valid\"],[[573,573],\"mapped\",[410]],[[574,574],\"mapped\",[11366]],[[575,576],\"valid\"],[[577,577],\"mapped\",[578]],[[578,578],\"valid\"],[[579,579],\"mapped\",[384]],[[580,580],\"mapped\",[649]],[[581,581],\"mapped\",[652]],[[582,582],\"mapped\",[583]],[[583,583],\"valid\"],[[584,584],\"mapped\",[585]],[[585,585],\"valid\"],[[586,586],\"mapped\",[587]],[[587,587],\"valid\"],[[588,588],\"mapped\",[589]],[[589,589],\"valid\"],[[590,590],\"mapped\",[591]],[[591,591],\"valid\"],[[592,680],\"valid\"],[[681,685],\"valid\"],[[686,687],\"valid\"],[[688,688],\"mapped\",[104]],[[689,689],\"mapped\",[614]],[[690,690],\"mapped\",[106]],[[691,691],\"mapped\",[114]],[[692,692],\"mapped\",[633]],[[693,693],\"mapped\",[635]],[[694,694],\"mapped\",[641]],[[695,695],\"mapped\",[119]],[[696,696],\"mapped\",[121]],[[697,705],\"valid\"],[[706,709],\"valid\",[],\"NV8\"],[[710,721],\"valid\"],[[722,727],\"valid\",[],\"NV8\"],[[728,728],\"disallowed_STD3_mapped\",[32,774]],[[729,729],\"disallowed_STD3_mapped\",[32,775]],[[730,730],\"disallowed_STD3_mapped\",[32,778]],[[731,731],\"disallowed_STD3_mapped\",[32,808]],[[732,732],\"disallowed_STD3_mapped\",[32,771]],[[733,733],\"disallowed_STD3_mapped\",[32,779]],[[734,734],\"valid\",[],\"NV8\"],[[735,735],\"valid\",[],\"NV8\"],[[736,736],\"mapped\",[611]],[[737,737],\"mapped\",[108]],[[738,738],\"mapped\",[115]],[[739,739],\"mapped\",[120]],[[740,740],\"mapped\",[661]],[[741,745],\"valid\",[],\"NV8\"],[[746,747],\"valid\",[],\"NV8\"],[[748,748],\"valid\"],[[749,749],\"valid\",[],\"NV8\"],[[750,750],\"valid\"],[[751,767],\"valid\",[],\"NV8\"],[[768,831],\"valid\"],[[832,832],\"mapped\",[768]],[[833,833],\"mapped\",[769]],[[834,834],\"valid\"],[[835,835],\"mapped\",[787]],[[836,836],\"mapped\",[776,769]],[[837,837],\"mapped\",[953]],[[838,846],\"valid\"],[[847,847],\"ignored\"],[[848,855],\"valid\"],[[856,860],\"valid\"],[[861,863],\"valid\"],[[864,865],\"valid\"],[[866,866],\"valid\"],[[867,879],\"valid\"],[[880,880],\"mapped\",[881]],[[881,881],\"valid\"],[[882,882],\"mapped\",[883]],[[883,883],\"valid\"],[[884,884],\"mapped\",[697]],[[885,885],\"valid\"],[[886,886],\"mapped\",[887]],[[887,887],\"valid\"],[[888,889],\"disallowed\"],[[890,890],\"disallowed_STD3_mapped\",[32,953]],[[891,893],\"valid\"],[[894,894],\"disallowed_STD3_mapped\",[59]],[[895,895],\"mapped\",[1011]],[[896,899],\"disallowed\"],[[900,900],\"disallowed_STD3_mapped\",[32,769]],[[901,901],\"disallowed_STD3_mapped\",[32,776,769]],[[902,902],\"mapped\",[940]],[[903,903],\"mapped\",[183]],[[904,904],\"mapped\",[941]],[[905,905],\"mapped\",[942]],[[906,906],\"mapped\",[943]],[[907,907],\"disallowed\"],[[908,908],\"mapped\",[972]],[[909,909],\"disallowed\"],[[910,910],\"mapped\",[973]],[[911,911],\"mapped\",[974]],[[912,912],\"valid\"],[[913,913],\"mapped\",[945]],[[914,914],\"mapped\",[946]],[[915,915],\"mapped\",[947]],[[916,916],\"mapped\",[948]],[[917,917],\"mapped\",[949]],[[918,918],\"mapped\",[950]],[[919,919],\"mapped\",[951]],[[920,920],\"mapped\",[952]],[[921,921],\"mapped\",[953]],[[922,922],\"mapped\",[954]],[[923,923],\"mapped\",[955]],[[924,924],\"mapped\",[956]],[[925,925],\"mapped\",[957]],[[926,926],\"mapped\",[958]],[[927,927],\"mapped\",[959]],[[928,928],\"mapped\",[960]],[[929,929],\"mapped\",[961]],[[930,930],\"disallowed\"],[[931,931],\"mapped\",[963]],[[932,932],\"mapped\",[964]],[[933,933],\"mapped\",[965]],[[934,934],\"mapped\",[966]],[[935,935],\"mapped\",[967]],[[936,936],\"mapped\",[968]],[[937,937],\"mapped\",[969]],[[938,938],\"mapped\",[970]],[[939,939],\"mapped\",[971]],[[940,961],\"valid\"],[[962,962],\"deviation\",[963]],[[963,974],\"valid\"],[[975,975],\"mapped\",[983]],[[976,976],\"mapped\",[946]],[[977,977],\"mapped\",[952]],[[978,978],\"mapped\",[965]],[[979,979],\"mapped\",[973]],[[980,980],\"mapped\",[971]],[[981,981],\"mapped\",[966]],[[982,982],\"mapped\",[960]],[[983,983],\"valid\"],[[984,984],\"mapped\",[985]],[[985,985],\"valid\"],[[986,986],\"mapped\",[987]],[[987,987],\"valid\"],[[988,988],\"mapped\",[989]],[[989,989],\"valid\"],[[990,990],\"mapped\",[991]],[[991,991],\"valid\"],[[992,992],\"mapped\",[993]],[[993,993],\"valid\"],[[994,994],\"mapped\",[995]],[[995,995],\"valid\"],[[996,996],\"mapped\",[997]],[[997,997],\"valid\"],[[998,998],\"mapped\",[999]],[[999,999],\"valid\"],[[1000,1000],\"mapped\",[1001]],[[1001,1001],\"valid\"],[[1002,1002],\"mapped\",[1003]],[[1003,1003],\"valid\"],[[1004,1004],\"mapped\",[1005]],[[1005,1005],\"valid\"],[[1006,1006],\"mapped\",[1007]],[[1007,1007],\"valid\"],[[1008,1008],\"mapped\",[954]],[[1009,1009],\"mapped\",[961]],[[1010,1010],\"mapped\",[963]],[[1011,1011],\"valid\"],[[1012,1012],\"mapped\",[952]],[[1013,1013],\"mapped\",[949]],[[1014,1014],\"valid\",[],\"NV8\"],[[1015,1015],\"mapped\",[1016]],[[1016,1016],\"valid\"],[[1017,1017],\"mapped\",[963]],[[1018,1018],\"mapped\",[1019]],[[1019,1019],\"valid\"],[[1020,1020],\"valid\"],[[1021,1021],\"mapped\",[891]],[[1022,1022],\"mapped\",[892]],[[1023,1023],\"mapped\",[893]],[[1024,1024],\"mapped\",[1104]],[[1025,1025],\"mapped\",[1105]],[[1026,1026],\"mapped\",[1106]],[[1027,1027],\"mapped\",[1107]],[[1028,1028],\"mapped\",[1108]],[[1029,1029],\"mapped\",[1109]],[[1030,1030],\"mapped\",[1110]],[[1031,1031],\"mapped\",[1111]],[[1032,1032],\"mapped\",[1112]],[[1033,1033],\"mapped\",[1113]],[[1034,1034],\"mapped\",[1114]],[[1035,1035],\"mapped\",[1115]],[[1036,1036],\"mapped\",[1116]],[[1037,1037],\"mapped\",[1117]],[[1038,1038],\"mapped\",[1118]],[[1039,1039],\"mapped\",[1119]],[[1040,1040],\"mapped\",[1072]],[[1041,1041],\"mapped\",[1073]],[[1042,1042],\"mapped\",[1074]],[[1043,1043],\"mapped\",[1075]],[[1044,1044],\"mapped\",[1076]],[[1045,1045],\"mapped\",[1077]],[[1046,1046],\"mapped\",[1078]],[[1047,1047],\"mapped\",[1079]],[[1048,1048],\"mapped\",[1080]],[[1049,1049],\"mapped\",[1081]],[[1050,1050],\"mapped\",[1082]],[[1051,1051],\"mapped\",[1083]],[[1052,1052],\"mapped\",[1084]],[[1053,1053],\"mapped\",[1085]],[[1054,1054],\"mapped\",[1086]],[[1055,1055],\"mapped\",[1087]],[[1056,1056],\"mapped\",[1088]],[[1057,1057],\"mapped\",[1089]],[[1058,1058],\"mapped\",[1090]],[[1059,1059],\"mapped\",[1091]],[[1060,1060],\"mapped\",[1092]],[[1061,1061],\"mapped\",[1093]],[[1062,1062],\"mapped\",[1094]],[[1063,1063],\"mapped\",[1095]],[[1064,1064],\"mapped\",[1096]],[[1065,1065],\"mapped\",[1097]],[[1066,1066],\"mapped\",[1098]],[[1067,1067],\"mapped\",[1099]],[[1068,1068],\"mapped\",[1100]],[[1069,1069],\"mapped\",[1101]],[[1070,1070],\"mapped\",[1102]],[[1071,1071],\"mapped\",[1103]],[[1072,1103],\"valid\"],[[1104,1104],\"valid\"],[[1105,1116],\"valid\"],[[1117,1117],\"valid\"],[[1118,1119],\"valid\"],[[1120,1120],\"mapped\",[1121]],[[1121,1121],\"valid\"],[[1122,1122],\"mapped\",[1123]],[[1123,1123],\"valid\"],[[1124,1124],\"mapped\",[1125]],[[1125,1125],\"valid\"],[[1126,1126],\"mapped\",[1127]],[[1127,1127],\"valid\"],[[1128,1128],\"mapped\",[1129]],[[1129,1129],\"valid\"],[[1130,1130],\"mapped\",[1131]],[[1131,1131],\"valid\"],[[1132,1132],\"mapped\",[1133]],[[1133,1133],\"valid\"],[[1134,1134],\"mapped\",[1135]],[[1135,1135],\"valid\"],[[1136,1136],\"mapped\",[1137]],[[1137,1137],\"valid\"],[[1138,1138],\"mapped\",[1139]],[[1139,1139],\"valid\"],[[1140,1140],\"mapped\",[1141]],[[1141,1141],\"valid\"],[[1142,1142],\"mapped\",[1143]],[[1143,1143],\"valid\"],[[1144,1144],\"mapped\",[1145]],[[1145,1145],\"valid\"],[[1146,1146],\"mapped\",[1147]],[[1147,1147],\"valid\"],[[1148,1148],\"mapped\",[1149]],[[1149,1149],\"valid\"],[[1150,1150],\"mapped\",[1151]],[[1151,1151],\"valid\"],[[1152,1152],\"mapped\",[1153]],[[1153,1153],\"valid\"],[[1154,1154],\"valid\",[],\"NV8\"],[[1155,1158],\"valid\"],[[1159,1159],\"valid\"],[[1160,1161],\"valid\",[],\"NV8\"],[[1162,1162],\"mapped\",[1163]],[[1163,1163],\"valid\"],[[1164,1164],\"mapped\",[1165]],[[1165,1165],\"valid\"],[[1166,1166],\"mapped\",[1167]],[[1167,1167],\"valid\"],[[1168,1168],\"mapped\",[1169]],[[1169,1169],\"valid\"],[[1170,1170],\"mapped\",[1171]],[[1171,1171],\"valid\"],[[1172,1172],\"mapped\",[1173]],[[1173,1173],\"valid\"],[[1174,1174],\"mapped\",[1175]],[[1175,1175],\"valid\"],[[1176,1176],\"mapped\",[1177]],[[1177,1177],\"valid\"],[[1178,1178],\"mapped\",[1179]],[[1179,1179],\"valid\"],[[1180,1180],\"mapped\",[1181]],[[1181,1181],\"valid\"],[[1182,1182],\"mapped\",[1183]],[[1183,1183],\"valid\"],[[1184,1184],\"mapped\",[1185]],[[1185,1185],\"valid\"],[[1186,1186],\"mapped\",[1187]],[[1187,1187],\"valid\"],[[1188,1188],\"mapped\",[1189]],[[1189,1189],\"valid\"],[[1190,1190],\"mapped\",[1191]],[[1191,1191],\"valid\"],[[1192,1192],\"mapped\",[1193]],[[1193,1193],\"valid\"],[[1194,1194],\"mapped\",[1195]],[[1195,1195],\"valid\"],[[1196,1196],\"mapped\",[1197]],[[1197,1197],\"valid\"],[[1198,1198],\"mapped\",[1199]],[[1199,1199],\"valid\"],[[1200,1200],\"mapped\",[1201]],[[1201,1201],\"valid\"],[[1202,1202],\"mapped\",[1203]],[[1203,1203],\"valid\"],[[1204,1204],\"mapped\",[1205]],[[1205,1205],\"valid\"],[[1206,1206],\"mapped\",[1207]],[[1207,1207],\"valid\"],[[1208,1208],\"mapped\",[1209]],[[1209,1209],\"valid\"],[[1210,1210],\"mapped\",[1211]],[[1211,1211],\"valid\"],[[1212,1212],\"mapped\",[1213]],[[1213,1213],\"valid\"],[[1214,1214],\"mapped\",[1215]],[[1215,1215],\"valid\"],[[1216,1216],\"disallowed\"],[[1217,1217],\"mapped\",[1218]],[[1218,1218],\"valid\"],[[1219,1219],\"mapped\",[1220]],[[1220,1220],\"valid\"],[[1221,1221],\"mapped\",[1222]],[[1222,1222],\"valid\"],[[1223,1223],\"mapped\",[1224]],[[1224,1224],\"valid\"],[[1225,1225],\"mapped\",[1226]],[[1226,1226],\"valid\"],[[1227,1227],\"mapped\",[1228]],[[1228,1228],\"valid\"],[[1229,1229],\"mapped\",[1230]],[[1230,1230],\"valid\"],[[1231,1231],\"valid\"],[[1232,1232],\"mapped\",[1233]],[[1233,1233],\"valid\"],[[1234,1234],\"mapped\",[1235]],[[1235,1235],\"valid\"],[[1236,1236],\"mapped\",[1237]],[[1237,1237],\"valid\"],[[1238,1238],\"mapped\",[1239]],[[1239,1239],\"valid\"],[[1240,1240],\"mapped\",[1241]],[[1241,1241],\"valid\"],[[1242,1242],\"mapped\",[1243]],[[1243,1243],\"valid\"],[[1244,1244],\"mapped\",[1245]],[[1245,1245],\"valid\"],[[1246,1246],\"mapped\",[1247]],[[1247,1247],\"valid\"],[[1248,1248],\"mapped\",[1249]],[[1249,1249],\"valid\"],[[1250,1250],\"mapped\",[1251]],[[1251,1251],\"valid\"],[[1252,1252],\"mapped\",[1253]],[[1253,1253],\"valid\"],[[1254,1254],\"mapped\",[1255]],[[1255,1255],\"valid\"],[[1256,1256],\"mapped\",[1257]],[[1257,1257],\"valid\"],[[1258,1258],\"mapped\",[1259]],[[1259,1259],\"valid\"],[[1260,1260],\"mapped\",[1261]],[[1261,1261],\"valid\"],[[1262,1262],\"mapped\",[1263]],[[1263,1263],\"valid\"],[[1264,1264],\"mapped\",[1265]],[[1265,1265],\"valid\"],[[1266,1266],\"mapped\",[1267]],[[1267,1267],\"valid\"],[[1268,1268],\"mapped\",[1269]],[[1269,1269],\"valid\"],[[1270,1270],\"mapped\",[1271]],[[1271,1271],\"valid\"],[[1272,1272],\"mapped\",[1273]],[[1273,1273],\"valid\"],[[1274,1274],\"mapped\",[1275]],[[1275,1275],\"valid\"],[[1276,1276],\"mapped\",[1277]],[[1277,1277],\"valid\"],[[1278,1278],\"mapped\",[1279]],[[1279,1279],\"valid\"],[[1280,1280],\"mapped\",[1281]],[[1281,1281],\"valid\"],[[1282,1282],\"mapped\",[1283]],[[1283,1283],\"valid\"],[[1284,1284],\"mapped\",[1285]],[[1285,1285],\"valid\"],[[1286,1286],\"mapped\",[1287]],[[1287,1287],\"valid\"],[[1288,1288],\"mapped\",[1289]],[[1289,1289],\"valid\"],[[1290,1290],\"mapped\",[1291]],[[1291,1291],\"valid\"],[[1292,1292],\"mapped\",[1293]],[[1293,1293],\"valid\"],[[1294,1294],\"mapped\",[1295]],[[1295,1295],\"valid\"],[[1296,1296],\"mapped\",[1297]],[[1297,1297],\"valid\"],[[1298,1298],\"mapped\",[1299]],[[1299,1299],\"valid\"],[[1300,1300],\"mapped\",[1301]],[[1301,1301],\"valid\"],[[1302,1302],\"mapped\",[1303]],[[1303,1303],\"valid\"],[[1304,1304],\"mapped\",[1305]],[[1305,1305],\"valid\"],[[1306,1306],\"mapped\",[1307]],[[1307,1307],\"valid\"],[[1308,1308],\"mapped\",[1309]],[[1309,1309],\"valid\"],[[1310,1310],\"mapped\",[1311]],[[1311,1311],\"valid\"],[[1312,1312],\"mapped\",[1313]],[[1313,1313],\"valid\"],[[1314,1314],\"mapped\",[1315]],[[1315,1315],\"valid\"],[[1316,1316],\"mapped\",[1317]],[[1317,1317],\"valid\"],[[1318,1318],\"mapped\",[1319]],[[1319,1319],\"valid\"],[[1320,1320],\"mapped\",[1321]],[[1321,1321],\"valid\"],[[1322,1322],\"mapped\",[1323]],[[1323,1323],\"valid\"],[[1324,1324],\"mapped\",[1325]],[[1325,1325],\"valid\"],[[1326,1326],\"mapped\",[1327]],[[1327,1327],\"valid\"],[[1328,1328],\"disallowed\"],[[1329,1329],\"mapped\",[1377]],[[1330,1330],\"mapped\",[1378]],[[1331,1331],\"mapped\",[1379]],[[1332,1332],\"mapped\",[1380]],[[1333,1333],\"mapped\",[1381]],[[1334,1334],\"mapped\",[1382]],[[1335,1335],\"mapped\",[1383]],[[1336,1336],\"mapped\",[1384]],[[1337,1337],\"mapped\",[1385]],[[1338,1338],\"mapped\",[1386]],[[1339,1339],\"mapped\",[1387]],[[1340,1340],\"mapped\",[1388]],[[1341,1341],\"mapped\",[1389]],[[1342,1342],\"mapped\",[1390]],[[1343,1343],\"mapped\",[1391]],[[1344,1344],\"mapped\",[1392]],[[1345,1345],\"mapped\",[1393]],[[1346,1346],\"mapped\",[1394]],[[1347,1347],\"mapped\",[1395]],[[1348,1348],\"mapped\",[1396]],[[1349,1349],\"mapped\",[1397]],[[1350,1350],\"mapped\",[1398]],[[1351,1351],\"mapped\",[1399]],[[1352,1352],\"mapped\",[1400]],[[1353,1353],\"mapped\",[1401]],[[1354,1354],\"mapped\",[1402]],[[1355,1355],\"mapped\",[1403]],[[1356,1356],\"mapped\",[1404]],[[1357,1357],\"mapped\",[1405]],[[1358,1358],\"mapped\",[1406]],[[1359,1359],\"mapped\",[1407]],[[1360,1360],\"mapped\",[1408]],[[1361,1361],\"mapped\",[1409]],[[1362,1362],\"mapped\",[1410]],[[1363,1363],\"mapped\",[1411]],[[1364,1364],\"mapped\",[1412]],[[1365,1365],\"mapped\",[1413]],[[1366,1366],\"mapped\",[1414]],[[1367,1368],\"disallowed\"],[[1369,1369],\"valid\"],[[1370,1375],\"valid\",[],\"NV8\"],[[1376,1376],\"disallowed\"],[[1377,1414],\"valid\"],[[1415,1415],\"mapped\",[1381,1410]],[[1416,1416],\"disallowed\"],[[1417,1417],\"valid\",[],\"NV8\"],[[1418,1418],\"valid\",[],\"NV8\"],[[1419,1420],\"disallowed\"],[[1421,1422],\"valid\",[],\"NV8\"],[[1423,1423],\"valid\",[],\"NV8\"],[[1424,1424],\"disallowed\"],[[1425,1441],\"valid\"],[[1442,1442],\"valid\"],[[1443,1455],\"valid\"],[[1456,1465],\"valid\"],[[1466,1466],\"valid\"],[[1467,1469],\"valid\"],[[1470,1470],\"valid\",[],\"NV8\"],[[1471,1471],\"valid\"],[[1472,1472],\"valid\",[],\"NV8\"],[[1473,1474],\"valid\"],[[1475,1475],\"valid\",[],\"NV8\"],[[1476,1476],\"valid\"],[[1477,1477],\"valid\"],[[1478,1478],\"valid\",[],\"NV8\"],[[1479,1479],\"valid\"],[[1480,1487],\"disallowed\"],[[1488,1514],\"valid\"],[[1515,1519],\"disallowed\"],[[1520,1524],\"valid\"],[[1525,1535],\"disallowed\"],[[1536,1539],\"disallowed\"],[[1540,1540],\"disallowed\"],[[1541,1541],\"disallowed\"],[[1542,1546],\"valid\",[],\"NV8\"],[[1547,1547],\"valid\",[],\"NV8\"],[[1548,1548],\"valid\",[],\"NV8\"],[[1549,1551],\"valid\",[],\"NV8\"],[[1552,1557],\"valid\"],[[1558,1562],\"valid\"],[[1563,1563],\"valid\",[],\"NV8\"],[[1564,1564],\"disallowed\"],[[1565,1565],\"disallowed\"],[[1566,1566],\"valid\",[],\"NV8\"],[[1567,1567],\"valid\",[],\"NV8\"],[[1568,1568],\"valid\"],[[1569,1594],\"valid\"],[[1595,1599],\"valid\"],[[1600,1600],\"valid\",[],\"NV8\"],[[1601,1618],\"valid\"],[[1619,1621],\"valid\"],[[1622,1624],\"valid\"],[[1625,1630],\"valid\"],[[1631,1631],\"valid\"],[[1632,1641],\"valid\"],[[1642,1645],\"valid\",[],\"NV8\"],[[1646,1647],\"valid\"],[[1648,1652],\"valid\"],[[1653,1653],\"mapped\",[1575,1652]],[[1654,1654],\"mapped\",[1608,1652]],[[1655,1655],\"mapped\",[1735,1652]],[[1656,1656],\"mapped\",[1610,1652]],[[1657,1719],\"valid\"],[[1720,1721],\"valid\"],[[1722,1726],\"valid\"],[[1727,1727],\"valid\"],[[1728,1742],\"valid\"],[[1743,1743],\"valid\"],[[1744,1747],\"valid\"],[[1748,1748],\"valid\",[],\"NV8\"],[[1749,1756],\"valid\"],[[1757,1757],\"disallowed\"],[[1758,1758],\"valid\",[],\"NV8\"],[[1759,1768],\"valid\"],[[1769,1769],\"valid\",[],\"NV8\"],[[1770,1773],\"valid\"],[[1774,1775],\"valid\"],[[1776,1785],\"valid\"],[[1786,1790],\"valid\"],[[1791,1791],\"valid\"],[[1792,1805],\"valid\",[],\"NV8\"],[[1806,1806],\"disallowed\"],[[1807,1807],\"disallowed\"],[[1808,1836],\"valid\"],[[1837,1839],\"valid\"],[[1840,1866],\"valid\"],[[1867,1868],\"disallowed\"],[[1869,1871],\"valid\"],[[1872,1901],\"valid\"],[[1902,1919],\"valid\"],[[1920,1968],\"valid\"],[[1969,1969],\"valid\"],[[1970,1983],\"disallowed\"],[[1984,2037],\"valid\"],[[2038,2042],\"valid\",[],\"NV8\"],[[2043,2047],\"disallowed\"],[[2048,2093],\"valid\"],[[2094,2095],\"disallowed\"],[[2096,2110],\"valid\",[],\"NV8\"],[[2111,2111],\"disallowed\"],[[2112,2139],\"valid\"],[[2140,2141],\"disallowed\"],[[2142,2142],\"valid\",[],\"NV8\"],[[2143,2207],\"disallowed\"],[[2208,2208],\"valid\"],[[2209,2209],\"valid\"],[[2210,2220],\"valid\"],[[2221,2226],\"valid\"],[[2227,2228],\"valid\"],[[2229,2274],\"disallowed\"],[[2275,2275],\"valid\"],[[2276,2302],\"valid\"],[[2303,2303],\"valid\"],[[2304,2304],\"valid\"],[[2305,2307],\"valid\"],[[2308,2308],\"valid\"],[[2309,2361],\"valid\"],[[2362,2363],\"valid\"],[[2364,2381],\"valid\"],[[2382,2382],\"valid\"],[[2383,2383],\"valid\"],[[2384,2388],\"valid\"],[[2389,2389],\"valid\"],[[2390,2391],\"valid\"],[[2392,2392],\"mapped\",[2325,2364]],[[2393,2393],\"mapped\",[2326,2364]],[[2394,2394],\"mapped\",[2327,2364]],[[2395,2395],\"mapped\",[2332,2364]],[[2396,2396],\"mapped\",[2337,2364]],[[2397,2397],\"mapped\",[2338,2364]],[[2398,2398],\"mapped\",[2347,2364]],[[2399,2399],\"mapped\",[2351,2364]],[[2400,2403],\"valid\"],[[2404,2405],\"valid\",[],\"NV8\"],[[2406,2415],\"valid\"],[[2416,2416],\"valid\",[],\"NV8\"],[[2417,2418],\"valid\"],[[2419,2423],\"valid\"],[[2424,2424],\"valid\"],[[2425,2426],\"valid\"],[[2427,2428],\"valid\"],[[2429,2429],\"valid\"],[[2430,2431],\"valid\"],[[2432,2432],\"valid\"],[[2433,2435],\"valid\"],[[2436,2436],\"disallowed\"],[[2437,2444],\"valid\"],[[2445,2446],\"disallowed\"],[[2447,2448],\"valid\"],[[2449,2450],\"disallowed\"],[[2451,2472],\"valid\"],[[2473,2473],\"disallowed\"],[[2474,2480],\"valid\"],[[2481,2481],\"disallowed\"],[[2482,2482],\"valid\"],[[2483,2485],\"disallowed\"],[[2486,2489],\"valid\"],[[2490,2491],\"disallowed\"],[[2492,2492],\"valid\"],[[2493,2493],\"valid\"],[[2494,2500],\"valid\"],[[2501,2502],\"disallowed\"],[[2503,2504],\"valid\"],[[2505,2506],\"disallowed\"],[[2507,2509],\"valid\"],[[2510,2510],\"valid\"],[[2511,2518],\"disallowed\"],[[2519,2519],\"valid\"],[[2520,2523],\"disallowed\"],[[2524,2524],\"mapped\",[2465,2492]],[[2525,2525],\"mapped\",[2466,2492]],[[2526,2526],\"disallowed\"],[[2527,2527],\"mapped\",[2479,2492]],[[2528,2531],\"valid\"],[[2532,2533],\"disallowed\"],[[2534,2545],\"valid\"],[[2546,2554],\"valid\",[],\"NV8\"],[[2555,2555],\"valid\",[],\"NV8\"],[[2556,2560],\"disallowed\"],[[2561,2561],\"valid\"],[[2562,2562],\"valid\"],[[2563,2563],\"valid\"],[[2564,2564],\"disallowed\"],[[2565,2570],\"valid\"],[[2571,2574],\"disallowed\"],[[2575,2576],\"valid\"],[[2577,2578],\"disallowed\"],[[2579,2600],\"valid\"],[[2601,2601],\"disallowed\"],[[2602,2608],\"valid\"],[[2609,2609],\"disallowed\"],[[2610,2610],\"valid\"],[[2611,2611],\"mapped\",[2610,2620]],[[2612,2612],\"disallowed\"],[[2613,2613],\"valid\"],[[2614,2614],\"mapped\",[2616,2620]],[[2615,2615],\"disallowed\"],[[2616,2617],\"valid\"],[[2618,2619],\"disallowed\"],[[2620,2620],\"valid\"],[[2621,2621],\"disallowed\"],[[2622,2626],\"valid\"],[[2627,2630],\"disallowed\"],[[2631,2632],\"valid\"],[[2633,2634],\"disallowed\"],[[2635,2637],\"valid\"],[[2638,2640],\"disallowed\"],[[2641,2641],\"valid\"],[[2642,2648],\"disallowed\"],[[2649,2649],\"mapped\",[2582,2620]],[[2650,2650],\"mapped\",[2583,2620]],[[2651,2651],\"mapped\",[2588,2620]],[[2652,2652],\"valid\"],[[2653,2653],\"disallowed\"],[[2654,2654],\"mapped\",[2603,2620]],[[2655,2661],\"disallowed\"],[[2662,2676],\"valid\"],[[2677,2677],\"valid\"],[[2678,2688],\"disallowed\"],[[2689,2691],\"valid\"],[[2692,2692],\"disallowed\"],[[2693,2699],\"valid\"],[[2700,2700],\"valid\"],[[2701,2701],\"valid\"],[[2702,2702],\"disallowed\"],[[2703,2705],\"valid\"],[[2706,2706],\"disallowed\"],[[2707,2728],\"valid\"],[[2729,2729],\"disallowed\"],[[2730,2736],\"valid\"],[[2737,2737],\"disallowed\"],[[2738,2739],\"valid\"],[[2740,2740],\"disallowed\"],[[2741,2745],\"valid\"],[[2746,2747],\"disallowed\"],[[2748,2757],\"valid\"],[[2758,2758],\"disallowed\"],[[2759,2761],\"valid\"],[[2762,2762],\"disallowed\"],[[2763,2765],\"valid\"],[[2766,2767],\"disallowed\"],[[2768,2768],\"valid\"],[[2769,2783],\"disallowed\"],[[2784,2784],\"valid\"],[[2785,2787],\"valid\"],[[2788,2789],\"disallowed\"],[[2790,2799],\"valid\"],[[2800,2800],\"valid\",[],\"NV8\"],[[2801,2801],\"valid\",[],\"NV8\"],[[2802,2808],\"disallowed\"],[[2809,2809],\"valid\"],[[2810,2816],\"disallowed\"],[[2817,2819],\"valid\"],[[2820,2820],\"disallowed\"],[[2821,2828],\"valid\"],[[2829,2830],\"disallowed\"],[[2831,2832],\"valid\"],[[2833,2834],\"disallowed\"],[[2835,2856],\"valid\"],[[2857,2857],\"disallowed\"],[[2858,2864],\"valid\"],[[2865,2865],\"disallowed\"],[[2866,2867],\"valid\"],[[2868,2868],\"disallowed\"],[[2869,2869],\"valid\"],[[2870,2873],\"valid\"],[[2874,2875],\"disallowed\"],[[2876,2883],\"valid\"],[[2884,2884],\"valid\"],[[2885,2886],\"disallowed\"],[[2887,2888],\"valid\"],[[2889,2890],\"disallowed\"],[[2891,2893],\"valid\"],[[2894,2901],\"disallowed\"],[[2902,2903],\"valid\"],[[2904,2907],\"disallowed\"],[[2908,2908],\"mapped\",[2849,2876]],[[2909,2909],\"mapped\",[2850,2876]],[[2910,2910],\"disallowed\"],[[2911,2913],\"valid\"],[[2914,2915],\"valid\"],[[2916,2917],\"disallowed\"],[[2918,2927],\"valid\"],[[2928,2928],\"valid\",[],\"NV8\"],[[2929,2929],\"valid\"],[[2930,2935],\"valid\",[],\"NV8\"],[[2936,2945],\"disallowed\"],[[2946,2947],\"valid\"],[[2948,2948],\"disallowed\"],[[2949,2954],\"valid\"],[[2955,2957],\"disallowed\"],[[2958,2960],\"valid\"],[[2961,2961],\"disallowed\"],[[2962,2965],\"valid\"],[[2966,2968],\"disallowed\"],[[2969,2970],\"valid\"],[[2971,2971],\"disallowed\"],[[2972,2972],\"valid\"],[[2973,2973],\"disallowed\"],[[2974,2975],\"valid\"],[[2976,2978],\"disallowed\"],[[2979,2980],\"valid\"],[[2981,2983],\"disallowed\"],[[2984,2986],\"valid\"],[[2987,2989],\"disallowed\"],[[2990,2997],\"valid\"],[[2998,2998],\"valid\"],[[2999,3001],\"valid\"],[[3002,3005],\"disallowed\"],[[3006,3010],\"valid\"],[[3011,3013],\"disallowed\"],[[3014,3016],\"valid\"],[[3017,3017],\"disallowed\"],[[3018,3021],\"valid\"],[[3022,3023],\"disallowed\"],[[3024,3024],\"valid\"],[[3025,3030],\"disallowed\"],[[3031,3031],\"valid\"],[[3032,3045],\"disallowed\"],[[3046,3046],\"valid\"],[[3047,3055],\"valid\"],[[3056,3058],\"valid\",[],\"NV8\"],[[3059,3066],\"valid\",[],\"NV8\"],[[3067,3071],\"disallowed\"],[[3072,3072],\"valid\"],[[3073,3075],\"valid\"],[[3076,3076],\"disallowed\"],[[3077,3084],\"valid\"],[[3085,3085],\"disallowed\"],[[3086,3088],\"valid\"],[[3089,3089],\"disallowed\"],[[3090,3112],\"valid\"],[[3113,3113],\"disallowed\"],[[3114,3123],\"valid\"],[[3124,3124],\"valid\"],[[3125,3129],\"valid\"],[[3130,3132],\"disallowed\"],[[3133,3133],\"valid\"],[[3134,3140],\"valid\"],[[3141,3141],\"disallowed\"],[[3142,3144],\"valid\"],[[3145,3145],\"disallowed\"],[[3146,3149],\"valid\"],[[3150,3156],\"disallowed\"],[[3157,3158],\"valid\"],[[3159,3159],\"disallowed\"],[[3160,3161],\"valid\"],[[3162,3162],\"valid\"],[[3163,3167],\"disallowed\"],[[3168,3169],\"valid\"],[[3170,3171],\"valid\"],[[3172,3173],\"disallowed\"],[[3174,3183],\"valid\"],[[3184,3191],\"disallowed\"],[[3192,3199],\"valid\",[],\"NV8\"],[[3200,3200],\"disallowed\"],[[3201,3201],\"valid\"],[[3202,3203],\"valid\"],[[3204,3204],\"disallowed\"],[[3205,3212],\"valid\"],[[3213,3213],\"disallowed\"],[[3214,3216],\"valid\"],[[3217,3217],\"disallowed\"],[[3218,3240],\"valid\"],[[3241,3241],\"disallowed\"],[[3242,3251],\"valid\"],[[3252,3252],\"disallowed\"],[[3253,3257],\"valid\"],[[3258,3259],\"disallowed\"],[[3260,3261],\"valid\"],[[3262,3268],\"valid\"],[[3269,3269],\"disallowed\"],[[3270,3272],\"valid\"],[[3273,3273],\"disallowed\"],[[3274,3277],\"valid\"],[[3278,3284],\"disallowed\"],[[3285,3286],\"valid\"],[[3287,3293],\"disallowed\"],[[3294,3294],\"valid\"],[[3295,3295],\"disallowed\"],[[3296,3297],\"valid\"],[[3298,3299],\"valid\"],[[3300,3301],\"disallowed\"],[[3302,3311],\"valid\"],[[3312,3312],\"disallowed\"],[[3313,3314],\"valid\"],[[3315,3328],\"disallowed\"],[[3329,3329],\"valid\"],[[3330,3331],\"valid\"],[[3332,3332],\"disallowed\"],[[3333,3340],\"valid\"],[[3341,3341],\"disallowed\"],[[3342,3344],\"valid\"],[[3345,3345],\"disallowed\"],[[3346,3368],\"valid\"],[[3369,3369],\"valid\"],[[3370,3385],\"valid\"],[[3386,3386],\"valid\"],[[3387,3388],\"disallowed\"],[[3389,3389],\"valid\"],[[3390,3395],\"valid\"],[[3396,3396],\"valid\"],[[3397,3397],\"disallowed\"],[[3398,3400],\"valid\"],[[3401,3401],\"disallowed\"],[[3402,3405],\"valid\"],[[3406,3406],\"valid\"],[[3407,3414],\"disallowed\"],[[3415,3415],\"valid\"],[[3416,3422],\"disallowed\"],[[3423,3423],\"valid\"],[[3424,3425],\"valid\"],[[3426,3427],\"valid\"],[[3428,3429],\"disallowed\"],[[3430,3439],\"valid\"],[[3440,3445],\"valid\",[],\"NV8\"],[[3446,3448],\"disallowed\"],[[3449,3449],\"valid\",[],\"NV8\"],[[3450,3455],\"valid\"],[[3456,3457],\"disallowed\"],[[3458,3459],\"valid\"],[[3460,3460],\"disallowed\"],[[3461,3478],\"valid\"],[[3479,3481],\"disallowed\"],[[3482,3505],\"valid\"],[[3506,3506],\"disallowed\"],[[3507,3515],\"valid\"],[[3516,3516],\"disallowed\"],[[3517,3517],\"valid\"],[[3518,3519],\"disallowed\"],[[3520,3526],\"valid\"],[[3527,3529],\"disallowed\"],[[3530,3530],\"valid\"],[[3531,3534],\"disallowed\"],[[3535,3540],\"valid\"],[[3541,3541],\"disallowed\"],[[3542,3542],\"valid\"],[[3543,3543],\"disallowed\"],[[3544,3551],\"valid\"],[[3552,3557],\"disallowed\"],[[3558,3567],\"valid\"],[[3568,3569],\"disallowed\"],[[3570,3571],\"valid\"],[[3572,3572],\"valid\",[],\"NV8\"],[[3573,3584],\"disallowed\"],[[3585,3634],\"valid\"],[[3635,3635],\"mapped\",[3661,3634]],[[3636,3642],\"valid\"],[[3643,3646],\"disallowed\"],[[3647,3647],\"valid\",[],\"NV8\"],[[3648,3662],\"valid\"],[[3663,3663],\"valid\",[],\"NV8\"],[[3664,3673],\"valid\"],[[3674,3675],\"valid\",[],\"NV8\"],[[3676,3712],\"disallowed\"],[[3713,3714],\"valid\"],[[3715,3715],\"disallowed\"],[[3716,3716],\"valid\"],[[3717,3718],\"disallowed\"],[[3719,3720],\"valid\"],[[3721,3721],\"disallowed\"],[[3722,3722],\"valid\"],[[3723,3724],\"disallowed\"],[[3725,3725],\"valid\"],[[3726,3731],\"disallowed\"],[[3732,3735],\"valid\"],[[3736,3736],\"disallowed\"],[[3737,3743],\"valid\"],[[3744,3744],\"disallowed\"],[[3745,3747],\"valid\"],[[3748,3748],\"disallowed\"],[[3749,3749],\"valid\"],[[3750,3750],\"disallowed\"],[[3751,3751],\"valid\"],[[3752,3753],\"disallowed\"],[[3754,3755],\"valid\"],[[3756,3756],\"disallowed\"],[[3757,3762],\"valid\"],[[3763,3763],\"mapped\",[3789,3762]],[[3764,3769],\"valid\"],[[3770,3770],\"disallowed\"],[[3771,3773],\"valid\"],[[3774,3775],\"disallowed\"],[[3776,3780],\"valid\"],[[3781,3781],\"disallowed\"],[[3782,3782],\"valid\"],[[3783,3783],\"disallowed\"],[[3784,3789],\"valid\"],[[3790,3791],\"disallowed\"],[[3792,3801],\"valid\"],[[3802,3803],\"disallowed\"],[[3804,3804],\"mapped\",[3755,3737]],[[3805,3805],\"mapped\",[3755,3745]],[[3806,3807],\"valid\"],[[3808,3839],\"disallowed\"],[[3840,3840],\"valid\"],[[3841,3850],\"valid\",[],\"NV8\"],[[3851,3851],\"valid\"],[[3852,3852],\"mapped\",[3851]],[[3853,3863],\"valid\",[],\"NV8\"],[[3864,3865],\"valid\"],[[3866,3871],\"valid\",[],\"NV8\"],[[3872,3881],\"valid\"],[[3882,3892],\"valid\",[],\"NV8\"],[[3893,3893],\"valid\"],[[3894,3894],\"valid\",[],\"NV8\"],[[3895,3895],\"valid\"],[[3896,3896],\"valid\",[],\"NV8\"],[[3897,3897],\"valid\"],[[3898,3901],\"valid\",[],\"NV8\"],[[3902,3906],\"valid\"],[[3907,3907],\"mapped\",[3906,4023]],[[3908,3911],\"valid\"],[[3912,3912],\"disallowed\"],[[3913,3916],\"valid\"],[[3917,3917],\"mapped\",[3916,4023]],[[3918,3921],\"valid\"],[[3922,3922],\"mapped\",[3921,4023]],[[3923,3926],\"valid\"],[[3927,3927],\"mapped\",[3926,4023]],[[3928,3931],\"valid\"],[[3932,3932],\"mapped\",[3931,4023]],[[3933,3944],\"valid\"],[[3945,3945],\"mapped\",[3904,4021]],[[3946,3946],\"valid\"],[[3947,3948],\"valid\"],[[3949,3952],\"disallowed\"],[[3953,3954],\"valid\"],[[3955,3955],\"mapped\",[3953,3954]],[[3956,3956],\"valid\"],[[3957,3957],\"mapped\",[3953,3956]],[[3958,3958],\"mapped\",[4018,3968]],[[3959,3959],\"mapped\",[4018,3953,3968]],[[3960,3960],\"mapped\",[4019,3968]],[[3961,3961],\"mapped\",[4019,3953,3968]],[[3962,3968],\"valid\"],[[3969,3969],\"mapped\",[3953,3968]],[[3970,3972],\"valid\"],[[3973,3973],\"valid\",[],\"NV8\"],[[3974,3979],\"valid\"],[[3980,3983],\"valid\"],[[3984,3986],\"valid\"],[[3987,3987],\"mapped\",[3986,4023]],[[3988,3989],\"valid\"],[[3990,3990],\"valid\"],[[3991,3991],\"valid\"],[[3992,3992],\"disallowed\"],[[3993,3996],\"valid\"],[[3997,3997],\"mapped\",[3996,4023]],[[3998,4001],\"valid\"],[[4002,4002],\"mapped\",[4001,4023]],[[4003,4006],\"valid\"],[[4007,4007],\"mapped\",[4006,4023]],[[4008,4011],\"valid\"],[[4012,4012],\"mapped\",[4011,4023]],[[4013,4013],\"valid\"],[[4014,4016],\"valid\"],[[4017,4023],\"valid\"],[[4024,4024],\"valid\"],[[4025,4025],\"mapped\",[3984,4021]],[[4026,4028],\"valid\"],[[4029,4029],\"disallowed\"],[[4030,4037],\"valid\",[],\"NV8\"],[[4038,4038],\"valid\"],[[4039,4044],\"valid\",[],\"NV8\"],[[4045,4045],\"disallowed\"],[[4046,4046],\"valid\",[],\"NV8\"],[[4047,4047],\"valid\",[],\"NV8\"],[[4048,4049],\"valid\",[],\"NV8\"],[[4050,4052],\"valid\",[],\"NV8\"],[[4053,4056],\"valid\",[],\"NV8\"],[[4057,4058],\"valid\",[],\"NV8\"],[[4059,4095],\"disallowed\"],[[4096,4129],\"valid\"],[[4130,4130],\"valid\"],[[4131,4135],\"valid\"],[[4136,4136],\"valid\"],[[4137,4138],\"valid\"],[[4139,4139],\"valid\"],[[4140,4146],\"valid\"],[[4147,4149],\"valid\"],[[4150,4153],\"valid\"],[[4154,4159],\"valid\"],[[4160,4169],\"valid\"],[[4170,4175],\"valid\",[],\"NV8\"],[[4176,4185],\"valid\"],[[4186,4249],\"valid\"],[[4250,4253],\"valid\"],[[4254,4255],\"valid\",[],\"NV8\"],[[4256,4293],\"disallowed\"],[[4294,4294],\"disallowed\"],[[4295,4295],\"mapped\",[11559]],[[4296,4300],\"disallowed\"],[[4301,4301],\"mapped\",[11565]],[[4302,4303],\"disallowed\"],[[4304,4342],\"valid\"],[[4343,4344],\"valid\"],[[4345,4346],\"valid\"],[[4347,4347],\"valid\",[],\"NV8\"],[[4348,4348],\"mapped\",[4316]],[[4349,4351],\"valid\"],[[4352,4441],\"valid\",[],\"NV8\"],[[4442,4446],\"valid\",[],\"NV8\"],[[4447,4448],\"disallowed\"],[[4449,4514],\"valid\",[],\"NV8\"],[[4515,4519],\"valid\",[],\"NV8\"],[[4520,4601],\"valid\",[],\"NV8\"],[[4602,4607],\"valid\",[],\"NV8\"],[[4608,4614],\"valid\"],[[4615,4615],\"valid\"],[[4616,4678],\"valid\"],[[4679,4679],\"valid\"],[[4680,4680],\"valid\"],[[4681,4681],\"disallowed\"],[[4682,4685],\"valid\"],[[4686,4687],\"disallowed\"],[[4688,4694],\"valid\"],[[4695,4695],\"disallowed\"],[[4696,4696],\"valid\"],[[4697,4697],\"disallowed\"],[[4698,4701],\"valid\"],[[4702,4703],\"disallowed\"],[[4704,4742],\"valid\"],[[4743,4743],\"valid\"],[[4744,4744],\"valid\"],[[4745,4745],\"disallowed\"],[[4746,4749],\"valid\"],[[4750,4751],\"disallowed\"],[[4752,4782],\"valid\"],[[4783,4783],\"valid\"],[[4784,4784],\"valid\"],[[4785,4785],\"disallowed\"],[[4786,4789],\"valid\"],[[4790,4791],\"disallowed\"],[[4792,4798],\"valid\"],[[4799,4799],\"disallowed\"],[[4800,4800],\"valid\"],[[4801,4801],\"disallowed\"],[[4802,4805],\"valid\"],[[4806,4807],\"disallowed\"],[[4808,4814],\"valid\"],[[4815,4815],\"valid\"],[[4816,4822],\"valid\"],[[4823,4823],\"disallowed\"],[[4824,4846],\"valid\"],[[4847,4847],\"valid\"],[[4848,4878],\"valid\"],[[4879,4879],\"valid\"],[[4880,4880],\"valid\"],[[4881,4881],\"disallowed\"],[[4882,4885],\"valid\"],[[4886,4887],\"disallowed\"],[[4888,4894],\"valid\"],[[4895,4895],\"valid\"],[[4896,4934],\"valid\"],[[4935,4935],\"valid\"],[[4936,4954],\"valid\"],[[4955,4956],\"disallowed\"],[[4957,4958],\"valid\"],[[4959,4959],\"valid\"],[[4960,4960],\"valid\",[],\"NV8\"],[[4961,4988],\"valid\",[],\"NV8\"],[[4989,4991],\"disallowed\"],[[4992,5007],\"valid\"],[[5008,5017],\"valid\",[],\"NV8\"],[[5018,5023],\"disallowed\"],[[5024,5108],\"valid\"],[[5109,5109],\"valid\"],[[5110,5111],\"disallowed\"],[[5112,5112],\"mapped\",[5104]],[[5113,5113],\"mapped\",[5105]],[[5114,5114],\"mapped\",[5106]],[[5115,5115],\"mapped\",[5107]],[[5116,5116],\"mapped\",[5108]],[[5117,5117],\"mapped\",[5109]],[[5118,5119],\"disallowed\"],[[5120,5120],\"valid\",[],\"NV8\"],[[5121,5740],\"valid\"],[[5741,5742],\"valid\",[],\"NV8\"],[[5743,5750],\"valid\"],[[5751,5759],\"valid\"],[[5760,5760],\"disallowed\"],[[5761,5786],\"valid\"],[[5787,5788],\"valid\",[],\"NV8\"],[[5789,5791],\"disallowed\"],[[5792,5866],\"valid\"],[[5867,5872],\"valid\",[],\"NV8\"],[[5873,5880],\"valid\"],[[5881,5887],\"disallowed\"],[[5888,5900],\"valid\"],[[5901,5901],\"disallowed\"],[[5902,5908],\"valid\"],[[5909,5919],\"disallowed\"],[[5920,5940],\"valid\"],[[5941,5942],\"valid\",[],\"NV8\"],[[5943,5951],\"disallowed\"],[[5952,5971],\"valid\"],[[5972,5983],\"disallowed\"],[[5984,5996],\"valid\"],[[5997,5997],\"disallowed\"],[[5998,6000],\"valid\"],[[6001,6001],\"disallowed\"],[[6002,6003],\"valid\"],[[6004,6015],\"disallowed\"],[[6016,6067],\"valid\"],[[6068,6069],\"disallowed\"],[[6070,6099],\"valid\"],[[6100,6102],\"valid\",[],\"NV8\"],[[6103,6103],\"valid\"],[[6104,6107],\"valid\",[],\"NV8\"],[[6108,6108],\"valid\"],[[6109,6109],\"valid\"],[[6110,6111],\"disallowed\"],[[6112,6121],\"valid\"],[[6122,6127],\"disallowed\"],[[6128,6137],\"valid\",[],\"NV8\"],[[6138,6143],\"disallowed\"],[[6144,6149],\"valid\",[],\"NV8\"],[[6150,6150],\"disallowed\"],[[6151,6154],\"valid\",[],\"NV8\"],[[6155,6157],\"ignored\"],[[6158,6158],\"disallowed\"],[[6159,6159],\"disallowed\"],[[6160,6169],\"valid\"],[[6170,6175],\"disallowed\"],[[6176,6263],\"valid\"],[[6264,6271],\"disallowed\"],[[6272,6313],\"valid\"],[[6314,6314],\"valid\"],[[6315,6319],\"disallowed\"],[[6320,6389],\"valid\"],[[6390,6399],\"disallowed\"],[[6400,6428],\"valid\"],[[6429,6430],\"valid\"],[[6431,6431],\"disallowed\"],[[6432,6443],\"valid\"],[[6444,6447],\"disallowed\"],[[6448,6459],\"valid\"],[[6460,6463],\"disallowed\"],[[6464,6464],\"valid\",[],\"NV8\"],[[6465,6467],\"disallowed\"],[[6468,6469],\"valid\",[],\"NV8\"],[[6470,6509],\"valid\"],[[6510,6511],\"disallowed\"],[[6512,6516],\"valid\"],[[6517,6527],\"disallowed\"],[[6528,6569],\"valid\"],[[6570,6571],\"valid\"],[[6572,6575],\"disallowed\"],[[6576,6601],\"valid\"],[[6602,6607],\"disallowed\"],[[6608,6617],\"valid\"],[[6618,6618],\"valid\",[],\"XV8\"],[[6619,6621],\"disallowed\"],[[6622,6623],\"valid\",[],\"NV8\"],[[6624,6655],\"valid\",[],\"NV8\"],[[6656,6683],\"valid\"],[[6684,6685],\"disallowed\"],[[6686,6687],\"valid\",[],\"NV8\"],[[6688,6750],\"valid\"],[[6751,6751],\"disallowed\"],[[6752,6780],\"valid\"],[[6781,6782],\"disallowed\"],[[6783,6793],\"valid\"],[[6794,6799],\"disallowed\"],[[6800,6809],\"valid\"],[[6810,6815],\"disallowed\"],[[6816,6822],\"valid\",[],\"NV8\"],[[6823,6823],\"valid\"],[[6824,6829],\"valid\",[],\"NV8\"],[[6830,6831],\"disallowed\"],[[6832,6845],\"valid\"],[[6846,6846],\"valid\",[],\"NV8\"],[[6847,6911],\"disallowed\"],[[6912,6987],\"valid\"],[[6988,6991],\"disallowed\"],[[6992,7001],\"valid\"],[[7002,7018],\"valid\",[],\"NV8\"],[[7019,7027],\"valid\"],[[7028,7036],\"valid\",[],\"NV8\"],[[7037,7039],\"disallowed\"],[[7040,7082],\"valid\"],[[7083,7085],\"valid\"],[[7086,7097],\"valid\"],[[7098,7103],\"valid\"],[[7104,7155],\"valid\"],[[7156,7163],\"disallowed\"],[[7164,7167],\"valid\",[],\"NV8\"],[[7168,7223],\"valid\"],[[7224,7226],\"disallowed\"],[[7227,7231],\"valid\",[],\"NV8\"],[[7232,7241],\"valid\"],[[7242,7244],\"disallowed\"],[[7245,7293],\"valid\"],[[7294,7295],\"valid\",[],\"NV8\"],[[7296,7359],\"disallowed\"],[[7360,7367],\"valid\",[],\"NV8\"],[[7368,7375],\"disallowed\"],[[7376,7378],\"valid\"],[[7379,7379],\"valid\",[],\"NV8\"],[[7380,7410],\"valid\"],[[7411,7414],\"valid\"],[[7415,7415],\"disallowed\"],[[7416,7417],\"valid\"],[[7418,7423],\"disallowed\"],[[7424,7467],\"valid\"],[[7468,7468],\"mapped\",[97]],[[7469,7469],\"mapped\",[230]],[[7470,7470],\"mapped\",[98]],[[7471,7471],\"valid\"],[[7472,7472],\"mapped\",[100]],[[7473,7473],\"mapped\",[101]],[[7474,7474],\"mapped\",[477]],[[7475,7475],\"mapped\",[103]],[[7476,7476],\"mapped\",[104]],[[7477,7477],\"mapped\",[105]],[[7478,7478],\"mapped\",[106]],[[7479,7479],\"mapped\",[107]],[[7480,7480],\"mapped\",[108]],[[7481,7481],\"mapped\",[109]],[[7482,7482],\"mapped\",[110]],[[7483,7483],\"valid\"],[[7484,7484],\"mapped\",[111]],[[7485,7485],\"mapped\",[547]],[[7486,7486],\"mapped\",[112]],[[7487,7487],\"mapped\",[114]],[[7488,7488],\"mapped\",[116]],[[7489,7489],\"mapped\",[117]],[[7490,7490],\"mapped\",[119]],[[7491,7491],\"mapped\",[97]],[[7492,7492],\"mapped\",[592]],[[7493,7493],\"mapped\",[593]],[[7494,7494],\"mapped\",[7426]],[[7495,7495],\"mapped\",[98]],[[7496,7496],\"mapped\",[100]],[[7497,7497],\"mapped\",[101]],[[7498,7498],\"mapped\",[601]],[[7499,7499],\"mapped\",[603]],[[7500,7500],\"mapped\",[604]],[[7501,7501],\"mapped\",[103]],[[7502,7502],\"valid\"],[[7503,7503],\"mapped\",[107]],[[7504,7504],\"mapped\",[109]],[[7505,7505],\"mapped\",[331]],[[7506,7506],\"mapped\",[111]],[[7507,7507],\"mapped\",[596]],[[7508,7508],\"mapped\",[7446]],[[7509,7509],\"mapped\",[7447]],[[7510,7510],\"mapped\",[112]],[[7511,7511],\"mapped\",[116]],[[7512,7512],\"mapped\",[117]],[[7513,7513],\"mapped\",[7453]],[[7514,7514],\"mapped\",[623]],[[7515,7515],\"mapped\",[118]],[[7516,7516],\"mapped\",[7461]],[[7517,7517],\"mapped\",[946]],[[7518,7518],\"mapped\",[947]],[[7519,7519],\"mapped\",[948]],[[7520,7520],\"mapped\",[966]],[[7521,7521],\"mapped\",[967]],[[7522,7522],\"mapped\",[105]],[[7523,7523],\"mapped\",[114]],[[7524,7524],\"mapped\",[117]],[[7525,7525],\"mapped\",[118]],[[7526,7526],\"mapped\",[946]],[[7527,7527],\"mapped\",[947]],[[7528,7528],\"mapped\",[961]],[[7529,7529],\"mapped\",[966]],[[7530,7530],\"mapped\",[967]],[[7531,7531],\"valid\"],[[7532,7543],\"valid\"],[[7544,7544],\"mapped\",[1085]],[[7545,7578],\"valid\"],[[7579,7579],\"mapped\",[594]],[[7580,7580],\"mapped\",[99]],[[7581,7581],\"mapped\",[597]],[[7582,7582],\"mapped\",[240]],[[7583,7583],\"mapped\",[604]],[[7584,7584],\"mapped\",[102]],[[7585,7585],\"mapped\",[607]],[[7586,7586],\"mapped\",[609]],[[7587,7587],\"mapped\",[613]],[[7588,7588],\"mapped\",[616]],[[7589,7589],\"mapped\",[617]],[[7590,7590],\"mapped\",[618]],[[7591,7591],\"mapped\",[7547]],[[7592,7592],\"mapped\",[669]],[[7593,7593],\"mapped\",[621]],[[7594,7594],\"mapped\",[7557]],[[7595,7595],\"mapped\",[671]],[[7596,7596],\"mapped\",[625]],[[7597,7597],\"mapped\",[624]],[[7598,7598],\"mapped\",[626]],[[7599,7599],\"mapped\",[627]],[[7600,7600],\"mapped\",[628]],[[7601,7601],\"mapped\",[629]],[[7602,7602],\"mapped\",[632]],[[7603,7603],\"mapped\",[642]],[[7604,7604],\"mapped\",[643]],[[7605,7605],\"mapped\",[427]],[[7606,7606],\"mapped\",[649]],[[7607,7607],\"mapped\",[650]],[[7608,7608],\"mapped\",[7452]],[[7609,7609],\"mapped\",[651]],[[7610,7610],\"mapped\",[652]],[[7611,7611],\"mapped\",[122]],[[7612,7612],\"mapped\",[656]],[[7613,7613],\"mapped\",[657]],[[7614,7614],\"mapped\",[658]],[[7615,7615],\"mapped\",[952]],[[7616,7619],\"valid\"],[[7620,7626],\"valid\"],[[7627,7654],\"valid\"],[[7655,7669],\"valid\"],[[7670,7675],\"disallowed\"],[[7676,7676],\"valid\"],[[7677,7677],\"valid\"],[[7678,7679],\"valid\"],[[7680,7680],\"mapped\",[7681]],[[7681,7681],\"valid\"],[[7682,7682],\"mapped\",[7683]],[[7683,7683],\"valid\"],[[7684,7684],\"mapped\",[7685]],[[7685,7685],\"valid\"],[[7686,7686],\"mapped\",[7687]],[[7687,7687],\"valid\"],[[7688,7688],\"mapped\",[7689]],[[7689,7689],\"valid\"],[[7690,7690],\"mapped\",[7691]],[[7691,7691],\"valid\"],[[7692,7692],\"mapped\",[7693]],[[7693,7693],\"valid\"],[[7694,7694],\"mapped\",[7695]],[[7695,7695],\"valid\"],[[7696,7696],\"mapped\",[7697]],[[7697,7697],\"valid\"],[[7698,7698],\"mapped\",[7699]],[[7699,7699],\"valid\"],[[7700,7700],\"mapped\",[7701]],[[7701,7701],\"valid\"],[[7702,7702],\"mapped\",[7703]],[[7703,7703],\"valid\"],[[7704,7704],\"mapped\",[7705]],[[7705,7705],\"valid\"],[[7706,7706],\"mapped\",[7707]],[[7707,7707],\"valid\"],[[7708,7708],\"mapped\",[7709]],[[7709,7709],\"valid\"],[[7710,7710],\"mapped\",[7711]],[[7711,7711],\"valid\"],[[7712,7712],\"mapped\",[7713]],[[7713,7713],\"valid\"],[[7714,7714],\"mapped\",[7715]],[[7715,7715],\"valid\"],[[7716,7716],\"mapped\",[7717]],[[7717,7717],\"valid\"],[[7718,7718],\"mapped\",[7719]],[[7719,7719],\"valid\"],[[7720,7720],\"mapped\",[7721]],[[7721,7721],\"valid\"],[[7722,7722],\"mapped\",[7723]],[[7723,7723],\"valid\"],[[7724,7724],\"mapped\",[7725]],[[7725,7725],\"valid\"],[[7726,7726],\"mapped\",[7727]],[[7727,7727],\"valid\"],[[7728,7728],\"mapped\",[7729]],[[7729,7729],\"valid\"],[[7730,7730],\"mapped\",[7731]],[[7731,7731],\"valid\"],[[7732,7732],\"mapped\",[7733]],[[7733,7733],\"valid\"],[[7734,7734],\"mapped\",[7735]],[[7735,7735],\"valid\"],[[7736,7736],\"mapped\",[7737]],[[7737,7737],\"valid\"],[[7738,7738],\"mapped\",[7739]],[[7739,7739],\"valid\"],[[7740,7740],\"mapped\",[7741]],[[7741,7741],\"valid\"],[[7742,7742],\"mapped\",[7743]],[[7743,7743],\"valid\"],[[7744,7744],\"mapped\",[7745]],[[7745,7745],\"valid\"],[[7746,7746],\"mapped\",[7747]],[[7747,7747],\"valid\"],[[7748,7748],\"mapped\",[7749]],[[7749,7749],\"valid\"],[[7750,7750],\"mapped\",[7751]],[[7751,7751],\"valid\"],[[7752,7752],\"mapped\",[7753]],[[7753,7753],\"valid\"],[[7754,7754],\"mapped\",[7755]],[[7755,7755],\"valid\"],[[7756,7756],\"mapped\",[7757]],[[7757,7757],\"valid\"],[[7758,7758],\"mapped\",[7759]],[[7759,7759],\"valid\"],[[7760,7760],\"mapped\",[7761]],[[7761,7761],\"valid\"],[[7762,7762],\"mapped\",[7763]],[[7763,7763],\"valid\"],[[7764,7764],\"mapped\",[7765]],[[7765,7765],\"valid\"],[[7766,7766],\"mapped\",[7767]],[[7767,7767],\"valid\"],[[7768,7768],\"mapped\",[7769]],[[7769,7769],\"valid\"],[[7770,7770],\"mapped\",[7771]],[[7771,7771],\"valid\"],[[7772,7772],\"mapped\",[7773]],[[7773,7773],\"valid\"],[[7774,7774],\"mapped\",[7775]],[[7775,7775],\"valid\"],[[7776,7776],\"mapped\",[7777]],[[7777,7777],\"valid\"],[[7778,7778],\"mapped\",[7779]],[[7779,7779],\"valid\"],[[7780,7780],\"mapped\",[7781]],[[7781,7781],\"valid\"],[[7782,7782],\"mapped\",[7783]],[[7783,7783],\"valid\"],[[7784,7784],\"mapped\",[7785]],[[7785,7785],\"valid\"],[[7786,7786],\"mapped\",[7787]],[[7787,7787],\"valid\"],[[7788,7788],\"mapped\",[7789]],[[7789,7789],\"valid\"],[[7790,7790],\"mapped\",[7791]],[[7791,7791],\"valid\"],[[7792,7792],\"mapped\",[7793]],[[7793,7793],\"valid\"],[[7794,7794],\"mapped\",[7795]],[[7795,7795],\"valid\"],[[7796,7796],\"mapped\",[7797]],[[7797,7797],\"valid\"],[[7798,7798],\"mapped\",[7799]],[[7799,7799],\"valid\"],[[7800,7800],\"mapped\",[7801]],[[7801,7801],\"valid\"],[[7802,7802],\"mapped\",[7803]],[[7803,7803],\"valid\"],[[7804,7804],\"mapped\",[7805]],[[7805,7805],\"valid\"],[[7806,7806],\"mapped\",[7807]],[[7807,7807],\"valid\"],[[7808,7808],\"mapped\",[7809]],[[7809,7809],\"valid\"],[[7810,7810],\"mapped\",[7811]],[[7811,7811],\"valid\"],[[7812,7812],\"mapped\",[7813]],[[7813,7813],\"valid\"],[[7814,7814],\"mapped\",[7815]],[[7815,7815],\"valid\"],[[7816,7816],\"mapped\",[7817]],[[7817,7817],\"valid\"],[[7818,7818],\"mapped\",[7819]],[[7819,7819],\"valid\"],[[7820,7820],\"mapped\",[7821]],[[7821,7821],\"valid\"],[[7822,7822],\"mapped\",[7823]],[[7823,7823],\"valid\"],[[7824,7824],\"mapped\",[7825]],[[7825,7825],\"valid\"],[[7826,7826],\"mapped\",[7827]],[[7827,7827],\"valid\"],[[7828,7828],\"mapped\",[7829]],[[7829,7833],\"valid\"],[[7834,7834],\"mapped\",[97,702]],[[7835,7835],\"mapped\",[7777]],[[7836,7837],\"valid\"],[[7838,7838],\"mapped\",[115,115]],[[7839,7839],\"valid\"],[[7840,7840],\"mapped\",[7841]],[[7841,7841],\"valid\"],[[7842,7842],\"mapped\",[7843]],[[7843,7843],\"valid\"],[[7844,7844],\"mapped\",[7845]],[[7845,7845],\"valid\"],[[7846,7846],\"mapped\",[7847]],[[7847,7847],\"valid\"],[[7848,7848],\"mapped\",[7849]],[[7849,7849],\"valid\"],[[7850,7850],\"mapped\",[7851]],[[7851,7851],\"valid\"],[[7852,7852],\"mapped\",[7853]],[[7853,7853],\"valid\"],[[7854,7854],\"mapped\",[7855]],[[7855,7855],\"valid\"],[[7856,7856],\"mapped\",[7857]],[[7857,7857],\"valid\"],[[7858,7858],\"mapped\",[7859]],[[7859,7859],\"valid\"],[[7860,7860],\"mapped\",[7861]],[[7861,7861],\"valid\"],[[7862,7862],\"mapped\",[7863]],[[7863,7863],\"valid\"],[[7864,7864],\"mapped\",[7865]],[[7865,7865],\"valid\"],[[7866,7866],\"mapped\",[7867]],[[7867,7867],\"valid\"],[[7868,7868],\"mapped\",[7869]],[[7869,7869],\"valid\"],[[7870,7870],\"mapped\",[7871]],[[7871,7871],\"valid\"],[[7872,7872],\"mapped\",[7873]],[[7873,7873],\"valid\"],[[7874,7874],\"mapped\",[7875]],[[7875,7875],\"valid\"],[[7876,7876],\"mapped\",[7877]],[[7877,7877],\"valid\"],[[7878,7878],\"mapped\",[7879]],[[7879,7879],\"valid\"],[[7880,7880],\"mapped\",[7881]],[[7881,7881],\"valid\"],[[7882,7882],\"mapped\",[7883]],[[7883,7883],\"valid\"],[[7884,7884],\"mapped\",[7885]],[[7885,7885],\"valid\"],[[7886,7886],\"mapped\",[7887]],[[7887,7887],\"valid\"],[[7888,7888],\"mapped\",[7889]],[[7889,7889],\"valid\"],[[7890,7890],\"mapped\",[7891]],[[7891,7891],\"valid\"],[[7892,7892],\"mapped\",[7893]],[[7893,7893],\"valid\"],[[7894,7894],\"mapped\",[7895]],[[7895,7895],\"valid\"],[[7896,7896],\"mapped\",[7897]],[[7897,7897],\"valid\"],[[7898,7898],\"mapped\",[7899]],[[7899,7899],\"valid\"],[[7900,7900],\"mapped\",[7901]],[[7901,7901],\"valid\"],[[7902,7902],\"mapped\",[7903]],[[7903,7903],\"valid\"],[[7904,7904],\"mapped\",[7905]],[[7905,7905],\"valid\"],[[7906,7906],\"mapped\",[7907]],[[7907,7907],\"valid\"],[[7908,7908],\"mapped\",[7909]],[[7909,7909],\"valid\"],[[7910,7910],\"mapped\",[7911]],[[7911,7911],\"valid\"],[[7912,7912],\"mapped\",[7913]],[[7913,7913],\"valid\"],[[7914,7914],\"mapped\",[7915]],[[7915,7915],\"valid\"],[[7916,7916],\"mapped\",[7917]],[[7917,7917],\"valid\"],[[7918,7918],\"mapped\",[7919]],[[7919,7919],\"valid\"],[[7920,7920],\"mapped\",[7921]],[[7921,7921],\"valid\"],[[7922,7922],\"mapped\",[7923]],[[7923,7923],\"valid\"],[[7924,7924],\"mapped\",[7925]],[[7925,7925],\"valid\"],[[7926,7926],\"mapped\",[7927]],[[7927,7927],\"valid\"],[[7928,7928],\"mapped\",[7929]],[[7929,7929],\"valid\"],[[7930,7930],\"mapped\",[7931]],[[7931,7931],\"valid\"],[[7932,7932],\"mapped\",[7933]],[[7933,7933],\"valid\"],[[7934,7934],\"mapped\",[7935]],[[7935,7935],\"valid\"],[[7936,7943],\"valid\"],[[7944,7944],\"mapped\",[7936]],[[7945,7945],\"mapped\",[7937]],[[7946,7946],\"mapped\",[7938]],[[7947,7947],\"mapped\",[7939]],[[7948,7948],\"mapped\",[7940]],[[7949,7949],\"mapped\",[7941]],[[7950,7950],\"mapped\",[7942]],[[7951,7951],\"mapped\",[7943]],[[7952,7957],\"valid\"],[[7958,7959],\"disallowed\"],[[7960,7960],\"mapped\",[7952]],[[7961,7961],\"mapped\",[7953]],[[7962,7962],\"mapped\",[7954]],[[7963,7963],\"mapped\",[7955]],[[7964,7964],\"mapped\",[7956]],[[7965,7965],\"mapped\",[7957]],[[7966,7967],\"disallowed\"],[[7968,7975],\"valid\"],[[7976,7976],\"mapped\",[7968]],[[7977,7977],\"mapped\",[7969]],[[7978,7978],\"mapped\",[7970]],[[7979,7979],\"mapped\",[7971]],[[7980,7980],\"mapped\",[7972]],[[7981,7981],\"mapped\",[7973]],[[7982,7982],\"mapped\",[7974]],[[7983,7983],\"mapped\",[7975]],[[7984,7991],\"valid\"],[[7992,7992],\"mapped\",[7984]],[[7993,7993],\"mapped\",[7985]],[[7994,7994],\"mapped\",[7986]],[[7995,7995],\"mapped\",[7987]],[[7996,7996],\"mapped\",[7988]],[[7997,7997],\"mapped\",[7989]],[[7998,7998],\"mapped\",[7990]],[[7999,7999],\"mapped\",[7991]],[[8000,8005],\"valid\"],[[8006,8007],\"disallowed\"],[[8008,8008],\"mapped\",[8000]],[[8009,8009],\"mapped\",[8001]],[[8010,8010],\"mapped\",[8002]],[[8011,8011],\"mapped\",[8003]],[[8012,8012],\"mapped\",[8004]],[[8013,8013],\"mapped\",[8005]],[[8014,8015],\"disallowed\"],[[8016,8023],\"valid\"],[[8024,8024],\"disallowed\"],[[8025,8025],\"mapped\",[8017]],[[8026,8026],\"disallowed\"],[[8027,8027],\"mapped\",[8019]],[[8028,8028],\"disallowed\"],[[8029,8029],\"mapped\",[8021]],[[8030,8030],\"disallowed\"],[[8031,8031],\"mapped\",[8023]],[[8032,8039],\"valid\"],[[8040,8040],\"mapped\",[8032]],[[8041,8041],\"mapped\",[8033]],[[8042,8042],\"mapped\",[8034]],[[8043,8043],\"mapped\",[8035]],[[8044,8044],\"mapped\",[8036]],[[8045,8045],\"mapped\",[8037]],[[8046,8046],\"mapped\",[8038]],[[8047,8047],\"mapped\",[8039]],[[8048,8048],\"valid\"],[[8049,8049],\"mapped\",[940]],[[8050,8050],\"valid\"],[[8051,8051],\"mapped\",[941]],[[8052,8052],\"valid\"],[[8053,8053],\"mapped\",[942]],[[8054,8054],\"valid\"],[[8055,8055],\"mapped\",[943]],[[8056,8056],\"valid\"],[[8057,8057],\"mapped\",[972]],[[8058,8058],\"valid\"],[[8059,8059],\"mapped\",[973]],[[8060,8060],\"valid\"],[[8061,8061],\"mapped\",[974]],[[8062,8063],\"disallowed\"],[[8064,8064],\"mapped\",[7936,953]],[[8065,8065],\"mapped\",[7937,953]],[[8066,8066],\"mapped\",[7938,953]],[[8067,8067],\"mapped\",[7939,953]],[[8068,8068],\"mapped\",[7940,953]],[[8069,8069],\"mapped\",[7941,953]],[[8070,8070],\"mapped\",[7942,953]],[[8071,8071],\"mapped\",[7943,953]],[[8072,8072],\"mapped\",[7936,953]],[[8073,8073],\"mapped\",[7937,953]],[[8074,8074],\"mapped\",[7938,953]],[[8075,8075],\"mapped\",[7939,953]],[[8076,8076],\"mapped\",[7940,953]],[[8077,8077],\"mapped\",[7941,953]],[[8078,8078],\"mapped\",[7942,953]],[[8079,8079],\"mapped\",[7943,953]],[[8080,8080],\"mapped\",[7968,953]],[[8081,8081],\"mapped\",[7969,953]],[[8082,8082],\"mapped\",[7970,953]],[[8083,8083],\"mapped\",[7971,953]],[[8084,8084],\"mapped\",[7972,953]],[[8085,8085],\"mapped\",[7973,953]],[[8086,8086],\"mapped\",[7974,953]],[[8087,8087],\"mapped\",[7975,953]],[[8088,8088],\"mapped\",[7968,953]],[[8089,8089],\"mapped\",[7969,953]],[[8090,8090],\"mapped\",[7970,953]],[[8091,8091],\"mapped\",[7971,953]],[[8092,8092],\"mapped\",[7972,953]],[[8093,8093],\"mapped\",[7973,953]],[[8094,8094],\"mapped\",[7974,953]],[[8095,8095],\"mapped\",[7975,953]],[[8096,8096],\"mapped\",[8032,953]],[[8097,8097],\"mapped\",[8033,953]],[[8098,8098],\"mapped\",[8034,953]],[[8099,8099],\"mapped\",[8035,953]],[[8100,8100],\"mapped\",[8036,953]],[[8101,8101],\"mapped\",[8037,953]],[[8102,8102],\"mapped\",[8038,953]],[[8103,8103],\"mapped\",[8039,953]],[[8104,8104],\"mapped\",[8032,953]],[[8105,8105],\"mapped\",[8033,953]],[[8106,8106],\"mapped\",[8034,953]],[[8107,8107],\"mapped\",[8035,953]],[[8108,8108],\"mapped\",[8036,953]],[[8109,8109],\"mapped\",[8037,953]],[[8110,8110],\"mapped\",[8038,953]],[[8111,8111],\"mapped\",[8039,953]],[[8112,8113],\"valid\"],[[8114,8114],\"mapped\",[8048,953]],[[8115,8115],\"mapped\",[945,953]],[[8116,8116],\"mapped\",[940,953]],[[8117,8117],\"disallowed\"],[[8118,8118],\"valid\"],[[8119,8119],\"mapped\",[8118,953]],[[8120,8120],\"mapped\",[8112]],[[8121,8121],\"mapped\",[8113]],[[8122,8122],\"mapped\",[8048]],[[8123,8123],\"mapped\",[940]],[[8124,8124],\"mapped\",[945,953]],[[8125,8125],\"disallowed_STD3_mapped\",[32,787]],[[8126,8126],\"mapped\",[953]],[[8127,8127],\"disallowed_STD3_mapped\",[32,787]],[[8128,8128],\"disallowed_STD3_mapped\",[32,834]],[[8129,8129],\"disallowed_STD3_mapped\",[32,776,834]],[[8130,8130],\"mapped\",[8052,953]],[[8131,8131],\"mapped\",[951,953]],[[8132,8132],\"mapped\",[942,953]],[[8133,8133],\"disallowed\"],[[8134,8134],\"valid\"],[[8135,8135],\"mapped\",[8134,953]],[[8136,8136],\"mapped\",[8050]],[[8137,8137],\"mapped\",[941]],[[8138,8138],\"mapped\",[8052]],[[8139,8139],\"mapped\",[942]],[[8140,8140],\"mapped\",[951,953]],[[8141,8141],\"disallowed_STD3_mapped\",[32,787,768]],[[8142,8142],\"disallowed_STD3_mapped\",[32,787,769]],[[8143,8143],\"disallowed_STD3_mapped\",[32,787,834]],[[8144,8146],\"valid\"],[[8147,8147],\"mapped\",[912]],[[8148,8149],\"disallowed\"],[[8150,8151],\"valid\"],[[8152,8152],\"mapped\",[8144]],[[8153,8153],\"mapped\",[8145]],[[8154,8154],\"mapped\",[8054]],[[8155,8155],\"mapped\",[943]],[[8156,8156],\"disallowed\"],[[8157,8157],\"disallowed_STD3_mapped\",[32,788,768]],[[8158,8158],\"disallowed_STD3_mapped\",[32,788,769]],[[8159,8159],\"disallowed_STD3_mapped\",[32,788,834]],[[8160,8162],\"valid\"],[[8163,8163],\"mapped\",[944]],[[8164,8167],\"valid\"],[[8168,8168],\"mapped\",[8160]],[[8169,8169],\"mapped\",[8161]],[[8170,8170],\"mapped\",[8058]],[[8171,8171],\"mapped\",[973]],[[8172,8172],\"mapped\",[8165]],[[8173,8173],\"disallowed_STD3_mapped\",[32,776,768]],[[8174,8174],\"disallowed_STD3_mapped\",[32,776,769]],[[8175,8175],\"disallowed_STD3_mapped\",[96]],[[8176,8177],\"disallowed\"],[[8178,8178],\"mapped\",[8060,953]],[[8179,8179],\"mapped\",[969,953]],[[8180,8180],\"mapped\",[974,953]],[[8181,8181],\"disallowed\"],[[8182,8182],\"valid\"],[[8183,8183],\"mapped\",[8182,953]],[[8184,8184],\"mapped\",[8056]],[[8185,8185],\"mapped\",[972]],[[8186,8186],\"mapped\",[8060]],[[8187,8187],\"mapped\",[974]],[[8188,8188],\"mapped\",[969,953]],[[8189,8189],\"disallowed_STD3_mapped\",[32,769]],[[8190,8190],\"disallowed_STD3_mapped\",[32,788]],[[8191,8191],\"disallowed\"],[[8192,8202],\"disallowed_STD3_mapped\",[32]],[[8203,8203],\"ignored\"],[[8204,8205],\"deviation\",[]],[[8206,8207],\"disallowed\"],[[8208,8208],\"valid\",[],\"NV8\"],[[8209,8209],\"mapped\",[8208]],[[8210,8214],\"valid\",[],\"NV8\"],[[8215,8215],\"disallowed_STD3_mapped\",[32,819]],[[8216,8227],\"valid\",[],\"NV8\"],[[8228,8230],\"disallowed\"],[[8231,8231],\"valid\",[],\"NV8\"],[[8232,8238],\"disallowed\"],[[8239,8239],\"disallowed_STD3_mapped\",[32]],[[8240,8242],\"valid\",[],\"NV8\"],[[8243,8243],\"mapped\",[8242,8242]],[[8244,8244],\"mapped\",[8242,8242,8242]],[[8245,8245],\"valid\",[],\"NV8\"],[[8246,8246],\"mapped\",[8245,8245]],[[8247,8247],\"mapped\",[8245,8245,8245]],[[8248,8251],\"valid\",[],\"NV8\"],[[8252,8252],\"disallowed_STD3_mapped\",[33,33]],[[8253,8253],\"valid\",[],\"NV8\"],[[8254,8254],\"disallowed_STD3_mapped\",[32,773]],[[8255,8262],\"valid\",[],\"NV8\"],[[8263,8263],\"disallowed_STD3_mapped\",[63,63]],[[8264,8264],\"disallowed_STD3_mapped\",[63,33]],[[8265,8265],\"disallowed_STD3_mapped\",[33,63]],[[8266,8269],\"valid\",[],\"NV8\"],[[8270,8274],\"valid\",[],\"NV8\"],[[8275,8276],\"valid\",[],\"NV8\"],[[8277,8278],\"valid\",[],\"NV8\"],[[8279,8279],\"mapped\",[8242,8242,8242,8242]],[[8280,8286],\"valid\",[],\"NV8\"],[[8287,8287],\"disallowed_STD3_mapped\",[32]],[[8288,8288],\"ignored\"],[[8289,8291],\"disallowed\"],[[8292,8292],\"ignored\"],[[8293,8293],\"disallowed\"],[[8294,8297],\"disallowed\"],[[8298,8303],\"disallowed\"],[[8304,8304],\"mapped\",[48]],[[8305,8305],\"mapped\",[105]],[[8306,8307],\"disallowed\"],[[8308,8308],\"mapped\",[52]],[[8309,8309],\"mapped\",[53]],[[8310,8310],\"mapped\",[54]],[[8311,8311],\"mapped\",[55]],[[8312,8312],\"mapped\",[56]],[[8313,8313],\"mapped\",[57]],[[8314,8314],\"disallowed_STD3_mapped\",[43]],[[8315,8315],\"mapped\",[8722]],[[8316,8316],\"disallowed_STD3_mapped\",[61]],[[8317,8317],\"disallowed_STD3_mapped\",[40]],[[8318,8318],\"disallowed_STD3_mapped\",[41]],[[8319,8319],\"mapped\",[110]],[[8320,8320],\"mapped\",[48]],[[8321,8321],\"mapped\",[49]],[[8322,8322],\"mapped\",[50]],[[8323,8323],\"mapped\",[51]],[[8324,8324],\"mapped\",[52]],[[8325,8325],\"mapped\",[53]],[[8326,8326],\"mapped\",[54]],[[8327,8327],\"mapped\",[55]],[[8328,8328],\"mapped\",[56]],[[8329,8329],\"mapped\",[57]],[[8330,8330],\"disallowed_STD3_mapped\",[43]],[[8331,8331],\"mapped\",[8722]],[[8332,8332],\"disallowed_STD3_mapped\",[61]],[[8333,8333],\"disallowed_STD3_mapped\",[40]],[[8334,8334],\"disallowed_STD3_mapped\",[41]],[[8335,8335],\"disallowed\"],[[8336,8336],\"mapped\",[97]],[[8337,8337],\"mapped\",[101]],[[8338,8338],\"mapped\",[111]],[[8339,8339],\"mapped\",[120]],[[8340,8340],\"mapped\",[601]],[[8341,8341],\"mapped\",[104]],[[8342,8342],\"mapped\",[107]],[[8343,8343],\"mapped\",[108]],[[8344,8344],\"mapped\",[109]],[[8345,8345],\"mapped\",[110]],[[8346,8346],\"mapped\",[112]],[[8347,8347],\"mapped\",[115]],[[8348,8348],\"mapped\",[116]],[[8349,8351],\"disallowed\"],[[8352,8359],\"valid\",[],\"NV8\"],[[8360,8360],\"mapped\",[114,115]],[[8361,8362],\"valid\",[],\"NV8\"],[[8363,8363],\"valid\",[],\"NV8\"],[[8364,8364],\"valid\",[],\"NV8\"],[[8365,8367],\"valid\",[],\"NV8\"],[[8368,8369],\"valid\",[],\"NV8\"],[[8370,8373],\"valid\",[],\"NV8\"],[[8374,8376],\"valid\",[],\"NV8\"],[[8377,8377],\"valid\",[],\"NV8\"],[[8378,8378],\"valid\",[],\"NV8\"],[[8379,8381],\"valid\",[],\"NV8\"],[[8382,8382],\"valid\",[],\"NV8\"],[[8383,8399],\"disallowed\"],[[8400,8417],\"valid\",[],\"NV8\"],[[8418,8419],\"valid\",[],\"NV8\"],[[8420,8426],\"valid\",[],\"NV8\"],[[8427,8427],\"valid\",[],\"NV8\"],[[8428,8431],\"valid\",[],\"NV8\"],[[8432,8432],\"valid\",[],\"NV8\"],[[8433,8447],\"disallowed\"],[[8448,8448],\"disallowed_STD3_mapped\",[97,47,99]],[[8449,8449],\"disallowed_STD3_mapped\",[97,47,115]],[[8450,8450],\"mapped\",[99]],[[8451,8451],\"mapped\",[176,99]],[[8452,8452],\"valid\",[],\"NV8\"],[[8453,8453],\"disallowed_STD3_mapped\",[99,47,111]],[[8454,8454],\"disallowed_STD3_mapped\",[99,47,117]],[[8455,8455],\"mapped\",[603]],[[8456,8456],\"valid\",[],\"NV8\"],[[8457,8457],\"mapped\",[176,102]],[[8458,8458],\"mapped\",[103]],[[8459,8462],\"mapped\",[104]],[[8463,8463],\"mapped\",[295]],[[8464,8465],\"mapped\",[105]],[[8466,8467],\"mapped\",[108]],[[8468,8468],\"valid\",[],\"NV8\"],[[8469,8469],\"mapped\",[110]],[[8470,8470],\"mapped\",[110,111]],[[8471,8472],\"valid\",[],\"NV8\"],[[8473,8473],\"mapped\",[112]],[[8474,8474],\"mapped\",[113]],[[8475,8477],\"mapped\",[114]],[[8478,8479],\"valid\",[],\"NV8\"],[[8480,8480],\"mapped\",[115,109]],[[8481,8481],\"mapped\",[116,101,108]],[[8482,8482],\"mapped\",[116,109]],[[8483,8483],\"valid\",[],\"NV8\"],[[8484,8484],\"mapped\",[122]],[[8485,8485],\"valid\",[],\"NV8\"],[[8486,8486],\"mapped\",[969]],[[8487,8487],\"valid\",[],\"NV8\"],[[8488,8488],\"mapped\",[122]],[[8489,8489],\"valid\",[],\"NV8\"],[[8490,8490],\"mapped\",[107]],[[8491,8491],\"mapped\",[229]],[[8492,8492],\"mapped\",[98]],[[8493,8493],\"mapped\",[99]],[[8494,8494],\"valid\",[],\"NV8\"],[[8495,8496],\"mapped\",[101]],[[8497,8497],\"mapped\",[102]],[[8498,8498],\"disallowed\"],[[8499,8499],\"mapped\",[109]],[[8500,8500],\"mapped\",[111]],[[8501,8501],\"mapped\",[1488]],[[8502,8502],\"mapped\",[1489]],[[8503,8503],\"mapped\",[1490]],[[8504,8504],\"mapped\",[1491]],[[8505,8505],\"mapped\",[105]],[[8506,8506],\"valid\",[],\"NV8\"],[[8507,8507],\"mapped\",[102,97,120]],[[8508,8508],\"mapped\",[960]],[[8509,8510],\"mapped\",[947]],[[8511,8511],\"mapped\",[960]],[[8512,8512],\"mapped\",[8721]],[[8513,8516],\"valid\",[],\"NV8\"],[[8517,8518],\"mapped\",[100]],[[8519,8519],\"mapped\",[101]],[[8520,8520],\"mapped\",[105]],[[8521,8521],\"mapped\",[106]],[[8522,8523],\"valid\",[],\"NV8\"],[[8524,8524],\"valid\",[],\"NV8\"],[[8525,8525],\"valid\",[],\"NV8\"],[[8526,8526],\"valid\"],[[8527,8527],\"valid\",[],\"NV8\"],[[8528,8528],\"mapped\",[49,8260,55]],[[8529,8529],\"mapped\",[49,8260,57]],[[8530,8530],\"mapped\",[49,8260,49,48]],[[8531,8531],\"mapped\",[49,8260,51]],[[8532,8532],\"mapped\",[50,8260,51]],[[8533,8533],\"mapped\",[49,8260,53]],[[8534,8534],\"mapped\",[50,8260,53]],[[8535,8535],\"mapped\",[51,8260,53]],[[8536,8536],\"mapped\",[52,8260,53]],[[8537,8537],\"mapped\",[49,8260,54]],[[8538,8538],\"mapped\",[53,8260,54]],[[8539,8539],\"mapped\",[49,8260,56]],[[8540,8540],\"mapped\",[51,8260,56]],[[8541,8541],\"mapped\",[53,8260,56]],[[8542,8542],\"mapped\",[55,8260,56]],[[8543,8543],\"mapped\",[49,8260]],[[8544,8544],\"mapped\",[105]],[[8545,8545],\"mapped\",[105,105]],[[8546,8546],\"mapped\",[105,105,105]],[[8547,8547],\"mapped\",[105,118]],[[8548,8548],\"mapped\",[118]],[[8549,8549],\"mapped\",[118,105]],[[8550,8550],\"mapped\",[118,105,105]],[[8551,8551],\"mapped\",[118,105,105,105]],[[8552,8552],\"mapped\",[105,120]],[[8553,8553],\"mapped\",[120]],[[8554,8554],\"mapped\",[120,105]],[[8555,8555],\"mapped\",[120,105,105]],[[8556,8556],\"mapped\",[108]],[[8557,8557],\"mapped\",[99]],[[8558,8558],\"mapped\",[100]],[[8559,8559],\"mapped\",[109]],[[8560,8560],\"mapped\",[105]],[[8561,8561],\"mapped\",[105,105]],[[8562,8562],\"mapped\",[105,105,105]],[[8563,8563],\"mapped\",[105,118]],[[8564,8564],\"mapped\",[118]],[[8565,8565],\"mapped\",[118,105]],[[8566,8566],\"mapped\",[118,105,105]],[[8567,8567],\"mapped\",[118,105,105,105]],[[8568,8568],\"mapped\",[105,120]],[[8569,8569],\"mapped\",[120]],[[8570,8570],\"mapped\",[120,105]],[[8571,8571],\"mapped\",[120,105,105]],[[8572,8572],\"mapped\",[108]],[[8573,8573],\"mapped\",[99]],[[8574,8574],\"mapped\",[100]],[[8575,8575],\"mapped\",[109]],[[8576,8578],\"valid\",[],\"NV8\"],[[8579,8579],\"disallowed\"],[[8580,8580],\"valid\"],[[8581,8584],\"valid\",[],\"NV8\"],[[8585,8585],\"mapped\",[48,8260,51]],[[8586,8587],\"valid\",[],\"NV8\"],[[8588,8591],\"disallowed\"],[[8592,8682],\"valid\",[],\"NV8\"],[[8683,8691],\"valid\",[],\"NV8\"],[[8692,8703],\"valid\",[],\"NV8\"],[[8704,8747],\"valid\",[],\"NV8\"],[[8748,8748],\"mapped\",[8747,8747]],[[8749,8749],\"mapped\",[8747,8747,8747]],[[8750,8750],\"valid\",[],\"NV8\"],[[8751,8751],\"mapped\",[8750,8750]],[[8752,8752],\"mapped\",[8750,8750,8750]],[[8753,8799],\"valid\",[],\"NV8\"],[[8800,8800],\"disallowed_STD3_valid\"],[[8801,8813],\"valid\",[],\"NV8\"],[[8814,8815],\"disallowed_STD3_valid\"],[[8816,8945],\"valid\",[],\"NV8\"],[[8946,8959],\"valid\",[],\"NV8\"],[[8960,8960],\"valid\",[],\"NV8\"],[[8961,8961],\"valid\",[],\"NV8\"],[[8962,9000],\"valid\",[],\"NV8\"],[[9001,9001],\"mapped\",[12296]],[[9002,9002],\"mapped\",[12297]],[[9003,9082],\"valid\",[],\"NV8\"],[[9083,9083],\"valid\",[],\"NV8\"],[[9084,9084],\"valid\",[],\"NV8\"],[[9085,9114],\"valid\",[],\"NV8\"],[[9115,9166],\"valid\",[],\"NV8\"],[[9167,9168],\"valid\",[],\"NV8\"],[[9169,9179],\"valid\",[],\"NV8\"],[[9180,9191],\"valid\",[],\"NV8\"],[[9192,9192],\"valid\",[],\"NV8\"],[[9193,9203],\"valid\",[],\"NV8\"],[[9204,9210],\"valid\",[],\"NV8\"],[[9211,9215],\"disallowed\"],[[9216,9252],\"valid\",[],\"NV8\"],[[9253,9254],\"valid\",[],\"NV8\"],[[9255,9279],\"disallowed\"],[[9280,9290],\"valid\",[],\"NV8\"],[[9291,9311],\"disallowed\"],[[9312,9312],\"mapped\",[49]],[[9313,9313],\"mapped\",[50]],[[9314,9314],\"mapped\",[51]],[[9315,9315],\"mapped\",[52]],[[9316,9316],\"mapped\",[53]],[[9317,9317],\"mapped\",[54]],[[9318,9318],\"mapped\",[55]],[[9319,9319],\"mapped\",[56]],[[9320,9320],\"mapped\",[57]],[[9321,9321],\"mapped\",[49,48]],[[9322,9322],\"mapped\",[49,49]],[[9323,9323],\"mapped\",[49,50]],[[9324,9324],\"mapped\",[49,51]],[[9325,9325],\"mapped\",[49,52]],[[9326,9326],\"mapped\",[49,53]],[[9327,9327],\"mapped\",[49,54]],[[9328,9328],\"mapped\",[49,55]],[[9329,9329],\"mapped\",[49,56]],[[9330,9330],\"mapped\",[49,57]],[[9331,9331],\"mapped\",[50,48]],[[9332,9332],\"disallowed_STD3_mapped\",[40,49,41]],[[9333,9333],\"disallowed_STD3_mapped\",[40,50,41]],[[9334,9334],\"disallowed_STD3_mapped\",[40,51,41]],[[9335,9335],\"disallowed_STD3_mapped\",[40,52,41]],[[9336,9336],\"disallowed_STD3_mapped\",[40,53,41]],[[9337,9337],\"disallowed_STD3_mapped\",[40,54,41]],[[9338,9338],\"disallowed_STD3_mapped\",[40,55,41]],[[9339,9339],\"disallowed_STD3_mapped\",[40,56,41]],[[9340,9340],\"disallowed_STD3_mapped\",[40,57,41]],[[9341,9341],\"disallowed_STD3_mapped\",[40,49,48,41]],[[9342,9342],\"disallowed_STD3_mapped\",[40,49,49,41]],[[9343,9343],\"disallowed_STD3_mapped\",[40,49,50,41]],[[9344,9344],\"disallowed_STD3_mapped\",[40,49,51,41]],[[9345,9345],\"disallowed_STD3_mapped\",[40,49,52,41]],[[9346,9346],\"disallowed_STD3_mapped\",[40,49,53,41]],[[9347,9347],\"disallowed_STD3_mapped\",[40,49,54,41]],[[9348,9348],\"disallowed_STD3_mapped\",[40,49,55,41]],[[9349,9349],\"disallowed_STD3_mapped\",[40,49,56,41]],[[9350,9350],\"disallowed_STD3_mapped\",[40,49,57,41]],[[9351,9351],\"disallowed_STD3_mapped\",[40,50,48,41]],[[9352,9371],\"disallowed\"],[[9372,9372],\"disallowed_STD3_mapped\",[40,97,41]],[[9373,9373],\"disallowed_STD3_mapped\",[40,98,41]],[[9374,9374],\"disallowed_STD3_mapped\",[40,99,41]],[[9375,9375],\"disallowed_STD3_mapped\",[40,100,41]],[[9376,9376],\"disallowed_STD3_mapped\",[40,101,41]],[[9377,9377],\"disallowed_STD3_mapped\",[40,102,41]],[[9378,9378],\"disallowed_STD3_mapped\",[40,103,41]],[[9379,9379],\"disallowed_STD3_mapped\",[40,104,41]],[[9380,9380],\"disallowed_STD3_mapped\",[40,105,41]],[[9381,9381],\"disallowed_STD3_mapped\",[40,106,41]],[[9382,9382],\"disallowed_STD3_mapped\",[40,107,41]],[[9383,9383],\"disallowed_STD3_mapped\",[40,108,41]],[[9384,9384],\"disallowed_STD3_mapped\",[40,109,41]],[[9385,9385],\"disallowed_STD3_mapped\",[40,110,41]],[[9386,9386],\"disallowed_STD3_mapped\",[40,111,41]],[[9387,9387],\"disallowed_STD3_mapped\",[40,112,41]],[[9388,9388],\"disallowed_STD3_mapped\",[40,113,41]],[[9389,9389],\"disallowed_STD3_mapped\",[40,114,41]],[[9390,9390],\"disallowed_STD3_mapped\",[40,115,41]],[[9391,9391],\"disallowed_STD3_mapped\",[40,116,41]],[[9392,9392],\"disallowed_STD3_mapped\",[40,117,41]],[[9393,9393],\"disallowed_STD3_mapped\",[40,118,41]],[[9394,9394],\"disallowed_STD3_mapped\",[40,119,41]],[[9395,9395],\"disallowed_STD3_mapped\",[40,120,41]],[[9396,9396],\"disallowed_STD3_mapped\",[40,121,41]],[[9397,9397],\"disallowed_STD3_mapped\",[40,122,41]],[[9398,9398],\"mapped\",[97]],[[9399,9399],\"mapped\",[98]],[[9400,9400],\"mapped\",[99]],[[9401,9401],\"mapped\",[100]],[[9402,9402],\"mapped\",[101]],[[9403,9403],\"mapped\",[102]],[[9404,9404],\"mapped\",[103]],[[9405,9405],\"mapped\",[104]],[[9406,9406],\"mapped\",[105]],[[9407,9407],\"mapped\",[106]],[[9408,9408],\"mapped\",[107]],[[9409,9409],\"mapped\",[108]],[[9410,9410],\"mapped\",[109]],[[9411,9411],\"mapped\",[110]],[[9412,9412],\"mapped\",[111]],[[9413,9413],\"mapped\",[112]],[[9414,9414],\"mapped\",[113]],[[9415,9415],\"mapped\",[114]],[[9416,9416],\"mapped\",[115]],[[9417,9417],\"mapped\",[116]],[[9418,9418],\"mapped\",[117]],[[9419,9419],\"mapped\",[118]],[[9420,9420],\"mapped\",[119]],[[9421,9421],\"mapped\",[120]],[[9422,9422],\"mapped\",[121]],[[9423,9423],\"mapped\",[122]],[[9424,9424],\"mapped\",[97]],[[9425,9425],\"mapped\",[98]],[[9426,9426],\"mapped\",[99]],[[9427,9427],\"mapped\",[100]],[[9428,9428],\"mapped\",[101]],[[9429,9429],\"mapped\",[102]],[[9430,9430],\"mapped\",[103]],[[9431,9431],\"mapped\",[104]],[[9432,9432],\"mapped\",[105]],[[9433,9433],\"mapped\",[106]],[[9434,9434],\"mapped\",[107]],[[9435,9435],\"mapped\",[108]],[[9436,9436],\"mapped\",[109]],[[9437,9437],\"mapped\",[110]],[[9438,9438],\"mapped\",[111]],[[9439,9439],\"mapped\",[112]],[[9440,9440],\"mapped\",[113]],[[9441,9441],\"mapped\",[114]],[[9442,9442],\"mapped\",[115]],[[9443,9443],\"mapped\",[116]],[[9444,9444],\"mapped\",[117]],[[9445,9445],\"mapped\",[118]],[[9446,9446],\"mapped\",[119]],[[9447,9447],\"mapped\",[120]],[[9448,9448],\"mapped\",[121]],[[9449,9449],\"mapped\",[122]],[[9450,9450],\"mapped\",[48]],[[9451,9470],\"valid\",[],\"NV8\"],[[9471,9471],\"valid\",[],\"NV8\"],[[9472,9621],\"valid\",[],\"NV8\"],[[9622,9631],\"valid\",[],\"NV8\"],[[9632,9711],\"valid\",[],\"NV8\"],[[9712,9719],\"valid\",[],\"NV8\"],[[9720,9727],\"valid\",[],\"NV8\"],[[9728,9747],\"valid\",[],\"NV8\"],[[9748,9749],\"valid\",[],\"NV8\"],[[9750,9751],\"valid\",[],\"NV8\"],[[9752,9752],\"valid\",[],\"NV8\"],[[9753,9753],\"valid\",[],\"NV8\"],[[9754,9839],\"valid\",[],\"NV8\"],[[9840,9841],\"valid\",[],\"NV8\"],[[9842,9853],\"valid\",[],\"NV8\"],[[9854,9855],\"valid\",[],\"NV8\"],[[9856,9865],\"valid\",[],\"NV8\"],[[9866,9873],\"valid\",[],\"NV8\"],[[9874,9884],\"valid\",[],\"NV8\"],[[9885,9885],\"valid\",[],\"NV8\"],[[9886,9887],\"valid\",[],\"NV8\"],[[9888,9889],\"valid\",[],\"NV8\"],[[9890,9905],\"valid\",[],\"NV8\"],[[9906,9906],\"valid\",[],\"NV8\"],[[9907,9916],\"valid\",[],\"NV8\"],[[9917,9919],\"valid\",[],\"NV8\"],[[9920,9923],\"valid\",[],\"NV8\"],[[9924,9933],\"valid\",[],\"NV8\"],[[9934,9934],\"valid\",[],\"NV8\"],[[9935,9953],\"valid\",[],\"NV8\"],[[9954,9954],\"valid\",[],\"NV8\"],[[9955,9955],\"valid\",[],\"NV8\"],[[9956,9959],\"valid\",[],\"NV8\"],[[9960,9983],\"valid\",[],\"NV8\"],[[9984,9984],\"valid\",[],\"NV8\"],[[9985,9988],\"valid\",[],\"NV8\"],[[9989,9989],\"valid\",[],\"NV8\"],[[9990,9993],\"valid\",[],\"NV8\"],[[9994,9995],\"valid\",[],\"NV8\"],[[9996,10023],\"valid\",[],\"NV8\"],[[10024,10024],\"valid\",[],\"NV8\"],[[10025,10059],\"valid\",[],\"NV8\"],[[10060,10060],\"valid\",[],\"NV8\"],[[10061,10061],\"valid\",[],\"NV8\"],[[10062,10062],\"valid\",[],\"NV8\"],[[10063,10066],\"valid\",[],\"NV8\"],[[10067,10069],\"valid\",[],\"NV8\"],[[10070,10070],\"valid\",[],\"NV8\"],[[10071,10071],\"valid\",[],\"NV8\"],[[10072,10078],\"valid\",[],\"NV8\"],[[10079,10080],\"valid\",[],\"NV8\"],[[10081,10087],\"valid\",[],\"NV8\"],[[10088,10101],\"valid\",[],\"NV8\"],[[10102,10132],\"valid\",[],\"NV8\"],[[10133,10135],\"valid\",[],\"NV8\"],[[10136,10159],\"valid\",[],\"NV8\"],[[10160,10160],\"valid\",[],\"NV8\"],[[10161,10174],\"valid\",[],\"NV8\"],[[10175,10175],\"valid\",[],\"NV8\"],[[10176,10182],\"valid\",[],\"NV8\"],[[10183,10186],\"valid\",[],\"NV8\"],[[10187,10187],\"valid\",[],\"NV8\"],[[10188,10188],\"valid\",[],\"NV8\"],[[10189,10189],\"valid\",[],\"NV8\"],[[10190,10191],\"valid\",[],\"NV8\"],[[10192,10219],\"valid\",[],\"NV8\"],[[10220,10223],\"valid\",[],\"NV8\"],[[10224,10239],\"valid\",[],\"NV8\"],[[10240,10495],\"valid\",[],\"NV8\"],[[10496,10763],\"valid\",[],\"NV8\"],[[10764,10764],\"mapped\",[8747,8747,8747,8747]],[[10765,10867],\"valid\",[],\"NV8\"],[[10868,10868],\"disallowed_STD3_mapped\",[58,58,61]],[[10869,10869],\"disallowed_STD3_mapped\",[61,61]],[[10870,10870],\"disallowed_STD3_mapped\",[61,61,61]],[[10871,10971],\"valid\",[],\"NV8\"],[[10972,10972],\"mapped\",[10973,824]],[[10973,11007],\"valid\",[],\"NV8\"],[[11008,11021],\"valid\",[],\"NV8\"],[[11022,11027],\"valid\",[],\"NV8\"],[[11028,11034],\"valid\",[],\"NV8\"],[[11035,11039],\"valid\",[],\"NV8\"],[[11040,11043],\"valid\",[],\"NV8\"],[[11044,11084],\"valid\",[],\"NV8\"],[[11085,11087],\"valid\",[],\"NV8\"],[[11088,11092],\"valid\",[],\"NV8\"],[[11093,11097],\"valid\",[],\"NV8\"],[[11098,11123],\"valid\",[],\"NV8\"],[[11124,11125],\"disallowed\"],[[11126,11157],\"valid\",[],\"NV8\"],[[11158,11159],\"disallowed\"],[[11160,11193],\"valid\",[],\"NV8\"],[[11194,11196],\"disallowed\"],[[11197,11208],\"valid\",[],\"NV8\"],[[11209,11209],\"disallowed\"],[[11210,11217],\"valid\",[],\"NV8\"],[[11218,11243],\"disallowed\"],[[11244,11247],\"valid\",[],\"NV8\"],[[11248,11263],\"disallowed\"],[[11264,11264],\"mapped\",[11312]],[[11265,11265],\"mapped\",[11313]],[[11266,11266],\"mapped\",[11314]],[[11267,11267],\"mapped\",[11315]],[[11268,11268],\"mapped\",[11316]],[[11269,11269],\"mapped\",[11317]],[[11270,11270],\"mapped\",[11318]],[[11271,11271],\"mapped\",[11319]],[[11272,11272],\"mapped\",[11320]],[[11273,11273],\"mapped\",[11321]],[[11274,11274],\"mapped\",[11322]],[[11275,11275],\"mapped\",[11323]],[[11276,11276],\"mapped\",[11324]],[[11277,11277],\"mapped\",[11325]],[[11278,11278],\"mapped\",[11326]],[[11279,11279],\"mapped\",[11327]],[[11280,11280],\"mapped\",[11328]],[[11281,11281],\"mapped\",[11329]],[[11282,11282],\"mapped\",[11330]],[[11283,11283],\"mapped\",[11331]],[[11284,11284],\"mapped\",[11332]],[[11285,11285],\"mapped\",[11333]],[[11286,11286],\"mapped\",[11334]],[[11287,11287],\"mapped\",[11335]],[[11288,11288],\"mapped\",[11336]],[[11289,11289],\"mapped\",[11337]],[[11290,11290],\"mapped\",[11338]],[[11291,11291],\"mapped\",[11339]],[[11292,11292],\"mapped\",[11340]],[[11293,11293],\"mapped\",[11341]],[[11294,11294],\"mapped\",[11342]],[[11295,11295],\"mapped\",[11343]],[[11296,11296],\"mapped\",[11344]],[[11297,11297],\"mapped\",[11345]],[[11298,11298],\"mapped\",[11346]],[[11299,11299],\"mapped\",[11347]],[[11300,11300],\"mapped\",[11348]],[[11301,11301],\"mapped\",[11349]],[[11302,11302],\"mapped\",[11350]],[[11303,11303],\"mapped\",[11351]],[[11304,11304],\"mapped\",[11352]],[[11305,11305],\"mapped\",[11353]],[[11306,11306],\"mapped\",[11354]],[[11307,11307],\"mapped\",[11355]],[[11308,11308],\"mapped\",[11356]],[[11309,11309],\"mapped\",[11357]],[[11310,11310],\"mapped\",[11358]],[[11311,11311],\"disallowed\"],[[11312,11358],\"valid\"],[[11359,11359],\"disallowed\"],[[11360,11360],\"mapped\",[11361]],[[11361,11361],\"valid\"],[[11362,11362],\"mapped\",[619]],[[11363,11363],\"mapped\",[7549]],[[11364,11364],\"mapped\",[637]],[[11365,11366],\"valid\"],[[11367,11367],\"mapped\",[11368]],[[11368,11368],\"valid\"],[[11369,11369],\"mapped\",[11370]],[[11370,11370],\"valid\"],[[11371,11371],\"mapped\",[11372]],[[11372,11372],\"valid\"],[[11373,11373],\"mapped\",[593]],[[11374,11374],\"mapped\",[625]],[[11375,11375],\"mapped\",[592]],[[11376,11376],\"mapped\",[594]],[[11377,11377],\"valid\"],[[11378,11378],\"mapped\",[11379]],[[11379,11379],\"valid\"],[[11380,11380],\"valid\"],[[11381,11381],\"mapped\",[11382]],[[11382,11383],\"valid\"],[[11384,11387],\"valid\"],[[11388,11388],\"mapped\",[106]],[[11389,11389],\"mapped\",[118]],[[11390,11390],\"mapped\",[575]],[[11391,11391],\"mapped\",[576]],[[11392,11392],\"mapped\",[11393]],[[11393,11393],\"valid\"],[[11394,11394],\"mapped\",[11395]],[[11395,11395],\"valid\"],[[11396,11396],\"mapped\",[11397]],[[11397,11397],\"valid\"],[[11398,11398],\"mapped\",[11399]],[[11399,11399],\"valid\"],[[11400,11400],\"mapped\",[11401]],[[11401,11401],\"valid\"],[[11402,11402],\"mapped\",[11403]],[[11403,11403],\"valid\"],[[11404,11404],\"mapped\",[11405]],[[11405,11405],\"valid\"],[[11406,11406],\"mapped\",[11407]],[[11407,11407],\"valid\"],[[11408,11408],\"mapped\",[11409]],[[11409,11409],\"valid\"],[[11410,11410],\"mapped\",[11411]],[[11411,11411],\"valid\"],[[11412,11412],\"mapped\",[11413]],[[11413,11413],\"valid\"],[[11414,11414],\"mapped\",[11415]],[[11415,11415],\"valid\"],[[11416,11416],\"mapped\",[11417]],[[11417,11417],\"valid\"],[[11418,11418],\"mapped\",[11419]],[[11419,11419],\"valid\"],[[11420,11420],\"mapped\",[11421]],[[11421,11421],\"valid\"],[[11422,11422],\"mapped\",[11423]],[[11423,11423],\"valid\"],[[11424,11424],\"mapped\",[11425]],[[11425,11425],\"valid\"],[[11426,11426],\"mapped\",[11427]],[[11427,11427],\"valid\"],[[11428,11428],\"mapped\",[11429]],[[11429,11429],\"valid\"],[[11430,11430],\"mapped\",[11431]],[[11431,11431],\"valid\"],[[11432,11432],\"mapped\",[11433]],[[11433,11433],\"valid\"],[[11434,11434],\"mapped\",[11435]],[[11435,11435],\"valid\"],[[11436,11436],\"mapped\",[11437]],[[11437,11437],\"valid\"],[[11438,11438],\"mapped\",[11439]],[[11439,11439],\"valid\"],[[11440,11440],\"mapped\",[11441]],[[11441,11441],\"valid\"],[[11442,11442],\"mapped\",[11443]],[[11443,11443],\"valid\"],[[11444,11444],\"mapped\",[11445]],[[11445,11445],\"valid\"],[[11446,11446],\"mapped\",[11447]],[[11447,11447],\"valid\"],[[11448,11448],\"mapped\",[11449]],[[11449,11449],\"valid\"],[[11450,11450],\"mapped\",[11451]],[[11451,11451],\"valid\"],[[11452,11452],\"mapped\",[11453]],[[11453,11453],\"valid\"],[[11454,11454],\"mapped\",[11455]],[[11455,11455],\"valid\"],[[11456,11456],\"mapped\",[11457]],[[11457,11457],\"valid\"],[[11458,11458],\"mapped\",[11459]],[[11459,11459],\"valid\"],[[11460,11460],\"mapped\",[11461]],[[11461,11461],\"valid\"],[[11462,11462],\"mapped\",[11463]],[[11463,11463],\"valid\"],[[11464,11464],\"mapped\",[11465]],[[11465,11465],\"valid\"],[[11466,11466],\"mapped\",[11467]],[[11467,11467],\"valid\"],[[11468,11468],\"mapped\",[11469]],[[11469,11469],\"valid\"],[[11470,11470],\"mapped\",[11471]],[[11471,11471],\"valid\"],[[11472,11472],\"mapped\",[11473]],[[11473,11473],\"valid\"],[[11474,11474],\"mapped\",[11475]],[[11475,11475],\"valid\"],[[11476,11476],\"mapped\",[11477]],[[11477,11477],\"valid\"],[[11478,11478],\"mapped\",[11479]],[[11479,11479],\"valid\"],[[11480,11480],\"mapped\",[11481]],[[11481,11481],\"valid\"],[[11482,11482],\"mapped\",[11483]],[[11483,11483],\"valid\"],[[11484,11484],\"mapped\",[11485]],[[11485,11485],\"valid\"],[[11486,11486],\"mapped\",[11487]],[[11487,11487],\"valid\"],[[11488,11488],\"mapped\",[11489]],[[11489,11489],\"valid\"],[[11490,11490],\"mapped\",[11491]],[[11491,11492],\"valid\"],[[11493,11498],\"valid\",[],\"NV8\"],[[11499,11499],\"mapped\",[11500]],[[11500,11500],\"valid\"],[[11501,11501],\"mapped\",[11502]],[[11502,11505],\"valid\"],[[11506,11506],\"mapped\",[11507]],[[11507,11507],\"valid\"],[[11508,11512],\"disallowed\"],[[11513,11519],\"valid\",[],\"NV8\"],[[11520,11557],\"valid\"],[[11558,11558],\"disallowed\"],[[11559,11559],\"valid\"],[[11560,11564],\"disallowed\"],[[11565,11565],\"valid\"],[[11566,11567],\"disallowed\"],[[11568,11621],\"valid\"],[[11622,11623],\"valid\"],[[11624,11630],\"disallowed\"],[[11631,11631],\"mapped\",[11617]],[[11632,11632],\"valid\",[],\"NV8\"],[[11633,11646],\"disallowed\"],[[11647,11647],\"valid\"],[[11648,11670],\"valid\"],[[11671,11679],\"disallowed\"],[[11680,11686],\"valid\"],[[11687,11687],\"disallowed\"],[[11688,11694],\"valid\"],[[11695,11695],\"disallowed\"],[[11696,11702],\"valid\"],[[11703,11703],\"disallowed\"],[[11704,11710],\"valid\"],[[11711,11711],\"disallowed\"],[[11712,11718],\"valid\"],[[11719,11719],\"disallowed\"],[[11720,11726],\"valid\"],[[11727,11727],\"disallowed\"],[[11728,11734],\"valid\"],[[11735,11735],\"disallowed\"],[[11736,11742],\"valid\"],[[11743,11743],\"disallowed\"],[[11744,11775],\"valid\"],[[11776,11799],\"valid\",[],\"NV8\"],[[11800,11803],\"valid\",[],\"NV8\"],[[11804,11805],\"valid\",[],\"NV8\"],[[11806,11822],\"valid\",[],\"NV8\"],[[11823,11823],\"valid\"],[[11824,11824],\"valid\",[],\"NV8\"],[[11825,11825],\"valid\",[],\"NV8\"],[[11826,11835],\"valid\",[],\"NV8\"],[[11836,11842],\"valid\",[],\"NV8\"],[[11843,11903],\"disallowed\"],[[11904,11929],\"valid\",[],\"NV8\"],[[11930,11930],\"disallowed\"],[[11931,11934],\"valid\",[],\"NV8\"],[[11935,11935],\"mapped\",[27597]],[[11936,12018],\"valid\",[],\"NV8\"],[[12019,12019],\"mapped\",[40863]],[[12020,12031],\"disallowed\"],[[12032,12032],\"mapped\",[19968]],[[12033,12033],\"mapped\",[20008]],[[12034,12034],\"mapped\",[20022]],[[12035,12035],\"mapped\",[20031]],[[12036,12036],\"mapped\",[20057]],[[12037,12037],\"mapped\",[20101]],[[12038,12038],\"mapped\",[20108]],[[12039,12039],\"mapped\",[20128]],[[12040,12040],\"mapped\",[20154]],[[12041,12041],\"mapped\",[20799]],[[12042,12042],\"mapped\",[20837]],[[12043,12043],\"mapped\",[20843]],[[12044,12044],\"mapped\",[20866]],[[12045,12045],\"mapped\",[20886]],[[12046,12046],\"mapped\",[20907]],[[12047,12047],\"mapped\",[20960]],[[12048,12048],\"mapped\",[20981]],[[12049,12049],\"mapped\",[20992]],[[12050,12050],\"mapped\",[21147]],[[12051,12051],\"mapped\",[21241]],[[12052,12052],\"mapped\",[21269]],[[12053,12053],\"mapped\",[21274]],[[12054,12054],\"mapped\",[21304]],[[12055,12055],\"mapped\",[21313]],[[12056,12056],\"mapped\",[21340]],[[12057,12057],\"mapped\",[21353]],[[12058,12058],\"mapped\",[21378]],[[12059,12059],\"mapped\",[21430]],[[12060,12060],\"mapped\",[21448]],[[12061,12061],\"mapped\",[21475]],[[12062,12062],\"mapped\",[22231]],[[12063,12063],\"mapped\",[22303]],[[12064,12064],\"mapped\",[22763]],[[12065,12065],\"mapped\",[22786]],[[12066,12066],\"mapped\",[22794]],[[12067,12067],\"mapped\",[22805]],[[12068,12068],\"mapped\",[22823]],[[12069,12069],\"mapped\",[22899]],[[12070,12070],\"mapped\",[23376]],[[12071,12071],\"mapped\",[23424]],[[12072,12072],\"mapped\",[23544]],[[12073,12073],\"mapped\",[23567]],[[12074,12074],\"mapped\",[23586]],[[12075,12075],\"mapped\",[23608]],[[12076,12076],\"mapped\",[23662]],[[12077,12077],\"mapped\",[23665]],[[12078,12078],\"mapped\",[24027]],[[12079,12079],\"mapped\",[24037]],[[12080,12080],\"mapped\",[24049]],[[12081,12081],\"mapped\",[24062]],[[12082,12082],\"mapped\",[24178]],[[12083,12083],\"mapped\",[24186]],[[12084,12084],\"mapped\",[24191]],[[12085,12085],\"mapped\",[24308]],[[12086,12086],\"mapped\",[24318]],[[12087,12087],\"mapped\",[24331]],[[12088,12088],\"mapped\",[24339]],[[12089,12089],\"mapped\",[24400]],[[12090,12090],\"mapped\",[24417]],[[12091,12091],\"mapped\",[24435]],[[12092,12092],\"mapped\",[24515]],[[12093,12093],\"mapped\",[25096]],[[12094,12094],\"mapped\",[25142]],[[12095,12095],\"mapped\",[25163]],[[12096,12096],\"mapped\",[25903]],[[12097,12097],\"mapped\",[25908]],[[12098,12098],\"mapped\",[25991]],[[12099,12099],\"mapped\",[26007]],[[12100,12100],\"mapped\",[26020]],[[12101,12101],\"mapped\",[26041]],[[12102,12102],\"mapped\",[26080]],[[12103,12103],\"mapped\",[26085]],[[12104,12104],\"mapped\",[26352]],[[12105,12105],\"mapped\",[26376]],[[12106,12106],\"mapped\",[26408]],[[12107,12107],\"mapped\",[27424]],[[12108,12108],\"mapped\",[27490]],[[12109,12109],\"mapped\",[27513]],[[12110,12110],\"mapped\",[27571]],[[12111,12111],\"mapped\",[27595]],[[12112,12112],\"mapped\",[27604]],[[12113,12113],\"mapped\",[27611]],[[12114,12114],\"mapped\",[27663]],[[12115,12115],\"mapped\",[27668]],[[12116,12116],\"mapped\",[27700]],[[12117,12117],\"mapped\",[28779]],[[12118,12118],\"mapped\",[29226]],[[12119,12119],\"mapped\",[29238]],[[12120,12120],\"mapped\",[29243]],[[12121,12121],\"mapped\",[29247]],[[12122,12122],\"mapped\",[29255]],[[12123,12123],\"mapped\",[29273]],[[12124,12124],\"mapped\",[29275]],[[12125,12125],\"mapped\",[29356]],[[12126,12126],\"mapped\",[29572]],[[12127,12127],\"mapped\",[29577]],[[12128,12128],\"mapped\",[29916]],[[12129,12129],\"mapped\",[29926]],[[12130,12130],\"mapped\",[29976]],[[12131,12131],\"mapped\",[29983]],[[12132,12132],\"mapped\",[29992]],[[12133,12133],\"mapped\",[30000]],[[12134,12134],\"mapped\",[30091]],[[12135,12135],\"mapped\",[30098]],[[12136,12136],\"mapped\",[30326]],[[12137,12137],\"mapped\",[30333]],[[12138,12138],\"mapped\",[30382]],[[12139,12139],\"mapped\",[30399]],[[12140,12140],\"mapped\",[30446]],[[12141,12141],\"mapped\",[30683]],[[12142,12142],\"mapped\",[30690]],[[12143,12143],\"mapped\",[30707]],[[12144,12144],\"mapped\",[31034]],[[12145,12145],\"mapped\",[31160]],[[12146,12146],\"mapped\",[31166]],[[12147,12147],\"mapped\",[31348]],[[12148,12148],\"mapped\",[31435]],[[12149,12149],\"mapped\",[31481]],[[12150,12150],\"mapped\",[31859]],[[12151,12151],\"mapped\",[31992]],[[12152,12152],\"mapped\",[32566]],[[12153,12153],\"mapped\",[32593]],[[12154,12154],\"mapped\",[32650]],[[12155,12155],\"mapped\",[32701]],[[12156,12156],\"mapped\",[32769]],[[12157,12157],\"mapped\",[32780]],[[12158,12158],\"mapped\",[32786]],[[12159,12159],\"mapped\",[32819]],[[12160,12160],\"mapped\",[32895]],[[12161,12161],\"mapped\",[32905]],[[12162,12162],\"mapped\",[33251]],[[12163,12163],\"mapped\",[33258]],[[12164,12164],\"mapped\",[33267]],[[12165,12165],\"mapped\",[33276]],[[12166,12166],\"mapped\",[33292]],[[12167,12167],\"mapped\",[33307]],[[12168,12168],\"mapped\",[33311]],[[12169,12169],\"mapped\",[33390]],[[12170,12170],\"mapped\",[33394]],[[12171,12171],\"mapped\",[33400]],[[12172,12172],\"mapped\",[34381]],[[12173,12173],\"mapped\",[34411]],[[12174,12174],\"mapped\",[34880]],[[12175,12175],\"mapped\",[34892]],[[12176,12176],\"mapped\",[34915]],[[12177,12177],\"mapped\",[35198]],[[12178,12178],\"mapped\",[35211]],[[12179,12179],\"mapped\",[35282]],[[12180,12180],\"mapped\",[35328]],[[12181,12181],\"mapped\",[35895]],[[12182,12182],\"mapped\",[35910]],[[12183,12183],\"mapped\",[35925]],[[12184,12184],\"mapped\",[35960]],[[12185,12185],\"mapped\",[35997]],[[12186,12186],\"mapped\",[36196]],[[12187,12187],\"mapped\",[36208]],[[12188,12188],\"mapped\",[36275]],[[12189,12189],\"mapped\",[36523]],[[12190,12190],\"mapped\",[36554]],[[12191,12191],\"mapped\",[36763]],[[12192,12192],\"mapped\",[36784]],[[12193,12193],\"mapped\",[36789]],[[12194,12194],\"mapped\",[37009]],[[12195,12195],\"mapped\",[37193]],[[12196,12196],\"mapped\",[37318]],[[12197,12197],\"mapped\",[37324]],[[12198,12198],\"mapped\",[37329]],[[12199,12199],\"mapped\",[38263]],[[12200,12200],\"mapped\",[38272]],[[12201,12201],\"mapped\",[38428]],[[12202,12202],\"mapped\",[38582]],[[12203,12203],\"mapped\",[38585]],[[12204,12204],\"mapped\",[38632]],[[12205,12205],\"mapped\",[38737]],[[12206,12206],\"mapped\",[38750]],[[12207,12207],\"mapped\",[38754]],[[12208,12208],\"mapped\",[38761]],[[12209,12209],\"mapped\",[38859]],[[12210,12210],\"mapped\",[38893]],[[12211,12211],\"mapped\",[38899]],[[12212,12212],\"mapped\",[38913]],[[12213,12213],\"mapped\",[39080]],[[12214,12214],\"mapped\",[39131]],[[12215,12215],\"mapped\",[39135]],[[12216,12216],\"mapped\",[39318]],[[12217,12217],\"mapped\",[39321]],[[12218,12218],\"mapped\",[39340]],[[12219,12219],\"mapped\",[39592]],[[12220,12220],\"mapped\",[39640]],[[12221,12221],\"mapped\",[39647]],[[12222,12222],\"mapped\",[39717]],[[12223,12223],\"mapped\",[39727]],[[12224,12224],\"mapped\",[39730]],[[12225,12225],\"mapped\",[39740]],[[12226,12226],\"mapped\",[39770]],[[12227,12227],\"mapped\",[40165]],[[12228,12228],\"mapped\",[40565]],[[12229,12229],\"mapped\",[40575]],[[12230,12230],\"mapped\",[40613]],[[12231,12231],\"mapped\",[40635]],[[12232,12232],\"mapped\",[40643]],[[12233,12233],\"mapped\",[40653]],[[12234,12234],\"mapped\",[40657]],[[12235,12235],\"mapped\",[40697]],[[12236,12236],\"mapped\",[40701]],[[12237,12237],\"mapped\",[40718]],[[12238,12238],\"mapped\",[40723]],[[12239,12239],\"mapped\",[40736]],[[12240,12240],\"mapped\",[40763]],[[12241,12241],\"mapped\",[40778]],[[12242,12242],\"mapped\",[40786]],[[12243,12243],\"mapped\",[40845]],[[12244,12244],\"mapped\",[40860]],[[12245,12245],\"mapped\",[40864]],[[12246,12271],\"disallowed\"],[[12272,12283],\"disallowed\"],[[12284,12287],\"disallowed\"],[[12288,12288],\"disallowed_STD3_mapped\",[32]],[[12289,12289],\"valid\",[],\"NV8\"],[[12290,12290],\"mapped\",[46]],[[12291,12292],\"valid\",[],\"NV8\"],[[12293,12295],\"valid\"],[[12296,12329],\"valid\",[],\"NV8\"],[[12330,12333],\"valid\"],[[12334,12341],\"valid\",[],\"NV8\"],[[12342,12342],\"mapped\",[12306]],[[12343,12343],\"valid\",[],\"NV8\"],[[12344,12344],\"mapped\",[21313]],[[12345,12345],\"mapped\",[21316]],[[12346,12346],\"mapped\",[21317]],[[12347,12347],\"valid\",[],\"NV8\"],[[12348,12348],\"valid\"],[[12349,12349],\"valid\",[],\"NV8\"],[[12350,12350],\"valid\",[],\"NV8\"],[[12351,12351],\"valid\",[],\"NV8\"],[[12352,12352],\"disallowed\"],[[12353,12436],\"valid\"],[[12437,12438],\"valid\"],[[12439,12440],\"disallowed\"],[[12441,12442],\"valid\"],[[12443,12443],\"disallowed_STD3_mapped\",[32,12441]],[[12444,12444],\"disallowed_STD3_mapped\",[32,12442]],[[12445,12446],\"valid\"],[[12447,12447],\"mapped\",[12424,12426]],[[12448,12448],\"valid\",[],\"NV8\"],[[12449,12542],\"valid\"],[[12543,12543],\"mapped\",[12467,12488]],[[12544,12548],\"disallowed\"],[[12549,12588],\"valid\"],[[12589,12589],\"valid\"],[[12590,12592],\"disallowed\"],[[12593,12593],\"mapped\",[4352]],[[12594,12594],\"mapped\",[4353]],[[12595,12595],\"mapped\",[4522]],[[12596,12596],\"mapped\",[4354]],[[12597,12597],\"mapped\",[4524]],[[12598,12598],\"mapped\",[4525]],[[12599,12599],\"mapped\",[4355]],[[12600,12600],\"mapped\",[4356]],[[12601,12601],\"mapped\",[4357]],[[12602,12602],\"mapped\",[4528]],[[12603,12603],\"mapped\",[4529]],[[12604,12604],\"mapped\",[4530]],[[12605,12605],\"mapped\",[4531]],[[12606,12606],\"mapped\",[4532]],[[12607,12607],\"mapped\",[4533]],[[12608,12608],\"mapped\",[4378]],[[12609,12609],\"mapped\",[4358]],[[12610,12610],\"mapped\",[4359]],[[12611,12611],\"mapped\",[4360]],[[12612,12612],\"mapped\",[4385]],[[12613,12613],\"mapped\",[4361]],[[12614,12614],\"mapped\",[4362]],[[12615,12615],\"mapped\",[4363]],[[12616,12616],\"mapped\",[4364]],[[12617,12617],\"mapped\",[4365]],[[12618,12618],\"mapped\",[4366]],[[12619,12619],\"mapped\",[4367]],[[12620,12620],\"mapped\",[4368]],[[12621,12621],\"mapped\",[4369]],[[12622,12622],\"mapped\",[4370]],[[12623,12623],\"mapped\",[4449]],[[12624,12624],\"mapped\",[4450]],[[12625,12625],\"mapped\",[4451]],[[12626,12626],\"mapped\",[4452]],[[12627,12627],\"mapped\",[4453]],[[12628,12628],\"mapped\",[4454]],[[12629,12629],\"mapped\",[4455]],[[12630,12630],\"mapped\",[4456]],[[12631,12631],\"mapped\",[4457]],[[12632,12632],\"mapped\",[4458]],[[12633,12633],\"mapped\",[4459]],[[12634,12634],\"mapped\",[4460]],[[12635,12635],\"mapped\",[4461]],[[12636,12636],\"mapped\",[4462]],[[12637,12637],\"mapped\",[4463]],[[12638,12638],\"mapped\",[4464]],[[12639,12639],\"mapped\",[4465]],[[12640,12640],\"mapped\",[4466]],[[12641,12641],\"mapped\",[4467]],[[12642,12642],\"mapped\",[4468]],[[12643,12643],\"mapped\",[4469]],[[12644,12644],\"disallowed\"],[[12645,12645],\"mapped\",[4372]],[[12646,12646],\"mapped\",[4373]],[[12647,12647],\"mapped\",[4551]],[[12648,12648],\"mapped\",[4552]],[[12649,12649],\"mapped\",[4556]],[[12650,12650],\"mapped\",[4558]],[[12651,12651],\"mapped\",[4563]],[[12652,12652],\"mapped\",[4567]],[[12653,12653],\"mapped\",[4569]],[[12654,12654],\"mapped\",[4380]],[[12655,12655],\"mapped\",[4573]],[[12656,12656],\"mapped\",[4575]],[[12657,12657],\"mapped\",[4381]],[[12658,12658],\"mapped\",[4382]],[[12659,12659],\"mapped\",[4384]],[[12660,12660],\"mapped\",[4386]],[[12661,12661],\"mapped\",[4387]],[[12662,12662],\"mapped\",[4391]],[[12663,12663],\"mapped\",[4393]],[[12664,12664],\"mapped\",[4395]],[[12665,12665],\"mapped\",[4396]],[[12666,12666],\"mapped\",[4397]],[[12667,12667],\"mapped\",[4398]],[[12668,12668],\"mapped\",[4399]],[[12669,12669],\"mapped\",[4402]],[[12670,12670],\"mapped\",[4406]],[[12671,12671],\"mapped\",[4416]],[[12672,12672],\"mapped\",[4423]],[[12673,12673],\"mapped\",[4428]],[[12674,12674],\"mapped\",[4593]],[[12675,12675],\"mapped\",[4594]],[[12676,12676],\"mapped\",[4439]],[[12677,12677],\"mapped\",[4440]],[[12678,12678],\"mapped\",[4441]],[[12679,12679],\"mapped\",[4484]],[[12680,12680],\"mapped\",[4485]],[[12681,12681],\"mapped\",[4488]],[[12682,12682],\"mapped\",[4497]],[[12683,12683],\"mapped\",[4498]],[[12684,12684],\"mapped\",[4500]],[[12685,12685],\"mapped\",[4510]],[[12686,12686],\"mapped\",[4513]],[[12687,12687],\"disallowed\"],[[12688,12689],\"valid\",[],\"NV8\"],[[12690,12690],\"mapped\",[19968]],[[12691,12691],\"mapped\",[20108]],[[12692,12692],\"mapped\",[19977]],[[12693,12693],\"mapped\",[22235]],[[12694,12694],\"mapped\",[19978]],[[12695,12695],\"mapped\",[20013]],[[12696,12696],\"mapped\",[19979]],[[12697,12697],\"mapped\",[30002]],[[12698,12698],\"mapped\",[20057]],[[12699,12699],\"mapped\",[19993]],[[12700,12700],\"mapped\",[19969]],[[12701,12701],\"mapped\",[22825]],[[12702,12702],\"mapped\",[22320]],[[12703,12703],\"mapped\",[20154]],[[12704,12727],\"valid\"],[[12728,12730],\"valid\"],[[12731,12735],\"disallowed\"],[[12736,12751],\"valid\",[],\"NV8\"],[[12752,12771],\"valid\",[],\"NV8\"],[[12772,12783],\"disallowed\"],[[12784,12799],\"valid\"],[[12800,12800],\"disallowed_STD3_mapped\",[40,4352,41]],[[12801,12801],\"disallowed_STD3_mapped\",[40,4354,41]],[[12802,12802],\"disallowed_STD3_mapped\",[40,4355,41]],[[12803,12803],\"disallowed_STD3_mapped\",[40,4357,41]],[[12804,12804],\"disallowed_STD3_mapped\",[40,4358,41]],[[12805,12805],\"disallowed_STD3_mapped\",[40,4359,41]],[[12806,12806],\"disallowed_STD3_mapped\",[40,4361,41]],[[12807,12807],\"disallowed_STD3_mapped\",[40,4363,41]],[[12808,12808],\"disallowed_STD3_mapped\",[40,4364,41]],[[12809,12809],\"disallowed_STD3_mapped\",[40,4366,41]],[[12810,12810],\"disallowed_STD3_mapped\",[40,4367,41]],[[12811,12811],\"disallowed_STD3_mapped\",[40,4368,41]],[[12812,12812],\"disallowed_STD3_mapped\",[40,4369,41]],[[12813,12813],\"disallowed_STD3_mapped\",[40,4370,41]],[[12814,12814],\"disallowed_STD3_mapped\",[40,44032,41]],[[12815,12815],\"disallowed_STD3_mapped\",[40,45208,41]],[[12816,12816],\"disallowed_STD3_mapped\",[40,45796,41]],[[12817,12817],\"disallowed_STD3_mapped\",[40,46972,41]],[[12818,12818],\"disallowed_STD3_mapped\",[40,47560,41]],[[12819,12819],\"disallowed_STD3_mapped\",[40,48148,41]],[[12820,12820],\"disallowed_STD3_mapped\",[40,49324,41]],[[12821,12821],\"disallowed_STD3_mapped\",[40,50500,41]],[[12822,12822],\"disallowed_STD3_mapped\",[40,51088,41]],[[12823,12823],\"disallowed_STD3_mapped\",[40,52264,41]],[[12824,12824],\"disallowed_STD3_mapped\",[40,52852,41]],[[12825,12825],\"disallowed_STD3_mapped\",[40,53440,41]],[[12826,12826],\"disallowed_STD3_mapped\",[40,54028,41]],[[12827,12827],\"disallowed_STD3_mapped\",[40,54616,41]],[[12828,12828],\"disallowed_STD3_mapped\",[40,51452,41]],[[12829,12829],\"disallowed_STD3_mapped\",[40,50724,51204,41]],[[12830,12830],\"disallowed_STD3_mapped\",[40,50724,54980,41]],[[12831,12831],\"disallowed\"],[[12832,12832],\"disallowed_STD3_mapped\",[40,19968,41]],[[12833,12833],\"disallowed_STD3_mapped\",[40,20108,41]],[[12834,12834],\"disallowed_STD3_mapped\",[40,19977,41]],[[12835,12835],\"disallowed_STD3_mapped\",[40,22235,41]],[[12836,12836],\"disallowed_STD3_mapped\",[40,20116,41]],[[12837,12837],\"disallowed_STD3_mapped\",[40,20845,41]],[[12838,12838],\"disallowed_STD3_mapped\",[40,19971,41]],[[12839,12839],\"disallowed_STD3_mapped\",[40,20843,41]],[[12840,12840],\"disallowed_STD3_mapped\",[40,20061,41]],[[12841,12841],\"disallowed_STD3_mapped\",[40,21313,41]],[[12842,12842],\"disallowed_STD3_mapped\",[40,26376,41]],[[12843,12843],\"disallowed_STD3_mapped\",[40,28779,41]],[[12844,12844],\"disallowed_STD3_mapped\",[40,27700,41]],[[12845,12845],\"disallowed_STD3_mapped\",[40,26408,41]],[[12846,12846],\"disallowed_STD3_mapped\",[40,37329,41]],[[12847,12847],\"disallowed_STD3_mapped\",[40,22303,41]],[[12848,12848],\"disallowed_STD3_mapped\",[40,26085,41]],[[12849,12849],\"disallowed_STD3_mapped\",[40,26666,41]],[[12850,12850],\"disallowed_STD3_mapped\",[40,26377,41]],[[12851,12851],\"disallowed_STD3_mapped\",[40,31038,41]],[[12852,12852],\"disallowed_STD3_mapped\",[40,21517,41]],[[12853,12853],\"disallowed_STD3_mapped\",[40,29305,41]],[[12854,12854],\"disallowed_STD3_mapped\",[40,36001,41]],[[12855,12855],\"disallowed_STD3_mapped\",[40,31069,41]],[[12856,12856],\"disallowed_STD3_mapped\",[40,21172,41]],[[12857,12857],\"disallowed_STD3_mapped\",[40,20195,41]],[[12858,12858],\"disallowed_STD3_mapped\",[40,21628,41]],[[12859,12859],\"disallowed_STD3_mapped\",[40,23398,41]],[[12860,12860],\"disallowed_STD3_mapped\",[40,30435,41]],[[12861,12861],\"disallowed_STD3_mapped\",[40,20225,41]],[[12862,12862],\"disallowed_STD3_mapped\",[40,36039,41]],[[12863,12863],\"disallowed_STD3_mapped\",[40,21332,41]],[[12864,12864],\"disallowed_STD3_mapped\",[40,31085,41]],[[12865,12865],\"disallowed_STD3_mapped\",[40,20241,41]],[[12866,12866],\"disallowed_STD3_mapped\",[40,33258,41]],[[12867,12867],\"disallowed_STD3_mapped\",[40,33267,41]],[[12868,12868],\"mapped\",[21839]],[[12869,12869],\"mapped\",[24188]],[[12870,12870],\"mapped\",[25991]],[[12871,12871],\"mapped\",[31631]],[[12872,12879],\"valid\",[],\"NV8\"],[[12880,12880],\"mapped\",[112,116,101]],[[12881,12881],\"mapped\",[50,49]],[[12882,12882],\"mapped\",[50,50]],[[12883,12883],\"mapped\",[50,51]],[[12884,12884],\"mapped\",[50,52]],[[12885,12885],\"mapped\",[50,53]],[[12886,12886],\"mapped\",[50,54]],[[12887,12887],\"mapped\",[50,55]],[[12888,12888],\"mapped\",[50,56]],[[12889,12889],\"mapped\",[50,57]],[[12890,12890],\"mapped\",[51,48]],[[12891,12891],\"mapped\",[51,49]],[[12892,12892],\"mapped\",[51,50]],[[12893,12893],\"mapped\",[51,51]],[[12894,12894],\"mapped\",[51,52]],[[12895,12895],\"mapped\",[51,53]],[[12896,12896],\"mapped\",[4352]],[[12897,12897],\"mapped\",[4354]],[[12898,12898],\"mapped\",[4355]],[[12899,12899],\"mapped\",[4357]],[[12900,12900],\"mapped\",[4358]],[[12901,12901],\"mapped\",[4359]],[[12902,12902],\"mapped\",[4361]],[[12903,12903],\"mapped\",[4363]],[[12904,12904],\"mapped\",[4364]],[[12905,12905],\"mapped\",[4366]],[[12906,12906],\"mapped\",[4367]],[[12907,12907],\"mapped\",[4368]],[[12908,12908],\"mapped\",[4369]],[[12909,12909],\"mapped\",[4370]],[[12910,12910],\"mapped\",[44032]],[[12911,12911],\"mapped\",[45208]],[[12912,12912],\"mapped\",[45796]],[[12913,12913],\"mapped\",[46972]],[[12914,12914],\"mapped\",[47560]],[[12915,12915],\"mapped\",[48148]],[[12916,12916],\"mapped\",[49324]],[[12917,12917],\"mapped\",[50500]],[[12918,12918],\"mapped\",[51088]],[[12919,12919],\"mapped\",[52264]],[[12920,12920],\"mapped\",[52852]],[[12921,12921],\"mapped\",[53440]],[[12922,12922],\"mapped\",[54028]],[[12923,12923],\"mapped\",[54616]],[[12924,12924],\"mapped\",[52280,44256]],[[12925,12925],\"mapped\",[51452,51032]],[[12926,12926],\"mapped\",[50864]],[[12927,12927],\"valid\",[],\"NV8\"],[[12928,12928],\"mapped\",[19968]],[[12929,12929],\"mapped\",[20108]],[[12930,12930],\"mapped\",[19977]],[[12931,12931],\"mapped\",[22235]],[[12932,12932],\"mapped\",[20116]],[[12933,12933],\"mapped\",[20845]],[[12934,12934],\"mapped\",[19971]],[[12935,12935],\"mapped\",[20843]],[[12936,12936],\"mapped\",[20061]],[[12937,12937],\"mapped\",[21313]],[[12938,12938],\"mapped\",[26376]],[[12939,12939],\"mapped\",[28779]],[[12940,12940],\"mapped\",[27700]],[[12941,12941],\"mapped\",[26408]],[[12942,12942],\"mapped\",[37329]],[[12943,12943],\"mapped\",[22303]],[[12944,12944],\"mapped\",[26085]],[[12945,12945],\"mapped\",[26666]],[[12946,12946],\"mapped\",[26377]],[[12947,12947],\"mapped\",[31038]],[[12948,12948],\"mapped\",[21517]],[[12949,12949],\"mapped\",[29305]],[[12950,12950],\"mapped\",[36001]],[[12951,12951],\"mapped\",[31069]],[[12952,12952],\"mapped\",[21172]],[[12953,12953],\"mapped\",[31192]],[[12954,12954],\"mapped\",[30007]],[[12955,12955],\"mapped\",[22899]],[[12956,12956],\"mapped\",[36969]],[[12957,12957],\"mapped\",[20778]],[[12958,12958],\"mapped\",[21360]],[[12959,12959],\"mapped\",[27880]],[[12960,12960],\"mapped\",[38917]],[[12961,12961],\"mapped\",[20241]],[[12962,12962],\"mapped\",[20889]],[[12963,12963],\"mapped\",[27491]],[[12964,12964],\"mapped\",[19978]],[[12965,12965],\"mapped\",[20013]],[[12966,12966],\"mapped\",[19979]],[[12967,12967],\"mapped\",[24038]],[[12968,12968],\"mapped\",[21491]],[[12969,12969],\"mapped\",[21307]],[[12970,12970],\"mapped\",[23447]],[[12971,12971],\"mapped\",[23398]],[[12972,12972],\"mapped\",[30435]],[[12973,12973],\"mapped\",[20225]],[[12974,12974],\"mapped\",[36039]],[[12975,12975],\"mapped\",[21332]],[[12976,12976],\"mapped\",[22812]],[[12977,12977],\"mapped\",[51,54]],[[12978,12978],\"mapped\",[51,55]],[[12979,12979],\"mapped\",[51,56]],[[12980,12980],\"mapped\",[51,57]],[[12981,12981],\"mapped\",[52,48]],[[12982,12982],\"mapped\",[52,49]],[[12983,12983],\"mapped\",[52,50]],[[12984,12984],\"mapped\",[52,51]],[[12985,12985],\"mapped\",[52,52]],[[12986,12986],\"mapped\",[52,53]],[[12987,12987],\"mapped\",[52,54]],[[12988,12988],\"mapped\",[52,55]],[[12989,12989],\"mapped\",[52,56]],[[12990,12990],\"mapped\",[52,57]],[[12991,12991],\"mapped\",[53,48]],[[12992,12992],\"mapped\",[49,26376]],[[12993,12993],\"mapped\",[50,26376]],[[12994,12994],\"mapped\",[51,26376]],[[12995,12995],\"mapped\",[52,26376]],[[12996,12996],\"mapped\",[53,26376]],[[12997,12997],\"mapped\",[54,26376]],[[12998,12998],\"mapped\",[55,26376]],[[12999,12999],\"mapped\",[56,26376]],[[13000,13000],\"mapped\",[57,26376]],[[13001,13001],\"mapped\",[49,48,26376]],[[13002,13002],\"mapped\",[49,49,26376]],[[13003,13003],\"mapped\",[49,50,26376]],[[13004,13004],\"mapped\",[104,103]],[[13005,13005],\"mapped\",[101,114,103]],[[13006,13006],\"mapped\",[101,118]],[[13007,13007],\"mapped\",[108,116,100]],[[13008,13008],\"mapped\",[12450]],[[13009,13009],\"mapped\",[12452]],[[13010,13010],\"mapped\",[12454]],[[13011,13011],\"mapped\",[12456]],[[13012,13012],\"mapped\",[12458]],[[13013,13013],\"mapped\",[12459]],[[13014,13014],\"mapped\",[12461]],[[13015,13015],\"mapped\",[12463]],[[13016,13016],\"mapped\",[12465]],[[13017,13017],\"mapped\",[12467]],[[13018,13018],\"mapped\",[12469]],[[13019,13019],\"mapped\",[12471]],[[13020,13020],\"mapped\",[12473]],[[13021,13021],\"mapped\",[12475]],[[13022,13022],\"mapped\",[12477]],[[13023,13023],\"mapped\",[12479]],[[13024,13024],\"mapped\",[12481]],[[13025,13025],\"mapped\",[12484]],[[13026,13026],\"mapped\",[12486]],[[13027,13027],\"mapped\",[12488]],[[13028,13028],\"mapped\",[12490]],[[13029,13029],\"mapped\",[12491]],[[13030,13030],\"mapped\",[12492]],[[13031,13031],\"mapped\",[12493]],[[13032,13032],\"mapped\",[12494]],[[13033,13033],\"mapped\",[12495]],[[13034,13034],\"mapped\",[12498]],[[13035,13035],\"mapped\",[12501]],[[13036,13036],\"mapped\",[12504]],[[13037,13037],\"mapped\",[12507]],[[13038,13038],\"mapped\",[12510]],[[13039,13039],\"mapped\",[12511]],[[13040,13040],\"mapped\",[12512]],[[13041,13041],\"mapped\",[12513]],[[13042,13042],\"mapped\",[12514]],[[13043,13043],\"mapped\",[12516]],[[13044,13044],\"mapped\",[12518]],[[13045,13045],\"mapped\",[12520]],[[13046,13046],\"mapped\",[12521]],[[13047,13047],\"mapped\",[12522]],[[13048,13048],\"mapped\",[12523]],[[13049,13049],\"mapped\",[12524]],[[13050,13050],\"mapped\",[12525]],[[13051,13051],\"mapped\",[12527]],[[13052,13052],\"mapped\",[12528]],[[13053,13053],\"mapped\",[12529]],[[13054,13054],\"mapped\",[12530]],[[13055,13055],\"disallowed\"],[[13056,13056],\"mapped\",[12450,12497,12540,12488]],[[13057,13057],\"mapped\",[12450,12523,12501,12449]],[[13058,13058],\"mapped\",[12450,12531,12506,12450]],[[13059,13059],\"mapped\",[12450,12540,12523]],[[13060,13060],\"mapped\",[12452,12491,12531,12464]],[[13061,13061],\"mapped\",[12452,12531,12481]],[[13062,13062],\"mapped\",[12454,12457,12531]],[[13063,13063],\"mapped\",[12456,12473,12463,12540,12489]],[[13064,13064],\"mapped\",[12456,12540,12459,12540]],[[13065,13065],\"mapped\",[12458,12531,12473]],[[13066,13066],\"mapped\",[12458,12540,12512]],[[13067,13067],\"mapped\",[12459,12452,12522]],[[13068,13068],\"mapped\",[12459,12521,12483,12488]],[[13069,13069],\"mapped\",[12459,12525,12522,12540]],[[13070,13070],\"mapped\",[12460,12525,12531]],[[13071,13071],\"mapped\",[12460,12531,12510]],[[13072,13072],\"mapped\",[12462,12460]],[[13073,13073],\"mapped\",[12462,12491,12540]],[[13074,13074],\"mapped\",[12461,12517,12522,12540]],[[13075,13075],\"mapped\",[12462,12523,12480,12540]],[[13076,13076],\"mapped\",[12461,12525]],[[13077,13077],\"mapped\",[12461,12525,12464,12521,12512]],[[13078,13078],\"mapped\",[12461,12525,12513,12540,12488,12523]],[[13079,13079],\"mapped\",[12461,12525,12527,12483,12488]],[[13080,13080],\"mapped\",[12464,12521,12512]],[[13081,13081],\"mapped\",[12464,12521,12512,12488,12531]],[[13082,13082],\"mapped\",[12463,12523,12476,12452,12525]],[[13083,13083],\"mapped\",[12463,12525,12540,12493]],[[13084,13084],\"mapped\",[12465,12540,12473]],[[13085,13085],\"mapped\",[12467,12523,12490]],[[13086,13086],\"mapped\",[12467,12540,12509]],[[13087,13087],\"mapped\",[12469,12452,12463,12523]],[[13088,13088],\"mapped\",[12469,12531,12481,12540,12512]],[[13089,13089],\"mapped\",[12471,12522,12531,12464]],[[13090,13090],\"mapped\",[12475,12531,12481]],[[13091,13091],\"mapped\",[12475,12531,12488]],[[13092,13092],\"mapped\",[12480,12540,12473]],[[13093,13093],\"mapped\",[12487,12471]],[[13094,13094],\"mapped\",[12489,12523]],[[13095,13095],\"mapped\",[12488,12531]],[[13096,13096],\"mapped\",[12490,12494]],[[13097,13097],\"mapped\",[12494,12483,12488]],[[13098,13098],\"mapped\",[12495,12452,12484]],[[13099,13099],\"mapped\",[12497,12540,12475,12531,12488]],[[13100,13100],\"mapped\",[12497,12540,12484]],[[13101,13101],\"mapped\",[12496,12540,12524,12523]],[[13102,13102],\"mapped\",[12500,12450,12473,12488,12523]],[[13103,13103],\"mapped\",[12500,12463,12523]],[[13104,13104],\"mapped\",[12500,12467]],[[13105,13105],\"mapped\",[12499,12523]],[[13106,13106],\"mapped\",[12501,12449,12521,12483,12489]],[[13107,13107],\"mapped\",[12501,12451,12540,12488]],[[13108,13108],\"mapped\",[12502,12483,12471,12455,12523]],[[13109,13109],\"mapped\",[12501,12521,12531]],[[13110,13110],\"mapped\",[12504,12463,12479,12540,12523]],[[13111,13111],\"mapped\",[12506,12477]],[[13112,13112],\"mapped\",[12506,12491,12498]],[[13113,13113],\"mapped\",[12504,12523,12484]],[[13114,13114],\"mapped\",[12506,12531,12473]],[[13115,13115],\"mapped\",[12506,12540,12472]],[[13116,13116],\"mapped\",[12505,12540,12479]],[[13117,13117],\"mapped\",[12509,12452,12531,12488]],[[13118,13118],\"mapped\",[12508,12523,12488]],[[13119,13119],\"mapped\",[12507,12531]],[[13120,13120],\"mapped\",[12509,12531,12489]],[[13121,13121],\"mapped\",[12507,12540,12523]],[[13122,13122],\"mapped\",[12507,12540,12531]],[[13123,13123],\"mapped\",[12510,12452,12463,12525]],[[13124,13124],\"mapped\",[12510,12452,12523]],[[13125,13125],\"mapped\",[12510,12483,12495]],[[13126,13126],\"mapped\",[12510,12523,12463]],[[13127,13127],\"mapped\",[12510,12531,12471,12519,12531]],[[13128,13128],\"mapped\",[12511,12463,12525,12531]],[[13129,13129],\"mapped\",[12511,12522]],[[13130,13130],\"mapped\",[12511,12522,12496,12540,12523]],[[13131,13131],\"mapped\",[12513,12460]],[[13132,13132],\"mapped\",[12513,12460,12488,12531]],[[13133,13133],\"mapped\",[12513,12540,12488,12523]],[[13134,13134],\"mapped\",[12516,12540,12489]],[[13135,13135],\"mapped\",[12516,12540,12523]],[[13136,13136],\"mapped\",[12518,12450,12531]],[[13137,13137],\"mapped\",[12522,12483,12488,12523]],[[13138,13138],\"mapped\",[12522,12521]],[[13139,13139],\"mapped\",[12523,12500,12540]],[[13140,13140],\"mapped\",[12523,12540,12502,12523]],[[13141,13141],\"mapped\",[12524,12512]],[[13142,13142],\"mapped\",[12524,12531,12488,12466,12531]],[[13143,13143],\"mapped\",[12527,12483,12488]],[[13144,13144],\"mapped\",[48,28857]],[[13145,13145],\"mapped\",[49,28857]],[[13146,13146],\"mapped\",[50,28857]],[[13147,13147],\"mapped\",[51,28857]],[[13148,13148],\"mapped\",[52,28857]],[[13149,13149],\"mapped\",[53,28857]],[[13150,13150],\"mapped\",[54,28857]],[[13151,13151],\"mapped\",[55,28857]],[[13152,13152],\"mapped\",[56,28857]],[[13153,13153],\"mapped\",[57,28857]],[[13154,13154],\"mapped\",[49,48,28857]],[[13155,13155],\"mapped\",[49,49,28857]],[[13156,13156],\"mapped\",[49,50,28857]],[[13157,13157],\"mapped\",[49,51,28857]],[[13158,13158],\"mapped\",[49,52,28857]],[[13159,13159],\"mapped\",[49,53,28857]],[[13160,13160],\"mapped\",[49,54,28857]],[[13161,13161],\"mapped\",[49,55,28857]],[[13162,13162],\"mapped\",[49,56,28857]],[[13163,13163],\"mapped\",[49,57,28857]],[[13164,13164],\"mapped\",[50,48,28857]],[[13165,13165],\"mapped\",[50,49,28857]],[[13166,13166],\"mapped\",[50,50,28857]],[[13167,13167],\"mapped\",[50,51,28857]],[[13168,13168],\"mapped\",[50,52,28857]],[[13169,13169],\"mapped\",[104,112,97]],[[13170,13170],\"mapped\",[100,97]],[[13171,13171],\"mapped\",[97,117]],[[13172,13172],\"mapped\",[98,97,114]],[[13173,13173],\"mapped\",[111,118]],[[13174,13174],\"mapped\",[112,99]],[[13175,13175],\"mapped\",[100,109]],[[13176,13176],\"mapped\",[100,109,50]],[[13177,13177],\"mapped\",[100,109,51]],[[13178,13178],\"mapped\",[105,117]],[[13179,13179],\"mapped\",[24179,25104]],[[13180,13180],\"mapped\",[26157,21644]],[[13181,13181],\"mapped\",[22823,27491]],[[13182,13182],\"mapped\",[26126,27835]],[[13183,13183],\"mapped\",[26666,24335,20250,31038]],[[13184,13184],\"mapped\",[112,97]],[[13185,13185],\"mapped\",[110,97]],[[13186,13186],\"mapped\",[956,97]],[[13187,13187],\"mapped\",[109,97]],[[13188,13188],\"mapped\",[107,97]],[[13189,13189],\"mapped\",[107,98]],[[13190,13190],\"mapped\",[109,98]],[[13191,13191],\"mapped\",[103,98]],[[13192,13192],\"mapped\",[99,97,108]],[[13193,13193],\"mapped\",[107,99,97,108]],[[13194,13194],\"mapped\",[112,102]],[[13195,13195],\"mapped\",[110,102]],[[13196,13196],\"mapped\",[956,102]],[[13197,13197],\"mapped\",[956,103]],[[13198,13198],\"mapped\",[109,103]],[[13199,13199],\"mapped\",[107,103]],[[13200,13200],\"mapped\",[104,122]],[[13201,13201],\"mapped\",[107,104,122]],[[13202,13202],\"mapped\",[109,104,122]],[[13203,13203],\"mapped\",[103,104,122]],[[13204,13204],\"mapped\",[116,104,122]],[[13205,13205],\"mapped\",[956,108]],[[13206,13206],\"mapped\",[109,108]],[[13207,13207],\"mapped\",[100,108]],[[13208,13208],\"mapped\",[107,108]],[[13209,13209],\"mapped\",[102,109]],[[13210,13210],\"mapped\",[110,109]],[[13211,13211],\"mapped\",[956,109]],[[13212,13212],\"mapped\",[109,109]],[[13213,13213],\"mapped\",[99,109]],[[13214,13214],\"mapped\",[107,109]],[[13215,13215],\"mapped\",[109,109,50]],[[13216,13216],\"mapped\",[99,109,50]],[[13217,13217],\"mapped\",[109,50]],[[13218,13218],\"mapped\",[107,109,50]],[[13219,13219],\"mapped\",[109,109,51]],[[13220,13220],\"mapped\",[99,109,51]],[[13221,13221],\"mapped\",[109,51]],[[13222,13222],\"mapped\",[107,109,51]],[[13223,13223],\"mapped\",[109,8725,115]],[[13224,13224],\"mapped\",[109,8725,115,50]],[[13225,13225],\"mapped\",[112,97]],[[13226,13226],\"mapped\",[107,112,97]],[[13227,13227],\"mapped\",[109,112,97]],[[13228,13228],\"mapped\",[103,112,97]],[[13229,13229],\"mapped\",[114,97,100]],[[13230,13230],\"mapped\",[114,97,100,8725,115]],[[13231,13231],\"mapped\",[114,97,100,8725,115,50]],[[13232,13232],\"mapped\",[112,115]],[[13233,13233],\"mapped\",[110,115]],[[13234,13234],\"mapped\",[956,115]],[[13235,13235],\"mapped\",[109,115]],[[13236,13236],\"mapped\",[112,118]],[[13237,13237],\"mapped\",[110,118]],[[13238,13238],\"mapped\",[956,118]],[[13239,13239],\"mapped\",[109,118]],[[13240,13240],\"mapped\",[107,118]],[[13241,13241],\"mapped\",[109,118]],[[13242,13242],\"mapped\",[112,119]],[[13243,13243],\"mapped\",[110,119]],[[13244,13244],\"mapped\",[956,119]],[[13245,13245],\"mapped\",[109,119]],[[13246,13246],\"mapped\",[107,119]],[[13247,13247],\"mapped\",[109,119]],[[13248,13248],\"mapped\",[107,969]],[[13249,13249],\"mapped\",[109,969]],[[13250,13250],\"disallowed\"],[[13251,13251],\"mapped\",[98,113]],[[13252,13252],\"mapped\",[99,99]],[[13253,13253],\"mapped\",[99,100]],[[13254,13254],\"mapped\",[99,8725,107,103]],[[13255,13255],\"disallowed\"],[[13256,13256],\"mapped\",[100,98]],[[13257,13257],\"mapped\",[103,121]],[[13258,13258],\"mapped\",[104,97]],[[13259,13259],\"mapped\",[104,112]],[[13260,13260],\"mapped\",[105,110]],[[13261,13261],\"mapped\",[107,107]],[[13262,13262],\"mapped\",[107,109]],[[13263,13263],\"mapped\",[107,116]],[[13264,13264],\"mapped\",[108,109]],[[13265,13265],\"mapped\",[108,110]],[[13266,13266],\"mapped\",[108,111,103]],[[13267,13267],\"mapped\",[108,120]],[[13268,13268],\"mapped\",[109,98]],[[13269,13269],\"mapped\",[109,105,108]],[[13270,13270],\"mapped\",[109,111,108]],[[13271,13271],\"mapped\",[112,104]],[[13272,13272],\"disallowed\"],[[13273,13273],\"mapped\",[112,112,109]],[[13274,13274],\"mapped\",[112,114]],[[13275,13275],\"mapped\",[115,114]],[[13276,13276],\"mapped\",[115,118]],[[13277,13277],\"mapped\",[119,98]],[[13278,13278],\"mapped\",[118,8725,109]],[[13279,13279],\"mapped\",[97,8725,109]],[[13280,13280],\"mapped\",[49,26085]],[[13281,13281],\"mapped\",[50,26085]],[[13282,13282],\"mapped\",[51,26085]],[[13283,13283],\"mapped\",[52,26085]],[[13284,13284],\"mapped\",[53,26085]],[[13285,13285],\"mapped\",[54,26085]],[[13286,13286],\"mapped\",[55,26085]],[[13287,13287],\"mapped\",[56,26085]],[[13288,13288],\"mapped\",[57,26085]],[[13289,13289],\"mapped\",[49,48,26085]],[[13290,13290],\"mapped\",[49,49,26085]],[[13291,13291],\"mapped\",[49,50,26085]],[[13292,13292],\"mapped\",[49,51,26085]],[[13293,13293],\"mapped\",[49,52,26085]],[[13294,13294],\"mapped\",[49,53,26085]],[[13295,13295],\"mapped\",[49,54,26085]],[[13296,13296],\"mapped\",[49,55,26085]],[[13297,13297],\"mapped\",[49,56,26085]],[[13298,13298],\"mapped\",[49,57,26085]],[[13299,13299],\"mapped\",[50,48,26085]],[[13300,13300],\"mapped\",[50,49,26085]],[[13301,13301],\"mapped\",[50,50,26085]],[[13302,13302],\"mapped\",[50,51,26085]],[[13303,13303],\"mapped\",[50,52,26085]],[[13304,13304],\"mapped\",[50,53,26085]],[[13305,13305],\"mapped\",[50,54,26085]],[[13306,13306],\"mapped\",[50,55,26085]],[[13307,13307],\"mapped\",[50,56,26085]],[[13308,13308],\"mapped\",[50,57,26085]],[[13309,13309],\"mapped\",[51,48,26085]],[[13310,13310],\"mapped\",[51,49,26085]],[[13311,13311],\"mapped\",[103,97,108]],[[13312,19893],\"valid\"],[[19894,19903],\"disallowed\"],[[19904,19967],\"valid\",[],\"NV8\"],[[19968,40869],\"valid\"],[[40870,40891],\"valid\"],[[40892,40899],\"valid\"],[[40900,40907],\"valid\"],[[40908,40908],\"valid\"],[[40909,40917],\"valid\"],[[40918,40959],\"disallowed\"],[[40960,42124],\"valid\"],[[42125,42127],\"disallowed\"],[[42128,42145],\"valid\",[],\"NV8\"],[[42146,42147],\"valid\",[],\"NV8\"],[[42148,42163],\"valid\",[],\"NV8\"],[[42164,42164],\"valid\",[],\"NV8\"],[[42165,42176],\"valid\",[],\"NV8\"],[[42177,42177],\"valid\",[],\"NV8\"],[[42178,42180],\"valid\",[],\"NV8\"],[[42181,42181],\"valid\",[],\"NV8\"],[[42182,42182],\"valid\",[],\"NV8\"],[[42183,42191],\"disallowed\"],[[42192,42237],\"valid\"],[[42238,42239],\"valid\",[],\"NV8\"],[[42240,42508],\"valid\"],[[42509,42511],\"valid\",[],\"NV8\"],[[42512,42539],\"valid\"],[[42540,42559],\"disallowed\"],[[42560,42560],\"mapped\",[42561]],[[42561,42561],\"valid\"],[[42562,42562],\"mapped\",[42563]],[[42563,42563],\"valid\"],[[42564,42564],\"mapped\",[42565]],[[42565,42565],\"valid\"],[[42566,42566],\"mapped\",[42567]],[[42567,42567],\"valid\"],[[42568,42568],\"mapped\",[42569]],[[42569,42569],\"valid\"],[[42570,42570],\"mapped\",[42571]],[[42571,42571],\"valid\"],[[42572,42572],\"mapped\",[42573]],[[42573,42573],\"valid\"],[[42574,42574],\"mapped\",[42575]],[[42575,42575],\"valid\"],[[42576,42576],\"mapped\",[42577]],[[42577,42577],\"valid\"],[[42578,42578],\"mapped\",[42579]],[[42579,42579],\"valid\"],[[42580,42580],\"mapped\",[42581]],[[42581,42581],\"valid\"],[[42582,42582],\"mapped\",[42583]],[[42583,42583],\"valid\"],[[42584,42584],\"mapped\",[42585]],[[42585,42585],\"valid\"],[[42586,42586],\"mapped\",[42587]],[[42587,42587],\"valid\"],[[42588,42588],\"mapped\",[42589]],[[42589,42589],\"valid\"],[[42590,42590],\"mapped\",[42591]],[[42591,42591],\"valid\"],[[42592,42592],\"mapped\",[42593]],[[42593,42593],\"valid\"],[[42594,42594],\"mapped\",[42595]],[[42595,42595],\"valid\"],[[42596,42596],\"mapped\",[42597]],[[42597,42597],\"valid\"],[[42598,42598],\"mapped\",[42599]],[[42599,42599],\"valid\"],[[42600,42600],\"mapped\",[42601]],[[42601,42601],\"valid\"],[[42602,42602],\"mapped\",[42603]],[[42603,42603],\"valid\"],[[42604,42604],\"mapped\",[42605]],[[42605,42607],\"valid\"],[[42608,42611],\"valid\",[],\"NV8\"],[[42612,42619],\"valid\"],[[42620,42621],\"valid\"],[[42622,42622],\"valid\",[],\"NV8\"],[[42623,42623],\"valid\"],[[42624,42624],\"mapped\",[42625]],[[42625,42625],\"valid\"],[[42626,42626],\"mapped\",[42627]],[[42627,42627],\"valid\"],[[42628,42628],\"mapped\",[42629]],[[42629,42629],\"valid\"],[[42630,42630],\"mapped\",[42631]],[[42631,42631],\"valid\"],[[42632,42632],\"mapped\",[42633]],[[42633,42633],\"valid\"],[[42634,42634],\"mapped\",[42635]],[[42635,42635],\"valid\"],[[42636,42636],\"mapped\",[42637]],[[42637,42637],\"valid\"],[[42638,42638],\"mapped\",[42639]],[[42639,42639],\"valid\"],[[42640,42640],\"mapped\",[42641]],[[42641,42641],\"valid\"],[[42642,42642],\"mapped\",[42643]],[[42643,42643],\"valid\"],[[42644,42644],\"mapped\",[42645]],[[42645,42645],\"valid\"],[[42646,42646],\"mapped\",[42647]],[[42647,42647],\"valid\"],[[42648,42648],\"mapped\",[42649]],[[42649,42649],\"valid\"],[[42650,42650],\"mapped\",[42651]],[[42651,42651],\"valid\"],[[42652,42652],\"mapped\",[1098]],[[42653,42653],\"mapped\",[1100]],[[42654,42654],\"valid\"],[[42655,42655],\"valid\"],[[42656,42725],\"valid\"],[[42726,42735],\"valid\",[],\"NV8\"],[[42736,42737],\"valid\"],[[42738,42743],\"valid\",[],\"NV8\"],[[42744,42751],\"disallowed\"],[[42752,42774],\"valid\",[],\"NV8\"],[[42775,42778],\"valid\"],[[42779,42783],\"valid\"],[[42784,42785],\"valid\",[],\"NV8\"],[[42786,42786],\"mapped\",[42787]],[[42787,42787],\"valid\"],[[42788,42788],\"mapped\",[42789]],[[42789,42789],\"valid\"],[[42790,42790],\"mapped\",[42791]],[[42791,42791],\"valid\"],[[42792,42792],\"mapped\",[42793]],[[42793,42793],\"valid\"],[[42794,42794],\"mapped\",[42795]],[[42795,42795],\"valid\"],[[42796,42796],\"mapped\",[42797]],[[42797,42797],\"valid\"],[[42798,42798],\"mapped\",[42799]],[[42799,42801],\"valid\"],[[42802,42802],\"mapped\",[42803]],[[42803,42803],\"valid\"],[[42804,42804],\"mapped\",[42805]],[[42805,42805],\"valid\"],[[42806,42806],\"mapped\",[42807]],[[42807,42807],\"valid\"],[[42808,42808],\"mapped\",[42809]],[[42809,42809],\"valid\"],[[42810,42810],\"mapped\",[42811]],[[42811,42811],\"valid\"],[[42812,42812],\"mapped\",[42813]],[[42813,42813],\"valid\"],[[42814,42814],\"mapped\",[42815]],[[42815,42815],\"valid\"],[[42816,42816],\"mapped\",[42817]],[[42817,42817],\"valid\"],[[42818,42818],\"mapped\",[42819]],[[42819,42819],\"valid\"],[[42820,42820],\"mapped\",[42821]],[[42821,42821],\"valid\"],[[42822,42822],\"mapped\",[42823]],[[42823,42823],\"valid\"],[[42824,42824],\"mapped\",[42825]],[[42825,42825],\"valid\"],[[42826,42826],\"mapped\",[42827]],[[42827,42827],\"valid\"],[[42828,42828],\"mapped\",[42829]],[[42829,42829],\"valid\"],[[42830,42830],\"mapped\",[42831]],[[42831,42831],\"valid\"],[[42832,42832],\"mapped\",[42833]],[[42833,42833],\"valid\"],[[42834,42834],\"mapped\",[42835]],[[42835,42835],\"valid\"],[[42836,42836],\"mapped\",[42837]],[[42837,42837],\"valid\"],[[42838,42838],\"mapped\",[42839]],[[42839,42839],\"valid\"],[[42840,42840],\"mapped\",[42841]],[[42841,42841],\"valid\"],[[42842,42842],\"mapped\",[42843]],[[42843,42843],\"valid\"],[[42844,42844],\"mapped\",[42845]],[[42845,42845],\"valid\"],[[42846,42846],\"mapped\",[42847]],[[42847,42847],\"valid\"],[[42848,42848],\"mapped\",[42849]],[[42849,42849],\"valid\"],[[42850,42850],\"mapped\",[42851]],[[42851,42851],\"valid\"],[[42852,42852],\"mapped\",[42853]],[[42853,42853],\"valid\"],[[42854,42854],\"mapped\",[42855]],[[42855,42855],\"valid\"],[[42856,42856],\"mapped\",[42857]],[[42857,42857],\"valid\"],[[42858,42858],\"mapped\",[42859]],[[42859,42859],\"valid\"],[[42860,42860],\"mapped\",[42861]],[[42861,42861],\"valid\"],[[42862,42862],\"mapped\",[42863]],[[42863,42863],\"valid\"],[[42864,42864],\"mapped\",[42863]],[[42865,42872],\"valid\"],[[42873,42873],\"mapped\",[42874]],[[42874,42874],\"valid\"],[[42875,42875],\"mapped\",[42876]],[[42876,42876],\"valid\"],[[42877,42877],\"mapped\",[7545]],[[42878,42878],\"mapped\",[42879]],[[42879,42879],\"valid\"],[[42880,42880],\"mapped\",[42881]],[[42881,42881],\"valid\"],[[42882,42882],\"mapped\",[42883]],[[42883,42883],\"valid\"],[[42884,42884],\"mapped\",[42885]],[[42885,42885],\"valid\"],[[42886,42886],\"mapped\",[42887]],[[42887,42888],\"valid\"],[[42889,42890],\"valid\",[],\"NV8\"],[[42891,42891],\"mapped\",[42892]],[[42892,42892],\"valid\"],[[42893,42893],\"mapped\",[613]],[[42894,42894],\"valid\"],[[42895,42895],\"valid\"],[[42896,42896],\"mapped\",[42897]],[[42897,42897],\"valid\"],[[42898,42898],\"mapped\",[42899]],[[42899,42899],\"valid\"],[[42900,42901],\"valid\"],[[42902,42902],\"mapped\",[42903]],[[42903,42903],\"valid\"],[[42904,42904],\"mapped\",[42905]],[[42905,42905],\"valid\"],[[42906,42906],\"mapped\",[42907]],[[42907,42907],\"valid\"],[[42908,42908],\"mapped\",[42909]],[[42909,42909],\"valid\"],[[42910,42910],\"mapped\",[42911]],[[42911,42911],\"valid\"],[[42912,42912],\"mapped\",[42913]],[[42913,42913],\"valid\"],[[42914,42914],\"mapped\",[42915]],[[42915,42915],\"valid\"],[[42916,42916],\"mapped\",[42917]],[[42917,42917],\"valid\"],[[42918,42918],\"mapped\",[42919]],[[42919,42919],\"valid\"],[[42920,42920],\"mapped\",[42921]],[[42921,42921],\"valid\"],[[42922,42922],\"mapped\",[614]],[[42923,42923],\"mapped\",[604]],[[42924,42924],\"mapped\",[609]],[[42925,42925],\"mapped\",[620]],[[42926,42927],\"disallowed\"],[[42928,42928],\"mapped\",[670]],[[42929,42929],\"mapped\",[647]],[[42930,42930],\"mapped\",[669]],[[42931,42931],\"mapped\",[43859]],[[42932,42932],\"mapped\",[42933]],[[42933,42933],\"valid\"],[[42934,42934],\"mapped\",[42935]],[[42935,42935],\"valid\"],[[42936,42998],\"disallowed\"],[[42999,42999],\"valid\"],[[43000,43000],\"mapped\",[295]],[[43001,43001],\"mapped\",[339]],[[43002,43002],\"valid\"],[[43003,43007],\"valid\"],[[43008,43047],\"valid\"],[[43048,43051],\"valid\",[],\"NV8\"],[[43052,43055],\"disallowed\"],[[43056,43065],\"valid\",[],\"NV8\"],[[43066,43071],\"disallowed\"],[[43072,43123],\"valid\"],[[43124,43127],\"valid\",[],\"NV8\"],[[43128,43135],\"disallowed\"],[[43136,43204],\"valid\"],[[43205,43213],\"disallowed\"],[[43214,43215],\"valid\",[],\"NV8\"],[[43216,43225],\"valid\"],[[43226,43231],\"disallowed\"],[[43232,43255],\"valid\"],[[43256,43258],\"valid\",[],\"NV8\"],[[43259,43259],\"valid\"],[[43260,43260],\"valid\",[],\"NV8\"],[[43261,43261],\"valid\"],[[43262,43263],\"disallowed\"],[[43264,43309],\"valid\"],[[43310,43311],\"valid\",[],\"NV8\"],[[43312,43347],\"valid\"],[[43348,43358],\"disallowed\"],[[43359,43359],\"valid\",[],\"NV8\"],[[43360,43388],\"valid\",[],\"NV8\"],[[43389,43391],\"disallowed\"],[[43392,43456],\"valid\"],[[43457,43469],\"valid\",[],\"NV8\"],[[43470,43470],\"disallowed\"],[[43471,43481],\"valid\"],[[43482,43485],\"disallowed\"],[[43486,43487],\"valid\",[],\"NV8\"],[[43488,43518],\"valid\"],[[43519,43519],\"disallowed\"],[[43520,43574],\"valid\"],[[43575,43583],\"disallowed\"],[[43584,43597],\"valid\"],[[43598,43599],\"disallowed\"],[[43600,43609],\"valid\"],[[43610,43611],\"disallowed\"],[[43612,43615],\"valid\",[],\"NV8\"],[[43616,43638],\"valid\"],[[43639,43641],\"valid\",[],\"NV8\"],[[43642,43643],\"valid\"],[[43644,43647],\"valid\"],[[43648,43714],\"valid\"],[[43715,43738],\"disallowed\"],[[43739,43741],\"valid\"],[[43742,43743],\"valid\",[],\"NV8\"],[[43744,43759],\"valid\"],[[43760,43761],\"valid\",[],\"NV8\"],[[43762,43766],\"valid\"],[[43767,43776],\"disallowed\"],[[43777,43782],\"valid\"],[[43783,43784],\"disallowed\"],[[43785,43790],\"valid\"],[[43791,43792],\"disallowed\"],[[43793,43798],\"valid\"],[[43799,43807],\"disallowed\"],[[43808,43814],\"valid\"],[[43815,43815],\"disallowed\"],[[43816,43822],\"valid\"],[[43823,43823],\"disallowed\"],[[43824,43866],\"valid\"],[[43867,43867],\"valid\",[],\"NV8\"],[[43868,43868],\"mapped\",[42791]],[[43869,43869],\"mapped\",[43831]],[[43870,43870],\"mapped\",[619]],[[43871,43871],\"mapped\",[43858]],[[43872,43875],\"valid\"],[[43876,43877],\"valid\"],[[43878,43887],\"disallowed\"],[[43888,43888],\"mapped\",[5024]],[[43889,43889],\"mapped\",[5025]],[[43890,43890],\"mapped\",[5026]],[[43891,43891],\"mapped\",[5027]],[[43892,43892],\"mapped\",[5028]],[[43893,43893],\"mapped\",[5029]],[[43894,43894],\"mapped\",[5030]],[[43895,43895],\"mapped\",[5031]],[[43896,43896],\"mapped\",[5032]],[[43897,43897],\"mapped\",[5033]],[[43898,43898],\"mapped\",[5034]],[[43899,43899],\"mapped\",[5035]],[[43900,43900],\"mapped\",[5036]],[[43901,43901],\"mapped\",[5037]],[[43902,43902],\"mapped\",[5038]],[[43903,43903],\"mapped\",[5039]],[[43904,43904],\"mapped\",[5040]],[[43905,43905],\"mapped\",[5041]],[[43906,43906],\"mapped\",[5042]],[[43907,43907],\"mapped\",[5043]],[[43908,43908],\"mapped\",[5044]],[[43909,43909],\"mapped\",[5045]],[[43910,43910],\"mapped\",[5046]],[[43911,43911],\"mapped\",[5047]],[[43912,43912],\"mapped\",[5048]],[[43913,43913],\"mapped\",[5049]],[[43914,43914],\"mapped\",[5050]],[[43915,43915],\"mapped\",[5051]],[[43916,43916],\"mapped\",[5052]],[[43917,43917],\"mapped\",[5053]],[[43918,43918],\"mapped\",[5054]],[[43919,43919],\"mapped\",[5055]],[[43920,43920],\"mapped\",[5056]],[[43921,43921],\"mapped\",[5057]],[[43922,43922],\"mapped\",[5058]],[[43923,43923],\"mapped\",[5059]],[[43924,43924],\"mapped\",[5060]],[[43925,43925],\"mapped\",[5061]],[[43926,43926],\"mapped\",[5062]],[[43927,43927],\"mapped\",[5063]],[[43928,43928],\"mapped\",[5064]],[[43929,43929],\"mapped\",[5065]],[[43930,43930],\"mapped\",[5066]],[[43931,43931],\"mapped\",[5067]],[[43932,43932],\"mapped\",[5068]],[[43933,43933],\"mapped\",[5069]],[[43934,43934],\"mapped\",[5070]],[[43935,43935],\"mapped\",[5071]],[[43936,43936],\"mapped\",[5072]],[[43937,43937],\"mapped\",[5073]],[[43938,43938],\"mapped\",[5074]],[[43939,43939],\"mapped\",[5075]],[[43940,43940],\"mapped\",[5076]],[[43941,43941],\"mapped\",[5077]],[[43942,43942],\"mapped\",[5078]],[[43943,43943],\"mapped\",[5079]],[[43944,43944],\"mapped\",[5080]],[[43945,43945],\"mapped\",[5081]],[[43946,43946],\"mapped\",[5082]],[[43947,43947],\"mapped\",[5083]],[[43948,43948],\"mapped\",[5084]],[[43949,43949],\"mapped\",[5085]],[[43950,43950],\"mapped\",[5086]],[[43951,43951],\"mapped\",[5087]],[[43952,43952],\"mapped\",[5088]],[[43953,43953],\"mapped\",[5089]],[[43954,43954],\"mapped\",[5090]],[[43955,43955],\"mapped\",[5091]],[[43956,43956],\"mapped\",[5092]],[[43957,43957],\"mapped\",[5093]],[[43958,43958],\"mapped\",[5094]],[[43959,43959],\"mapped\",[5095]],[[43960,43960],\"mapped\",[5096]],[[43961,43961],\"mapped\",[5097]],[[43962,43962],\"mapped\",[5098]],[[43963,43963],\"mapped\",[5099]],[[43964,43964],\"mapped\",[5100]],[[43965,43965],\"mapped\",[5101]],[[43966,43966],\"mapped\",[5102]],[[43967,43967],\"mapped\",[5103]],[[43968,44010],\"valid\"],[[44011,44011],\"valid\",[],\"NV8\"],[[44012,44013],\"valid\"],[[44014,44015],\"disallowed\"],[[44016,44025],\"valid\"],[[44026,44031],\"disallowed\"],[[44032,55203],\"valid\"],[[55204,55215],\"disallowed\"],[[55216,55238],\"valid\",[],\"NV8\"],[[55239,55242],\"disallowed\"],[[55243,55291],\"valid\",[],\"NV8\"],[[55292,55295],\"disallowed\"],[[55296,57343],\"disallowed\"],[[57344,63743],\"disallowed\"],[[63744,63744],\"mapped\",[35912]],[[63745,63745],\"mapped\",[26356]],[[63746,63746],\"mapped\",[36554]],[[63747,63747],\"mapped\",[36040]],[[63748,63748],\"mapped\",[28369]],[[63749,63749],\"mapped\",[20018]],[[63750,63750],\"mapped\",[21477]],[[63751,63752],\"mapped\",[40860]],[[63753,63753],\"mapped\",[22865]],[[63754,63754],\"mapped\",[37329]],[[63755,63755],\"mapped\",[21895]],[[63756,63756],\"mapped\",[22856]],[[63757,63757],\"mapped\",[25078]],[[63758,63758],\"mapped\",[30313]],[[63759,63759],\"mapped\",[32645]],[[63760,63760],\"mapped\",[34367]],[[63761,63761],\"mapped\",[34746]],[[63762,63762],\"mapped\",[35064]],[[63763,63763],\"mapped\",[37007]],[[63764,63764],\"mapped\",[27138]],[[63765,63765],\"mapped\",[27931]],[[63766,63766],\"mapped\",[28889]],[[63767,63767],\"mapped\",[29662]],[[63768,63768],\"mapped\",[33853]],[[63769,63769],\"mapped\",[37226]],[[63770,63770],\"mapped\",[39409]],[[63771,63771],\"mapped\",[20098]],[[63772,63772],\"mapped\",[21365]],[[63773,63773],\"mapped\",[27396]],[[63774,63774],\"mapped\",[29211]],[[63775,63775],\"mapped\",[34349]],[[63776,63776],\"mapped\",[40478]],[[63777,63777],\"mapped\",[23888]],[[63778,63778],\"mapped\",[28651]],[[63779,63779],\"mapped\",[34253]],[[63780,63780],\"mapped\",[35172]],[[63781,63781],\"mapped\",[25289]],[[63782,63782],\"mapped\",[33240]],[[63783,63783],\"mapped\",[34847]],[[63784,63784],\"mapped\",[24266]],[[63785,63785],\"mapped\",[26391]],[[63786,63786],\"mapped\",[28010]],[[63787,63787],\"mapped\",[29436]],[[63788,63788],\"mapped\",[37070]],[[63789,63789],\"mapped\",[20358]],[[63790,63790],\"mapped\",[20919]],[[63791,63791],\"mapped\",[21214]],[[63792,63792],\"mapped\",[25796]],[[63793,63793],\"mapped\",[27347]],[[63794,63794],\"mapped\",[29200]],[[63795,63795],\"mapped\",[30439]],[[63796,63796],\"mapped\",[32769]],[[63797,63797],\"mapped\",[34310]],[[63798,63798],\"mapped\",[34396]],[[63799,63799],\"mapped\",[36335]],[[63800,63800],\"mapped\",[38706]],[[63801,63801],\"mapped\",[39791]],[[63802,63802],\"mapped\",[40442]],[[63803,63803],\"mapped\",[30860]],[[63804,63804],\"mapped\",[31103]],[[63805,63805],\"mapped\",[32160]],[[63806,63806],\"mapped\",[33737]],[[63807,63807],\"mapped\",[37636]],[[63808,63808],\"mapped\",[40575]],[[63809,63809],\"mapped\",[35542]],[[63810,63810],\"mapped\",[22751]],[[63811,63811],\"mapped\",[24324]],[[63812,63812],\"mapped\",[31840]],[[63813,63813],\"mapped\",[32894]],[[63814,63814],\"mapped\",[29282]],[[63815,63815],\"mapped\",[30922]],[[63816,63816],\"mapped\",[36034]],[[63817,63817],\"mapped\",[38647]],[[63818,63818],\"mapped\",[22744]],[[63819,63819],\"mapped\",[23650]],[[63820,63820],\"mapped\",[27155]],[[63821,63821],\"mapped\",[28122]],[[63822,63822],\"mapped\",[28431]],[[63823,63823],\"mapped\",[32047]],[[63824,63824],\"mapped\",[32311]],[[63825,63825],\"mapped\",[38475]],[[63826,63826],\"mapped\",[21202]],[[63827,63827],\"mapped\",[32907]],[[63828,63828],\"mapped\",[20956]],[[63829,63829],\"mapped\",[20940]],[[63830,63830],\"mapped\",[31260]],[[63831,63831],\"mapped\",[32190]],[[63832,63832],\"mapped\",[33777]],[[63833,63833],\"mapped\",[38517]],[[63834,63834],\"mapped\",[35712]],[[63835,63835],\"mapped\",[25295]],[[63836,63836],\"mapped\",[27138]],[[63837,63837],\"mapped\",[35582]],[[63838,63838],\"mapped\",[20025]],[[63839,63839],\"mapped\",[23527]],[[63840,63840],\"mapped\",[24594]],[[63841,63841],\"mapped\",[29575]],[[63842,63842],\"mapped\",[30064]],[[63843,63843],\"mapped\",[21271]],[[63844,63844],\"mapped\",[30971]],[[63845,63845],\"mapped\",[20415]],[[63846,63846],\"mapped\",[24489]],[[63847,63847],\"mapped\",[19981]],[[63848,63848],\"mapped\",[27852]],[[63849,63849],\"mapped\",[25976]],[[63850,63850],\"mapped\",[32034]],[[63851,63851],\"mapped\",[21443]],[[63852,63852],\"mapped\",[22622]],[[63853,63853],\"mapped\",[30465]],[[63854,63854],\"mapped\",[33865]],[[63855,63855],\"mapped\",[35498]],[[63856,63856],\"mapped\",[27578]],[[63857,63857],\"mapped\",[36784]],[[63858,63858],\"mapped\",[27784]],[[63859,63859],\"mapped\",[25342]],[[63860,63860],\"mapped\",[33509]],[[63861,63861],\"mapped\",[25504]],[[63862,63862],\"mapped\",[30053]],[[63863,63863],\"mapped\",[20142]],[[63864,63864],\"mapped\",[20841]],[[63865,63865],\"mapped\",[20937]],[[63866,63866],\"mapped\",[26753]],[[63867,63867],\"mapped\",[31975]],[[63868,63868],\"mapped\",[33391]],[[63869,63869],\"mapped\",[35538]],[[63870,63870],\"mapped\",[37327]],[[63871,63871],\"mapped\",[21237]],[[63872,63872],\"mapped\",[21570]],[[63873,63873],\"mapped\",[22899]],[[63874,63874],\"mapped\",[24300]],[[63875,63875],\"mapped\",[26053]],[[63876,63876],\"mapped\",[28670]],[[63877,63877],\"mapped\",[31018]],[[63878,63878],\"mapped\",[38317]],[[63879,63879],\"mapped\",[39530]],[[63880,63880],\"mapped\",[40599]],[[63881,63881],\"mapped\",[40654]],[[63882,63882],\"mapped\",[21147]],[[63883,63883],\"mapped\",[26310]],[[63884,63884],\"mapped\",[27511]],[[63885,63885],\"mapped\",[36706]],[[63886,63886],\"mapped\",[24180]],[[63887,63887],\"mapped\",[24976]],[[63888,63888],\"mapped\",[25088]],[[63889,63889],\"mapped\",[25754]],[[63890,63890],\"mapped\",[28451]],[[63891,63891],\"mapped\",[29001]],[[63892,63892],\"mapped\",[29833]],[[63893,63893],\"mapped\",[31178]],[[63894,63894],\"mapped\",[32244]],[[63895,63895],\"mapped\",[32879]],[[63896,63896],\"mapped\",[36646]],[[63897,63897],\"mapped\",[34030]],[[63898,63898],\"mapped\",[36899]],[[63899,63899],\"mapped\",[37706]],[[63900,63900],\"mapped\",[21015]],[[63901,63901],\"mapped\",[21155]],[[63902,63902],\"mapped\",[21693]],[[63903,63903],\"mapped\",[28872]],[[63904,63904],\"mapped\",[35010]],[[63905,63905],\"mapped\",[35498]],[[63906,63906],\"mapped\",[24265]],[[63907,63907],\"mapped\",[24565]],[[63908,63908],\"mapped\",[25467]],[[63909,63909],\"mapped\",[27566]],[[63910,63910],\"mapped\",[31806]],[[63911,63911],\"mapped\",[29557]],[[63912,63912],\"mapped\",[20196]],[[63913,63913],\"mapped\",[22265]],[[63914,63914],\"mapped\",[23527]],[[63915,63915],\"mapped\",[23994]],[[63916,63916],\"mapped\",[24604]],[[63917,63917],\"mapped\",[29618]],[[63918,63918],\"mapped\",[29801]],[[63919,63919],\"mapped\",[32666]],[[63920,63920],\"mapped\",[32838]],[[63921,63921],\"mapped\",[37428]],[[63922,63922],\"mapped\",[38646]],[[63923,63923],\"mapped\",[38728]],[[63924,63924],\"mapped\",[38936]],[[63925,63925],\"mapped\",[20363]],[[63926,63926],\"mapped\",[31150]],[[63927,63927],\"mapped\",[37300]],[[63928,63928],\"mapped\",[38584]],[[63929,63929],\"mapped\",[24801]],[[63930,63930],\"mapped\",[20102]],[[63931,63931],\"mapped\",[20698]],[[63932,63932],\"mapped\",[23534]],[[63933,63933],\"mapped\",[23615]],[[63934,63934],\"mapped\",[26009]],[[63935,63935],\"mapped\",[27138]],[[63936,63936],\"mapped\",[29134]],[[63937,63937],\"mapped\",[30274]],[[63938,63938],\"mapped\",[34044]],[[63939,63939],\"mapped\",[36988]],[[63940,63940],\"mapped\",[40845]],[[63941,63941],\"mapped\",[26248]],[[63942,63942],\"mapped\",[38446]],[[63943,63943],\"mapped\",[21129]],[[63944,63944],\"mapped\",[26491]],[[63945,63945],\"mapped\",[26611]],[[63946,63946],\"mapped\",[27969]],[[63947,63947],\"mapped\",[28316]],[[63948,63948],\"mapped\",[29705]],[[63949,63949],\"mapped\",[30041]],[[63950,63950],\"mapped\",[30827]],[[63951,63951],\"mapped\",[32016]],[[63952,63952],\"mapped\",[39006]],[[63953,63953],\"mapped\",[20845]],[[63954,63954],\"mapped\",[25134]],[[63955,63955],\"mapped\",[38520]],[[63956,63956],\"mapped\",[20523]],[[63957,63957],\"mapped\",[23833]],[[63958,63958],\"mapped\",[28138]],[[63959,63959],\"mapped\",[36650]],[[63960,63960],\"mapped\",[24459]],[[63961,63961],\"mapped\",[24900]],[[63962,63962],\"mapped\",[26647]],[[63963,63963],\"mapped\",[29575]],[[63964,63964],\"mapped\",[38534]],[[63965,63965],\"mapped\",[21033]],[[63966,63966],\"mapped\",[21519]],[[63967,63967],\"mapped\",[23653]],[[63968,63968],\"mapped\",[26131]],[[63969,63969],\"mapped\",[26446]],[[63970,63970],\"mapped\",[26792]],[[63971,63971],\"mapped\",[27877]],[[63972,63972],\"mapped\",[29702]],[[63973,63973],\"mapped\",[30178]],[[63974,63974],\"mapped\",[32633]],[[63975,63975],\"mapped\",[35023]],[[63976,63976],\"mapped\",[35041]],[[63977,63977],\"mapped\",[37324]],[[63978,63978],\"mapped\",[38626]],[[63979,63979],\"mapped\",[21311]],[[63980,63980],\"mapped\",[28346]],[[63981,63981],\"mapped\",[21533]],[[63982,63982],\"mapped\",[29136]],[[63983,63983],\"mapped\",[29848]],[[63984,63984],\"mapped\",[34298]],[[63985,63985],\"mapped\",[38563]],[[63986,63986],\"mapped\",[40023]],[[63987,63987],\"mapped\",[40607]],[[63988,63988],\"mapped\",[26519]],[[63989,63989],\"mapped\",[28107]],[[63990,63990],\"mapped\",[33256]],[[63991,63991],\"mapped\",[31435]],[[63992,63992],\"mapped\",[31520]],[[63993,63993],\"mapped\",[31890]],[[63994,63994],\"mapped\",[29376]],[[63995,63995],\"mapped\",[28825]],[[63996,63996],\"mapped\",[35672]],[[63997,63997],\"mapped\",[20160]],[[63998,63998],\"mapped\",[33590]],[[63999,63999],\"mapped\",[21050]],[[64000,64000],\"mapped\",[20999]],[[64001,64001],\"mapped\",[24230]],[[64002,64002],\"mapped\",[25299]],[[64003,64003],\"mapped\",[31958]],[[64004,64004],\"mapped\",[23429]],[[64005,64005],\"mapped\",[27934]],[[64006,64006],\"mapped\",[26292]],[[64007,64007],\"mapped\",[36667]],[[64008,64008],\"mapped\",[34892]],[[64009,64009],\"mapped\",[38477]],[[64010,64010],\"mapped\",[35211]],[[64011,64011],\"mapped\",[24275]],[[64012,64012],\"mapped\",[20800]],[[64013,64013],\"mapped\",[21952]],[[64014,64015],\"valid\"],[[64016,64016],\"mapped\",[22618]],[[64017,64017],\"valid\"],[[64018,64018],\"mapped\",[26228]],[[64019,64020],\"valid\"],[[64021,64021],\"mapped\",[20958]],[[64022,64022],\"mapped\",[29482]],[[64023,64023],\"mapped\",[30410]],[[64024,64024],\"mapped\",[31036]],[[64025,64025],\"mapped\",[31070]],[[64026,64026],\"mapped\",[31077]],[[64027,64027],\"mapped\",[31119]],[[64028,64028],\"mapped\",[38742]],[[64029,64029],\"mapped\",[31934]],[[64030,64030],\"mapped\",[32701]],[[64031,64031],\"valid\"],[[64032,64032],\"mapped\",[34322]],[[64033,64033],\"valid\"],[[64034,64034],\"mapped\",[35576]],[[64035,64036],\"valid\"],[[64037,64037],\"mapped\",[36920]],[[64038,64038],\"mapped\",[37117]],[[64039,64041],\"valid\"],[[64042,64042],\"mapped\",[39151]],[[64043,64043],\"mapped\",[39164]],[[64044,64044],\"mapped\",[39208]],[[64045,64045],\"mapped\",[40372]],[[64046,64046],\"mapped\",[37086]],[[64047,64047],\"mapped\",[38583]],[[64048,64048],\"mapped\",[20398]],[[64049,64049],\"mapped\",[20711]],[[64050,64050],\"mapped\",[20813]],[[64051,64051],\"mapped\",[21193]],[[64052,64052],\"mapped\",[21220]],[[64053,64053],\"mapped\",[21329]],[[64054,64054],\"mapped\",[21917]],[[64055,64055],\"mapped\",[22022]],[[64056,64056],\"mapped\",[22120]],[[64057,64057],\"mapped\",[22592]],[[64058,64058],\"mapped\",[22696]],[[64059,64059],\"mapped\",[23652]],[[64060,64060],\"mapped\",[23662]],[[64061,64061],\"mapped\",[24724]],[[64062,64062],\"mapped\",[24936]],[[64063,64063],\"mapped\",[24974]],[[64064,64064],\"mapped\",[25074]],[[64065,64065],\"mapped\",[25935]],[[64066,64066],\"mapped\",[26082]],[[64067,64067],\"mapped\",[26257]],[[64068,64068],\"mapped\",[26757]],[[64069,64069],\"mapped\",[28023]],[[64070,64070],\"mapped\",[28186]],[[64071,64071],\"mapped\",[28450]],[[64072,64072],\"mapped\",[29038]],[[64073,64073],\"mapped\",[29227]],[[64074,64074],\"mapped\",[29730]],[[64075,64075],\"mapped\",[30865]],[[64076,64076],\"mapped\",[31038]],[[64077,64077],\"mapped\",[31049]],[[64078,64078],\"mapped\",[31048]],[[64079,64079],\"mapped\",[31056]],[[64080,64080],\"mapped\",[31062]],[[64081,64081],\"mapped\",[31069]],[[64082,64082],\"mapped\",[31117]],[[64083,64083],\"mapped\",[31118]],[[64084,64084],\"mapped\",[31296]],[[64085,64085],\"mapped\",[31361]],[[64086,64086],\"mapped\",[31680]],[[64087,64087],\"mapped\",[32244]],[[64088,64088],\"mapped\",[32265]],[[64089,64089],\"mapped\",[32321]],[[64090,64090],\"mapped\",[32626]],[[64091,64091],\"mapped\",[32773]],[[64092,64092],\"mapped\",[33261]],[[64093,64094],\"mapped\",[33401]],[[64095,64095],\"mapped\",[33879]],[[64096,64096],\"mapped\",[35088]],[[64097,64097],\"mapped\",[35222]],[[64098,64098],\"mapped\",[35585]],[[64099,64099],\"mapped\",[35641]],[[64100,64100],\"mapped\",[36051]],[[64101,64101],\"mapped\",[36104]],[[64102,64102],\"mapped\",[36790]],[[64103,64103],\"mapped\",[36920]],[[64104,64104],\"mapped\",[38627]],[[64105,64105],\"mapped\",[38911]],[[64106,64106],\"mapped\",[38971]],[[64107,64107],\"mapped\",[24693]],[[64108,64108],\"mapped\",[148206]],[[64109,64109],\"mapped\",[33304]],[[64110,64111],\"disallowed\"],[[64112,64112],\"mapped\",[20006]],[[64113,64113],\"mapped\",[20917]],[[64114,64114],\"mapped\",[20840]],[[64115,64115],\"mapped\",[20352]],[[64116,64116],\"mapped\",[20805]],[[64117,64117],\"mapped\",[20864]],[[64118,64118],\"mapped\",[21191]],[[64119,64119],\"mapped\",[21242]],[[64120,64120],\"mapped\",[21917]],[[64121,64121],\"mapped\",[21845]],[[64122,64122],\"mapped\",[21913]],[[64123,64123],\"mapped\",[21986]],[[64124,64124],\"mapped\",[22618]],[[64125,64125],\"mapped\",[22707]],[[64126,64126],\"mapped\",[22852]],[[64127,64127],\"mapped\",[22868]],[[64128,64128],\"mapped\",[23138]],[[64129,64129],\"mapped\",[23336]],[[64130,64130],\"mapped\",[24274]],[[64131,64131],\"mapped\",[24281]],[[64132,64132],\"mapped\",[24425]],[[64133,64133],\"mapped\",[24493]],[[64134,64134],\"mapped\",[24792]],[[64135,64135],\"mapped\",[24910]],[[64136,64136],\"mapped\",[24840]],[[64137,64137],\"mapped\",[24974]],[[64138,64138],\"mapped\",[24928]],[[64139,64139],\"mapped\",[25074]],[[64140,64140],\"mapped\",[25140]],[[64141,64141],\"mapped\",[25540]],[[64142,64142],\"mapped\",[25628]],[[64143,64143],\"mapped\",[25682]],[[64144,64144],\"mapped\",[25942]],[[64145,64145],\"mapped\",[26228]],[[64146,64146],\"mapped\",[26391]],[[64147,64147],\"mapped\",[26395]],[[64148,64148],\"mapped\",[26454]],[[64149,64149],\"mapped\",[27513]],[[64150,64150],\"mapped\",[27578]],[[64151,64151],\"mapped\",[27969]],[[64152,64152],\"mapped\",[28379]],[[64153,64153],\"mapped\",[28363]],[[64154,64154],\"mapped\",[28450]],[[64155,64155],\"mapped\",[28702]],[[64156,64156],\"mapped\",[29038]],[[64157,64157],\"mapped\",[30631]],[[64158,64158],\"mapped\",[29237]],[[64159,64159],\"mapped\",[29359]],[[64160,64160],\"mapped\",[29482]],[[64161,64161],\"mapped\",[29809]],[[64162,64162],\"mapped\",[29958]],[[64163,64163],\"mapped\",[30011]],[[64164,64164],\"mapped\",[30237]],[[64165,64165],\"mapped\",[30239]],[[64166,64166],\"mapped\",[30410]],[[64167,64167],\"mapped\",[30427]],[[64168,64168],\"mapped\",[30452]],[[64169,64169],\"mapped\",[30538]],[[64170,64170],\"mapped\",[30528]],[[64171,64171],\"mapped\",[30924]],[[64172,64172],\"mapped\",[31409]],[[64173,64173],\"mapped\",[31680]],[[64174,64174],\"mapped\",[31867]],[[64175,64175],\"mapped\",[32091]],[[64176,64176],\"mapped\",[32244]],[[64177,64177],\"mapped\",[32574]],[[64178,64178],\"mapped\",[32773]],[[64179,64179],\"mapped\",[33618]],[[64180,64180],\"mapped\",[33775]],[[64181,64181],\"mapped\",[34681]],[[64182,64182],\"mapped\",[35137]],[[64183,64183],\"mapped\",[35206]],[[64184,64184],\"mapped\",[35222]],[[64185,64185],\"mapped\",[35519]],[[64186,64186],\"mapped\",[35576]],[[64187,64187],\"mapped\",[35531]],[[64188,64188],\"mapped\",[35585]],[[64189,64189],\"mapped\",[35582]],[[64190,64190],\"mapped\",[35565]],[[64191,64191],\"mapped\",[35641]],[[64192,64192],\"mapped\",[35722]],[[64193,64193],\"mapped\",[36104]],[[64194,64194],\"mapped\",[36664]],[[64195,64195],\"mapped\",[36978]],[[64196,64196],\"mapped\",[37273]],[[64197,64197],\"mapped\",[37494]],[[64198,64198],\"mapped\",[38524]],[[64199,64199],\"mapped\",[38627]],[[64200,64200],\"mapped\",[38742]],[[64201,64201],\"mapped\",[38875]],[[64202,64202],\"mapped\",[38911]],[[64203,64203],\"mapped\",[38923]],[[64204,64204],\"mapped\",[38971]],[[64205,64205],\"mapped\",[39698]],[[64206,64206],\"mapped\",[40860]],[[64207,64207],\"mapped\",[141386]],[[64208,64208],\"mapped\",[141380]],[[64209,64209],\"mapped\",[144341]],[[64210,64210],\"mapped\",[15261]],[[64211,64211],\"mapped\",[16408]],[[64212,64212],\"mapped\",[16441]],[[64213,64213],\"mapped\",[152137]],[[64214,64214],\"mapped\",[154832]],[[64215,64215],\"mapped\",[163539]],[[64216,64216],\"mapped\",[40771]],[[64217,64217],\"mapped\",[40846]],[[64218,64255],\"disallowed\"],[[64256,64256],\"mapped\",[102,102]],[[64257,64257],\"mapped\",[102,105]],[[64258,64258],\"mapped\",[102,108]],[[64259,64259],\"mapped\",[102,102,105]],[[64260,64260],\"mapped\",[102,102,108]],[[64261,64262],\"mapped\",[115,116]],[[64263,64274],\"disallowed\"],[[64275,64275],\"mapped\",[1396,1398]],[[64276,64276],\"mapped\",[1396,1381]],[[64277,64277],\"mapped\",[1396,1387]],[[64278,64278],\"mapped\",[1406,1398]],[[64279,64279],\"mapped\",[1396,1389]],[[64280,64284],\"disallowed\"],[[64285,64285],\"mapped\",[1497,1460]],[[64286,64286],\"valid\"],[[64287,64287],\"mapped\",[1522,1463]],[[64288,64288],\"mapped\",[1506]],[[64289,64289],\"mapped\",[1488]],[[64290,64290],\"mapped\",[1491]],[[64291,64291],\"mapped\",[1492]],[[64292,64292],\"mapped\",[1499]],[[64293,64293],\"mapped\",[1500]],[[64294,64294],\"mapped\",[1501]],[[64295,64295],\"mapped\",[1512]],[[64296,64296],\"mapped\",[1514]],[[64297,64297],\"disallowed_STD3_mapped\",[43]],[[64298,64298],\"mapped\",[1513,1473]],[[64299,64299],\"mapped\",[1513,1474]],[[64300,64300],\"mapped\",[1513,1468,1473]],[[64301,64301],\"mapped\",[1513,1468,1474]],[[64302,64302],\"mapped\",[1488,1463]],[[64303,64303],\"mapped\",[1488,1464]],[[64304,64304],\"mapped\",[1488,1468]],[[64305,64305],\"mapped\",[1489,1468]],[[64306,64306],\"mapped\",[1490,1468]],[[64307,64307],\"mapped\",[1491,1468]],[[64308,64308],\"mapped\",[1492,1468]],[[64309,64309],\"mapped\",[1493,1468]],[[64310,64310],\"mapped\",[1494,1468]],[[64311,64311],\"disallowed\"],[[64312,64312],\"mapped\",[1496,1468]],[[64313,64313],\"mapped\",[1497,1468]],[[64314,64314],\"mapped\",[1498,1468]],[[64315,64315],\"mapped\",[1499,1468]],[[64316,64316],\"mapped\",[1500,1468]],[[64317,64317],\"disallowed\"],[[64318,64318],\"mapped\",[1502,1468]],[[64319,64319],\"disallowed\"],[[64320,64320],\"mapped\",[1504,1468]],[[64321,64321],\"mapped\",[1505,1468]],[[64322,64322],\"disallowed\"],[[64323,64323],\"mapped\",[1507,1468]],[[64324,64324],\"mapped\",[1508,1468]],[[64325,64325],\"disallowed\"],[[64326,64326],\"mapped\",[1510,1468]],[[64327,64327],\"mapped\",[1511,1468]],[[64328,64328],\"mapped\",[1512,1468]],[[64329,64329],\"mapped\",[1513,1468]],[[64330,64330],\"mapped\",[1514,1468]],[[64331,64331],\"mapped\",[1493,1465]],[[64332,64332],\"mapped\",[1489,1471]],[[64333,64333],\"mapped\",[1499,1471]],[[64334,64334],\"mapped\",[1508,1471]],[[64335,64335],\"mapped\",[1488,1500]],[[64336,64337],\"mapped\",[1649]],[[64338,64341],\"mapped\",[1659]],[[64342,64345],\"mapped\",[1662]],[[64346,64349],\"mapped\",[1664]],[[64350,64353],\"mapped\",[1658]],[[64354,64357],\"mapped\",[1663]],[[64358,64361],\"mapped\",[1657]],[[64362,64365],\"mapped\",[1700]],[[64366,64369],\"mapped\",[1702]],[[64370,64373],\"mapped\",[1668]],[[64374,64377],\"mapped\",[1667]],[[64378,64381],\"mapped\",[1670]],[[64382,64385],\"mapped\",[1671]],[[64386,64387],\"mapped\",[1677]],[[64388,64389],\"mapped\",[1676]],[[64390,64391],\"mapped\",[1678]],[[64392,64393],\"mapped\",[1672]],[[64394,64395],\"mapped\",[1688]],[[64396,64397],\"mapped\",[1681]],[[64398,64401],\"mapped\",[1705]],[[64402,64405],\"mapped\",[1711]],[[64406,64409],\"mapped\",[1715]],[[64410,64413],\"mapped\",[1713]],[[64414,64415],\"mapped\",[1722]],[[64416,64419],\"mapped\",[1723]],[[64420,64421],\"mapped\",[1728]],[[64422,64425],\"mapped\",[1729]],[[64426,64429],\"mapped\",[1726]],[[64430,64431],\"mapped\",[1746]],[[64432,64433],\"mapped\",[1747]],[[64434,64449],\"valid\",[],\"NV8\"],[[64450,64466],\"disallowed\"],[[64467,64470],\"mapped\",[1709]],[[64471,64472],\"mapped\",[1735]],[[64473,64474],\"mapped\",[1734]],[[64475,64476],\"mapped\",[1736]],[[64477,64477],\"mapped\",[1735,1652]],[[64478,64479],\"mapped\",[1739]],[[64480,64481],\"mapped\",[1733]],[[64482,64483],\"mapped\",[1737]],[[64484,64487],\"mapped\",[1744]],[[64488,64489],\"mapped\",[1609]],[[64490,64491],\"mapped\",[1574,1575]],[[64492,64493],\"mapped\",[1574,1749]],[[64494,64495],\"mapped\",[1574,1608]],[[64496,64497],\"mapped\",[1574,1735]],[[64498,64499],\"mapped\",[1574,1734]],[[64500,64501],\"mapped\",[1574,1736]],[[64502,64504],\"mapped\",[1574,1744]],[[64505,64507],\"mapped\",[1574,1609]],[[64508,64511],\"mapped\",[1740]],[[64512,64512],\"mapped\",[1574,1580]],[[64513,64513],\"mapped\",[1574,1581]],[[64514,64514],\"mapped\",[1574,1605]],[[64515,64515],\"mapped\",[1574,1609]],[[64516,64516],\"mapped\",[1574,1610]],[[64517,64517],\"mapped\",[1576,1580]],[[64518,64518],\"mapped\",[1576,1581]],[[64519,64519],\"mapped\",[1576,1582]],[[64520,64520],\"mapped\",[1576,1605]],[[64521,64521],\"mapped\",[1576,1609]],[[64522,64522],\"mapped\",[1576,1610]],[[64523,64523],\"mapped\",[1578,1580]],[[64524,64524],\"mapped\",[1578,1581]],[[64525,64525],\"mapped\",[1578,1582]],[[64526,64526],\"mapped\",[1578,1605]],[[64527,64527],\"mapped\",[1578,1609]],[[64528,64528],\"mapped\",[1578,1610]],[[64529,64529],\"mapped\",[1579,1580]],[[64530,64530],\"mapped\",[1579,1605]],[[64531,64531],\"mapped\",[1579,1609]],[[64532,64532],\"mapped\",[1579,1610]],[[64533,64533],\"mapped\",[1580,1581]],[[64534,64534],\"mapped\",[1580,1605]],[[64535,64535],\"mapped\",[1581,1580]],[[64536,64536],\"mapped\",[1581,1605]],[[64537,64537],\"mapped\",[1582,1580]],[[64538,64538],\"mapped\",[1582,1581]],[[64539,64539],\"mapped\",[1582,1605]],[[64540,64540],\"mapped\",[1587,1580]],[[64541,64541],\"mapped\",[1587,1581]],[[64542,64542],\"mapped\",[1587,1582]],[[64543,64543],\"mapped\",[1587,1605]],[[64544,64544],\"mapped\",[1589,1581]],[[64545,64545],\"mapped\",[1589,1605]],[[64546,64546],\"mapped\",[1590,1580]],[[64547,64547],\"mapped\",[1590,1581]],[[64548,64548],\"mapped\",[1590,1582]],[[64549,64549],\"mapped\",[1590,1605]],[[64550,64550],\"mapped\",[1591,1581]],[[64551,64551],\"mapped\",[1591,1605]],[[64552,64552],\"mapped\",[1592,1605]],[[64553,64553],\"mapped\",[1593,1580]],[[64554,64554],\"mapped\",[1593,1605]],[[64555,64555],\"mapped\",[1594,1580]],[[64556,64556],\"mapped\",[1594,1605]],[[64557,64557],\"mapped\",[1601,1580]],[[64558,64558],\"mapped\",[1601,1581]],[[64559,64559],\"mapped\",[1601,1582]],[[64560,64560],\"mapped\",[1601,1605]],[[64561,64561],\"mapped\",[1601,1609]],[[64562,64562],\"mapped\",[1601,1610]],[[64563,64563],\"mapped\",[1602,1581]],[[64564,64564],\"mapped\",[1602,1605]],[[64565,64565],\"mapped\",[1602,1609]],[[64566,64566],\"mapped\",[1602,1610]],[[64567,64567],\"mapped\",[1603,1575]],[[64568,64568],\"mapped\",[1603,1580]],[[64569,64569],\"mapped\",[1603,1581]],[[64570,64570],\"mapped\",[1603,1582]],[[64571,64571],\"mapped\",[1603,1604]],[[64572,64572],\"mapped\",[1603,1605]],[[64573,64573],\"mapped\",[1603,1609]],[[64574,64574],\"mapped\",[1603,1610]],[[64575,64575],\"mapped\",[1604,1580]],[[64576,64576],\"mapped\",[1604,1581]],[[64577,64577],\"mapped\",[1604,1582]],[[64578,64578],\"mapped\",[1604,1605]],[[64579,64579],\"mapped\",[1604,1609]],[[64580,64580],\"mapped\",[1604,1610]],[[64581,64581],\"mapped\",[1605,1580]],[[64582,64582],\"mapped\",[1605,1581]],[[64583,64583],\"mapped\",[1605,1582]],[[64584,64584],\"mapped\",[1605,1605]],[[64585,64585],\"mapped\",[1605,1609]],[[64586,64586],\"mapped\",[1605,1610]],[[64587,64587],\"mapped\",[1606,1580]],[[64588,64588],\"mapped\",[1606,1581]],[[64589,64589],\"mapped\",[1606,1582]],[[64590,64590],\"mapped\",[1606,1605]],[[64591,64591],\"mapped\",[1606,1609]],[[64592,64592],\"mapped\",[1606,1610]],[[64593,64593],\"mapped\",[1607,1580]],[[64594,64594],\"mapped\",[1607,1605]],[[64595,64595],\"mapped\",[1607,1609]],[[64596,64596],\"mapped\",[1607,1610]],[[64597,64597],\"mapped\",[1610,1580]],[[64598,64598],\"mapped\",[1610,1581]],[[64599,64599],\"mapped\",[1610,1582]],[[64600,64600],\"mapped\",[1610,1605]],[[64601,64601],\"mapped\",[1610,1609]],[[64602,64602],\"mapped\",[1610,1610]],[[64603,64603],\"mapped\",[1584,1648]],[[64604,64604],\"mapped\",[1585,1648]],[[64605,64605],\"mapped\",[1609,1648]],[[64606,64606],\"disallowed_STD3_mapped\",[32,1612,1617]],[[64607,64607],\"disallowed_STD3_mapped\",[32,1613,1617]],[[64608,64608],\"disallowed_STD3_mapped\",[32,1614,1617]],[[64609,64609],\"disallowed_STD3_mapped\",[32,1615,1617]],[[64610,64610],\"disallowed_STD3_mapped\",[32,1616,1617]],[[64611,64611],\"disallowed_STD3_mapped\",[32,1617,1648]],[[64612,64612],\"mapped\",[1574,1585]],[[64613,64613],\"mapped\",[1574,1586]],[[64614,64614],\"mapped\",[1574,1605]],[[64615,64615],\"mapped\",[1574,1606]],[[64616,64616],\"mapped\",[1574,1609]],[[64617,64617],\"mapped\",[1574,1610]],[[64618,64618],\"mapped\",[1576,1585]],[[64619,64619],\"mapped\",[1576,1586]],[[64620,64620],\"mapped\",[1576,1605]],[[64621,64621],\"mapped\",[1576,1606]],[[64622,64622],\"mapped\",[1576,1609]],[[64623,64623],\"mapped\",[1576,1610]],[[64624,64624],\"mapped\",[1578,1585]],[[64625,64625],\"mapped\",[1578,1586]],[[64626,64626],\"mapped\",[1578,1605]],[[64627,64627],\"mapped\",[1578,1606]],[[64628,64628],\"mapped\",[1578,1609]],[[64629,64629],\"mapped\",[1578,1610]],[[64630,64630],\"mapped\",[1579,1585]],[[64631,64631],\"mapped\",[1579,1586]],[[64632,64632],\"mapped\",[1579,1605]],[[64633,64633],\"mapped\",[1579,1606]],[[64634,64634],\"mapped\",[1579,1609]],[[64635,64635],\"mapped\",[1579,1610]],[[64636,64636],\"mapped\",[1601,1609]],[[64637,64637],\"mapped\",[1601,1610]],[[64638,64638],\"mapped\",[1602,1609]],[[64639,64639],\"mapped\",[1602,1610]],[[64640,64640],\"mapped\",[1603,1575]],[[64641,64641],\"mapped\",[1603,1604]],[[64642,64642],\"mapped\",[1603,1605]],[[64643,64643],\"mapped\",[1603,1609]],[[64644,64644],\"mapped\",[1603,1610]],[[64645,64645],\"mapped\",[1604,1605]],[[64646,64646],\"mapped\",[1604,1609]],[[64647,64647],\"mapped\",[1604,1610]],[[64648,64648],\"mapped\",[1605,1575]],[[64649,64649],\"mapped\",[1605,1605]],[[64650,64650],\"mapped\",[1606,1585]],[[64651,64651],\"mapped\",[1606,1586]],[[64652,64652],\"mapped\",[1606,1605]],[[64653,64653],\"mapped\",[1606,1606]],[[64654,64654],\"mapped\",[1606,1609]],[[64655,64655],\"mapped\",[1606,1610]],[[64656,64656],\"mapped\",[1609,1648]],[[64657,64657],\"mapped\",[1610,1585]],[[64658,64658],\"mapped\",[1610,1586]],[[64659,64659],\"mapped\",[1610,1605]],[[64660,64660],\"mapped\",[1610,1606]],[[64661,64661],\"mapped\",[1610,1609]],[[64662,64662],\"mapped\",[1610,1610]],[[64663,64663],\"mapped\",[1574,1580]],[[64664,64664],\"mapped\",[1574,1581]],[[64665,64665],\"mapped\",[1574,1582]],[[64666,64666],\"mapped\",[1574,1605]],[[64667,64667],\"mapped\",[1574,1607]],[[64668,64668],\"mapped\",[1576,1580]],[[64669,64669],\"mapped\",[1576,1581]],[[64670,64670],\"mapped\",[1576,1582]],[[64671,64671],\"mapped\",[1576,1605]],[[64672,64672],\"mapped\",[1576,1607]],[[64673,64673],\"mapped\",[1578,1580]],[[64674,64674],\"mapped\",[1578,1581]],[[64675,64675],\"mapped\",[1578,1582]],[[64676,64676],\"mapped\",[1578,1605]],[[64677,64677],\"mapped\",[1578,1607]],[[64678,64678],\"mapped\",[1579,1605]],[[64679,64679],\"mapped\",[1580,1581]],[[64680,64680],\"mapped\",[1580,1605]],[[64681,64681],\"mapped\",[1581,1580]],[[64682,64682],\"mapped\",[1581,1605]],[[64683,64683],\"mapped\",[1582,1580]],[[64684,64684],\"mapped\",[1582,1605]],[[64685,64685],\"mapped\",[1587,1580]],[[64686,64686],\"mapped\",[1587,1581]],[[64687,64687],\"mapped\",[1587,1582]],[[64688,64688],\"mapped\",[1587,1605]],[[64689,64689],\"mapped\",[1589,1581]],[[64690,64690],\"mapped\",[1589,1582]],[[64691,64691],\"mapped\",[1589,1605]],[[64692,64692],\"mapped\",[1590,1580]],[[64693,64693],\"mapped\",[1590,1581]],[[64694,64694],\"mapped\",[1590,1582]],[[64695,64695],\"mapped\",[1590,1605]],[[64696,64696],\"mapped\",[1591,1581]],[[64697,64697],\"mapped\",[1592,1605]],[[64698,64698],\"mapped\",[1593,1580]],[[64699,64699],\"mapped\",[1593,1605]],[[64700,64700],\"mapped\",[1594,1580]],[[64701,64701],\"mapped\",[1594,1605]],[[64702,64702],\"mapped\",[1601,1580]],[[64703,64703],\"mapped\",[1601,1581]],[[64704,64704],\"mapped\",[1601,1582]],[[64705,64705],\"mapped\",[1601,1605]],[[64706,64706],\"mapped\",[1602,1581]],[[64707,64707],\"mapped\",[1602,1605]],[[64708,64708],\"mapped\",[1603,1580]],[[64709,64709],\"mapped\",[1603,1581]],[[64710,64710],\"mapped\",[1603,1582]],[[64711,64711],\"mapped\",[1603,1604]],[[64712,64712],\"mapped\",[1603,1605]],[[64713,64713],\"mapped\",[1604,1580]],[[64714,64714],\"mapped\",[1604,1581]],[[64715,64715],\"mapped\",[1604,1582]],[[64716,64716],\"mapped\",[1604,1605]],[[64717,64717],\"mapped\",[1604,1607]],[[64718,64718],\"mapped\",[1605,1580]],[[64719,64719],\"mapped\",[1605,1581]],[[64720,64720],\"mapped\",[1605,1582]],[[64721,64721],\"mapped\",[1605,1605]],[[64722,64722],\"mapped\",[1606,1580]],[[64723,64723],\"mapped\",[1606,1581]],[[64724,64724],\"mapped\",[1606,1582]],[[64725,64725],\"mapped\",[1606,1605]],[[64726,64726],\"mapped\",[1606,1607]],[[64727,64727],\"mapped\",[1607,1580]],[[64728,64728],\"mapped\",[1607,1605]],[[64729,64729],\"mapped\",[1607,1648]],[[64730,64730],\"mapped\",[1610,1580]],[[64731,64731],\"mapped\",[1610,1581]],[[64732,64732],\"mapped\",[1610,1582]],[[64733,64733],\"mapped\",[1610,1605]],[[64734,64734],\"mapped\",[1610,1607]],[[64735,64735],\"mapped\",[1574,1605]],[[64736,64736],\"mapped\",[1574,1607]],[[64737,64737],\"mapped\",[1576,1605]],[[64738,64738],\"mapped\",[1576,1607]],[[64739,64739],\"mapped\",[1578,1605]],[[64740,64740],\"mapped\",[1578,1607]],[[64741,64741],\"mapped\",[1579,1605]],[[64742,64742],\"mapped\",[1579,1607]],[[64743,64743],\"mapped\",[1587,1605]],[[64744,64744],\"mapped\",[1587,1607]],[[64745,64745],\"mapped\",[1588,1605]],[[64746,64746],\"mapped\",[1588,1607]],[[64747,64747],\"mapped\",[1603,1604]],[[64748,64748],\"mapped\",[1603,1605]],[[64749,64749],\"mapped\",[1604,1605]],[[64750,64750],\"mapped\",[1606,1605]],[[64751,64751],\"mapped\",[1606,1607]],[[64752,64752],\"mapped\",[1610,1605]],[[64753,64753],\"mapped\",[1610,1607]],[[64754,64754],\"mapped\",[1600,1614,1617]],[[64755,64755],\"mapped\",[1600,1615,1617]],[[64756,64756],\"mapped\",[1600,1616,1617]],[[64757,64757],\"mapped\",[1591,1609]],[[64758,64758],\"mapped\",[1591,1610]],[[64759,64759],\"mapped\",[1593,1609]],[[64760,64760],\"mapped\",[1593,1610]],[[64761,64761],\"mapped\",[1594,1609]],[[64762,64762],\"mapped\",[1594,1610]],[[64763,64763],\"mapped\",[1587,1609]],[[64764,64764],\"mapped\",[1587,1610]],[[64765,64765],\"mapped\",[1588,1609]],[[64766,64766],\"mapped\",[1588,1610]],[[64767,64767],\"mapped\",[1581,1609]],[[64768,64768],\"mapped\",[1581,1610]],[[64769,64769],\"mapped\",[1580,1609]],[[64770,64770],\"mapped\",[1580,1610]],[[64771,64771],\"mapped\",[1582,1609]],[[64772,64772],\"mapped\",[1582,1610]],[[64773,64773],\"mapped\",[1589,1609]],[[64774,64774],\"mapped\",[1589,1610]],[[64775,64775],\"mapped\",[1590,1609]],[[64776,64776],\"mapped\",[1590,1610]],[[64777,64777],\"mapped\",[1588,1580]],[[64778,64778],\"mapped\",[1588,1581]],[[64779,64779],\"mapped\",[1588,1582]],[[64780,64780],\"mapped\",[1588,1605]],[[64781,64781],\"mapped\",[1588,1585]],[[64782,64782],\"mapped\",[1587,1585]],[[64783,64783],\"mapped\",[1589,1585]],[[64784,64784],\"mapped\",[1590,1585]],[[64785,64785],\"mapped\",[1591,1609]],[[64786,64786],\"mapped\",[1591,1610]],[[64787,64787],\"mapped\",[1593,1609]],[[64788,64788],\"mapped\",[1593,1610]],[[64789,64789],\"mapped\",[1594,1609]],[[64790,64790],\"mapped\",[1594,1610]],[[64791,64791],\"mapped\",[1587,1609]],[[64792,64792],\"mapped\",[1587,1610]],[[64793,64793],\"mapped\",[1588,1609]],[[64794,64794],\"mapped\",[1588,1610]],[[64795,64795],\"mapped\",[1581,1609]],[[64796,64796],\"mapped\",[1581,1610]],[[64797,64797],\"mapped\",[1580,1609]],[[64798,64798],\"mapped\",[1580,1610]],[[64799,64799],\"mapped\",[1582,1609]],[[64800,64800],\"mapped\",[1582,1610]],[[64801,64801],\"mapped\",[1589,1609]],[[64802,64802],\"mapped\",[1589,1610]],[[64803,64803],\"mapped\",[1590,1609]],[[64804,64804],\"mapped\",[1590,1610]],[[64805,64805],\"mapped\",[1588,1580]],[[64806,64806],\"mapped\",[1588,1581]],[[64807,64807],\"mapped\",[1588,1582]],[[64808,64808],\"mapped\",[1588,1605]],[[64809,64809],\"mapped\",[1588,1585]],[[64810,64810],\"mapped\",[1587,1585]],[[64811,64811],\"mapped\",[1589,1585]],[[64812,64812],\"mapped\",[1590,1585]],[[64813,64813],\"mapped\",[1588,1580]],[[64814,64814],\"mapped\",[1588,1581]],[[64815,64815],\"mapped\",[1588,1582]],[[64816,64816],\"mapped\",[1588,1605]],[[64817,64817],\"mapped\",[1587,1607]],[[64818,64818],\"mapped\",[1588,1607]],[[64819,64819],\"mapped\",[1591,1605]],[[64820,64820],\"mapped\",[1587,1580]],[[64821,64821],\"mapped\",[1587,1581]],[[64822,64822],\"mapped\",[1587,1582]],[[64823,64823],\"mapped\",[1588,1580]],[[64824,64824],\"mapped\",[1588,1581]],[[64825,64825],\"mapped\",[1588,1582]],[[64826,64826],\"mapped\",[1591,1605]],[[64827,64827],\"mapped\",[1592,1605]],[[64828,64829],\"mapped\",[1575,1611]],[[64830,64831],\"valid\",[],\"NV8\"],[[64832,64847],\"disallowed\"],[[64848,64848],\"mapped\",[1578,1580,1605]],[[64849,64850],\"mapped\",[1578,1581,1580]],[[64851,64851],\"mapped\",[1578,1581,1605]],[[64852,64852],\"mapped\",[1578,1582,1605]],[[64853,64853],\"mapped\",[1578,1605,1580]],[[64854,64854],\"mapped\",[1578,1605,1581]],[[64855,64855],\"mapped\",[1578,1605,1582]],[[64856,64857],\"mapped\",[1580,1605,1581]],[[64858,64858],\"mapped\",[1581,1605,1610]],[[64859,64859],\"mapped\",[1581,1605,1609]],[[64860,64860],\"mapped\",[1587,1581,1580]],[[64861,64861],\"mapped\",[1587,1580,1581]],[[64862,64862],\"mapped\",[1587,1580,1609]],[[64863,64864],\"mapped\",[1587,1605,1581]],[[64865,64865],\"mapped\",[1587,1605,1580]],[[64866,64867],\"mapped\",[1587,1605,1605]],[[64868,64869],\"mapped\",[1589,1581,1581]],[[64870,64870],\"mapped\",[1589,1605,1605]],[[64871,64872],\"mapped\",[1588,1581,1605]],[[64873,64873],\"mapped\",[1588,1580,1610]],[[64874,64875],\"mapped\",[1588,1605,1582]],[[64876,64877],\"mapped\",[1588,1605,1605]],[[64878,64878],\"mapped\",[1590,1581,1609]],[[64879,64880],\"mapped\",[1590,1582,1605]],[[64881,64882],\"mapped\",[1591,1605,1581]],[[64883,64883],\"mapped\",[1591,1605,1605]],[[64884,64884],\"mapped\",[1591,1605,1610]],[[64885,64885],\"mapped\",[1593,1580,1605]],[[64886,64887],\"mapped\",[1593,1605,1605]],[[64888,64888],\"mapped\",[1593,1605,1609]],[[64889,64889],\"mapped\",[1594,1605,1605]],[[64890,64890],\"mapped\",[1594,1605,1610]],[[64891,64891],\"mapped\",[1594,1605,1609]],[[64892,64893],\"mapped\",[1601,1582,1605]],[[64894,64894],\"mapped\",[1602,1605,1581]],[[64895,64895],\"mapped\",[1602,1605,1605]],[[64896,64896],\"mapped\",[1604,1581,1605]],[[64897,64897],\"mapped\",[1604,1581,1610]],[[64898,64898],\"mapped\",[1604,1581,1609]],[[64899,64900],\"mapped\",[1604,1580,1580]],[[64901,64902],\"mapped\",[1604,1582,1605]],[[64903,64904],\"mapped\",[1604,1605,1581]],[[64905,64905],\"mapped\",[1605,1581,1580]],[[64906,64906],\"mapped\",[1605,1581,1605]],[[64907,64907],\"mapped\",[1605,1581,1610]],[[64908,64908],\"mapped\",[1605,1580,1581]],[[64909,64909],\"mapped\",[1605,1580,1605]],[[64910,64910],\"mapped\",[1605,1582,1580]],[[64911,64911],\"mapped\",[1605,1582,1605]],[[64912,64913],\"disallowed\"],[[64914,64914],\"mapped\",[1605,1580,1582]],[[64915,64915],\"mapped\",[1607,1605,1580]],[[64916,64916],\"mapped\",[1607,1605,1605]],[[64917,64917],\"mapped\",[1606,1581,1605]],[[64918,64918],\"mapped\",[1606,1581,1609]],[[64919,64920],\"mapped\",[1606,1580,1605]],[[64921,64921],\"mapped\",[1606,1580,1609]],[[64922,64922],\"mapped\",[1606,1605,1610]],[[64923,64923],\"mapped\",[1606,1605,1609]],[[64924,64925],\"mapped\",[1610,1605,1605]],[[64926,64926],\"mapped\",[1576,1582,1610]],[[64927,64927],\"mapped\",[1578,1580,1610]],[[64928,64928],\"mapped\",[1578,1580,1609]],[[64929,64929],\"mapped\",[1578,1582,1610]],[[64930,64930],\"mapped\",[1578,1582,1609]],[[64931,64931],\"mapped\",[1578,1605,1610]],[[64932,64932],\"mapped\",[1578,1605,1609]],[[64933,64933],\"mapped\",[1580,1605,1610]],[[64934,64934],\"mapped\",[1580,1581,1609]],[[64935,64935],\"mapped\",[1580,1605,1609]],[[64936,64936],\"mapped\",[1587,1582,1609]],[[64937,64937],\"mapped\",[1589,1581,1610]],[[64938,64938],\"mapped\",[1588,1581,1610]],[[64939,64939],\"mapped\",[1590,1581,1610]],[[64940,64940],\"mapped\",[1604,1580,1610]],[[64941,64941],\"mapped\",[1604,1605,1610]],[[64942,64942],\"mapped\",[1610,1581,1610]],[[64943,64943],\"mapped\",[1610,1580,1610]],[[64944,64944],\"mapped\",[1610,1605,1610]],[[64945,64945],\"mapped\",[1605,1605,1610]],[[64946,64946],\"mapped\",[1602,1605,1610]],[[64947,64947],\"mapped\",[1606,1581,1610]],[[64948,64948],\"mapped\",[1602,1605,1581]],[[64949,64949],\"mapped\",[1604,1581,1605]],[[64950,64950],\"mapped\",[1593,1605,1610]],[[64951,64951],\"mapped\",[1603,1605,1610]],[[64952,64952],\"mapped\",[1606,1580,1581]],[[64953,64953],\"mapped\",[1605,1582,1610]],[[64954,64954],\"mapped\",[1604,1580,1605]],[[64955,64955],\"mapped\",[1603,1605,1605]],[[64956,64956],\"mapped\",[1604,1580,1605]],[[64957,64957],\"mapped\",[1606,1580,1581]],[[64958,64958],\"mapped\",[1580,1581,1610]],[[64959,64959],\"mapped\",[1581,1580,1610]],[[64960,64960],\"mapped\",[1605,1580,1610]],[[64961,64961],\"mapped\",[1601,1605,1610]],[[64962,64962],\"mapped\",[1576,1581,1610]],[[64963,64963],\"mapped\",[1603,1605,1605]],[[64964,64964],\"mapped\",[1593,1580,1605]],[[64965,64965],\"mapped\",[1589,1605,1605]],[[64966,64966],\"mapped\",[1587,1582,1610]],[[64967,64967],\"mapped\",[1606,1580,1610]],[[64968,64975],\"disallowed\"],[[64976,65007],\"disallowed\"],[[65008,65008],\"mapped\",[1589,1604,1746]],[[65009,65009],\"mapped\",[1602,1604,1746]],[[65010,65010],\"mapped\",[1575,1604,1604,1607]],[[65011,65011],\"mapped\",[1575,1603,1576,1585]],[[65012,65012],\"mapped\",[1605,1581,1605,1583]],[[65013,65013],\"mapped\",[1589,1604,1593,1605]],[[65014,65014],\"mapped\",[1585,1587,1608,1604]],[[65015,65015],\"mapped\",[1593,1604,1610,1607]],[[65016,65016],\"mapped\",[1608,1587,1604,1605]],[[65017,65017],\"mapped\",[1589,1604,1609]],[[65018,65018],\"disallowed_STD3_mapped\",[1589,1604,1609,32,1575,1604,1604,1607,32,1593,1604,1610,1607,32,1608,1587,1604,1605]],[[65019,65019],\"disallowed_STD3_mapped\",[1580,1604,32,1580,1604,1575,1604,1607]],[[65020,65020],\"mapped\",[1585,1740,1575,1604]],[[65021,65021],\"valid\",[],\"NV8\"],[[65022,65023],\"disallowed\"],[[65024,65039],\"ignored\"],[[65040,65040],\"disallowed_STD3_mapped\",[44]],[[65041,65041],\"mapped\",[12289]],[[65042,65042],\"disallowed\"],[[65043,65043],\"disallowed_STD3_mapped\",[58]],[[65044,65044],\"disallowed_STD3_mapped\",[59]],[[65045,65045],\"disallowed_STD3_mapped\",[33]],[[65046,65046],\"disallowed_STD3_mapped\",[63]],[[65047,65047],\"mapped\",[12310]],[[65048,65048],\"mapped\",[12311]],[[65049,65049],\"disallowed\"],[[65050,65055],\"disallowed\"],[[65056,65059],\"valid\"],[[65060,65062],\"valid\"],[[65063,65069],\"valid\"],[[65070,65071],\"valid\"],[[65072,65072],\"disallowed\"],[[65073,65073],\"mapped\",[8212]],[[65074,65074],\"mapped\",[8211]],[[65075,65076],\"disallowed_STD3_mapped\",[95]],[[65077,65077],\"disallowed_STD3_mapped\",[40]],[[65078,65078],\"disallowed_STD3_mapped\",[41]],[[65079,65079],\"disallowed_STD3_mapped\",[123]],[[65080,65080],\"disallowed_STD3_mapped\",[125]],[[65081,65081],\"mapped\",[12308]],[[65082,65082],\"mapped\",[12309]],[[65083,65083],\"mapped\",[12304]],[[65084,65084],\"mapped\",[12305]],[[65085,65085],\"mapped\",[12298]],[[65086,65086],\"mapped\",[12299]],[[65087,65087],\"mapped\",[12296]],[[65088,65088],\"mapped\",[12297]],[[65089,65089],\"mapped\",[12300]],[[65090,65090],\"mapped\",[12301]],[[65091,65091],\"mapped\",[12302]],[[65092,65092],\"mapped\",[12303]],[[65093,65094],\"valid\",[],\"NV8\"],[[65095,65095],\"disallowed_STD3_mapped\",[91]],[[65096,65096],\"disallowed_STD3_mapped\",[93]],[[65097,65100],\"disallowed_STD3_mapped\",[32,773]],[[65101,65103],\"disallowed_STD3_mapped\",[95]],[[65104,65104],\"disallowed_STD3_mapped\",[44]],[[65105,65105],\"mapped\",[12289]],[[65106,65106],\"disallowed\"],[[65107,65107],\"disallowed\"],[[65108,65108],\"disallowed_STD3_mapped\",[59]],[[65109,65109],\"disallowed_STD3_mapped\",[58]],[[65110,65110],\"disallowed_STD3_mapped\",[63]],[[65111,65111],\"disallowed_STD3_mapped\",[33]],[[65112,65112],\"mapped\",[8212]],[[65113,65113],\"disallowed_STD3_mapped\",[40]],[[65114,65114],\"disallowed_STD3_mapped\",[41]],[[65115,65115],\"disallowed_STD3_mapped\",[123]],[[65116,65116],\"disallowed_STD3_mapped\",[125]],[[65117,65117],\"mapped\",[12308]],[[65118,65118],\"mapped\",[12309]],[[65119,65119],\"disallowed_STD3_mapped\",[35]],[[65120,65120],\"disallowed_STD3_mapped\",[38]],[[65121,65121],\"disallowed_STD3_mapped\",[42]],[[65122,65122],\"disallowed_STD3_mapped\",[43]],[[65123,65123],\"mapped\",[45]],[[65124,65124],\"disallowed_STD3_mapped\",[60]],[[65125,65125],\"disallowed_STD3_mapped\",[62]],[[65126,65126],\"disallowed_STD3_mapped\",[61]],[[65127,65127],\"disallowed\"],[[65128,65128],\"disallowed_STD3_mapped\",[92]],[[65129,65129],\"disallowed_STD3_mapped\",[36]],[[65130,65130],\"disallowed_STD3_mapped\",[37]],[[65131,65131],\"disallowed_STD3_mapped\",[64]],[[65132,65135],\"disallowed\"],[[65136,65136],\"disallowed_STD3_mapped\",[32,1611]],[[65137,65137],\"mapped\",[1600,1611]],[[65138,65138],\"disallowed_STD3_mapped\",[32,1612]],[[65139,65139],\"valid\"],[[65140,65140],\"disallowed_STD3_mapped\",[32,1613]],[[65141,65141],\"disallowed\"],[[65142,65142],\"disallowed_STD3_mapped\",[32,1614]],[[65143,65143],\"mapped\",[1600,1614]],[[65144,65144],\"disallowed_STD3_mapped\",[32,1615]],[[65145,65145],\"mapped\",[1600,1615]],[[65146,65146],\"disallowed_STD3_mapped\",[32,1616]],[[65147,65147],\"mapped\",[1600,1616]],[[65148,65148],\"disallowed_STD3_mapped\",[32,1617]],[[65149,65149],\"mapped\",[1600,1617]],[[65150,65150],\"disallowed_STD3_mapped\",[32,1618]],[[65151,65151],\"mapped\",[1600,1618]],[[65152,65152],\"mapped\",[1569]],[[65153,65154],\"mapped\",[1570]],[[65155,65156],\"mapped\",[1571]],[[65157,65158],\"mapped\",[1572]],[[65159,65160],\"mapped\",[1573]],[[65161,65164],\"mapped\",[1574]],[[65165,65166],\"mapped\",[1575]],[[65167,65170],\"mapped\",[1576]],[[65171,65172],\"mapped\",[1577]],[[65173,65176],\"mapped\",[1578]],[[65177,65180],\"mapped\",[1579]],[[65181,65184],\"mapped\",[1580]],[[65185,65188],\"mapped\",[1581]],[[65189,65192],\"mapped\",[1582]],[[65193,65194],\"mapped\",[1583]],[[65195,65196],\"mapped\",[1584]],[[65197,65198],\"mapped\",[1585]],[[65199,65200],\"mapped\",[1586]],[[65201,65204],\"mapped\",[1587]],[[65205,65208],\"mapped\",[1588]],[[65209,65212],\"mapped\",[1589]],[[65213,65216],\"mapped\",[1590]],[[65217,65220],\"mapped\",[1591]],[[65221,65224],\"mapped\",[1592]],[[65225,65228],\"mapped\",[1593]],[[65229,65232],\"mapped\",[1594]],[[65233,65236],\"mapped\",[1601]],[[65237,65240],\"mapped\",[1602]],[[65241,65244],\"mapped\",[1603]],[[65245,65248],\"mapped\",[1604]],[[65249,65252],\"mapped\",[1605]],[[65253,65256],\"mapped\",[1606]],[[65257,65260],\"mapped\",[1607]],[[65261,65262],\"mapped\",[1608]],[[65263,65264],\"mapped\",[1609]],[[65265,65268],\"mapped\",[1610]],[[65269,65270],\"mapped\",[1604,1570]],[[65271,65272],\"mapped\",[1604,1571]],[[65273,65274],\"mapped\",[1604,1573]],[[65275,65276],\"mapped\",[1604,1575]],[[65277,65278],\"disallowed\"],[[65279,65279],\"ignored\"],[[65280,65280],\"disallowed\"],[[65281,65281],\"disallowed_STD3_mapped\",[33]],[[65282,65282],\"disallowed_STD3_mapped\",[34]],[[65283,65283],\"disallowed_STD3_mapped\",[35]],[[65284,65284],\"disallowed_STD3_mapped\",[36]],[[65285,65285],\"disallowed_STD3_mapped\",[37]],[[65286,65286],\"disallowed_STD3_mapped\",[38]],[[65287,65287],\"disallowed_STD3_mapped\",[39]],[[65288,65288],\"disallowed_STD3_mapped\",[40]],[[65289,65289],\"disallowed_STD3_mapped\",[41]],[[65290,65290],\"disallowed_STD3_mapped\",[42]],[[65291,65291],\"disallowed_STD3_mapped\",[43]],[[65292,65292],\"disallowed_STD3_mapped\",[44]],[[65293,65293],\"mapped\",[45]],[[65294,65294],\"mapped\",[46]],[[65295,65295],\"disallowed_STD3_mapped\",[47]],[[65296,65296],\"mapped\",[48]],[[65297,65297],\"mapped\",[49]],[[65298,65298],\"mapped\",[50]],[[65299,65299],\"mapped\",[51]],[[65300,65300],\"mapped\",[52]],[[65301,65301],\"mapped\",[53]],[[65302,65302],\"mapped\",[54]],[[65303,65303],\"mapped\",[55]],[[65304,65304],\"mapped\",[56]],[[65305,65305],\"mapped\",[57]],[[65306,65306],\"disallowed_STD3_mapped\",[58]],[[65307,65307],\"disallowed_STD3_mapped\",[59]],[[65308,65308],\"disallowed_STD3_mapped\",[60]],[[65309,65309],\"disallowed_STD3_mapped\",[61]],[[65310,65310],\"disallowed_STD3_mapped\",[62]],[[65311,65311],\"disallowed_STD3_mapped\",[63]],[[65312,65312],\"disallowed_STD3_mapped\",[64]],[[65313,65313],\"mapped\",[97]],[[65314,65314],\"mapped\",[98]],[[65315,65315],\"mapped\",[99]],[[65316,65316],\"mapped\",[100]],[[65317,65317],\"mapped\",[101]],[[65318,65318],\"mapped\",[102]],[[65319,65319],\"mapped\",[103]],[[65320,65320],\"mapped\",[104]],[[65321,65321],\"mapped\",[105]],[[65322,65322],\"mapped\",[106]],[[65323,65323],\"mapped\",[107]],[[65324,65324],\"mapped\",[108]],[[65325,65325],\"mapped\",[109]],[[65326,65326],\"mapped\",[110]],[[65327,65327],\"mapped\",[111]],[[65328,65328],\"mapped\",[112]],[[65329,65329],\"mapped\",[113]],[[65330,65330],\"mapped\",[114]],[[65331,65331],\"mapped\",[115]],[[65332,65332],\"mapped\",[116]],[[65333,65333],\"mapped\",[117]],[[65334,65334],\"mapped\",[118]],[[65335,65335],\"mapped\",[119]],[[65336,65336],\"mapped\",[120]],[[65337,65337],\"mapped\",[121]],[[65338,65338],\"mapped\",[122]],[[65339,65339],\"disallowed_STD3_mapped\",[91]],[[65340,65340],\"disallowed_STD3_mapped\",[92]],[[65341,65341],\"disallowed_STD3_mapped\",[93]],[[65342,65342],\"disallowed_STD3_mapped\",[94]],[[65343,65343],\"disallowed_STD3_mapped\",[95]],[[65344,65344],\"disallowed_STD3_mapped\",[96]],[[65345,65345],\"mapped\",[97]],[[65346,65346],\"mapped\",[98]],[[65347,65347],\"mapped\",[99]],[[65348,65348],\"mapped\",[100]],[[65349,65349],\"mapped\",[101]],[[65350,65350],\"mapped\",[102]],[[65351,65351],\"mapped\",[103]],[[65352,65352],\"mapped\",[104]],[[65353,65353],\"mapped\",[105]],[[65354,65354],\"mapped\",[106]],[[65355,65355],\"mapped\",[107]],[[65356,65356],\"mapped\",[108]],[[65357,65357],\"mapped\",[109]],[[65358,65358],\"mapped\",[110]],[[65359,65359],\"mapped\",[111]],[[65360,65360],\"mapped\",[112]],[[65361,65361],\"mapped\",[113]],[[65362,65362],\"mapped\",[114]],[[65363,65363],\"mapped\",[115]],[[65364,65364],\"mapped\",[116]],[[65365,65365],\"mapped\",[117]],[[65366,65366],\"mapped\",[118]],[[65367,65367],\"mapped\",[119]],[[65368,65368],\"mapped\",[120]],[[65369,65369],\"mapped\",[121]],[[65370,65370],\"mapped\",[122]],[[65371,65371],\"disallowed_STD3_mapped\",[123]],[[65372,65372],\"disallowed_STD3_mapped\",[124]],[[65373,65373],\"disallowed_STD3_mapped\",[125]],[[65374,65374],\"disallowed_STD3_mapped\",[126]],[[65375,65375],\"mapped\",[10629]],[[65376,65376],\"mapped\",[10630]],[[65377,65377],\"mapped\",[46]],[[65378,65378],\"mapped\",[12300]],[[65379,65379],\"mapped\",[12301]],[[65380,65380],\"mapped\",[12289]],[[65381,65381],\"mapped\",[12539]],[[65382,65382],\"mapped\",[12530]],[[65383,65383],\"mapped\",[12449]],[[65384,65384],\"mapped\",[12451]],[[65385,65385],\"mapped\",[12453]],[[65386,65386],\"mapped\",[12455]],[[65387,65387],\"mapped\",[12457]],[[65388,65388],\"mapped\",[12515]],[[65389,65389],\"mapped\",[12517]],[[65390,65390],\"mapped\",[12519]],[[65391,65391],\"mapped\",[12483]],[[65392,65392],\"mapped\",[12540]],[[65393,65393],\"mapped\",[12450]],[[65394,65394],\"mapped\",[12452]],[[65395,65395],\"mapped\",[12454]],[[65396,65396],\"mapped\",[12456]],[[65397,65397],\"mapped\",[12458]],[[65398,65398],\"mapped\",[12459]],[[65399,65399],\"mapped\",[12461]],[[65400,65400],\"mapped\",[12463]],[[65401,65401],\"mapped\",[12465]],[[65402,65402],\"mapped\",[12467]],[[65403,65403],\"mapped\",[12469]],[[65404,65404],\"mapped\",[12471]],[[65405,65405],\"mapped\",[12473]],[[65406,65406],\"mapped\",[12475]],[[65407,65407],\"mapped\",[12477]],[[65408,65408],\"mapped\",[12479]],[[65409,65409],\"mapped\",[12481]],[[65410,65410],\"mapped\",[12484]],[[65411,65411],\"mapped\",[12486]],[[65412,65412],\"mapped\",[12488]],[[65413,65413],\"mapped\",[12490]],[[65414,65414],\"mapped\",[12491]],[[65415,65415],\"mapped\",[12492]],[[65416,65416],\"mapped\",[12493]],[[65417,65417],\"mapped\",[12494]],[[65418,65418],\"mapped\",[12495]],[[65419,65419],\"mapped\",[12498]],[[65420,65420],\"mapped\",[12501]],[[65421,65421],\"mapped\",[12504]],[[65422,65422],\"mapped\",[12507]],[[65423,65423],\"mapped\",[12510]],[[65424,65424],\"mapped\",[12511]],[[65425,65425],\"mapped\",[12512]],[[65426,65426],\"mapped\",[12513]],[[65427,65427],\"mapped\",[12514]],[[65428,65428],\"mapped\",[12516]],[[65429,65429],\"mapped\",[12518]],[[65430,65430],\"mapped\",[12520]],[[65431,65431],\"mapped\",[12521]],[[65432,65432],\"mapped\",[12522]],[[65433,65433],\"mapped\",[12523]],[[65434,65434],\"mapped\",[12524]],[[65435,65435],\"mapped\",[12525]],[[65436,65436],\"mapped\",[12527]],[[65437,65437],\"mapped\",[12531]],[[65438,65438],\"mapped\",[12441]],[[65439,65439],\"mapped\",[12442]],[[65440,65440],\"disallowed\"],[[65441,65441],\"mapped\",[4352]],[[65442,65442],\"mapped\",[4353]],[[65443,65443],\"mapped\",[4522]],[[65444,65444],\"mapped\",[4354]],[[65445,65445],\"mapped\",[4524]],[[65446,65446],\"mapped\",[4525]],[[65447,65447],\"mapped\",[4355]],[[65448,65448],\"mapped\",[4356]],[[65449,65449],\"mapped\",[4357]],[[65450,65450],\"mapped\",[4528]],[[65451,65451],\"mapped\",[4529]],[[65452,65452],\"mapped\",[4530]],[[65453,65453],\"mapped\",[4531]],[[65454,65454],\"mapped\",[4532]],[[65455,65455],\"mapped\",[4533]],[[65456,65456],\"mapped\",[4378]],[[65457,65457],\"mapped\",[4358]],[[65458,65458],\"mapped\",[4359]],[[65459,65459],\"mapped\",[4360]],[[65460,65460],\"mapped\",[4385]],[[65461,65461],\"mapped\",[4361]],[[65462,65462],\"mapped\",[4362]],[[65463,65463],\"mapped\",[4363]],[[65464,65464],\"mapped\",[4364]],[[65465,65465],\"mapped\",[4365]],[[65466,65466],\"mapped\",[4366]],[[65467,65467],\"mapped\",[4367]],[[65468,65468],\"mapped\",[4368]],[[65469,65469],\"mapped\",[4369]],[[65470,65470],\"mapped\",[4370]],[[65471,65473],\"disallowed\"],[[65474,65474],\"mapped\",[4449]],[[65475,65475],\"mapped\",[4450]],[[65476,65476],\"mapped\",[4451]],[[65477,65477],\"mapped\",[4452]],[[65478,65478],\"mapped\",[4453]],[[65479,65479],\"mapped\",[4454]],[[65480,65481],\"disallowed\"],[[65482,65482],\"mapped\",[4455]],[[65483,65483],\"mapped\",[4456]],[[65484,65484],\"mapped\",[4457]],[[65485,65485],\"mapped\",[4458]],[[65486,65486],\"mapped\",[4459]],[[65487,65487],\"mapped\",[4460]],[[65488,65489],\"disallowed\"],[[65490,65490],\"mapped\",[4461]],[[65491,65491],\"mapped\",[4462]],[[65492,65492],\"mapped\",[4463]],[[65493,65493],\"mapped\",[4464]],[[65494,65494],\"mapped\",[4465]],[[65495,65495],\"mapped\",[4466]],[[65496,65497],\"disallowed\"],[[65498,65498],\"mapped\",[4467]],[[65499,65499],\"mapped\",[4468]],[[65500,65500],\"mapped\",[4469]],[[65501,65503],\"disallowed\"],[[65504,65504],\"mapped\",[162]],[[65505,65505],\"mapped\",[163]],[[65506,65506],\"mapped\",[172]],[[65507,65507],\"disallowed_STD3_mapped\",[32,772]],[[65508,65508],\"mapped\",[166]],[[65509,65509],\"mapped\",[165]],[[65510,65510],\"mapped\",[8361]],[[65511,65511],\"disallowed\"],[[65512,65512],\"mapped\",[9474]],[[65513,65513],\"mapped\",[8592]],[[65514,65514],\"mapped\",[8593]],[[65515,65515],\"mapped\",[8594]],[[65516,65516],\"mapped\",[8595]],[[65517,65517],\"mapped\",[9632]],[[65518,65518],\"mapped\",[9675]],[[65519,65528],\"disallowed\"],[[65529,65531],\"disallowed\"],[[65532,65532],\"disallowed\"],[[65533,65533],\"disallowed\"],[[65534,65535],\"disallowed\"],[[65536,65547],\"valid\"],[[65548,65548],\"disallowed\"],[[65549,65574],\"valid\"],[[65575,65575],\"disallowed\"],[[65576,65594],\"valid\"],[[65595,65595],\"disallowed\"],[[65596,65597],\"valid\"],[[65598,65598],\"disallowed\"],[[65599,65613],\"valid\"],[[65614,65615],\"disallowed\"],[[65616,65629],\"valid\"],[[65630,65663],\"disallowed\"],[[65664,65786],\"valid\"],[[65787,65791],\"disallowed\"],[[65792,65794],\"valid\",[],\"NV8\"],[[65795,65798],\"disallowed\"],[[65799,65843],\"valid\",[],\"NV8\"],[[65844,65846],\"disallowed\"],[[65847,65855],\"valid\",[],\"NV8\"],[[65856,65930],\"valid\",[],\"NV8\"],[[65931,65932],\"valid\",[],\"NV8\"],[[65933,65935],\"disallowed\"],[[65936,65947],\"valid\",[],\"NV8\"],[[65948,65951],\"disallowed\"],[[65952,65952],\"valid\",[],\"NV8\"],[[65953,65999],\"disallowed\"],[[66000,66044],\"valid\",[],\"NV8\"],[[66045,66045],\"valid\"],[[66046,66175],\"disallowed\"],[[66176,66204],\"valid\"],[[66205,66207],\"disallowed\"],[[66208,66256],\"valid\"],[[66257,66271],\"disallowed\"],[[66272,66272],\"valid\"],[[66273,66299],\"valid\",[],\"NV8\"],[[66300,66303],\"disallowed\"],[[66304,66334],\"valid\"],[[66335,66335],\"valid\"],[[66336,66339],\"valid\",[],\"NV8\"],[[66340,66351],\"disallowed\"],[[66352,66368],\"valid\"],[[66369,66369],\"valid\",[],\"NV8\"],[[66370,66377],\"valid\"],[[66378,66378],\"valid\",[],\"NV8\"],[[66379,66383],\"disallowed\"],[[66384,66426],\"valid\"],[[66427,66431],\"disallowed\"],[[66432,66461],\"valid\"],[[66462,66462],\"disallowed\"],[[66463,66463],\"valid\",[],\"NV8\"],[[66464,66499],\"valid\"],[[66500,66503],\"disallowed\"],[[66504,66511],\"valid\"],[[66512,66517],\"valid\",[],\"NV8\"],[[66518,66559],\"disallowed\"],[[66560,66560],\"mapped\",[66600]],[[66561,66561],\"mapped\",[66601]],[[66562,66562],\"mapped\",[66602]],[[66563,66563],\"mapped\",[66603]],[[66564,66564],\"mapped\",[66604]],[[66565,66565],\"mapped\",[66605]],[[66566,66566],\"mapped\",[66606]],[[66567,66567],\"mapped\",[66607]],[[66568,66568],\"mapped\",[66608]],[[66569,66569],\"mapped\",[66609]],[[66570,66570],\"mapped\",[66610]],[[66571,66571],\"mapped\",[66611]],[[66572,66572],\"mapped\",[66612]],[[66573,66573],\"mapped\",[66613]],[[66574,66574],\"mapped\",[66614]],[[66575,66575],\"mapped\",[66615]],[[66576,66576],\"mapped\",[66616]],[[66577,66577],\"mapped\",[66617]],[[66578,66578],\"mapped\",[66618]],[[66579,66579],\"mapped\",[66619]],[[66580,66580],\"mapped\",[66620]],[[66581,66581],\"mapped\",[66621]],[[66582,66582],\"mapped\",[66622]],[[66583,66583],\"mapped\",[66623]],[[66584,66584],\"mapped\",[66624]],[[66585,66585],\"mapped\",[66625]],[[66586,66586],\"mapped\",[66626]],[[66587,66587],\"mapped\",[66627]],[[66588,66588],\"mapped\",[66628]],[[66589,66589],\"mapped\",[66629]],[[66590,66590],\"mapped\",[66630]],[[66591,66591],\"mapped\",[66631]],[[66592,66592],\"mapped\",[66632]],[[66593,66593],\"mapped\",[66633]],[[66594,66594],\"mapped\",[66634]],[[66595,66595],\"mapped\",[66635]],[[66596,66596],\"mapped\",[66636]],[[66597,66597],\"mapped\",[66637]],[[66598,66598],\"mapped\",[66638]],[[66599,66599],\"mapped\",[66639]],[[66600,66637],\"valid\"],[[66638,66717],\"valid\"],[[66718,66719],\"disallowed\"],[[66720,66729],\"valid\"],[[66730,66815],\"disallowed\"],[[66816,66855],\"valid\"],[[66856,66863],\"disallowed\"],[[66864,66915],\"valid\"],[[66916,66926],\"disallowed\"],[[66927,66927],\"valid\",[],\"NV8\"],[[66928,67071],\"disallowed\"],[[67072,67382],\"valid\"],[[67383,67391],\"disallowed\"],[[67392,67413],\"valid\"],[[67414,67423],\"disallowed\"],[[67424,67431],\"valid\"],[[67432,67583],\"disallowed\"],[[67584,67589],\"valid\"],[[67590,67591],\"disallowed\"],[[67592,67592],\"valid\"],[[67593,67593],\"disallowed\"],[[67594,67637],\"valid\"],[[67638,67638],\"disallowed\"],[[67639,67640],\"valid\"],[[67641,67643],\"disallowed\"],[[67644,67644],\"valid\"],[[67645,67646],\"disallowed\"],[[67647,67647],\"valid\"],[[67648,67669],\"valid\"],[[67670,67670],\"disallowed\"],[[67671,67679],\"valid\",[],\"NV8\"],[[67680,67702],\"valid\"],[[67703,67711],\"valid\",[],\"NV8\"],[[67712,67742],\"valid\"],[[67743,67750],\"disallowed\"],[[67751,67759],\"valid\",[],\"NV8\"],[[67760,67807],\"disallowed\"],[[67808,67826],\"valid\"],[[67827,67827],\"disallowed\"],[[67828,67829],\"valid\"],[[67830,67834],\"disallowed\"],[[67835,67839],\"valid\",[],\"NV8\"],[[67840,67861],\"valid\"],[[67862,67865],\"valid\",[],\"NV8\"],[[67866,67867],\"valid\",[],\"NV8\"],[[67868,67870],\"disallowed\"],[[67871,67871],\"valid\",[],\"NV8\"],[[67872,67897],\"valid\"],[[67898,67902],\"disallowed\"],[[67903,67903],\"valid\",[],\"NV8\"],[[67904,67967],\"disallowed\"],[[67968,68023],\"valid\"],[[68024,68027],\"disallowed\"],[[68028,68029],\"valid\",[],\"NV8\"],[[68030,68031],\"valid\"],[[68032,68047],\"valid\",[],\"NV8\"],[[68048,68049],\"disallowed\"],[[68050,68095],\"valid\",[],\"NV8\"],[[68096,68099],\"valid\"],[[68100,68100],\"disallowed\"],[[68101,68102],\"valid\"],[[68103,68107],\"disallowed\"],[[68108,68115],\"valid\"],[[68116,68116],\"disallowed\"],[[68117,68119],\"valid\"],[[68120,68120],\"disallowed\"],[[68121,68147],\"valid\"],[[68148,68151],\"disallowed\"],[[68152,68154],\"valid\"],[[68155,68158],\"disallowed\"],[[68159,68159],\"valid\"],[[68160,68167],\"valid\",[],\"NV8\"],[[68168,68175],\"disallowed\"],[[68176,68184],\"valid\",[],\"NV8\"],[[68185,68191],\"disallowed\"],[[68192,68220],\"valid\"],[[68221,68223],\"valid\",[],\"NV8\"],[[68224,68252],\"valid\"],[[68253,68255],\"valid\",[],\"NV8\"],[[68256,68287],\"disallowed\"],[[68288,68295],\"valid\"],[[68296,68296],\"valid\",[],\"NV8\"],[[68297,68326],\"valid\"],[[68327,68330],\"disallowed\"],[[68331,68342],\"valid\",[],\"NV8\"],[[68343,68351],\"disallowed\"],[[68352,68405],\"valid\"],[[68406,68408],\"disallowed\"],[[68409,68415],\"valid\",[],\"NV8\"],[[68416,68437],\"valid\"],[[68438,68439],\"disallowed\"],[[68440,68447],\"valid\",[],\"NV8\"],[[68448,68466],\"valid\"],[[68467,68471],\"disallowed\"],[[68472,68479],\"valid\",[],\"NV8\"],[[68480,68497],\"valid\"],[[68498,68504],\"disallowed\"],[[68505,68508],\"valid\",[],\"NV8\"],[[68509,68520],\"disallowed\"],[[68521,68527],\"valid\",[],\"NV8\"],[[68528,68607],\"disallowed\"],[[68608,68680],\"valid\"],[[68681,68735],\"disallowed\"],[[68736,68736],\"mapped\",[68800]],[[68737,68737],\"mapped\",[68801]],[[68738,68738],\"mapped\",[68802]],[[68739,68739],\"mapped\",[68803]],[[68740,68740],\"mapped\",[68804]],[[68741,68741],\"mapped\",[68805]],[[68742,68742],\"mapped\",[68806]],[[68743,68743],\"mapped\",[68807]],[[68744,68744],\"mapped\",[68808]],[[68745,68745],\"mapped\",[68809]],[[68746,68746],\"mapped\",[68810]],[[68747,68747],\"mapped\",[68811]],[[68748,68748],\"mapped\",[68812]],[[68749,68749],\"mapped\",[68813]],[[68750,68750],\"mapped\",[68814]],[[68751,68751],\"mapped\",[68815]],[[68752,68752],\"mapped\",[68816]],[[68753,68753],\"mapped\",[68817]],[[68754,68754],\"mapped\",[68818]],[[68755,68755],\"mapped\",[68819]],[[68756,68756],\"mapped\",[68820]],[[68757,68757],\"mapped\",[68821]],[[68758,68758],\"mapped\",[68822]],[[68759,68759],\"mapped\",[68823]],[[68760,68760],\"mapped\",[68824]],[[68761,68761],\"mapped\",[68825]],[[68762,68762],\"mapped\",[68826]],[[68763,68763],\"mapped\",[68827]],[[68764,68764],\"mapped\",[68828]],[[68765,68765],\"mapped\",[68829]],[[68766,68766],\"mapped\",[68830]],[[68767,68767],\"mapped\",[68831]],[[68768,68768],\"mapped\",[68832]],[[68769,68769],\"mapped\",[68833]],[[68770,68770],\"mapped\",[68834]],[[68771,68771],\"mapped\",[68835]],[[68772,68772],\"mapped\",[68836]],[[68773,68773],\"mapped\",[68837]],[[68774,68774],\"mapped\",[68838]],[[68775,68775],\"mapped\",[68839]],[[68776,68776],\"mapped\",[68840]],[[68777,68777],\"mapped\",[68841]],[[68778,68778],\"mapped\",[68842]],[[68779,68779],\"mapped\",[68843]],[[68780,68780],\"mapped\",[68844]],[[68781,68781],\"mapped\",[68845]],[[68782,68782],\"mapped\",[68846]],[[68783,68783],\"mapped\",[68847]],[[68784,68784],\"mapped\",[68848]],[[68785,68785],\"mapped\",[68849]],[[68786,68786],\"mapped\",[68850]],[[68787,68799],\"disallowed\"],[[68800,68850],\"valid\"],[[68851,68857],\"disallowed\"],[[68858,68863],\"valid\",[],\"NV8\"],[[68864,69215],\"disallowed\"],[[69216,69246],\"valid\",[],\"NV8\"],[[69247,69631],\"disallowed\"],[[69632,69702],\"valid\"],[[69703,69709],\"valid\",[],\"NV8\"],[[69710,69713],\"disallowed\"],[[69714,69733],\"valid\",[],\"NV8\"],[[69734,69743],\"valid\"],[[69744,69758],\"disallowed\"],[[69759,69759],\"valid\"],[[69760,69818],\"valid\"],[[69819,69820],\"valid\",[],\"NV8\"],[[69821,69821],\"disallowed\"],[[69822,69825],\"valid\",[],\"NV8\"],[[69826,69839],\"disallowed\"],[[69840,69864],\"valid\"],[[69865,69871],\"disallowed\"],[[69872,69881],\"valid\"],[[69882,69887],\"disallowed\"],[[69888,69940],\"valid\"],[[69941,69941],\"disallowed\"],[[69942,69951],\"valid\"],[[69952,69955],\"valid\",[],\"NV8\"],[[69956,69967],\"disallowed\"],[[69968,70003],\"valid\"],[[70004,70005],\"valid\",[],\"NV8\"],[[70006,70006],\"valid\"],[[70007,70015],\"disallowed\"],[[70016,70084],\"valid\"],[[70085,70088],\"valid\",[],\"NV8\"],[[70089,70089],\"valid\",[],\"NV8\"],[[70090,70092],\"valid\"],[[70093,70093],\"valid\",[],\"NV8\"],[[70094,70095],\"disallowed\"],[[70096,70105],\"valid\"],[[70106,70106],\"valid\"],[[70107,70107],\"valid\",[],\"NV8\"],[[70108,70108],\"valid\"],[[70109,70111],\"valid\",[],\"NV8\"],[[70112,70112],\"disallowed\"],[[70113,70132],\"valid\",[],\"NV8\"],[[70133,70143],\"disallowed\"],[[70144,70161],\"valid\"],[[70162,70162],\"disallowed\"],[[70163,70199],\"valid\"],[[70200,70205],\"valid\",[],\"NV8\"],[[70206,70271],\"disallowed\"],[[70272,70278],\"valid\"],[[70279,70279],\"disallowed\"],[[70280,70280],\"valid\"],[[70281,70281],\"disallowed\"],[[70282,70285],\"valid\"],[[70286,70286],\"disallowed\"],[[70287,70301],\"valid\"],[[70302,70302],\"disallowed\"],[[70303,70312],\"valid\"],[[70313,70313],\"valid\",[],\"NV8\"],[[70314,70319],\"disallowed\"],[[70320,70378],\"valid\"],[[70379,70383],\"disallowed\"],[[70384,70393],\"valid\"],[[70394,70399],\"disallowed\"],[[70400,70400],\"valid\"],[[70401,70403],\"valid\"],[[70404,70404],\"disallowed\"],[[70405,70412],\"valid\"],[[70413,70414],\"disallowed\"],[[70415,70416],\"valid\"],[[70417,70418],\"disallowed\"],[[70419,70440],\"valid\"],[[70441,70441],\"disallowed\"],[[70442,70448],\"valid\"],[[70449,70449],\"disallowed\"],[[70450,70451],\"valid\"],[[70452,70452],\"disallowed\"],[[70453,70457],\"valid\"],[[70458,70459],\"disallowed\"],[[70460,70468],\"valid\"],[[70469,70470],\"disallowed\"],[[70471,70472],\"valid\"],[[70473,70474],\"disallowed\"],[[70475,70477],\"valid\"],[[70478,70479],\"disallowed\"],[[70480,70480],\"valid\"],[[70481,70486],\"disallowed\"],[[70487,70487],\"valid\"],[[70488,70492],\"disallowed\"],[[70493,70499],\"valid\"],[[70500,70501],\"disallowed\"],[[70502,70508],\"valid\"],[[70509,70511],\"disallowed\"],[[70512,70516],\"valid\"],[[70517,70783],\"disallowed\"],[[70784,70853],\"valid\"],[[70854,70854],\"valid\",[],\"NV8\"],[[70855,70855],\"valid\"],[[70856,70863],\"disallowed\"],[[70864,70873],\"valid\"],[[70874,71039],\"disallowed\"],[[71040,71093],\"valid\"],[[71094,71095],\"disallowed\"],[[71096,71104],\"valid\"],[[71105,71113],\"valid\",[],\"NV8\"],[[71114,71127],\"valid\",[],\"NV8\"],[[71128,71133],\"valid\"],[[71134,71167],\"disallowed\"],[[71168,71232],\"valid\"],[[71233,71235],\"valid\",[],\"NV8\"],[[71236,71236],\"valid\"],[[71237,71247],\"disallowed\"],[[71248,71257],\"valid\"],[[71258,71295],\"disallowed\"],[[71296,71351],\"valid\"],[[71352,71359],\"disallowed\"],[[71360,71369],\"valid\"],[[71370,71423],\"disallowed\"],[[71424,71449],\"valid\"],[[71450,71452],\"disallowed\"],[[71453,71467],\"valid\"],[[71468,71471],\"disallowed\"],[[71472,71481],\"valid\"],[[71482,71487],\"valid\",[],\"NV8\"],[[71488,71839],\"disallowed\"],[[71840,71840],\"mapped\",[71872]],[[71841,71841],\"mapped\",[71873]],[[71842,71842],\"mapped\",[71874]],[[71843,71843],\"mapped\",[71875]],[[71844,71844],\"mapped\",[71876]],[[71845,71845],\"mapped\",[71877]],[[71846,71846],\"mapped\",[71878]],[[71847,71847],\"mapped\",[71879]],[[71848,71848],\"mapped\",[71880]],[[71849,71849],\"mapped\",[71881]],[[71850,71850],\"mapped\",[71882]],[[71851,71851],\"mapped\",[71883]],[[71852,71852],\"mapped\",[71884]],[[71853,71853],\"mapped\",[71885]],[[71854,71854],\"mapped\",[71886]],[[71855,71855],\"mapped\",[71887]],[[71856,71856],\"mapped\",[71888]],[[71857,71857],\"mapped\",[71889]],[[71858,71858],\"mapped\",[71890]],[[71859,71859],\"mapped\",[71891]],[[71860,71860],\"mapped\",[71892]],[[71861,71861],\"mapped\",[71893]],[[71862,71862],\"mapped\",[71894]],[[71863,71863],\"mapped\",[71895]],[[71864,71864],\"mapped\",[71896]],[[71865,71865],\"mapped\",[71897]],[[71866,71866],\"mapped\",[71898]],[[71867,71867],\"mapped\",[71899]],[[71868,71868],\"mapped\",[71900]],[[71869,71869],\"mapped\",[71901]],[[71870,71870],\"mapped\",[71902]],[[71871,71871],\"mapped\",[71903]],[[71872,71913],\"valid\"],[[71914,71922],\"valid\",[],\"NV8\"],[[71923,71934],\"disallowed\"],[[71935,71935],\"valid\"],[[71936,72383],\"disallowed\"],[[72384,72440],\"valid\"],[[72441,73727],\"disallowed\"],[[73728,74606],\"valid\"],[[74607,74648],\"valid\"],[[74649,74649],\"valid\"],[[74650,74751],\"disallowed\"],[[74752,74850],\"valid\",[],\"NV8\"],[[74851,74862],\"valid\",[],\"NV8\"],[[74863,74863],\"disallowed\"],[[74864,74867],\"valid\",[],\"NV8\"],[[74868,74868],\"valid\",[],\"NV8\"],[[74869,74879],\"disallowed\"],[[74880,75075],\"valid\"],[[75076,77823],\"disallowed\"],[[77824,78894],\"valid\"],[[78895,82943],\"disallowed\"],[[82944,83526],\"valid\"],[[83527,92159],\"disallowed\"],[[92160,92728],\"valid\"],[[92729,92735],\"disallowed\"],[[92736,92766],\"valid\"],[[92767,92767],\"disallowed\"],[[92768,92777],\"valid\"],[[92778,92781],\"disallowed\"],[[92782,92783],\"valid\",[],\"NV8\"],[[92784,92879],\"disallowed\"],[[92880,92909],\"valid\"],[[92910,92911],\"disallowed\"],[[92912,92916],\"valid\"],[[92917,92917],\"valid\",[],\"NV8\"],[[92918,92927],\"disallowed\"],[[92928,92982],\"valid\"],[[92983,92991],\"valid\",[],\"NV8\"],[[92992,92995],\"valid\"],[[92996,92997],\"valid\",[],\"NV8\"],[[92998,93007],\"disallowed\"],[[93008,93017],\"valid\"],[[93018,93018],\"disallowed\"],[[93019,93025],\"valid\",[],\"NV8\"],[[93026,93026],\"disallowed\"],[[93027,93047],\"valid\"],[[93048,93052],\"disallowed\"],[[93053,93071],\"valid\"],[[93072,93951],\"disallowed\"],[[93952,94020],\"valid\"],[[94021,94031],\"disallowed\"],[[94032,94078],\"valid\"],[[94079,94094],\"disallowed\"],[[94095,94111],\"valid\"],[[94112,110591],\"disallowed\"],[[110592,110593],\"valid\"],[[110594,113663],\"disallowed\"],[[113664,113770],\"valid\"],[[113771,113775],\"disallowed\"],[[113776,113788],\"valid\"],[[113789,113791],\"disallowed\"],[[113792,113800],\"valid\"],[[113801,113807],\"disallowed\"],[[113808,113817],\"valid\"],[[113818,113819],\"disallowed\"],[[113820,113820],\"valid\",[],\"NV8\"],[[113821,113822],\"valid\"],[[113823,113823],\"valid\",[],\"NV8\"],[[113824,113827],\"ignored\"],[[113828,118783],\"disallowed\"],[[118784,119029],\"valid\",[],\"NV8\"],[[119030,119039],\"disallowed\"],[[119040,119078],\"valid\",[],\"NV8\"],[[119079,119080],\"disallowed\"],[[119081,119081],\"valid\",[],\"NV8\"],[[119082,119133],\"valid\",[],\"NV8\"],[[119134,119134],\"mapped\",[119127,119141]],[[119135,119135],\"mapped\",[119128,119141]],[[119136,119136],\"mapped\",[119128,119141,119150]],[[119137,119137],\"mapped\",[119128,119141,119151]],[[119138,119138],\"mapped\",[119128,119141,119152]],[[119139,119139],\"mapped\",[119128,119141,119153]],[[119140,119140],\"mapped\",[119128,119141,119154]],[[119141,119154],\"valid\",[],\"NV8\"],[[119155,119162],\"disallowed\"],[[119163,119226],\"valid\",[],\"NV8\"],[[119227,119227],\"mapped\",[119225,119141]],[[119228,119228],\"mapped\",[119226,119141]],[[119229,119229],\"mapped\",[119225,119141,119150]],[[119230,119230],\"mapped\",[119226,119141,119150]],[[119231,119231],\"mapped\",[119225,119141,119151]],[[119232,119232],\"mapped\",[119226,119141,119151]],[[119233,119261],\"valid\",[],\"NV8\"],[[119262,119272],\"valid\",[],\"NV8\"],[[119273,119295],\"disallowed\"],[[119296,119365],\"valid\",[],\"NV8\"],[[119366,119551],\"disallowed\"],[[119552,119638],\"valid\",[],\"NV8\"],[[119639,119647],\"disallowed\"],[[119648,119665],\"valid\",[],\"NV8\"],[[119666,119807],\"disallowed\"],[[119808,119808],\"mapped\",[97]],[[119809,119809],\"mapped\",[98]],[[119810,119810],\"mapped\",[99]],[[119811,119811],\"mapped\",[100]],[[119812,119812],\"mapped\",[101]],[[119813,119813],\"mapped\",[102]],[[119814,119814],\"mapped\",[103]],[[119815,119815],\"mapped\",[104]],[[119816,119816],\"mapped\",[105]],[[119817,119817],\"mapped\",[106]],[[119818,119818],\"mapped\",[107]],[[119819,119819],\"mapped\",[108]],[[119820,119820],\"mapped\",[109]],[[119821,119821],\"mapped\",[110]],[[119822,119822],\"mapped\",[111]],[[119823,119823],\"mapped\",[112]],[[119824,119824],\"mapped\",[113]],[[119825,119825],\"mapped\",[114]],[[119826,119826],\"mapped\",[115]],[[119827,119827],\"mapped\",[116]],[[119828,119828],\"mapped\",[117]],[[119829,119829],\"mapped\",[118]],[[119830,119830],\"mapped\",[119]],[[119831,119831],\"mapped\",[120]],[[119832,119832],\"mapped\",[121]],[[119833,119833],\"mapped\",[122]],[[119834,119834],\"mapped\",[97]],[[119835,119835],\"mapped\",[98]],[[119836,119836],\"mapped\",[99]],[[119837,119837],\"mapped\",[100]],[[119838,119838],\"mapped\",[101]],[[119839,119839],\"mapped\",[102]],[[119840,119840],\"mapped\",[103]],[[119841,119841],\"mapped\",[104]],[[119842,119842],\"mapped\",[105]],[[119843,119843],\"mapped\",[106]],[[119844,119844],\"mapped\",[107]],[[119845,119845],\"mapped\",[108]],[[119846,119846],\"mapped\",[109]],[[119847,119847],\"mapped\",[110]],[[119848,119848],\"mapped\",[111]],[[119849,119849],\"mapped\",[112]],[[119850,119850],\"mapped\",[113]],[[119851,119851],\"mapped\",[114]],[[119852,119852],\"mapped\",[115]],[[119853,119853],\"mapped\",[116]],[[119854,119854],\"mapped\",[117]],[[119855,119855],\"mapped\",[118]],[[119856,119856],\"mapped\",[119]],[[119857,119857],\"mapped\",[120]],[[119858,119858],\"mapped\",[121]],[[119859,119859],\"mapped\",[122]],[[119860,119860],\"mapped\",[97]],[[119861,119861],\"mapped\",[98]],[[119862,119862],\"mapped\",[99]],[[119863,119863],\"mapped\",[100]],[[119864,119864],\"mapped\",[101]],[[119865,119865],\"mapped\",[102]],[[119866,119866],\"mapped\",[103]],[[119867,119867],\"mapped\",[104]],[[119868,119868],\"mapped\",[105]],[[119869,119869],\"mapped\",[106]],[[119870,119870],\"mapped\",[107]],[[119871,119871],\"mapped\",[108]],[[119872,119872],\"mapped\",[109]],[[119873,119873],\"mapped\",[110]],[[119874,119874],\"mapped\",[111]],[[119875,119875],\"mapped\",[112]],[[119876,119876],\"mapped\",[113]],[[119877,119877],\"mapped\",[114]],[[119878,119878],\"mapped\",[115]],[[119879,119879],\"mapped\",[116]],[[119880,119880],\"mapped\",[117]],[[119881,119881],\"mapped\",[118]],[[119882,119882],\"mapped\",[119]],[[119883,119883],\"mapped\",[120]],[[119884,119884],\"mapped\",[121]],[[119885,119885],\"mapped\",[122]],[[119886,119886],\"mapped\",[97]],[[119887,119887],\"mapped\",[98]],[[119888,119888],\"mapped\",[99]],[[119889,119889],\"mapped\",[100]],[[119890,119890],\"mapped\",[101]],[[119891,119891],\"mapped\",[102]],[[119892,119892],\"mapped\",[103]],[[119893,119893],\"disallowed\"],[[119894,119894],\"mapped\",[105]],[[119895,119895],\"mapped\",[106]],[[119896,119896],\"mapped\",[107]],[[119897,119897],\"mapped\",[108]],[[119898,119898],\"mapped\",[109]],[[119899,119899],\"mapped\",[110]],[[119900,119900],\"mapped\",[111]],[[119901,119901],\"mapped\",[112]],[[119902,119902],\"mapped\",[113]],[[119903,119903],\"mapped\",[114]],[[119904,119904],\"mapped\",[115]],[[119905,119905],\"mapped\",[116]],[[119906,119906],\"mapped\",[117]],[[119907,119907],\"mapped\",[118]],[[119908,119908],\"mapped\",[119]],[[119909,119909],\"mapped\",[120]],[[119910,119910],\"mapped\",[121]],[[119911,119911],\"mapped\",[122]],[[119912,119912],\"mapped\",[97]],[[119913,119913],\"mapped\",[98]],[[119914,119914],\"mapped\",[99]],[[119915,119915],\"mapped\",[100]],[[119916,119916],\"mapped\",[101]],[[119917,119917],\"mapped\",[102]],[[119918,119918],\"mapped\",[103]],[[119919,119919],\"mapped\",[104]],[[119920,119920],\"mapped\",[105]],[[119921,119921],\"mapped\",[106]],[[119922,119922],\"mapped\",[107]],[[119923,119923],\"mapped\",[108]],[[119924,119924],\"mapped\",[109]],[[119925,119925],\"mapped\",[110]],[[119926,119926],\"mapped\",[111]],[[119927,119927],\"mapped\",[112]],[[119928,119928],\"mapped\",[113]],[[119929,119929],\"mapped\",[114]],[[119930,119930],\"mapped\",[115]],[[119931,119931],\"mapped\",[116]],[[119932,119932],\"mapped\",[117]],[[119933,119933],\"mapped\",[118]],[[119934,119934],\"mapped\",[119]],[[119935,119935],\"mapped\",[120]],[[119936,119936],\"mapped\",[121]],[[119937,119937],\"mapped\",[122]],[[119938,119938],\"mapped\",[97]],[[119939,119939],\"mapped\",[98]],[[119940,119940],\"mapped\",[99]],[[119941,119941],\"mapped\",[100]],[[119942,119942],\"mapped\",[101]],[[119943,119943],\"mapped\",[102]],[[119944,119944],\"mapped\",[103]],[[119945,119945],\"mapped\",[104]],[[119946,119946],\"mapped\",[105]],[[119947,119947],\"mapped\",[106]],[[119948,119948],\"mapped\",[107]],[[119949,119949],\"mapped\",[108]],[[119950,119950],\"mapped\",[109]],[[119951,119951],\"mapped\",[110]],[[119952,119952],\"mapped\",[111]],[[119953,119953],\"mapped\",[112]],[[119954,119954],\"mapped\",[113]],[[119955,119955],\"mapped\",[114]],[[119956,119956],\"mapped\",[115]],[[119957,119957],\"mapped\",[116]],[[119958,119958],\"mapped\",[117]],[[119959,119959],\"mapped\",[118]],[[119960,119960],\"mapped\",[119]],[[119961,119961],\"mapped\",[120]],[[119962,119962],\"mapped\",[121]],[[119963,119963],\"mapped\",[122]],[[119964,119964],\"mapped\",[97]],[[119965,119965],\"disallowed\"],[[119966,119966],\"mapped\",[99]],[[119967,119967],\"mapped\",[100]],[[119968,119969],\"disallowed\"],[[119970,119970],\"mapped\",[103]],[[119971,119972],\"disallowed\"],[[119973,119973],\"mapped\",[106]],[[119974,119974],\"mapped\",[107]],[[119975,119976],\"disallowed\"],[[119977,119977],\"mapped\",[110]],[[119978,119978],\"mapped\",[111]],[[119979,119979],\"mapped\",[112]],[[119980,119980],\"mapped\",[113]],[[119981,119981],\"disallowed\"],[[119982,119982],\"mapped\",[115]],[[119983,119983],\"mapped\",[116]],[[119984,119984],\"mapped\",[117]],[[119985,119985],\"mapped\",[118]],[[119986,119986],\"mapped\",[119]],[[119987,119987],\"mapped\",[120]],[[119988,119988],\"mapped\",[121]],[[119989,119989],\"mapped\",[122]],[[119990,119990],\"mapped\",[97]],[[119991,119991],\"mapped\",[98]],[[119992,119992],\"mapped\",[99]],[[119993,119993],\"mapped\",[100]],[[119994,119994],\"disallowed\"],[[119995,119995],\"mapped\",[102]],[[119996,119996],\"disallowed\"],[[119997,119997],\"mapped\",[104]],[[119998,119998],\"mapped\",[105]],[[119999,119999],\"mapped\",[106]],[[120000,120000],\"mapped\",[107]],[[120001,120001],\"mapped\",[108]],[[120002,120002],\"mapped\",[109]],[[120003,120003],\"mapped\",[110]],[[120004,120004],\"disallowed\"],[[120005,120005],\"mapped\",[112]],[[120006,120006],\"mapped\",[113]],[[120007,120007],\"mapped\",[114]],[[120008,120008],\"mapped\",[115]],[[120009,120009],\"mapped\",[116]],[[120010,120010],\"mapped\",[117]],[[120011,120011],\"mapped\",[118]],[[120012,120012],\"mapped\",[119]],[[120013,120013],\"mapped\",[120]],[[120014,120014],\"mapped\",[121]],[[120015,120015],\"mapped\",[122]],[[120016,120016],\"mapped\",[97]],[[120017,120017],\"mapped\",[98]],[[120018,120018],\"mapped\",[99]],[[120019,120019],\"mapped\",[100]],[[120020,120020],\"mapped\",[101]],[[120021,120021],\"mapped\",[102]],[[120022,120022],\"mapped\",[103]],[[120023,120023],\"mapped\",[104]],[[120024,120024],\"mapped\",[105]],[[120025,120025],\"mapped\",[106]],[[120026,120026],\"mapped\",[107]],[[120027,120027],\"mapped\",[108]],[[120028,120028],\"mapped\",[109]],[[120029,120029],\"mapped\",[110]],[[120030,120030],\"mapped\",[111]],[[120031,120031],\"mapped\",[112]],[[120032,120032],\"mapped\",[113]],[[120033,120033],\"mapped\",[114]],[[120034,120034],\"mapped\",[115]],[[120035,120035],\"mapped\",[116]],[[120036,120036],\"mapped\",[117]],[[120037,120037],\"mapped\",[118]],[[120038,120038],\"mapped\",[119]],[[120039,120039],\"mapped\",[120]],[[120040,120040],\"mapped\",[121]],[[120041,120041],\"mapped\",[122]],[[120042,120042],\"mapped\",[97]],[[120043,120043],\"mapped\",[98]],[[120044,120044],\"mapped\",[99]],[[120045,120045],\"mapped\",[100]],[[120046,120046],\"mapped\",[101]],[[120047,120047],\"mapped\",[102]],[[120048,120048],\"mapped\",[103]],[[120049,120049],\"mapped\",[104]],[[120050,120050],\"mapped\",[105]],[[120051,120051],\"mapped\",[106]],[[120052,120052],\"mapped\",[107]],[[120053,120053],\"mapped\",[108]],[[120054,120054],\"mapped\",[109]],[[120055,120055],\"mapped\",[110]],[[120056,120056],\"mapped\",[111]],[[120057,120057],\"mapped\",[112]],[[120058,120058],\"mapped\",[113]],[[120059,120059],\"mapped\",[114]],[[120060,120060],\"mapped\",[115]],[[120061,120061],\"mapped\",[116]],[[120062,120062],\"mapped\",[117]],[[120063,120063],\"mapped\",[118]],[[120064,120064],\"mapped\",[119]],[[120065,120065],\"mapped\",[120]],[[120066,120066],\"mapped\",[121]],[[120067,120067],\"mapped\",[122]],[[120068,120068],\"mapped\",[97]],[[120069,120069],\"mapped\",[98]],[[120070,120070],\"disallowed\"],[[120071,120071],\"mapped\",[100]],[[120072,120072],\"mapped\",[101]],[[120073,120073],\"mapped\",[102]],[[120074,120074],\"mapped\",[103]],[[120075,120076],\"disallowed\"],[[120077,120077],\"mapped\",[106]],[[120078,120078],\"mapped\",[107]],[[120079,120079],\"mapped\",[108]],[[120080,120080],\"mapped\",[109]],[[120081,120081],\"mapped\",[110]],[[120082,120082],\"mapped\",[111]],[[120083,120083],\"mapped\",[112]],[[120084,120084],\"mapped\",[113]],[[120085,120085],\"disallowed\"],[[120086,120086],\"mapped\",[115]],[[120087,120087],\"mapped\",[116]],[[120088,120088],\"mapped\",[117]],[[120089,120089],\"mapped\",[118]],[[120090,120090],\"mapped\",[119]],[[120091,120091],\"mapped\",[120]],[[120092,120092],\"mapped\",[121]],[[120093,120093],\"disallowed\"],[[120094,120094],\"mapped\",[97]],[[120095,120095],\"mapped\",[98]],[[120096,120096],\"mapped\",[99]],[[120097,120097],\"mapped\",[100]],[[120098,120098],\"mapped\",[101]],[[120099,120099],\"mapped\",[102]],[[120100,120100],\"mapped\",[103]],[[120101,120101],\"mapped\",[104]],[[120102,120102],\"mapped\",[105]],[[120103,120103],\"mapped\",[106]],[[120104,120104],\"mapped\",[107]],[[120105,120105],\"mapped\",[108]],[[120106,120106],\"mapped\",[109]],[[120107,120107],\"mapped\",[110]],[[120108,120108],\"mapped\",[111]],[[120109,120109],\"mapped\",[112]],[[120110,120110],\"mapped\",[113]],[[120111,120111],\"mapped\",[114]],[[120112,120112],\"mapped\",[115]],[[120113,120113],\"mapped\",[116]],[[120114,120114],\"mapped\",[117]],[[120115,120115],\"mapped\",[118]],[[120116,120116],\"mapped\",[119]],[[120117,120117],\"mapped\",[120]],[[120118,120118],\"mapped\",[121]],[[120119,120119],\"mapped\",[122]],[[120120,120120],\"mapped\",[97]],[[120121,120121],\"mapped\",[98]],[[120122,120122],\"disallowed\"],[[120123,120123],\"mapped\",[100]],[[120124,120124],\"mapped\",[101]],[[120125,120125],\"mapped\",[102]],[[120126,120126],\"mapped\",[103]],[[120127,120127],\"disallowed\"],[[120128,120128],\"mapped\",[105]],[[120129,120129],\"mapped\",[106]],[[120130,120130],\"mapped\",[107]],[[120131,120131],\"mapped\",[108]],[[120132,120132],\"mapped\",[109]],[[120133,120133],\"disallowed\"],[[120134,120134],\"mapped\",[111]],[[120135,120137],\"disallowed\"],[[120138,120138],\"mapped\",[115]],[[120139,120139],\"mapped\",[116]],[[120140,120140],\"mapped\",[117]],[[120141,120141],\"mapped\",[118]],[[120142,120142],\"mapped\",[119]],[[120143,120143],\"mapped\",[120]],[[120144,120144],\"mapped\",[121]],[[120145,120145],\"disallowed\"],[[120146,120146],\"mapped\",[97]],[[120147,120147],\"mapped\",[98]],[[120148,120148],\"mapped\",[99]],[[120149,120149],\"mapped\",[100]],[[120150,120150],\"mapped\",[101]],[[120151,120151],\"mapped\",[102]],[[120152,120152],\"mapped\",[103]],[[120153,120153],\"mapped\",[104]],[[120154,120154],\"mapped\",[105]],[[120155,120155],\"mapped\",[106]],[[120156,120156],\"mapped\",[107]],[[120157,120157],\"mapped\",[108]],[[120158,120158],\"mapped\",[109]],[[120159,120159],\"mapped\",[110]],[[120160,120160],\"mapped\",[111]],[[120161,120161],\"mapped\",[112]],[[120162,120162],\"mapped\",[113]],[[120163,120163],\"mapped\",[114]],[[120164,120164],\"mapped\",[115]],[[120165,120165],\"mapped\",[116]],[[120166,120166],\"mapped\",[117]],[[120167,120167],\"mapped\",[118]],[[120168,120168],\"mapped\",[119]],[[120169,120169],\"mapped\",[120]],[[120170,120170],\"mapped\",[121]],[[120171,120171],\"mapped\",[122]],[[120172,120172],\"mapped\",[97]],[[120173,120173],\"mapped\",[98]],[[120174,120174],\"mapped\",[99]],[[120175,120175],\"mapped\",[100]],[[120176,120176],\"mapped\",[101]],[[120177,120177],\"mapped\",[102]],[[120178,120178],\"mapped\",[103]],[[120179,120179],\"mapped\",[104]],[[120180,120180],\"mapped\",[105]],[[120181,120181],\"mapped\",[106]],[[120182,120182],\"mapped\",[107]],[[120183,120183],\"mapped\",[108]],[[120184,120184],\"mapped\",[109]],[[120185,120185],\"mapped\",[110]],[[120186,120186],\"mapped\",[111]],[[120187,120187],\"mapped\",[112]],[[120188,120188],\"mapped\",[113]],[[120189,120189],\"mapped\",[114]],[[120190,120190],\"mapped\",[115]],[[120191,120191],\"mapped\",[116]],[[120192,120192],\"mapped\",[117]],[[120193,120193],\"mapped\",[118]],[[120194,120194],\"mapped\",[119]],[[120195,120195],\"mapped\",[120]],[[120196,120196],\"mapped\",[121]],[[120197,120197],\"mapped\",[122]],[[120198,120198],\"mapped\",[97]],[[120199,120199],\"mapped\",[98]],[[120200,120200],\"mapped\",[99]],[[120201,120201],\"mapped\",[100]],[[120202,120202],\"mapped\",[101]],[[120203,120203],\"mapped\",[102]],[[120204,120204],\"mapped\",[103]],[[120205,120205],\"mapped\",[104]],[[120206,120206],\"mapped\",[105]],[[120207,120207],\"mapped\",[106]],[[120208,120208],\"mapped\",[107]],[[120209,120209],\"mapped\",[108]],[[120210,120210],\"mapped\",[109]],[[120211,120211],\"mapped\",[110]],[[120212,120212],\"mapped\",[111]],[[120213,120213],\"mapped\",[112]],[[120214,120214],\"mapped\",[113]],[[120215,120215],\"mapped\",[114]],[[120216,120216],\"mapped\",[115]],[[120217,120217],\"mapped\",[116]],[[120218,120218],\"mapped\",[117]],[[120219,120219],\"mapped\",[118]],[[120220,120220],\"mapped\",[119]],[[120221,120221],\"mapped\",[120]],[[120222,120222],\"mapped\",[121]],[[120223,120223],\"mapped\",[122]],[[120224,120224],\"mapped\",[97]],[[120225,120225],\"mapped\",[98]],[[120226,120226],\"mapped\",[99]],[[120227,120227],\"mapped\",[100]],[[120228,120228],\"mapped\",[101]],[[120229,120229],\"mapped\",[102]],[[120230,120230],\"mapped\",[103]],[[120231,120231],\"mapped\",[104]],[[120232,120232],\"mapped\",[105]],[[120233,120233],\"mapped\",[106]],[[120234,120234],\"mapped\",[107]],[[120235,120235],\"mapped\",[108]],[[120236,120236],\"mapped\",[109]],[[120237,120237],\"mapped\",[110]],[[120238,120238],\"mapped\",[111]],[[120239,120239],\"mapped\",[112]],[[120240,120240],\"mapped\",[113]],[[120241,120241],\"mapped\",[114]],[[120242,120242],\"mapped\",[115]],[[120243,120243],\"mapped\",[116]],[[120244,120244],\"mapped\",[117]],[[120245,120245],\"mapped\",[118]],[[120246,120246],\"mapped\",[119]],[[120247,120247],\"mapped\",[120]],[[120248,120248],\"mapped\",[121]],[[120249,120249],\"mapped\",[122]],[[120250,120250],\"mapped\",[97]],[[120251,120251],\"mapped\",[98]],[[120252,120252],\"mapped\",[99]],[[120253,120253],\"mapped\",[100]],[[120254,120254],\"mapped\",[101]],[[120255,120255],\"mapped\",[102]],[[120256,120256],\"mapped\",[103]],[[120257,120257],\"mapped\",[104]],[[120258,120258],\"mapped\",[105]],[[120259,120259],\"mapped\",[106]],[[120260,120260],\"mapped\",[107]],[[120261,120261],\"mapped\",[108]],[[120262,120262],\"mapped\",[109]],[[120263,120263],\"mapped\",[110]],[[120264,120264],\"mapped\",[111]],[[120265,120265],\"mapped\",[112]],[[120266,120266],\"mapped\",[113]],[[120267,120267],\"mapped\",[114]],[[120268,120268],\"mapped\",[115]],[[120269,120269],\"mapped\",[116]],[[120270,120270],\"mapped\",[117]],[[120271,120271],\"mapped\",[118]],[[120272,120272],\"mapped\",[119]],[[120273,120273],\"mapped\",[120]],[[120274,120274],\"mapped\",[121]],[[120275,120275],\"mapped\",[122]],[[120276,120276],\"mapped\",[97]],[[120277,120277],\"mapped\",[98]],[[120278,120278],\"mapped\",[99]],[[120279,120279],\"mapped\",[100]],[[120280,120280],\"mapped\",[101]],[[120281,120281],\"mapped\",[102]],[[120282,120282],\"mapped\",[103]],[[120283,120283],\"mapped\",[104]],[[120284,120284],\"mapped\",[105]],[[120285,120285],\"mapped\",[106]],[[120286,120286],\"mapped\",[107]],[[120287,120287],\"mapped\",[108]],[[120288,120288],\"mapped\",[109]],[[120289,120289],\"mapped\",[110]],[[120290,120290],\"mapped\",[111]],[[120291,120291],\"mapped\",[112]],[[120292,120292],\"mapped\",[113]],[[120293,120293],\"mapped\",[114]],[[120294,120294],\"mapped\",[115]],[[120295,120295],\"mapped\",[116]],[[120296,120296],\"mapped\",[117]],[[120297,120297],\"mapped\",[118]],[[120298,120298],\"mapped\",[119]],[[120299,120299],\"mapped\",[120]],[[120300,120300],\"mapped\",[121]],[[120301,120301],\"mapped\",[122]],[[120302,120302],\"mapped\",[97]],[[120303,120303],\"mapped\",[98]],[[120304,120304],\"mapped\",[99]],[[120305,120305],\"mapped\",[100]],[[120306,120306],\"mapped\",[101]],[[120307,120307],\"mapped\",[102]],[[120308,120308],\"mapped\",[103]],[[120309,120309],\"mapped\",[104]],[[120310,120310],\"mapped\",[105]],[[120311,120311],\"mapped\",[106]],[[120312,120312],\"mapped\",[107]],[[120313,120313],\"mapped\",[108]],[[120314,120314],\"mapped\",[109]],[[120315,120315],\"mapped\",[110]],[[120316,120316],\"mapped\",[111]],[[120317,120317],\"mapped\",[112]],[[120318,120318],\"mapped\",[113]],[[120319,120319],\"mapped\",[114]],[[120320,120320],\"mapped\",[115]],[[120321,120321],\"mapped\",[116]],[[120322,120322],\"mapped\",[117]],[[120323,120323],\"mapped\",[118]],[[120324,120324],\"mapped\",[119]],[[120325,120325],\"mapped\",[120]],[[120326,120326],\"mapped\",[121]],[[120327,120327],\"mapped\",[122]],[[120328,120328],\"mapped\",[97]],[[120329,120329],\"mapped\",[98]],[[120330,120330],\"mapped\",[99]],[[120331,120331],\"mapped\",[100]],[[120332,120332],\"mapped\",[101]],[[120333,120333],\"mapped\",[102]],[[120334,120334],\"mapped\",[103]],[[120335,120335],\"mapped\",[104]],[[120336,120336],\"mapped\",[105]],[[120337,120337],\"mapped\",[106]],[[120338,120338],\"mapped\",[107]],[[120339,120339],\"mapped\",[108]],[[120340,120340],\"mapped\",[109]],[[120341,120341],\"mapped\",[110]],[[120342,120342],\"mapped\",[111]],[[120343,120343],\"mapped\",[112]],[[120344,120344],\"mapped\",[113]],[[120345,120345],\"mapped\",[114]],[[120346,120346],\"mapped\",[115]],[[120347,120347],\"mapped\",[116]],[[120348,120348],\"mapped\",[117]],[[120349,120349],\"mapped\",[118]],[[120350,120350],\"mapped\",[119]],[[120351,120351],\"mapped\",[120]],[[120352,120352],\"mapped\",[121]],[[120353,120353],\"mapped\",[122]],[[120354,120354],\"mapped\",[97]],[[120355,120355],\"mapped\",[98]],[[120356,120356],\"mapped\",[99]],[[120357,120357],\"mapped\",[100]],[[120358,120358],\"mapped\",[101]],[[120359,120359],\"mapped\",[102]],[[120360,120360],\"mapped\",[103]],[[120361,120361],\"mapped\",[104]],[[120362,120362],\"mapped\",[105]],[[120363,120363],\"mapped\",[106]],[[120364,120364],\"mapped\",[107]],[[120365,120365],\"mapped\",[108]],[[120366,120366],\"mapped\",[109]],[[120367,120367],\"mapped\",[110]],[[120368,120368],\"mapped\",[111]],[[120369,120369],\"mapped\",[112]],[[120370,120370],\"mapped\",[113]],[[120371,120371],\"mapped\",[114]],[[120372,120372],\"mapped\",[115]],[[120373,120373],\"mapped\",[116]],[[120374,120374],\"mapped\",[117]],[[120375,120375],\"mapped\",[118]],[[120376,120376],\"mapped\",[119]],[[120377,120377],\"mapped\",[120]],[[120378,120378],\"mapped\",[121]],[[120379,120379],\"mapped\",[122]],[[120380,120380],\"mapped\",[97]],[[120381,120381],\"mapped\",[98]],[[120382,120382],\"mapped\",[99]],[[120383,120383],\"mapped\",[100]],[[120384,120384],\"mapped\",[101]],[[120385,120385],\"mapped\",[102]],[[120386,120386],\"mapped\",[103]],[[120387,120387],\"mapped\",[104]],[[120388,120388],\"mapped\",[105]],[[120389,120389],\"mapped\",[106]],[[120390,120390],\"mapped\",[107]],[[120391,120391],\"mapped\",[108]],[[120392,120392],\"mapped\",[109]],[[120393,120393],\"mapped\",[110]],[[120394,120394],\"mapped\",[111]],[[120395,120395],\"mapped\",[112]],[[120396,120396],\"mapped\",[113]],[[120397,120397],\"mapped\",[114]],[[120398,120398],\"mapped\",[115]],[[120399,120399],\"mapped\",[116]],[[120400,120400],\"mapped\",[117]],[[120401,120401],\"mapped\",[118]],[[120402,120402],\"mapped\",[119]],[[120403,120403],\"mapped\",[120]],[[120404,120404],\"mapped\",[121]],[[120405,120405],\"mapped\",[122]],[[120406,120406],\"mapped\",[97]],[[120407,120407],\"mapped\",[98]],[[120408,120408],\"mapped\",[99]],[[120409,120409],\"mapped\",[100]],[[120410,120410],\"mapped\",[101]],[[120411,120411],\"mapped\",[102]],[[120412,120412],\"mapped\",[103]],[[120413,120413],\"mapped\",[104]],[[120414,120414],\"mapped\",[105]],[[120415,120415],\"mapped\",[106]],[[120416,120416],\"mapped\",[107]],[[120417,120417],\"mapped\",[108]],[[120418,120418],\"mapped\",[109]],[[120419,120419],\"mapped\",[110]],[[120420,120420],\"mapped\",[111]],[[120421,120421],\"mapped\",[112]],[[120422,120422],\"mapped\",[113]],[[120423,120423],\"mapped\",[114]],[[120424,120424],\"mapped\",[115]],[[120425,120425],\"mapped\",[116]],[[120426,120426],\"mapped\",[117]],[[120427,120427],\"mapped\",[118]],[[120428,120428],\"mapped\",[119]],[[120429,120429],\"mapped\",[120]],[[120430,120430],\"mapped\",[121]],[[120431,120431],\"mapped\",[122]],[[120432,120432],\"mapped\",[97]],[[120433,120433],\"mapped\",[98]],[[120434,120434],\"mapped\",[99]],[[120435,120435],\"mapped\",[100]],[[120436,120436],\"mapped\",[101]],[[120437,120437],\"mapped\",[102]],[[120438,120438],\"mapped\",[103]],[[120439,120439],\"mapped\",[104]],[[120440,120440],\"mapped\",[105]],[[120441,120441],\"mapped\",[106]],[[120442,120442],\"mapped\",[107]],[[120443,120443],\"mapped\",[108]],[[120444,120444],\"mapped\",[109]],[[120445,120445],\"mapped\",[110]],[[120446,120446],\"mapped\",[111]],[[120447,120447],\"mapped\",[112]],[[120448,120448],\"mapped\",[113]],[[120449,120449],\"mapped\",[114]],[[120450,120450],\"mapped\",[115]],[[120451,120451],\"mapped\",[116]],[[120452,120452],\"mapped\",[117]],[[120453,120453],\"mapped\",[118]],[[120454,120454],\"mapped\",[119]],[[120455,120455],\"mapped\",[120]],[[120456,120456],\"mapped\",[121]],[[120457,120457],\"mapped\",[122]],[[120458,120458],\"mapped\",[97]],[[120459,120459],\"mapped\",[98]],[[120460,120460],\"mapped\",[99]],[[120461,120461],\"mapped\",[100]],[[120462,120462],\"mapped\",[101]],[[120463,120463],\"mapped\",[102]],[[120464,120464],\"mapped\",[103]],[[120465,120465],\"mapped\",[104]],[[120466,120466],\"mapped\",[105]],[[120467,120467],\"mapped\",[106]],[[120468,120468],\"mapped\",[107]],[[120469,120469],\"mapped\",[108]],[[120470,120470],\"mapped\",[109]],[[120471,120471],\"mapped\",[110]],[[120472,120472],\"mapped\",[111]],[[120473,120473],\"mapped\",[112]],[[120474,120474],\"mapped\",[113]],[[120475,120475],\"mapped\",[114]],[[120476,120476],\"mapped\",[115]],[[120477,120477],\"mapped\",[116]],[[120478,120478],\"mapped\",[117]],[[120479,120479],\"mapped\",[118]],[[120480,120480],\"mapped\",[119]],[[120481,120481],\"mapped\",[120]],[[120482,120482],\"mapped\",[121]],[[120483,120483],\"mapped\",[122]],[[120484,120484],\"mapped\",[305]],[[120485,120485],\"mapped\",[567]],[[120486,120487],\"disallowed\"],[[120488,120488],\"mapped\",[945]],[[120489,120489],\"mapped\",[946]],[[120490,120490],\"mapped\",[947]],[[120491,120491],\"mapped\",[948]],[[120492,120492],\"mapped\",[949]],[[120493,120493],\"mapped\",[950]],[[120494,120494],\"mapped\",[951]],[[120495,120495],\"mapped\",[952]],[[120496,120496],\"mapped\",[953]],[[120497,120497],\"mapped\",[954]],[[120498,120498],\"mapped\",[955]],[[120499,120499],\"mapped\",[956]],[[120500,120500],\"mapped\",[957]],[[120501,120501],\"mapped\",[958]],[[120502,120502],\"mapped\",[959]],[[120503,120503],\"mapped\",[960]],[[120504,120504],\"mapped\",[961]],[[120505,120505],\"mapped\",[952]],[[120506,120506],\"mapped\",[963]],[[120507,120507],\"mapped\",[964]],[[120508,120508],\"mapped\",[965]],[[120509,120509],\"mapped\",[966]],[[120510,120510],\"mapped\",[967]],[[120511,120511],\"mapped\",[968]],[[120512,120512],\"mapped\",[969]],[[120513,120513],\"mapped\",[8711]],[[120514,120514],\"mapped\",[945]],[[120515,120515],\"mapped\",[946]],[[120516,120516],\"mapped\",[947]],[[120517,120517],\"mapped\",[948]],[[120518,120518],\"mapped\",[949]],[[120519,120519],\"mapped\",[950]],[[120520,120520],\"mapped\",[951]],[[120521,120521],\"mapped\",[952]],[[120522,120522],\"mapped\",[953]],[[120523,120523],\"mapped\",[954]],[[120524,120524],\"mapped\",[955]],[[120525,120525],\"mapped\",[956]],[[120526,120526],\"mapped\",[957]],[[120527,120527],\"mapped\",[958]],[[120528,120528],\"mapped\",[959]],[[120529,120529],\"mapped\",[960]],[[120530,120530],\"mapped\",[961]],[[120531,120532],\"mapped\",[963]],[[120533,120533],\"mapped\",[964]],[[120534,120534],\"mapped\",[965]],[[120535,120535],\"mapped\",[966]],[[120536,120536],\"mapped\",[967]],[[120537,120537],\"mapped\",[968]],[[120538,120538],\"mapped\",[969]],[[120539,120539],\"mapped\",[8706]],[[120540,120540],\"mapped\",[949]],[[120541,120541],\"mapped\",[952]],[[120542,120542],\"mapped\",[954]],[[120543,120543],\"mapped\",[966]],[[120544,120544],\"mapped\",[961]],[[120545,120545],\"mapped\",[960]],[[120546,120546],\"mapped\",[945]],[[120547,120547],\"mapped\",[946]],[[120548,120548],\"mapped\",[947]],[[120549,120549],\"mapped\",[948]],[[120550,120550],\"mapped\",[949]],[[120551,120551],\"mapped\",[950]],[[120552,120552],\"mapped\",[951]],[[120553,120553],\"mapped\",[952]],[[120554,120554],\"mapped\",[953]],[[120555,120555],\"mapped\",[954]],[[120556,120556],\"mapped\",[955]],[[120557,120557],\"mapped\",[956]],[[120558,120558],\"mapped\",[957]],[[120559,120559],\"mapped\",[958]],[[120560,120560],\"mapped\",[959]],[[120561,120561],\"mapped\",[960]],[[120562,120562],\"mapped\",[961]],[[120563,120563],\"mapped\",[952]],[[120564,120564],\"mapped\",[963]],[[120565,120565],\"mapped\",[964]],[[120566,120566],\"mapped\",[965]],[[120567,120567],\"mapped\",[966]],[[120568,120568],\"mapped\",[967]],[[120569,120569],\"mapped\",[968]],[[120570,120570],\"mapped\",[969]],[[120571,120571],\"mapped\",[8711]],[[120572,120572],\"mapped\",[945]],[[120573,120573],\"mapped\",[946]],[[120574,120574],\"mapped\",[947]],[[120575,120575],\"mapped\",[948]],[[120576,120576],\"mapped\",[949]],[[120577,120577],\"mapped\",[950]],[[120578,120578],\"mapped\",[951]],[[120579,120579],\"mapped\",[952]],[[120580,120580],\"mapped\",[953]],[[120581,120581],\"mapped\",[954]],[[120582,120582],\"mapped\",[955]],[[120583,120583],\"mapped\",[956]],[[120584,120584],\"mapped\",[957]],[[120585,120585],\"mapped\",[958]],[[120586,120586],\"mapped\",[959]],[[120587,120587],\"mapped\",[960]],[[120588,120588],\"mapped\",[961]],[[120589,120590],\"mapped\",[963]],[[120591,120591],\"mapped\",[964]],[[120592,120592],\"mapped\",[965]],[[120593,120593],\"mapped\",[966]],[[120594,120594],\"mapped\",[967]],[[120595,120595],\"mapped\",[968]],[[120596,120596],\"mapped\",[969]],[[120597,120597],\"mapped\",[8706]],[[120598,120598],\"mapped\",[949]],[[120599,120599],\"mapped\",[952]],[[120600,120600],\"mapped\",[954]],[[120601,120601],\"mapped\",[966]],[[120602,120602],\"mapped\",[961]],[[120603,120603],\"mapped\",[960]],[[120604,120604],\"mapped\",[945]],[[120605,120605],\"mapped\",[946]],[[120606,120606],\"mapped\",[947]],[[120607,120607],\"mapped\",[948]],[[120608,120608],\"mapped\",[949]],[[120609,120609],\"mapped\",[950]],[[120610,120610],\"mapped\",[951]],[[120611,120611],\"mapped\",[952]],[[120612,120612],\"mapped\",[953]],[[120613,120613],\"mapped\",[954]],[[120614,120614],\"mapped\",[955]],[[120615,120615],\"mapped\",[956]],[[120616,120616],\"mapped\",[957]],[[120617,120617],\"mapped\",[958]],[[120618,120618],\"mapped\",[959]],[[120619,120619],\"mapped\",[960]],[[120620,120620],\"mapped\",[961]],[[120621,120621],\"mapped\",[952]],[[120622,120622],\"mapped\",[963]],[[120623,120623],\"mapped\",[964]],[[120624,120624],\"mapped\",[965]],[[120625,120625],\"mapped\",[966]],[[120626,120626],\"mapped\",[967]],[[120627,120627],\"mapped\",[968]],[[120628,120628],\"mapped\",[969]],[[120629,120629],\"mapped\",[8711]],[[120630,120630],\"mapped\",[945]],[[120631,120631],\"mapped\",[946]],[[120632,120632],\"mapped\",[947]],[[120633,120633],\"mapped\",[948]],[[120634,120634],\"mapped\",[949]],[[120635,120635],\"mapped\",[950]],[[120636,120636],\"mapped\",[951]],[[120637,120637],\"mapped\",[952]],[[120638,120638],\"mapped\",[953]],[[120639,120639],\"mapped\",[954]],[[120640,120640],\"mapped\",[955]],[[120641,120641],\"mapped\",[956]],[[120642,120642],\"mapped\",[957]],[[120643,120643],\"mapped\",[958]],[[120644,120644],\"mapped\",[959]],[[120645,120645],\"mapped\",[960]],[[120646,120646],\"mapped\",[961]],[[120647,120648],\"mapped\",[963]],[[120649,120649],\"mapped\",[964]],[[120650,120650],\"mapped\",[965]],[[120651,120651],\"mapped\",[966]],[[120652,120652],\"mapped\",[967]],[[120653,120653],\"mapped\",[968]],[[120654,120654],\"mapped\",[969]],[[120655,120655],\"mapped\",[8706]],[[120656,120656],\"mapped\",[949]],[[120657,120657],\"mapped\",[952]],[[120658,120658],\"mapped\",[954]],[[120659,120659],\"mapped\",[966]],[[120660,120660],\"mapped\",[961]],[[120661,120661],\"mapped\",[960]],[[120662,120662],\"mapped\",[945]],[[120663,120663],\"mapped\",[946]],[[120664,120664],\"mapped\",[947]],[[120665,120665],\"mapped\",[948]],[[120666,120666],\"mapped\",[949]],[[120667,120667],\"mapped\",[950]],[[120668,120668],\"mapped\",[951]],[[120669,120669],\"mapped\",[952]],[[120670,120670],\"mapped\",[953]],[[120671,120671],\"mapped\",[954]],[[120672,120672],\"mapped\",[955]],[[120673,120673],\"mapped\",[956]],[[120674,120674],\"mapped\",[957]],[[120675,120675],\"mapped\",[958]],[[120676,120676],\"mapped\",[959]],[[120677,120677],\"mapped\",[960]],[[120678,120678],\"mapped\",[961]],[[120679,120679],\"mapped\",[952]],[[120680,120680],\"mapped\",[963]],[[120681,120681],\"mapped\",[964]],[[120682,120682],\"mapped\",[965]],[[120683,120683],\"mapped\",[966]],[[120684,120684],\"mapped\",[967]],[[120685,120685],\"mapped\",[968]],[[120686,120686],\"mapped\",[969]],[[120687,120687],\"mapped\",[8711]],[[120688,120688],\"mapped\",[945]],[[120689,120689],\"mapped\",[946]],[[120690,120690],\"mapped\",[947]],[[120691,120691],\"mapped\",[948]],[[120692,120692],\"mapped\",[949]],[[120693,120693],\"mapped\",[950]],[[120694,120694],\"mapped\",[951]],[[120695,120695],\"mapped\",[952]],[[120696,120696],\"mapped\",[953]],[[120697,120697],\"mapped\",[954]],[[120698,120698],\"mapped\",[955]],[[120699,120699],\"mapped\",[956]],[[120700,120700],\"mapped\",[957]],[[120701,120701],\"mapped\",[958]],[[120702,120702],\"mapped\",[959]],[[120703,120703],\"mapped\",[960]],[[120704,120704],\"mapped\",[961]],[[120705,120706],\"mapped\",[963]],[[120707,120707],\"mapped\",[964]],[[120708,120708],\"mapped\",[965]],[[120709,120709],\"mapped\",[966]],[[120710,120710],\"mapped\",[967]],[[120711,120711],\"mapped\",[968]],[[120712,120712],\"mapped\",[969]],[[120713,120713],\"mapped\",[8706]],[[120714,120714],\"mapped\",[949]],[[120715,120715],\"mapped\",[952]],[[120716,120716],\"mapped\",[954]],[[120717,120717],\"mapped\",[966]],[[120718,120718],\"mapped\",[961]],[[120719,120719],\"mapped\",[960]],[[120720,120720],\"mapped\",[945]],[[120721,120721],\"mapped\",[946]],[[120722,120722],\"mapped\",[947]],[[120723,120723],\"mapped\",[948]],[[120724,120724],\"mapped\",[949]],[[120725,120725],\"mapped\",[950]],[[120726,120726],\"mapped\",[951]],[[120727,120727],\"mapped\",[952]],[[120728,120728],\"mapped\",[953]],[[120729,120729],\"mapped\",[954]],[[120730,120730],\"mapped\",[955]],[[120731,120731],\"mapped\",[956]],[[120732,120732],\"mapped\",[957]],[[120733,120733],\"mapped\",[958]],[[120734,120734],\"mapped\",[959]],[[120735,120735],\"mapped\",[960]],[[120736,120736],\"mapped\",[961]],[[120737,120737],\"mapped\",[952]],[[120738,120738],\"mapped\",[963]],[[120739,120739],\"mapped\",[964]],[[120740,120740],\"mapped\",[965]],[[120741,120741],\"mapped\",[966]],[[120742,120742],\"mapped\",[967]],[[120743,120743],\"mapped\",[968]],[[120744,120744],\"mapped\",[969]],[[120745,120745],\"mapped\",[8711]],[[120746,120746],\"mapped\",[945]],[[120747,120747],\"mapped\",[946]],[[120748,120748],\"mapped\",[947]],[[120749,120749],\"mapped\",[948]],[[120750,120750],\"mapped\",[949]],[[120751,120751],\"mapped\",[950]],[[120752,120752],\"mapped\",[951]],[[120753,120753],\"mapped\",[952]],[[120754,120754],\"mapped\",[953]],[[120755,120755],\"mapped\",[954]],[[120756,120756],\"mapped\",[955]],[[120757,120757],\"mapped\",[956]],[[120758,120758],\"mapped\",[957]],[[120759,120759],\"mapped\",[958]],[[120760,120760],\"mapped\",[959]],[[120761,120761],\"mapped\",[960]],[[120762,120762],\"mapped\",[961]],[[120763,120764],\"mapped\",[963]],[[120765,120765],\"mapped\",[964]],[[120766,120766],\"mapped\",[965]],[[120767,120767],\"mapped\",[966]],[[120768,120768],\"mapped\",[967]],[[120769,120769],\"mapped\",[968]],[[120770,120770],\"mapped\",[969]],[[120771,120771],\"mapped\",[8706]],[[120772,120772],\"mapped\",[949]],[[120773,120773],\"mapped\",[952]],[[120774,120774],\"mapped\",[954]],[[120775,120775],\"mapped\",[966]],[[120776,120776],\"mapped\",[961]],[[120777,120777],\"mapped\",[960]],[[120778,120779],\"mapped\",[989]],[[120780,120781],\"disallowed\"],[[120782,120782],\"mapped\",[48]],[[120783,120783],\"mapped\",[49]],[[120784,120784],\"mapped\",[50]],[[120785,120785],\"mapped\",[51]],[[120786,120786],\"mapped\",[52]],[[120787,120787],\"mapped\",[53]],[[120788,120788],\"mapped\",[54]],[[120789,120789],\"mapped\",[55]],[[120790,120790],\"mapped\",[56]],[[120791,120791],\"mapped\",[57]],[[120792,120792],\"mapped\",[48]],[[120793,120793],\"mapped\",[49]],[[120794,120794],\"mapped\",[50]],[[120795,120795],\"mapped\",[51]],[[120796,120796],\"mapped\",[52]],[[120797,120797],\"mapped\",[53]],[[120798,120798],\"mapped\",[54]],[[120799,120799],\"mapped\",[55]],[[120800,120800],\"mapped\",[56]],[[120801,120801],\"mapped\",[57]],[[120802,120802],\"mapped\",[48]],[[120803,120803],\"mapped\",[49]],[[120804,120804],\"mapped\",[50]],[[120805,120805],\"mapped\",[51]],[[120806,120806],\"mapped\",[52]],[[120807,120807],\"mapped\",[53]],[[120808,120808],\"mapped\",[54]],[[120809,120809],\"mapped\",[55]],[[120810,120810],\"mapped\",[56]],[[120811,120811],\"mapped\",[57]],[[120812,120812],\"mapped\",[48]],[[120813,120813],\"mapped\",[49]],[[120814,120814],\"mapped\",[50]],[[120815,120815],\"mapped\",[51]],[[120816,120816],\"mapped\",[52]],[[120817,120817],\"mapped\",[53]],[[120818,120818],\"mapped\",[54]],[[120819,120819],\"mapped\",[55]],[[120820,120820],\"mapped\",[56]],[[120821,120821],\"mapped\",[57]],[[120822,120822],\"mapped\",[48]],[[120823,120823],\"mapped\",[49]],[[120824,120824],\"mapped\",[50]],[[120825,120825],\"mapped\",[51]],[[120826,120826],\"mapped\",[52]],[[120827,120827],\"mapped\",[53]],[[120828,120828],\"mapped\",[54]],[[120829,120829],\"mapped\",[55]],[[120830,120830],\"mapped\",[56]],[[120831,120831],\"mapped\",[57]],[[120832,121343],\"valid\",[],\"NV8\"],[[121344,121398],\"valid\"],[[121399,121402],\"valid\",[],\"NV8\"],[[121403,121452],\"valid\"],[[121453,121460],\"valid\",[],\"NV8\"],[[121461,121461],\"valid\"],[[121462,121475],\"valid\",[],\"NV8\"],[[121476,121476],\"valid\"],[[121477,121483],\"valid\",[],\"NV8\"],[[121484,121498],\"disallowed\"],[[121499,121503],\"valid\"],[[121504,121504],\"disallowed\"],[[121505,121519],\"valid\"],[[121520,124927],\"disallowed\"],[[124928,125124],\"valid\"],[[125125,125126],\"disallowed\"],[[125127,125135],\"valid\",[],\"NV8\"],[[125136,125142],\"valid\"],[[125143,126463],\"disallowed\"],[[126464,126464],\"mapped\",[1575]],[[126465,126465],\"mapped\",[1576]],[[126466,126466],\"mapped\",[1580]],[[126467,126467],\"mapped\",[1583]],[[126468,126468],\"disallowed\"],[[126469,126469],\"mapped\",[1608]],[[126470,126470],\"mapped\",[1586]],[[126471,126471],\"mapped\",[1581]],[[126472,126472],\"mapped\",[1591]],[[126473,126473],\"mapped\",[1610]],[[126474,126474],\"mapped\",[1603]],[[126475,126475],\"mapped\",[1604]],[[126476,126476],\"mapped\",[1605]],[[126477,126477],\"mapped\",[1606]],[[126478,126478],\"mapped\",[1587]],[[126479,126479],\"mapped\",[1593]],[[126480,126480],\"mapped\",[1601]],[[126481,126481],\"mapped\",[1589]],[[126482,126482],\"mapped\",[1602]],[[126483,126483],\"mapped\",[1585]],[[126484,126484],\"mapped\",[1588]],[[126485,126485],\"mapped\",[1578]],[[126486,126486],\"mapped\",[1579]],[[126487,126487],\"mapped\",[1582]],[[126488,126488],\"mapped\",[1584]],[[126489,126489],\"mapped\",[1590]],[[126490,126490],\"mapped\",[1592]],[[126491,126491],\"mapped\",[1594]],[[126492,126492],\"mapped\",[1646]],[[126493,126493],\"mapped\",[1722]],[[126494,126494],\"mapped\",[1697]],[[126495,126495],\"mapped\",[1647]],[[126496,126496],\"disallowed\"],[[126497,126497],\"mapped\",[1576]],[[126498,126498],\"mapped\",[1580]],[[126499,126499],\"disallowed\"],[[126500,126500],\"mapped\",[1607]],[[126501,126502],\"disallowed\"],[[126503,126503],\"mapped\",[1581]],[[126504,126504],\"disallowed\"],[[126505,126505],\"mapped\",[1610]],[[126506,126506],\"mapped\",[1603]],[[126507,126507],\"mapped\",[1604]],[[126508,126508],\"mapped\",[1605]],[[126509,126509],\"mapped\",[1606]],[[126510,126510],\"mapped\",[1587]],[[126511,126511],\"mapped\",[1593]],[[126512,126512],\"mapped\",[1601]],[[126513,126513],\"mapped\",[1589]],[[126514,126514],\"mapped\",[1602]],[[126515,126515],\"disallowed\"],[[126516,126516],\"mapped\",[1588]],[[126517,126517],\"mapped\",[1578]],[[126518,126518],\"mapped\",[1579]],[[126519,126519],\"mapped\",[1582]],[[126520,126520],\"disallowed\"],[[126521,126521],\"mapped\",[1590]],[[126522,126522],\"disallowed\"],[[126523,126523],\"mapped\",[1594]],[[126524,126529],\"disallowed\"],[[126530,126530],\"mapped\",[1580]],[[126531,126534],\"disallowed\"],[[126535,126535],\"mapped\",[1581]],[[126536,126536],\"disallowed\"],[[126537,126537],\"mapped\",[1610]],[[126538,126538],\"disallowed\"],[[126539,126539],\"mapped\",[1604]],[[126540,126540],\"disallowed\"],[[126541,126541],\"mapped\",[1606]],[[126542,126542],\"mapped\",[1587]],[[126543,126543],\"mapped\",[1593]],[[126544,126544],\"disallowed\"],[[126545,126545],\"mapped\",[1589]],[[126546,126546],\"mapped\",[1602]],[[126547,126547],\"disallowed\"],[[126548,126548],\"mapped\",[1588]],[[126549,126550],\"disallowed\"],[[126551,126551],\"mapped\",[1582]],[[126552,126552],\"disallowed\"],[[126553,126553],\"mapped\",[1590]],[[126554,126554],\"disallowed\"],[[126555,126555],\"mapped\",[1594]],[[126556,126556],\"disallowed\"],[[126557,126557],\"mapped\",[1722]],[[126558,126558],\"disallowed\"],[[126559,126559],\"mapped\",[1647]],[[126560,126560],\"disallowed\"],[[126561,126561],\"mapped\",[1576]],[[126562,126562],\"mapped\",[1580]],[[126563,126563],\"disallowed\"],[[126564,126564],\"mapped\",[1607]],[[126565,126566],\"disallowed\"],[[126567,126567],\"mapped\",[1581]],[[126568,126568],\"mapped\",[1591]],[[126569,126569],\"mapped\",[1610]],[[126570,126570],\"mapped\",[1603]],[[126571,126571],\"disallowed\"],[[126572,126572],\"mapped\",[1605]],[[126573,126573],\"mapped\",[1606]],[[126574,126574],\"mapped\",[1587]],[[126575,126575],\"mapped\",[1593]],[[126576,126576],\"mapped\",[1601]],[[126577,126577],\"mapped\",[1589]],[[126578,126578],\"mapped\",[1602]],[[126579,126579],\"disallowed\"],[[126580,126580],\"mapped\",[1588]],[[126581,126581],\"mapped\",[1578]],[[126582,126582],\"mapped\",[1579]],[[126583,126583],\"mapped\",[1582]],[[126584,126584],\"disallowed\"],[[126585,126585],\"mapped\",[1590]],[[126586,126586],\"mapped\",[1592]],[[126587,126587],\"mapped\",[1594]],[[126588,126588],\"mapped\",[1646]],[[126589,126589],\"disallowed\"],[[126590,126590],\"mapped\",[1697]],[[126591,126591],\"disallowed\"],[[126592,126592],\"mapped\",[1575]],[[126593,126593],\"mapped\",[1576]],[[126594,126594],\"mapped\",[1580]],[[126595,126595],\"mapped\",[1583]],[[126596,126596],\"mapped\",[1607]],[[126597,126597],\"mapped\",[1608]],[[126598,126598],\"mapped\",[1586]],[[126599,126599],\"mapped\",[1581]],[[126600,126600],\"mapped\",[1591]],[[126601,126601],\"mapped\",[1610]],[[126602,126602],\"disallowed\"],[[126603,126603],\"mapped\",[1604]],[[126604,126604],\"mapped\",[1605]],[[126605,126605],\"mapped\",[1606]],[[126606,126606],\"mapped\",[1587]],[[126607,126607],\"mapped\",[1593]],[[126608,126608],\"mapped\",[1601]],[[126609,126609],\"mapped\",[1589]],[[126610,126610],\"mapped\",[1602]],[[126611,126611],\"mapped\",[1585]],[[126612,126612],\"mapped\",[1588]],[[126613,126613],\"mapped\",[1578]],[[126614,126614],\"mapped\",[1579]],[[126615,126615],\"mapped\",[1582]],[[126616,126616],\"mapped\",[1584]],[[126617,126617],\"mapped\",[1590]],[[126618,126618],\"mapped\",[1592]],[[126619,126619],\"mapped\",[1594]],[[126620,126624],\"disallowed\"],[[126625,126625],\"mapped\",[1576]],[[126626,126626],\"mapped\",[1580]],[[126627,126627],\"mapped\",[1583]],[[126628,126628],\"disallowed\"],[[126629,126629],\"mapped\",[1608]],[[126630,126630],\"mapped\",[1586]],[[126631,126631],\"mapped\",[1581]],[[126632,126632],\"mapped\",[1591]],[[126633,126633],\"mapped\",[1610]],[[126634,126634],\"disallowed\"],[[126635,126635],\"mapped\",[1604]],[[126636,126636],\"mapped\",[1605]],[[126637,126637],\"mapped\",[1606]],[[126638,126638],\"mapped\",[1587]],[[126639,126639],\"mapped\",[1593]],[[126640,126640],\"mapped\",[1601]],[[126641,126641],\"mapped\",[1589]],[[126642,126642],\"mapped\",[1602]],[[126643,126643],\"mapped\",[1585]],[[126644,126644],\"mapped\",[1588]],[[126645,126645],\"mapped\",[1578]],[[126646,126646],\"mapped\",[1579]],[[126647,126647],\"mapped\",[1582]],[[126648,126648],\"mapped\",[1584]],[[126649,126649],\"mapped\",[1590]],[[126650,126650],\"mapped\",[1592]],[[126651,126651],\"mapped\",[1594]],[[126652,126703],\"disallowed\"],[[126704,126705],\"valid\",[],\"NV8\"],[[126706,126975],\"disallowed\"],[[126976,127019],\"valid\",[],\"NV8\"],[[127020,127023],\"disallowed\"],[[127024,127123],\"valid\",[],\"NV8\"],[[127124,127135],\"disallowed\"],[[127136,127150],\"valid\",[],\"NV8\"],[[127151,127152],\"disallowed\"],[[127153,127166],\"valid\",[],\"NV8\"],[[127167,127167],\"valid\",[],\"NV8\"],[[127168,127168],\"disallowed\"],[[127169,127183],\"valid\",[],\"NV8\"],[[127184,127184],\"disallowed\"],[[127185,127199],\"valid\",[],\"NV8\"],[[127200,127221],\"valid\",[],\"NV8\"],[[127222,127231],\"disallowed\"],[[127232,127232],\"disallowed\"],[[127233,127233],\"disallowed_STD3_mapped\",[48,44]],[[127234,127234],\"disallowed_STD3_mapped\",[49,44]],[[127235,127235],\"disallowed_STD3_mapped\",[50,44]],[[127236,127236],\"disallowed_STD3_mapped\",[51,44]],[[127237,127237],\"disallowed_STD3_mapped\",[52,44]],[[127238,127238],\"disallowed_STD3_mapped\",[53,44]],[[127239,127239],\"disallowed_STD3_mapped\",[54,44]],[[127240,127240],\"disallowed_STD3_mapped\",[55,44]],[[127241,127241],\"disallowed_STD3_mapped\",[56,44]],[[127242,127242],\"disallowed_STD3_mapped\",[57,44]],[[127243,127244],\"valid\",[],\"NV8\"],[[127245,127247],\"disallowed\"],[[127248,127248],\"disallowed_STD3_mapped\",[40,97,41]],[[127249,127249],\"disallowed_STD3_mapped\",[40,98,41]],[[127250,127250],\"disallowed_STD3_mapped\",[40,99,41]],[[127251,127251],\"disallowed_STD3_mapped\",[40,100,41]],[[127252,127252],\"disallowed_STD3_mapped\",[40,101,41]],[[127253,127253],\"disallowed_STD3_mapped\",[40,102,41]],[[127254,127254],\"disallowed_STD3_mapped\",[40,103,41]],[[127255,127255],\"disallowed_STD3_mapped\",[40,104,41]],[[127256,127256],\"disallowed_STD3_mapped\",[40,105,41]],[[127257,127257],\"disallowed_STD3_mapped\",[40,106,41]],[[127258,127258],\"disallowed_STD3_mapped\",[40,107,41]],[[127259,127259],\"disallowed_STD3_mapped\",[40,108,41]],[[127260,127260],\"disallowed_STD3_mapped\",[40,109,41]],[[127261,127261],\"disallowed_STD3_mapped\",[40,110,41]],[[127262,127262],\"disallowed_STD3_mapped\",[40,111,41]],[[127263,127263],\"disallowed_STD3_mapped\",[40,112,41]],[[127264,127264],\"disallowed_STD3_mapped\",[40,113,41]],[[127265,127265],\"disallowed_STD3_mapped\",[40,114,41]],[[127266,127266],\"disallowed_STD3_mapped\",[40,115,41]],[[127267,127267],\"disallowed_STD3_mapped\",[40,116,41]],[[127268,127268],\"disallowed_STD3_mapped\",[40,117,41]],[[127269,127269],\"disallowed_STD3_mapped\",[40,118,41]],[[127270,127270],\"disallowed_STD3_mapped\",[40,119,41]],[[127271,127271],\"disallowed_STD3_mapped\",[40,120,41]],[[127272,127272],\"disallowed_STD3_mapped\",[40,121,41]],[[127273,127273],\"disallowed_STD3_mapped\",[40,122,41]],[[127274,127274],\"mapped\",[12308,115,12309]],[[127275,127275],\"mapped\",[99]],[[127276,127276],\"mapped\",[114]],[[127277,127277],\"mapped\",[99,100]],[[127278,127278],\"mapped\",[119,122]],[[127279,127279],\"disallowed\"],[[127280,127280],\"mapped\",[97]],[[127281,127281],\"mapped\",[98]],[[127282,127282],\"mapped\",[99]],[[127283,127283],\"mapped\",[100]],[[127284,127284],\"mapped\",[101]],[[127285,127285],\"mapped\",[102]],[[127286,127286],\"mapped\",[103]],[[127287,127287],\"mapped\",[104]],[[127288,127288],\"mapped\",[105]],[[127289,127289],\"mapped\",[106]],[[127290,127290],\"mapped\",[107]],[[127291,127291],\"mapped\",[108]],[[127292,127292],\"mapped\",[109]],[[127293,127293],\"mapped\",[110]],[[127294,127294],\"mapped\",[111]],[[127295,127295],\"mapped\",[112]],[[127296,127296],\"mapped\",[113]],[[127297,127297],\"mapped\",[114]],[[127298,127298],\"mapped\",[115]],[[127299,127299],\"mapped\",[116]],[[127300,127300],\"mapped\",[117]],[[127301,127301],\"mapped\",[118]],[[127302,127302],\"mapped\",[119]],[[127303,127303],\"mapped\",[120]],[[127304,127304],\"mapped\",[121]],[[127305,127305],\"mapped\",[122]],[[127306,127306],\"mapped\",[104,118]],[[127307,127307],\"mapped\",[109,118]],[[127308,127308],\"mapped\",[115,100]],[[127309,127309],\"mapped\",[115,115]],[[127310,127310],\"mapped\",[112,112,118]],[[127311,127311],\"mapped\",[119,99]],[[127312,127318],\"valid\",[],\"NV8\"],[[127319,127319],\"valid\",[],\"NV8\"],[[127320,127326],\"valid\",[],\"NV8\"],[[127327,127327],\"valid\",[],\"NV8\"],[[127328,127337],\"valid\",[],\"NV8\"],[[127338,127338],\"mapped\",[109,99]],[[127339,127339],\"mapped\",[109,100]],[[127340,127343],\"disallowed\"],[[127344,127352],\"valid\",[],\"NV8\"],[[127353,127353],\"valid\",[],\"NV8\"],[[127354,127354],\"valid\",[],\"NV8\"],[[127355,127356],\"valid\",[],\"NV8\"],[[127357,127358],\"valid\",[],\"NV8\"],[[127359,127359],\"valid\",[],\"NV8\"],[[127360,127369],\"valid\",[],\"NV8\"],[[127370,127373],\"valid\",[],\"NV8\"],[[127374,127375],\"valid\",[],\"NV8\"],[[127376,127376],\"mapped\",[100,106]],[[127377,127386],\"valid\",[],\"NV8\"],[[127387,127461],\"disallowed\"],[[127462,127487],\"valid\",[],\"NV8\"],[[127488,127488],\"mapped\",[12411,12363]],[[127489,127489],\"mapped\",[12467,12467]],[[127490,127490],\"mapped\",[12469]],[[127491,127503],\"disallowed\"],[[127504,127504],\"mapped\",[25163]],[[127505,127505],\"mapped\",[23383]],[[127506,127506],\"mapped\",[21452]],[[127507,127507],\"mapped\",[12487]],[[127508,127508],\"mapped\",[20108]],[[127509,127509],\"mapped\",[22810]],[[127510,127510],\"mapped\",[35299]],[[127511,127511],\"mapped\",[22825]],[[127512,127512],\"mapped\",[20132]],[[127513,127513],\"mapped\",[26144]],[[127514,127514],\"mapped\",[28961]],[[127515,127515],\"mapped\",[26009]],[[127516,127516],\"mapped\",[21069]],[[127517,127517],\"mapped\",[24460]],[[127518,127518],\"mapped\",[20877]],[[127519,127519],\"mapped\",[26032]],[[127520,127520],\"mapped\",[21021]],[[127521,127521],\"mapped\",[32066]],[[127522,127522],\"mapped\",[29983]],[[127523,127523],\"mapped\",[36009]],[[127524,127524],\"mapped\",[22768]],[[127525,127525],\"mapped\",[21561]],[[127526,127526],\"mapped\",[28436]],[[127527,127527],\"mapped\",[25237]],[[127528,127528],\"mapped\",[25429]],[[127529,127529],\"mapped\",[19968]],[[127530,127530],\"mapped\",[19977]],[[127531,127531],\"mapped\",[36938]],[[127532,127532],\"mapped\",[24038]],[[127533,127533],\"mapped\",[20013]],[[127534,127534],\"mapped\",[21491]],[[127535,127535],\"mapped\",[25351]],[[127536,127536],\"mapped\",[36208]],[[127537,127537],\"mapped\",[25171]],[[127538,127538],\"mapped\",[31105]],[[127539,127539],\"mapped\",[31354]],[[127540,127540],\"mapped\",[21512]],[[127541,127541],\"mapped\",[28288]],[[127542,127542],\"mapped\",[26377]],[[127543,127543],\"mapped\",[26376]],[[127544,127544],\"mapped\",[30003]],[[127545,127545],\"mapped\",[21106]],[[127546,127546],\"mapped\",[21942]],[[127547,127551],\"disallowed\"],[[127552,127552],\"mapped\",[12308,26412,12309]],[[127553,127553],\"mapped\",[12308,19977,12309]],[[127554,127554],\"mapped\",[12308,20108,12309]],[[127555,127555],\"mapped\",[12308,23433,12309]],[[127556,127556],\"mapped\",[12308,28857,12309]],[[127557,127557],\"mapped\",[12308,25171,12309]],[[127558,127558],\"mapped\",[12308,30423,12309]],[[127559,127559],\"mapped\",[12308,21213,12309]],[[127560,127560],\"mapped\",[12308,25943,12309]],[[127561,127567],\"disallowed\"],[[127568,127568],\"mapped\",[24471]],[[127569,127569],\"mapped\",[21487]],[[127570,127743],\"disallowed\"],[[127744,127776],\"valid\",[],\"NV8\"],[[127777,127788],\"valid\",[],\"NV8\"],[[127789,127791],\"valid\",[],\"NV8\"],[[127792,127797],\"valid\",[],\"NV8\"],[[127798,127798],\"valid\",[],\"NV8\"],[[127799,127868],\"valid\",[],\"NV8\"],[[127869,127869],\"valid\",[],\"NV8\"],[[127870,127871],\"valid\",[],\"NV8\"],[[127872,127891],\"valid\",[],\"NV8\"],[[127892,127903],\"valid\",[],\"NV8\"],[[127904,127940],\"valid\",[],\"NV8\"],[[127941,127941],\"valid\",[],\"NV8\"],[[127942,127946],\"valid\",[],\"NV8\"],[[127947,127950],\"valid\",[],\"NV8\"],[[127951,127955],\"valid\",[],\"NV8\"],[[127956,127967],\"valid\",[],\"NV8\"],[[127968,127984],\"valid\",[],\"NV8\"],[[127985,127991],\"valid\",[],\"NV8\"],[[127992,127999],\"valid\",[],\"NV8\"],[[128000,128062],\"valid\",[],\"NV8\"],[[128063,128063],\"valid\",[],\"NV8\"],[[128064,128064],\"valid\",[],\"NV8\"],[[128065,128065],\"valid\",[],\"NV8\"],[[128066,128247],\"valid\",[],\"NV8\"],[[128248,128248],\"valid\",[],\"NV8\"],[[128249,128252],\"valid\",[],\"NV8\"],[[128253,128254],\"valid\",[],\"NV8\"],[[128255,128255],\"valid\",[],\"NV8\"],[[128256,128317],\"valid\",[],\"NV8\"],[[128318,128319],\"valid\",[],\"NV8\"],[[128320,128323],\"valid\",[],\"NV8\"],[[128324,128330],\"valid\",[],\"NV8\"],[[128331,128335],\"valid\",[],\"NV8\"],[[128336,128359],\"valid\",[],\"NV8\"],[[128360,128377],\"valid\",[],\"NV8\"],[[128378,128378],\"disallowed\"],[[128379,128419],\"valid\",[],\"NV8\"],[[128420,128420],\"disallowed\"],[[128421,128506],\"valid\",[],\"NV8\"],[[128507,128511],\"valid\",[],\"NV8\"],[[128512,128512],\"valid\",[],\"NV8\"],[[128513,128528],\"valid\",[],\"NV8\"],[[128529,128529],\"valid\",[],\"NV8\"],[[128530,128532],\"valid\",[],\"NV8\"],[[128533,128533],\"valid\",[],\"NV8\"],[[128534,128534],\"valid\",[],\"NV8\"],[[128535,128535],\"valid\",[],\"NV8\"],[[128536,128536],\"valid\",[],\"NV8\"],[[128537,128537],\"valid\",[],\"NV8\"],[[128538,128538],\"valid\",[],\"NV8\"],[[128539,128539],\"valid\",[],\"NV8\"],[[128540,128542],\"valid\",[],\"NV8\"],[[128543,128543],\"valid\",[],\"NV8\"],[[128544,128549],\"valid\",[],\"NV8\"],[[128550,128551],\"valid\",[],\"NV8\"],[[128552,128555],\"valid\",[],\"NV8\"],[[128556,128556],\"valid\",[],\"NV8\"],[[128557,128557],\"valid\",[],\"NV8\"],[[128558,128559],\"valid\",[],\"NV8\"],[[128560,128563],\"valid\",[],\"NV8\"],[[128564,128564],\"valid\",[],\"NV8\"],[[128565,128576],\"valid\",[],\"NV8\"],[[128577,128578],\"valid\",[],\"NV8\"],[[128579,128580],\"valid\",[],\"NV8\"],[[128581,128591],\"valid\",[],\"NV8\"],[[128592,128639],\"valid\",[],\"NV8\"],[[128640,128709],\"valid\",[],\"NV8\"],[[128710,128719],\"valid\",[],\"NV8\"],[[128720,128720],\"valid\",[],\"NV8\"],[[128721,128735],\"disallowed\"],[[128736,128748],\"valid\",[],\"NV8\"],[[128749,128751],\"disallowed\"],[[128752,128755],\"valid\",[],\"NV8\"],[[128756,128767],\"disallowed\"],[[128768,128883],\"valid\",[],\"NV8\"],[[128884,128895],\"disallowed\"],[[128896,128980],\"valid\",[],\"NV8\"],[[128981,129023],\"disallowed\"],[[129024,129035],\"valid\",[],\"NV8\"],[[129036,129039],\"disallowed\"],[[129040,129095],\"valid\",[],\"NV8\"],[[129096,129103],\"disallowed\"],[[129104,129113],\"valid\",[],\"NV8\"],[[129114,129119],\"disallowed\"],[[129120,129159],\"valid\",[],\"NV8\"],[[129160,129167],\"disallowed\"],[[129168,129197],\"valid\",[],\"NV8\"],[[129198,129295],\"disallowed\"],[[129296,129304],\"valid\",[],\"NV8\"],[[129305,129407],\"disallowed\"],[[129408,129412],\"valid\",[],\"NV8\"],[[129413,129471],\"disallowed\"],[[129472,129472],\"valid\",[],\"NV8\"],[[129473,131069],\"disallowed\"],[[131070,131071],\"disallowed\"],[[131072,173782],\"valid\"],[[173783,173823],\"disallowed\"],[[173824,177972],\"valid\"],[[177973,177983],\"disallowed\"],[[177984,178205],\"valid\"],[[178206,178207],\"disallowed\"],[[178208,183969],\"valid\"],[[183970,194559],\"disallowed\"],[[194560,194560],\"mapped\",[20029]],[[194561,194561],\"mapped\",[20024]],[[194562,194562],\"mapped\",[20033]],[[194563,194563],\"mapped\",[131362]],[[194564,194564],\"mapped\",[20320]],[[194565,194565],\"mapped\",[20398]],[[194566,194566],\"mapped\",[20411]],[[194567,194567],\"mapped\",[20482]],[[194568,194568],\"mapped\",[20602]],[[194569,194569],\"mapped\",[20633]],[[194570,194570],\"mapped\",[20711]],[[194571,194571],\"mapped\",[20687]],[[194572,194572],\"mapped\",[13470]],[[194573,194573],\"mapped\",[132666]],[[194574,194574],\"mapped\",[20813]],[[194575,194575],\"mapped\",[20820]],[[194576,194576],\"mapped\",[20836]],[[194577,194577],\"mapped\",[20855]],[[194578,194578],\"mapped\",[132380]],[[194579,194579],\"mapped\",[13497]],[[194580,194580],\"mapped\",[20839]],[[194581,194581],\"mapped\",[20877]],[[194582,194582],\"mapped\",[132427]],[[194583,194583],\"mapped\",[20887]],[[194584,194584],\"mapped\",[20900]],[[194585,194585],\"mapped\",[20172]],[[194586,194586],\"mapped\",[20908]],[[194587,194587],\"mapped\",[20917]],[[194588,194588],\"mapped\",[168415]],[[194589,194589],\"mapped\",[20981]],[[194590,194590],\"mapped\",[20995]],[[194591,194591],\"mapped\",[13535]],[[194592,194592],\"mapped\",[21051]],[[194593,194593],\"mapped\",[21062]],[[194594,194594],\"mapped\",[21106]],[[194595,194595],\"mapped\",[21111]],[[194596,194596],\"mapped\",[13589]],[[194597,194597],\"mapped\",[21191]],[[194598,194598],\"mapped\",[21193]],[[194599,194599],\"mapped\",[21220]],[[194600,194600],\"mapped\",[21242]],[[194601,194601],\"mapped\",[21253]],[[194602,194602],\"mapped\",[21254]],[[194603,194603],\"mapped\",[21271]],[[194604,194604],\"mapped\",[21321]],[[194605,194605],\"mapped\",[21329]],[[194606,194606],\"mapped\",[21338]],[[194607,194607],\"mapped\",[21363]],[[194608,194608],\"mapped\",[21373]],[[194609,194611],\"mapped\",[21375]],[[194612,194612],\"mapped\",[133676]],[[194613,194613],\"mapped\",[28784]],[[194614,194614],\"mapped\",[21450]],[[194615,194615],\"mapped\",[21471]],[[194616,194616],\"mapped\",[133987]],[[194617,194617],\"mapped\",[21483]],[[194618,194618],\"mapped\",[21489]],[[194619,194619],\"mapped\",[21510]],[[194620,194620],\"mapped\",[21662]],[[194621,194621],\"mapped\",[21560]],[[194622,194622],\"mapped\",[21576]],[[194623,194623],\"mapped\",[21608]],[[194624,194624],\"mapped\",[21666]],[[194625,194625],\"mapped\",[21750]],[[194626,194626],\"mapped\",[21776]],[[194627,194627],\"mapped\",[21843]],[[194628,194628],\"mapped\",[21859]],[[194629,194630],\"mapped\",[21892]],[[194631,194631],\"mapped\",[21913]],[[194632,194632],\"mapped\",[21931]],[[194633,194633],\"mapped\",[21939]],[[194634,194634],\"mapped\",[21954]],[[194635,194635],\"mapped\",[22294]],[[194636,194636],\"mapped\",[22022]],[[194637,194637],\"mapped\",[22295]],[[194638,194638],\"mapped\",[22097]],[[194639,194639],\"mapped\",[22132]],[[194640,194640],\"mapped\",[20999]],[[194641,194641],\"mapped\",[22766]],[[194642,194642],\"mapped\",[22478]],[[194643,194643],\"mapped\",[22516]],[[194644,194644],\"mapped\",[22541]],[[194645,194645],\"mapped\",[22411]],[[194646,194646],\"mapped\",[22578]],[[194647,194647],\"mapped\",[22577]],[[194648,194648],\"mapped\",[22700]],[[194649,194649],\"mapped\",[136420]],[[194650,194650],\"mapped\",[22770]],[[194651,194651],\"mapped\",[22775]],[[194652,194652],\"mapped\",[22790]],[[194653,194653],\"mapped\",[22810]],[[194654,194654],\"mapped\",[22818]],[[194655,194655],\"mapped\",[22882]],[[194656,194656],\"mapped\",[136872]],[[194657,194657],\"mapped\",[136938]],[[194658,194658],\"mapped\",[23020]],[[194659,194659],\"mapped\",[23067]],[[194660,194660],\"mapped\",[23079]],[[194661,194661],\"mapped\",[23000]],[[194662,194662],\"mapped\",[23142]],[[194663,194663],\"mapped\",[14062]],[[194664,194664],\"disallowed\"],[[194665,194665],\"mapped\",[23304]],[[194666,194667],\"mapped\",[23358]],[[194668,194668],\"mapped\",[137672]],[[194669,194669],\"mapped\",[23491]],[[194670,194670],\"mapped\",[23512]],[[194671,194671],\"mapped\",[23527]],[[194672,194672],\"mapped\",[23539]],[[194673,194673],\"mapped\",[138008]],[[194674,194674],\"mapped\",[23551]],[[194675,194675],\"mapped\",[23558]],[[194676,194676],\"disallowed\"],[[194677,194677],\"mapped\",[23586]],[[194678,194678],\"mapped\",[14209]],[[194679,194679],\"mapped\",[23648]],[[194680,194680],\"mapped\",[23662]],[[194681,194681],\"mapped\",[23744]],[[194682,194682],\"mapped\",[23693]],[[194683,194683],\"mapped\",[138724]],[[194684,194684],\"mapped\",[23875]],[[194685,194685],\"mapped\",[138726]],[[194686,194686],\"mapped\",[23918]],[[194687,194687],\"mapped\",[23915]],[[194688,194688],\"mapped\",[23932]],[[194689,194689],\"mapped\",[24033]],[[194690,194690],\"mapped\",[24034]],[[194691,194691],\"mapped\",[14383]],[[194692,194692],\"mapped\",[24061]],[[194693,194693],\"mapped\",[24104]],[[194694,194694],\"mapped\",[24125]],[[194695,194695],\"mapped\",[24169]],[[194696,194696],\"mapped\",[14434]],[[194697,194697],\"mapped\",[139651]],[[194698,194698],\"mapped\",[14460]],[[194699,194699],\"mapped\",[24240]],[[194700,194700],\"mapped\",[24243]],[[194701,194701],\"mapped\",[24246]],[[194702,194702],\"mapped\",[24266]],[[194703,194703],\"mapped\",[172946]],[[194704,194704],\"mapped\",[24318]],[[194705,194706],\"mapped\",[140081]],[[194707,194707],\"mapped\",[33281]],[[194708,194709],\"mapped\",[24354]],[[194710,194710],\"mapped\",[14535]],[[194711,194711],\"mapped\",[144056]],[[194712,194712],\"mapped\",[156122]],[[194713,194713],\"mapped\",[24418]],[[194714,194714],\"mapped\",[24427]],[[194715,194715],\"mapped\",[14563]],[[194716,194716],\"mapped\",[24474]],[[194717,194717],\"mapped\",[24525]],[[194718,194718],\"mapped\",[24535]],[[194719,194719],\"mapped\",[24569]],[[194720,194720],\"mapped\",[24705]],[[194721,194721],\"mapped\",[14650]],[[194722,194722],\"mapped\",[14620]],[[194723,194723],\"mapped\",[24724]],[[194724,194724],\"mapped\",[141012]],[[194725,194725],\"mapped\",[24775]],[[194726,194726],\"mapped\",[24904]],[[194727,194727],\"mapped\",[24908]],[[194728,194728],\"mapped\",[24910]],[[194729,194729],\"mapped\",[24908]],[[194730,194730],\"mapped\",[24954]],[[194731,194731],\"mapped\",[24974]],[[194732,194732],\"mapped\",[25010]],[[194733,194733],\"mapped\",[24996]],[[194734,194734],\"mapped\",[25007]],[[194735,194735],\"mapped\",[25054]],[[194736,194736],\"mapped\",[25074]],[[194737,194737],\"mapped\",[25078]],[[194738,194738],\"mapped\",[25104]],[[194739,194739],\"mapped\",[25115]],[[194740,194740],\"mapped\",[25181]],[[194741,194741],\"mapped\",[25265]],[[194742,194742],\"mapped\",[25300]],[[194743,194743],\"mapped\",[25424]],[[194744,194744],\"mapped\",[142092]],[[194745,194745],\"mapped\",[25405]],[[194746,194746],\"mapped\",[25340]],[[194747,194747],\"mapped\",[25448]],[[194748,194748],\"mapped\",[25475]],[[194749,194749],\"mapped\",[25572]],[[194750,194750],\"mapped\",[142321]],[[194751,194751],\"mapped\",[25634]],[[194752,194752],\"mapped\",[25541]],[[194753,194753],\"mapped\",[25513]],[[194754,194754],\"mapped\",[14894]],[[194755,194755],\"mapped\",[25705]],[[194756,194756],\"mapped\",[25726]],[[194757,194757],\"mapped\",[25757]],[[194758,194758],\"mapped\",[25719]],[[194759,194759],\"mapped\",[14956]],[[194760,194760],\"mapped\",[25935]],[[194761,194761],\"mapped\",[25964]],[[194762,194762],\"mapped\",[143370]],[[194763,194763],\"mapped\",[26083]],[[194764,194764],\"mapped\",[26360]],[[194765,194765],\"mapped\",[26185]],[[194766,194766],\"mapped\",[15129]],[[194767,194767],\"mapped\",[26257]],[[194768,194768],\"mapped\",[15112]],[[194769,194769],\"mapped\",[15076]],[[194770,194770],\"mapped\",[20882]],[[194771,194771],\"mapped\",[20885]],[[194772,194772],\"mapped\",[26368]],[[194773,194773],\"mapped\",[26268]],[[194774,194774],\"mapped\",[32941]],[[194775,194775],\"mapped\",[17369]],[[194776,194776],\"mapped\",[26391]],[[194777,194777],\"mapped\",[26395]],[[194778,194778],\"mapped\",[26401]],[[194779,194779],\"mapped\",[26462]],[[194780,194780],\"mapped\",[26451]],[[194781,194781],\"mapped\",[144323]],[[194782,194782],\"mapped\",[15177]],[[194783,194783],\"mapped\",[26618]],[[194784,194784],\"mapped\",[26501]],[[194785,194785],\"mapped\",[26706]],[[194786,194786],\"mapped\",[26757]],[[194787,194787],\"mapped\",[144493]],[[194788,194788],\"mapped\",[26766]],[[194789,194789],\"mapped\",[26655]],[[194790,194790],\"mapped\",[26900]],[[194791,194791],\"mapped\",[15261]],[[194792,194792],\"mapped\",[26946]],[[194793,194793],\"mapped\",[27043]],[[194794,194794],\"mapped\",[27114]],[[194795,194795],\"mapped\",[27304]],[[194796,194796],\"mapped\",[145059]],[[194797,194797],\"mapped\",[27355]],[[194798,194798],\"mapped\",[15384]],[[194799,194799],\"mapped\",[27425]],[[194800,194800],\"mapped\",[145575]],[[194801,194801],\"mapped\",[27476]],[[194802,194802],\"mapped\",[15438]],[[194803,194803],\"mapped\",[27506]],[[194804,194804],\"mapped\",[27551]],[[194805,194805],\"mapped\",[27578]],[[194806,194806],\"mapped\",[27579]],[[194807,194807],\"mapped\",[146061]],[[194808,194808],\"mapped\",[138507]],[[194809,194809],\"mapped\",[146170]],[[194810,194810],\"mapped\",[27726]],[[194811,194811],\"mapped\",[146620]],[[194812,194812],\"mapped\",[27839]],[[194813,194813],\"mapped\",[27853]],[[194814,194814],\"mapped\",[27751]],[[194815,194815],\"mapped\",[27926]],[[194816,194816],\"mapped\",[27966]],[[194817,194817],\"mapped\",[28023]],[[194818,194818],\"mapped\",[27969]],[[194819,194819],\"mapped\",[28009]],[[194820,194820],\"mapped\",[28024]],[[194821,194821],\"mapped\",[28037]],[[194822,194822],\"mapped\",[146718]],[[194823,194823],\"mapped\",[27956]],[[194824,194824],\"mapped\",[28207]],[[194825,194825],\"mapped\",[28270]],[[194826,194826],\"mapped\",[15667]],[[194827,194827],\"mapped\",[28363]],[[194828,194828],\"mapped\",[28359]],[[194829,194829],\"mapped\",[147153]],[[194830,194830],\"mapped\",[28153]],[[194831,194831],\"mapped\",[28526]],[[194832,194832],\"mapped\",[147294]],[[194833,194833],\"mapped\",[147342]],[[194834,194834],\"mapped\",[28614]],[[194835,194835],\"mapped\",[28729]],[[194836,194836],\"mapped\",[28702]],[[194837,194837],\"mapped\",[28699]],[[194838,194838],\"mapped\",[15766]],[[194839,194839],\"mapped\",[28746]],[[194840,194840],\"mapped\",[28797]],[[194841,194841],\"mapped\",[28791]],[[194842,194842],\"mapped\",[28845]],[[194843,194843],\"mapped\",[132389]],[[194844,194844],\"mapped\",[28997]],[[194845,194845],\"mapped\",[148067]],[[194846,194846],\"mapped\",[29084]],[[194847,194847],\"disallowed\"],[[194848,194848],\"mapped\",[29224]],[[194849,194849],\"mapped\",[29237]],[[194850,194850],\"mapped\",[29264]],[[194851,194851],\"mapped\",[149000]],[[194852,194852],\"mapped\",[29312]],[[194853,194853],\"mapped\",[29333]],[[194854,194854],\"mapped\",[149301]],[[194855,194855],\"mapped\",[149524]],[[194856,194856],\"mapped\",[29562]],[[194857,194857],\"mapped\",[29579]],[[194858,194858],\"mapped\",[16044]],[[194859,194859],\"mapped\",[29605]],[[194860,194861],\"mapped\",[16056]],[[194862,194862],\"mapped\",[29767]],[[194863,194863],\"mapped\",[29788]],[[194864,194864],\"mapped\",[29809]],[[194865,194865],\"mapped\",[29829]],[[194866,194866],\"mapped\",[29898]],[[194867,194867],\"mapped\",[16155]],[[194868,194868],\"mapped\",[29988]],[[194869,194869],\"mapped\",[150582]],[[194870,194870],\"mapped\",[30014]],[[194871,194871],\"mapped\",[150674]],[[194872,194872],\"mapped\",[30064]],[[194873,194873],\"mapped\",[139679]],[[194874,194874],\"mapped\",[30224]],[[194875,194875],\"mapped\",[151457]],[[194876,194876],\"mapped\",[151480]],[[194877,194877],\"mapped\",[151620]],[[194878,194878],\"mapped\",[16380]],[[194879,194879],\"mapped\",[16392]],[[194880,194880],\"mapped\",[30452]],[[194881,194881],\"mapped\",[151795]],[[194882,194882],\"mapped\",[151794]],[[194883,194883],\"mapped\",[151833]],[[194884,194884],\"mapped\",[151859]],[[194885,194885],\"mapped\",[30494]],[[194886,194887],\"mapped\",[30495]],[[194888,194888],\"mapped\",[30538]],[[194889,194889],\"mapped\",[16441]],[[194890,194890],\"mapped\",[30603]],[[194891,194891],\"mapped\",[16454]],[[194892,194892],\"mapped\",[16534]],[[194893,194893],\"mapped\",[152605]],[[194894,194894],\"mapped\",[30798]],[[194895,194895],\"mapped\",[30860]],[[194896,194896],\"mapped\",[30924]],[[194897,194897],\"mapped\",[16611]],[[194898,194898],\"mapped\",[153126]],[[194899,194899],\"mapped\",[31062]],[[194900,194900],\"mapped\",[153242]],[[194901,194901],\"mapped\",[153285]],[[194902,194902],\"mapped\",[31119]],[[194903,194903],\"mapped\",[31211]],[[194904,194904],\"mapped\",[16687]],[[194905,194905],\"mapped\",[31296]],[[194906,194906],\"mapped\",[31306]],[[194907,194907],\"mapped\",[31311]],[[194908,194908],\"mapped\",[153980]],[[194909,194910],\"mapped\",[154279]],[[194911,194911],\"disallowed\"],[[194912,194912],\"mapped\",[16898]],[[194913,194913],\"mapped\",[154539]],[[194914,194914],\"mapped\",[31686]],[[194915,194915],\"mapped\",[31689]],[[194916,194916],\"mapped\",[16935]],[[194917,194917],\"mapped\",[154752]],[[194918,194918],\"mapped\",[31954]],[[194919,194919],\"mapped\",[17056]],[[194920,194920],\"mapped\",[31976]],[[194921,194921],\"mapped\",[31971]],[[194922,194922],\"mapped\",[32000]],[[194923,194923],\"mapped\",[155526]],[[194924,194924],\"mapped\",[32099]],[[194925,194925],\"mapped\",[17153]],[[194926,194926],\"mapped\",[32199]],[[194927,194927],\"mapped\",[32258]],[[194928,194928],\"mapped\",[32325]],[[194929,194929],\"mapped\",[17204]],[[194930,194930],\"mapped\",[156200]],[[194931,194931],\"mapped\",[156231]],[[194932,194932],\"mapped\",[17241]],[[194933,194933],\"mapped\",[156377]],[[194934,194934],\"mapped\",[32634]],[[194935,194935],\"mapped\",[156478]],[[194936,194936],\"mapped\",[32661]],[[194937,194937],\"mapped\",[32762]],[[194938,194938],\"mapped\",[32773]],[[194939,194939],\"mapped\",[156890]],[[194940,194940],\"mapped\",[156963]],[[194941,194941],\"mapped\",[32864]],[[194942,194942],\"mapped\",[157096]],[[194943,194943],\"mapped\",[32880]],[[194944,194944],\"mapped\",[144223]],[[194945,194945],\"mapped\",[17365]],[[194946,194946],\"mapped\",[32946]],[[194947,194947],\"mapped\",[33027]],[[194948,194948],\"mapped\",[17419]],[[194949,194949],\"mapped\",[33086]],[[194950,194950],\"mapped\",[23221]],[[194951,194951],\"mapped\",[157607]],[[194952,194952],\"mapped\",[157621]],[[194953,194953],\"mapped\",[144275]],[[194954,194954],\"mapped\",[144284]],[[194955,194955],\"mapped\",[33281]],[[194956,194956],\"mapped\",[33284]],[[194957,194957],\"mapped\",[36766]],[[194958,194958],\"mapped\",[17515]],[[194959,194959],\"mapped\",[33425]],[[194960,194960],\"mapped\",[33419]],[[194961,194961],\"mapped\",[33437]],[[194962,194962],\"mapped\",[21171]],[[194963,194963],\"mapped\",[33457]],[[194964,194964],\"mapped\",[33459]],[[194965,194965],\"mapped\",[33469]],[[194966,194966],\"mapped\",[33510]],[[194967,194967],\"mapped\",[158524]],[[194968,194968],\"mapped\",[33509]],[[194969,194969],\"mapped\",[33565]],[[194970,194970],\"mapped\",[33635]],[[194971,194971],\"mapped\",[33709]],[[194972,194972],\"mapped\",[33571]],[[194973,194973],\"mapped\",[33725]],[[194974,194974],\"mapped\",[33767]],[[194975,194975],\"mapped\",[33879]],[[194976,194976],\"mapped\",[33619]],[[194977,194977],\"mapped\",[33738]],[[194978,194978],\"mapped\",[33740]],[[194979,194979],\"mapped\",[33756]],[[194980,194980],\"mapped\",[158774]],[[194981,194981],\"mapped\",[159083]],[[194982,194982],\"mapped\",[158933]],[[194983,194983],\"mapped\",[17707]],[[194984,194984],\"mapped\",[34033]],[[194985,194985],\"mapped\",[34035]],[[194986,194986],\"mapped\",[34070]],[[194987,194987],\"mapped\",[160714]],[[194988,194988],\"mapped\",[34148]],[[194989,194989],\"mapped\",[159532]],[[194990,194990],\"mapped\",[17757]],[[194991,194991],\"mapped\",[17761]],[[194992,194992],\"mapped\",[159665]],[[194993,194993],\"mapped\",[159954]],[[194994,194994],\"mapped\",[17771]],[[194995,194995],\"mapped\",[34384]],[[194996,194996],\"mapped\",[34396]],[[194997,194997],\"mapped\",[34407]],[[194998,194998],\"mapped\",[34409]],[[194999,194999],\"mapped\",[34473]],[[195000,195000],\"mapped\",[34440]],[[195001,195001],\"mapped\",[34574]],[[195002,195002],\"mapped\",[34530]],[[195003,195003],\"mapped\",[34681]],[[195004,195004],\"mapped\",[34600]],[[195005,195005],\"mapped\",[34667]],[[195006,195006],\"mapped\",[34694]],[[195007,195007],\"disallowed\"],[[195008,195008],\"mapped\",[34785]],[[195009,195009],\"mapped\",[34817]],[[195010,195010],\"mapped\",[17913]],[[195011,195011],\"mapped\",[34912]],[[195012,195012],\"mapped\",[34915]],[[195013,195013],\"mapped\",[161383]],[[195014,195014],\"mapped\",[35031]],[[195015,195015],\"mapped\",[35038]],[[195016,195016],\"mapped\",[17973]],[[195017,195017],\"mapped\",[35066]],[[195018,195018],\"mapped\",[13499]],[[195019,195019],\"mapped\",[161966]],[[195020,195020],\"mapped\",[162150]],[[195021,195021],\"mapped\",[18110]],[[195022,195022],\"mapped\",[18119]],[[195023,195023],\"mapped\",[35488]],[[195024,195024],\"mapped\",[35565]],[[195025,195025],\"mapped\",[35722]],[[195026,195026],\"mapped\",[35925]],[[195027,195027],\"mapped\",[162984]],[[195028,195028],\"mapped\",[36011]],[[195029,195029],\"mapped\",[36033]],[[195030,195030],\"mapped\",[36123]],[[195031,195031],\"mapped\",[36215]],[[195032,195032],\"mapped\",[163631]],[[195033,195033],\"mapped\",[133124]],[[195034,195034],\"mapped\",[36299]],[[195035,195035],\"mapped\",[36284]],[[195036,195036],\"mapped\",[36336]],[[195037,195037],\"mapped\",[133342]],[[195038,195038],\"mapped\",[36564]],[[195039,195039],\"mapped\",[36664]],[[195040,195040],\"mapped\",[165330]],[[195041,195041],\"mapped\",[165357]],[[195042,195042],\"mapped\",[37012]],[[195043,195043],\"mapped\",[37105]],[[195044,195044],\"mapped\",[37137]],[[195045,195045],\"mapped\",[165678]],[[195046,195046],\"mapped\",[37147]],[[195047,195047],\"mapped\",[37432]],[[195048,195048],\"mapped\",[37591]],[[195049,195049],\"mapped\",[37592]],[[195050,195050],\"mapped\",[37500]],[[195051,195051],\"mapped\",[37881]],[[195052,195052],\"mapped\",[37909]],[[195053,195053],\"mapped\",[166906]],[[195054,195054],\"mapped\",[38283]],[[195055,195055],\"mapped\",[18837]],[[195056,195056],\"mapped\",[38327]],[[195057,195057],\"mapped\",[167287]],[[195058,195058],\"mapped\",[18918]],[[195059,195059],\"mapped\",[38595]],[[195060,195060],\"mapped\",[23986]],[[195061,195061],\"mapped\",[38691]],[[195062,195062],\"mapped\",[168261]],[[195063,195063],\"mapped\",[168474]],[[195064,195064],\"mapped\",[19054]],[[195065,195065],\"mapped\",[19062]],[[195066,195066],\"mapped\",[38880]],[[195067,195067],\"mapped\",[168970]],[[195068,195068],\"mapped\",[19122]],[[195069,195069],\"mapped\",[169110]],[[195070,195071],\"mapped\",[38923]],[[195072,195072],\"mapped\",[38953]],[[195073,195073],\"mapped\",[169398]],[[195074,195074],\"mapped\",[39138]],[[195075,195075],\"mapped\",[19251]],[[195076,195076],\"mapped\",[39209]],[[195077,195077],\"mapped\",[39335]],[[195078,195078],\"mapped\",[39362]],[[195079,195079],\"mapped\",[39422]],[[195080,195080],\"mapped\",[19406]],[[195081,195081],\"mapped\",[170800]],[[195082,195082],\"mapped\",[39698]],[[195083,195083],\"mapped\",[40000]],[[195084,195084],\"mapped\",[40189]],[[195085,195085],\"mapped\",[19662]],[[195086,195086],\"mapped\",[19693]],[[195087,195087],\"mapped\",[40295]],[[195088,195088],\"mapped\",[172238]],[[195089,195089],\"mapped\",[19704]],[[195090,195090],\"mapped\",[172293]],[[195091,195091],\"mapped\",[172558]],[[195092,195092],\"mapped\",[172689]],[[195093,195093],\"mapped\",[40635]],[[195094,195094],\"mapped\",[19798]],[[195095,195095],\"mapped\",[40697]],[[195096,195096],\"mapped\",[40702]],[[195097,195097],\"mapped\",[40709]],[[195098,195098],\"mapped\",[40719]],[[195099,195099],\"mapped\",[40726]],[[195100,195100],\"mapped\",[40763]],[[195101,195101],\"mapped\",[173568]],[[195102,196605],\"disallowed\"],[[196606,196607],\"disallowed\"],[[196608,262141],\"disallowed\"],[[262142,262143],\"disallowed\"],[[262144,327677],\"disallowed\"],[[327678,327679],\"disallowed\"],[[327680,393213],\"disallowed\"],[[393214,393215],\"disallowed\"],[[393216,458749],\"disallowed\"],[[458750,458751],\"disallowed\"],[[458752,524285],\"disallowed\"],[[524286,524287],\"disallowed\"],[[524288,589821],\"disallowed\"],[[589822,589823],\"disallowed\"],[[589824,655357],\"disallowed\"],[[655358,655359],\"disallowed\"],[[655360,720893],\"disallowed\"],[[720894,720895],\"disallowed\"],[[720896,786429],\"disallowed\"],[[786430,786431],\"disallowed\"],[[786432,851965],\"disallowed\"],[[851966,851967],\"disallowed\"],[[851968,917501],\"disallowed\"],[[917502,917503],\"disallowed\"],[[917504,917504],\"disallowed\"],[[917505,917505],\"disallowed\"],[[917506,917535],\"disallowed\"],[[917536,917631],\"disallowed\"],[[917632,917759],\"disallowed\"],[[917760,917999],\"ignored\"],[[918000,983037],\"disallowed\"],[[983038,983039],\"disallowed\"],[[983040,1048573],\"disallowed\"],[[1048574,1048575],\"disallowed\"],[[1048576,1114109],\"disallowed\"],[[1114110,1114111],\"disallowed\"]]");
})), Yn = /* @__PURE__ */ A(((e, t) => {
	var n = F("punycode"), r = (Jn(), P(Kn).default), i = {
		TRANSITIONAL: 0,
		NONTRANSITIONAL: 1
	};
	function a(e) {
		return e.split("\0").map(function(e) {
			return e.normalize("NFC");
		}).join("\0");
	}
	function o(e) {
		for (var t = 0, n = r.length - 1; t <= n;) {
			var i = Math.floor((t + n) / 2), a = r[i];
			if (a[0][0] <= e && a[0][1] >= e) return a;
			a[0][0] > e ? n = i - 1 : t = i + 1;
		}
		return null;
	}
	var s = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
	function c(e) {
		return e.replace(s, "_").length;
	}
	function l(e, t, n) {
		for (var r = !1, a = "", s = c(e), l = 0; l < s; ++l) {
			var u = e.codePointAt(l), d = o(u);
			switch (d[1]) {
				case "disallowed":
					r = !0, a += String.fromCodePoint(u);
					break;
				case "ignored": break;
				case "mapped":
					a += String.fromCodePoint.apply(String, d[2]);
					break;
				case "deviation":
					n === i.TRANSITIONAL ? a += String.fromCodePoint.apply(String, d[2]) : a += String.fromCodePoint(u);
					break;
				case "valid":
					a += String.fromCodePoint(u);
					break;
				case "disallowed_STD3_mapped":
					t ? (r = !0, a += String.fromCodePoint(u)) : a += String.fromCodePoint.apply(String, d[2]);
					break;
				case "disallowed_STD3_valid":
					t && (r = !0), a += String.fromCodePoint(u);
					break;
			}
		}
		return {
			string: a,
			error: r
		};
	}
	var u = /[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08E4-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B62\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0D01-\u0D03\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D82\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u192B\u1930-\u193B\u19B0-\u19C0\u19C8\u19C9\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF8\u1CF9\u1DC0-\u1DF5\u1DFC-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880\uA881\uA8B4-\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2D]|\uD800[\uDDFD\uDEE0\uDF76-\uDF7A]|\uD802[\uDE01-\uDE03\uDE05\uDE06\uDE0C-\uDE0F\uDE38-\uDE3A\uDE3F\uDEE5\uDEE6]|\uD804[\uDC00-\uDC02\uDC38-\uDC46\uDC7F-\uDC82\uDCB0-\uDCBA\uDD00-\uDD02\uDD27-\uDD34\uDD73\uDD80-\uDD82\uDDB3-\uDDC0\uDE2C-\uDE37\uDEDF-\uDEEA\uDF01-\uDF03\uDF3C\uDF3E-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF57\uDF62\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDCB0-\uDCC3\uDDAF-\uDDB5\uDDB8-\uDDC0\uDE30-\uDE40\uDEAB-\uDEB7]|\uD81A[\uDEF0-\uDEF4\uDF30-\uDF36]|\uD81B[\uDF51-\uDF7E\uDF8F-\uDF92]|\uD82F[\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD83A[\uDCD0-\uDCD6]|\uDB40[\uDD00-\uDDEF]/;
	function d(e, t) {
		e.substr(0, 4) === "xn--" && (e = n.toUnicode(e), t = i.NONTRANSITIONAL);
		var r = !1;
		(a(e) !== e || e[3] === "-" && e[4] === "-" || e[0] === "-" || e[e.length - 1] === "-" || e.indexOf(".") !== -1 || e.search(u) === 0) && (r = !0);
		for (var s = c(e), l = 0; l < s; ++l) {
			var d = o(e.codePointAt(l));
			if (f === i.TRANSITIONAL && d[1] !== "valid" || f === i.NONTRANSITIONAL && d[1] !== "valid" && d[1] !== "deviation") {
				r = !0;
				break;
			}
		}
		return {
			label: e,
			error: r
		};
	}
	function f(e, t, n) {
		var r = l(e, t, n);
		r.string = a(r.string);
		for (var i = r.string.split("."), o = 0; o < i.length; ++o) try {
			var s = d(i[o]);
			i[o] = s.label, r.error = r.error || s.error;
		} catch {
			r.error = !0;
		}
		return {
			string: i.join("."),
			error: r.error
		};
	}
	t.exports.toASCII = function(e, t, r, i) {
		var a = f(e, t, r), o = a.string.split(".");
		if (o = o.map(function(e) {
			try {
				return n.toASCII(e);
			} catch {
				return a.error = !0, e;
			}
		}), i) {
			var s = o.slice(0, o.length - 1).join(".").length;
			(s.length > 253 || s.length === 0) && (a.error = !0);
			for (var c = 0; c < o.length; ++c) if (o.length > 63 || o.length === 0) {
				a.error = !0;
				break;
			}
		}
		return a.error ? null : o.join(".");
	}, t.exports.toUnicode = function(e, t) {
		var n = f(e, t, i.NONTRANSITIONAL);
		return {
			domain: n.string,
			error: n.error
		};
	}, t.exports.PROCESSING_OPTIONS = i;
})), Xn = /* @__PURE__ */ A(((e, t) => {
	var n = F("punycode"), r = Yn(), i = {
		ftp: 21,
		file: null,
		gopher: 70,
		http: 80,
		https: 443,
		ws: 80,
		wss: 443
	}, a = Symbol("failure");
	function o(e) {
		return n.ucs2.decode(e).length;
	}
	function s(e, t) {
		let n = e[t];
		return isNaN(n) ? void 0 : String.fromCodePoint(n);
	}
	function c(e) {
		return e >= 48 && e <= 57;
	}
	function l(e) {
		return e >= 65 && e <= 90 || e >= 97 && e <= 122;
	}
	function u(e) {
		return l(e) || c(e);
	}
	function d(e) {
		return c(e) || e >= 65 && e <= 70 || e >= 97 && e <= 102;
	}
	function f(e) {
		return e === "." || e.toLowerCase() === "%2e";
	}
	function p(e) {
		return e = e.toLowerCase(), e === ".." || e === "%2e." || e === ".%2e" || e === "%2e%2e";
	}
	function m(e, t) {
		return l(e) && (t === 58 || t === 124);
	}
	function h(e) {
		return e.length === 2 && l(e.codePointAt(0)) && (e[1] === ":" || e[1] === "|");
	}
	function g(e) {
		return e.length === 2 && l(e.codePointAt(0)) && e[1] === ":";
	}
	function _(e) {
		return e.search(/\u0000|\u0009|\u000A|\u000D|\u0020|#|%|\/|:|\?|@|\[|\\|\]/) !== -1;
	}
	function v(e) {
		return e.search(/\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|\?|@|\[|\\|\]/) !== -1;
	}
	function y(e) {
		return i[e] !== void 0;
	}
	function b(e) {
		return y(e.scheme);
	}
	function x(e) {
		return i[e];
	}
	function S(e) {
		let t = e.toString(16).toUpperCase();
		return t.length === 1 && (t = "0" + t), "%" + t;
	}
	function C(e) {
		let t = new Buffer(e), n = "";
		for (let e = 0; e < t.length; ++e) n += S(t[e]);
		return n;
	}
	function w(e) {
		let t = new Buffer(e), n = [];
		for (let e = 0; e < t.length; ++e) t[e] === 37 && t[e] === 37 && d(t[e + 1]) && d(t[e + 2]) ? (n.push(parseInt(t.slice(e + 1, e + 3).toString(), 16)), e += 2) : n.push(t[e]);
		return new Buffer(n).toString();
	}
	function T(e) {
		return e <= 31 || e > 126;
	}
	var E = new Set([
		32,
		34,
		35,
		60,
		62,
		63,
		96,
		123,
		125
	]);
	function D(e) {
		return T(e) || E.has(e);
	}
	var O = new Set([
		47,
		58,
		59,
		61,
		64,
		91,
		92,
		93,
		94,
		124
	]);
	function k(e) {
		return D(e) || O.has(e);
	}
	function A(e, t) {
		let n = String.fromCodePoint(e);
		return t(e) ? C(n) : n;
	}
	function j(e) {
		let t = 10;
		return e.length >= 2 && e.charAt(0) === "0" && e.charAt(1).toLowerCase() === "x" ? (e = e.substring(2), t = 16) : e.length >= 2 && e.charAt(0) === "0" && (e = e.substring(1), t = 8), e === "" ? 0 : (t === 10 ? /[^0-9]/ : t === 16 ? /[^0-9A-Fa-f]/ : /[^0-7]/).test(e) ? a : parseInt(e, t);
	}
	function M(e) {
		let t = e.split(".");
		if (t[t.length - 1] === "" && t.length > 1 && t.pop(), t.length > 4) return e;
		let n = [];
		for (let r of t) {
			if (r === "") return e;
			let t = j(r);
			if (t === a) return e;
			n.push(t);
		}
		for (let e = 0; e < n.length - 1; ++e) if (n[e] > 255) return a;
		if (n[n.length - 1] >= 256 ** (5 - n.length)) return a;
		let r = n.pop(), i = 0;
		for (let e of n) r += e * 256 ** (3 - i), ++i;
		return r;
	}
	function N(e) {
		let t = "", n = e;
		for (let e = 1; e <= 4; ++e) t = String(n % 256) + t, e !== 4 && (t = "." + t), n = Math.floor(n / 256);
		return t;
	}
	function P(e) {
		let t = [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		], r = 0, i = null, o = 0;
		if (e = n.ucs2.decode(e), e[o] === 58) {
			if (e[o + 1] !== 58) return a;
			o += 2, ++r, i = r;
		}
		for (; o < e.length;) {
			if (r === 8) return a;
			if (e[o] === 58) {
				if (i !== null) return a;
				++o, ++r, i = r;
				continue;
			}
			let n = 0, l = 0;
			for (; l < 4 && d(e[o]);) n = n * 16 + parseInt(s(e, o), 16), ++o, ++l;
			if (e[o] === 46) {
				if (l === 0 || (o -= l, r > 6)) return a;
				let n = 0;
				for (; e[o] !== void 0;) {
					let i = null;
					if (n > 0) if (e[o] === 46 && n < 4) ++o;
					else return a;
					if (!c(e[o])) return a;
					for (; c(e[o]);) {
						let t = parseInt(s(e, o));
						if (i === null) i = t;
						else if (i === 0) return a;
						else i = i * 10 + t;
						if (i > 255) return a;
						++o;
					}
					t[r] = t[r] * 256 + i, ++n, (n === 2 || n === 4) && ++r;
				}
				if (n !== 4) return a;
				break;
			} else if (e[o] === 58) {
				if (++o, e[o] === void 0) return a;
			} else if (e[o] !== void 0) return a;
			t[r] = n, ++r;
		}
		if (i !== null) {
			let e = r - i;
			for (r = 7; r !== 0 && e > 0;) {
				let n = t[i + e - 1];
				t[i + e - 1] = t[r], t[r] = n, --r, --e;
			}
		} else if (i === null && r !== 8) return a;
		return t;
	}
	function I(e) {
		let t = "", n = te(e).idx, r = !1;
		for (let i = 0; i <= 7; ++i) if (!(r && e[i] === 0)) {
			if (r &&= !1, n === i) {
				t += i === 0 ? "::" : ":", r = !0;
				continue;
			}
			t += e[i].toString(16), i !== 7 && (t += ":");
		}
		return t;
	}
	function ee(e, t) {
		if (e[0] === "[") return e[e.length - 1] === "]" ? P(e.substring(1, e.length - 1)) : a;
		if (!t) return L(e);
		let n = w(e), i = r.toASCII(n, !1, r.PROCESSING_OPTIONS.NONTRANSITIONAL, !1);
		if (i === null || _(i)) return a;
		let o = M(i);
		return typeof o == "number" || o === a ? o : i;
	}
	function L(e) {
		if (v(e)) return a;
		let t = "", r = n.ucs2.decode(e);
		for (let e = 0; e < r.length; ++e) t += A(r[e], T);
		return t;
	}
	function te(e) {
		let t = null, n = 1, r = null, i = 0;
		for (let a = 0; a < e.length; ++a) e[a] === 0 ? (r === null && (r = a), ++i) : (i > n && (t = r, n = i), r = null, i = 0);
		return i > n && (t = r, n = i), {
			idx: t,
			len: n
		};
	}
	function R(e) {
		return typeof e == "number" ? N(e) : e instanceof Array ? "[" + I(e) + "]" : e;
	}
	function z(e) {
		return e.replace(/^[\u0000-\u001F\u0020]+|[\u0000-\u001F\u0020]+$/g, "");
	}
	function B(e) {
		return e.replace(/\u0009|\u000A|\u000D/g, "");
	}
	function V(e) {
		let t = e.path;
		t.length !== 0 && (e.scheme === "file" && t.length === 1 && W(t[0]) || t.pop());
	}
	function H(e) {
		return e.username !== "" || e.password !== "";
	}
	function U(e) {
		return e.host === null || e.host === "" || e.cannotBeABaseURL || e.scheme === "file";
	}
	function W(e) {
		return /^[A-Za-z]:$/.test(e);
	}
	function G(e, t, r, i, o) {
		if (this.pointer = 0, this.input = e, this.base = t || null, this.encodingOverride = r || "utf-8", this.stateOverride = o, this.url = i, this.failure = !1, this.parseError = !1, !this.url) {
			this.url = {
				scheme: "",
				username: "",
				password: "",
				host: null,
				port: null,
				path: [],
				query: null,
				fragment: null,
				cannotBeABaseURL: !1
			};
			let e = z(this.input);
			e !== this.input && (this.parseError = !0), this.input = e;
		}
		let s = B(this.input);
		for (s !== this.input && (this.parseError = !0), this.input = s, this.state = o || "scheme start", this.buffer = "", this.atFlag = !1, this.arrFlag = !1, this.passwordTokenSeenFlag = !1, this.input = n.ucs2.decode(this.input); this.pointer <= this.input.length; ++this.pointer) {
			let e = this.input[this.pointer], t = isNaN(e) ? void 0 : String.fromCodePoint(e), n = this["parse " + this.state](e, t);
			if (!n) break;
			if (n === a) {
				this.failure = !0;
				break;
			}
		}
	}
	G.prototype["parse scheme start"] = function(e, t) {
		if (l(e)) this.buffer += t.toLowerCase(), this.state = "scheme";
		else if (!this.stateOverride) this.state = "no scheme", --this.pointer;
		else return this.parseError = !0, a;
		return !0;
	}, G.prototype["parse scheme"] = function(e, t) {
		if (u(e) || e === 43 || e === 45 || e === 46) this.buffer += t.toLowerCase();
		else if (e === 58) {
			if (this.stateOverride && (b(this.url) && !y(this.buffer) || !b(this.url) && y(this.buffer) || (H(this.url) || this.url.port !== null) && this.buffer === "file" || this.url.scheme === "file" && (this.url.host === "" || this.url.host === null)) || (this.url.scheme = this.buffer, this.buffer = "", this.stateOverride)) return !1;
			this.url.scheme === "file" ? ((this.input[this.pointer + 1] !== 47 || this.input[this.pointer + 2] !== 47) && (this.parseError = !0), this.state = "file") : b(this.url) && this.base !== null && this.base.scheme === this.url.scheme ? this.state = "special relative or authority" : b(this.url) ? this.state = "special authority slashes" : this.input[this.pointer + 1] === 47 ? (this.state = "path or authority", ++this.pointer) : (this.url.cannotBeABaseURL = !0, this.url.path.push(""), this.state = "cannot-be-a-base-URL path");
		} else if (!this.stateOverride) this.buffer = "", this.state = "no scheme", this.pointer = -1;
		else return this.parseError = !0, a;
		return !0;
	}, G.prototype["parse no scheme"] = function(e) {
		return this.base === null || this.base.cannotBeABaseURL && e !== 35 ? a : (this.base.cannotBeABaseURL && e === 35 ? (this.url.scheme = this.base.scheme, this.url.path = this.base.path.slice(), this.url.query = this.base.query, this.url.fragment = "", this.url.cannotBeABaseURL = !0, this.state = "fragment") : this.base.scheme === "file" ? (this.state = "file", --this.pointer) : (this.state = "relative", --this.pointer), !0);
	}, G.prototype["parse special relative or authority"] = function(e) {
		return e === 47 && this.input[this.pointer + 1] === 47 ? (this.state = "special authority ignore slashes", ++this.pointer) : (this.parseError = !0, this.state = "relative", --this.pointer), !0;
	}, G.prototype["parse path or authority"] = function(e) {
		return e === 47 ? this.state = "authority" : (this.state = "path", --this.pointer), !0;
	}, G.prototype["parse relative"] = function(e) {
		return this.url.scheme = this.base.scheme, isNaN(e) ? (this.url.username = this.base.username, this.url.password = this.base.password, this.url.host = this.base.host, this.url.port = this.base.port, this.url.path = this.base.path.slice(), this.url.query = this.base.query) : e === 47 ? this.state = "relative slash" : e === 63 ? (this.url.username = this.base.username, this.url.password = this.base.password, this.url.host = this.base.host, this.url.port = this.base.port, this.url.path = this.base.path.slice(), this.url.query = "", this.state = "query") : e === 35 ? (this.url.username = this.base.username, this.url.password = this.base.password, this.url.host = this.base.host, this.url.port = this.base.port, this.url.path = this.base.path.slice(), this.url.query = this.base.query, this.url.fragment = "", this.state = "fragment") : b(this.url) && e === 92 ? (this.parseError = !0, this.state = "relative slash") : (this.url.username = this.base.username, this.url.password = this.base.password, this.url.host = this.base.host, this.url.port = this.base.port, this.url.path = this.base.path.slice(0, this.base.path.length - 1), this.state = "path", --this.pointer), !0;
	}, G.prototype["parse relative slash"] = function(e) {
		return b(this.url) && (e === 47 || e === 92) ? (e === 92 && (this.parseError = !0), this.state = "special authority ignore slashes") : e === 47 ? this.state = "authority" : (this.url.username = this.base.username, this.url.password = this.base.password, this.url.host = this.base.host, this.url.port = this.base.port, this.state = "path", --this.pointer), !0;
	}, G.prototype["parse special authority slashes"] = function(e) {
		return e === 47 && this.input[this.pointer + 1] === 47 ? (this.state = "special authority ignore slashes", ++this.pointer) : (this.parseError = !0, this.state = "special authority ignore slashes", --this.pointer), !0;
	}, G.prototype["parse special authority ignore slashes"] = function(e) {
		return e !== 47 && e !== 92 ? (this.state = "authority", --this.pointer) : this.parseError = !0, !0;
	}, G.prototype["parse authority"] = function(e, t) {
		if (e === 64) {
			this.parseError = !0, this.atFlag && (this.buffer = "%40" + this.buffer), this.atFlag = !0;
			let e = o(this.buffer);
			for (let t = 0; t < e; ++t) {
				let e = this.buffer.codePointAt(t);
				if (e === 58 && !this.passwordTokenSeenFlag) {
					this.passwordTokenSeenFlag = !0;
					continue;
				}
				let n = A(e, k);
				this.passwordTokenSeenFlag ? this.url.password += n : this.url.username += n;
			}
			this.buffer = "";
		} else if (isNaN(e) || e === 47 || e === 63 || e === 35 || b(this.url) && e === 92) {
			if (this.atFlag && this.buffer === "") return this.parseError = !0, a;
			this.pointer -= o(this.buffer) + 1, this.buffer = "", this.state = "host";
		} else this.buffer += t;
		return !0;
	}, G.prototype["parse hostname"] = G.prototype["parse host"] = function(e, t) {
		if (this.stateOverride && this.url.scheme === "file") --this.pointer, this.state = "file host";
		else if (e === 58 && !this.arrFlag) {
			if (this.buffer === "") return this.parseError = !0, a;
			let e = ee(this.buffer, b(this.url));
			if (e === a) return a;
			if (this.url.host = e, this.buffer = "", this.state = "port", this.stateOverride === "hostname") return !1;
		} else if (isNaN(e) || e === 47 || e === 63 || e === 35 || b(this.url) && e === 92) {
			if (--this.pointer, b(this.url) && this.buffer === "") return this.parseError = !0, a;
			if (this.stateOverride && this.buffer === "" && (H(this.url) || this.url.port !== null)) return this.parseError = !0, !1;
			let e = ee(this.buffer, b(this.url));
			if (e === a) return a;
			if (this.url.host = e, this.buffer = "", this.state = "path start", this.stateOverride) return !1;
		} else e === 91 ? this.arrFlag = !0 : e === 93 && (this.arrFlag = !1), this.buffer += t;
		return !0;
	}, G.prototype["parse port"] = function(e, t) {
		if (c(e)) this.buffer += t;
		else if (isNaN(e) || e === 47 || e === 63 || e === 35 || b(this.url) && e === 92 || this.stateOverride) {
			if (this.buffer !== "") {
				let e = parseInt(this.buffer);
				if (e > 2 ** 16 - 1) return this.parseError = !0, a;
				this.url.port = e === x(this.url.scheme) ? null : e, this.buffer = "";
			}
			if (this.stateOverride) return !1;
			this.state = "path start", --this.pointer;
		} else return this.parseError = !0, a;
		return !0;
	};
	var ne = new Set([
		47,
		92,
		63,
		35
	]);
	G.prototype["parse file"] = function(e) {
		return this.url.scheme = "file", e === 47 || e === 92 ? (e === 92 && (this.parseError = !0), this.state = "file slash") : this.base !== null && this.base.scheme === "file" ? isNaN(e) ? (this.url.host = this.base.host, this.url.path = this.base.path.slice(), this.url.query = this.base.query) : e === 63 ? (this.url.host = this.base.host, this.url.path = this.base.path.slice(), this.url.query = "", this.state = "query") : e === 35 ? (this.url.host = this.base.host, this.url.path = this.base.path.slice(), this.url.query = this.base.query, this.url.fragment = "", this.state = "fragment") : (this.input.length - this.pointer - 1 == 0 || !m(e, this.input[this.pointer + 1]) || this.input.length - this.pointer - 1 >= 2 && !ne.has(this.input[this.pointer + 2]) ? (this.url.host = this.base.host, this.url.path = this.base.path.slice(), V(this.url)) : this.parseError = !0, this.state = "path", --this.pointer) : (this.state = "path", --this.pointer), !0;
	}, G.prototype["parse file slash"] = function(e) {
		return e === 47 || e === 92 ? (e === 92 && (this.parseError = !0), this.state = "file host") : (this.base !== null && this.base.scheme === "file" && (g(this.base.path[0]) ? this.url.path.push(this.base.path[0]) : this.url.host = this.base.host), this.state = "path", --this.pointer), !0;
	}, G.prototype["parse file host"] = function(e, t) {
		if (isNaN(e) || e === 47 || e === 92 || e === 63 || e === 35) if (--this.pointer, !this.stateOverride && h(this.buffer)) this.parseError = !0, this.state = "path";
		else if (this.buffer === "") {
			if (this.url.host = "", this.stateOverride) return !1;
			this.state = "path start";
		} else {
			let e = ee(this.buffer, b(this.url));
			if (e === a) return a;
			if (e === "localhost" && (e = ""), this.url.host = e, this.stateOverride) return !1;
			this.buffer = "", this.state = "path start";
		}
		else this.buffer += t;
		return !0;
	}, G.prototype["parse path start"] = function(e) {
		return b(this.url) ? (e === 92 && (this.parseError = !0), this.state = "path", e !== 47 && e !== 92 && --this.pointer) : !this.stateOverride && e === 63 ? (this.url.query = "", this.state = "query") : !this.stateOverride && e === 35 ? (this.url.fragment = "", this.state = "fragment") : e !== void 0 && (this.state = "path", e !== 47 && --this.pointer), !0;
	}, G.prototype["parse path"] = function(e) {
		if (isNaN(e) || e === 47 || b(this.url) && e === 92 || !this.stateOverride && (e === 63 || e === 35)) {
			if (b(this.url) && e === 92 && (this.parseError = !0), p(this.buffer) ? (V(this.url), e !== 47 && !(b(this.url) && e === 92) && this.url.path.push("")) : f(this.buffer) && e !== 47 && !(b(this.url) && e === 92) ? this.url.path.push("") : f(this.buffer) || (this.url.scheme === "file" && this.url.path.length === 0 && h(this.buffer) && (this.url.host !== "" && this.url.host !== null && (this.parseError = !0, this.url.host = ""), this.buffer = this.buffer[0] + ":"), this.url.path.push(this.buffer)), this.buffer = "", this.url.scheme === "file" && (e === void 0 || e === 63 || e === 35)) for (; this.url.path.length > 1 && this.url.path[0] === "";) this.parseError = !0, this.url.path.shift();
			e === 63 && (this.url.query = "", this.state = "query"), e === 35 && (this.url.fragment = "", this.state = "fragment");
		} else e === 37 && (!d(this.input[this.pointer + 1]) || !d(this.input[this.pointer + 2])) && (this.parseError = !0), this.buffer += A(e, D);
		return !0;
	}, G.prototype["parse cannot-be-a-base-URL path"] = function(e) {
		return e === 63 ? (this.url.query = "", this.state = "query") : e === 35 ? (this.url.fragment = "", this.state = "fragment") : (!isNaN(e) && e !== 37 && (this.parseError = !0), e === 37 && (!d(this.input[this.pointer + 1]) || !d(this.input[this.pointer + 2])) && (this.parseError = !0), isNaN(e) || (this.url.path[0] = this.url.path[0] + A(e, T))), !0;
	}, G.prototype["parse query"] = function(e, t) {
		if (isNaN(e) || !this.stateOverride && e === 35) {
			(!b(this.url) || this.url.scheme === "ws" || this.url.scheme === "wss") && (this.encodingOverride = "utf-8");
			let t = new Buffer(this.buffer);
			for (let e = 0; e < t.length; ++e) t[e] < 33 || t[e] > 126 || t[e] === 34 || t[e] === 35 || t[e] === 60 || t[e] === 62 ? this.url.query += S(t[e]) : this.url.query += String.fromCodePoint(t[e]);
			this.buffer = "", e === 35 && (this.url.fragment = "", this.state = "fragment");
		} else e === 37 && (!d(this.input[this.pointer + 1]) || !d(this.input[this.pointer + 2])) && (this.parseError = !0), this.buffer += t;
		return !0;
	}, G.prototype["parse fragment"] = function(e) {
		return isNaN(e) || (e === 0 ? this.parseError = !0 : (e === 37 && (!d(this.input[this.pointer + 1]) || !d(this.input[this.pointer + 2])) && (this.parseError = !0), this.url.fragment += A(e, T))), !0;
	};
	function re(e, t) {
		let n = e.scheme + ":";
		if (e.host === null ? e.host === null && e.scheme === "file" && (n += "//") : (n += "//", (e.username !== "" || e.password !== "") && (n += e.username, e.password !== "" && (n += ":" + e.password), n += "@"), n += R(e.host), e.port !== null && (n += ":" + e.port)), e.cannotBeABaseURL) n += e.path[0];
		else for (let t of e.path) n += "/" + t;
		return e.query !== null && (n += "?" + e.query), !t && e.fragment !== null && (n += "#" + e.fragment), n;
	}
	function ie(e) {
		let t = e.scheme + "://";
		return t += R(e.host), e.port !== null && (t += ":" + e.port), t;
	}
	t.exports.serializeURL = re, t.exports.serializeURLOrigin = function(e) {
		switch (e.scheme) {
			case "blob": try {
				return t.exports.serializeURLOrigin(t.exports.parseURL(e.path[0]));
			} catch {
				return "null";
			}
			case "ftp":
			case "gopher":
			case "http":
			case "https":
			case "ws":
			case "wss": return ie({
				scheme: e.scheme,
				host: e.host,
				port: e.port
			});
			case "file": return "file://";
			default: return "null";
		}
	}, t.exports.basicURLParse = function(e, t) {
		t === void 0 && (t = {});
		let n = new G(e, t.baseURL, t.encodingOverride, t.url, t.stateOverride);
		return n.failure ? "failure" : n.url;
	}, t.exports.setTheUsername = function(e, t) {
		e.username = "";
		let r = n.ucs2.decode(t);
		for (let t = 0; t < r.length; ++t) e.username += A(r[t], k);
	}, t.exports.setThePassword = function(e, t) {
		e.password = "";
		let r = n.ucs2.decode(t);
		for (let t = 0; t < r.length; ++t) e.password += A(r[t], k);
	}, t.exports.serializeHost = R, t.exports.cannotHaveAUsernamePasswordPort = U, t.exports.serializeInteger = function(e) {
		return String(e);
	}, t.exports.parseURL = function(e, n) {
		return n === void 0 && (n = {}), t.exports.basicURLParse(e, {
			baseURL: n.baseURL,
			encodingOverride: n.encodingOverride
		});
	};
})), Zn = /* @__PURE__ */ A(((e) => {
	var t = Xn();
	e.implementation = class {
		constructor(e) {
			let n = e[0], r = e[1], i = null;
			if (r !== void 0 && (i = t.basicURLParse(r), i === "failure")) throw TypeError("Invalid base URL");
			let a = t.basicURLParse(n, { baseURL: i });
			if (a === "failure") throw TypeError("Invalid URL");
			this._url = a;
		}
		get href() {
			return t.serializeURL(this._url);
		}
		set href(e) {
			let n = t.basicURLParse(e);
			if (n === "failure") throw TypeError("Invalid URL");
			this._url = n;
		}
		get origin() {
			return t.serializeURLOrigin(this._url);
		}
		get protocol() {
			return this._url.scheme + ":";
		}
		set protocol(e) {
			t.basicURLParse(e + ":", {
				url: this._url,
				stateOverride: "scheme start"
			});
		}
		get username() {
			return this._url.username;
		}
		set username(e) {
			t.cannotHaveAUsernamePasswordPort(this._url) || t.setTheUsername(this._url, e);
		}
		get password() {
			return this._url.password;
		}
		set password(e) {
			t.cannotHaveAUsernamePasswordPort(this._url) || t.setThePassword(this._url, e);
		}
		get host() {
			let e = this._url;
			return e.host === null ? "" : e.port === null ? t.serializeHost(e.host) : t.serializeHost(e.host) + ":" + t.serializeInteger(e.port);
		}
		set host(e) {
			this._url.cannotBeABaseURL || t.basicURLParse(e, {
				url: this._url,
				stateOverride: "host"
			});
		}
		get hostname() {
			return this._url.host === null ? "" : t.serializeHost(this._url.host);
		}
		set hostname(e) {
			this._url.cannotBeABaseURL || t.basicURLParse(e, {
				url: this._url,
				stateOverride: "hostname"
			});
		}
		get port() {
			return this._url.port === null ? "" : t.serializeInteger(this._url.port);
		}
		set port(e) {
			t.cannotHaveAUsernamePasswordPort(this._url) || (e === "" ? this._url.port = null : t.basicURLParse(e, {
				url: this._url,
				stateOverride: "port"
			}));
		}
		get pathname() {
			return this._url.cannotBeABaseURL ? this._url.path[0] : this._url.path.length === 0 ? "" : "/" + this._url.path.join("/");
		}
		set pathname(e) {
			this._url.cannotBeABaseURL || (this._url.path = [], t.basicURLParse(e, {
				url: this._url,
				stateOverride: "path start"
			}));
		}
		get search() {
			return this._url.query === null || this._url.query === "" ? "" : "?" + this._url.query;
		}
		set search(e) {
			let n = this._url;
			if (e === "") {
				n.query = null;
				return;
			}
			let r = e[0] === "?" ? e.substring(1) : e;
			n.query = "", t.basicURLParse(r, {
				url: n,
				stateOverride: "query"
			});
		}
		get hash() {
			return this._url.fragment === null || this._url.fragment === "" ? "" : "#" + this._url.fragment;
		}
		set hash(e) {
			if (e === "") {
				this._url.fragment = null;
				return;
			}
			let n = e[0] === "#" ? e.substring(1) : e;
			this._url.fragment = "", t.basicURLParse(n, {
				url: this._url,
				stateOverride: "fragment"
			});
		}
		toJSON() {
			return this.href;
		}
	};
})), Qn = /* @__PURE__ */ A(((e, t) => {
	var n = Wn(), r = Gn(), i = Zn(), a = r.implSymbol;
	function o(e) {
		if (!this || this[a] || !(this instanceof o)) throw TypeError("Failed to construct 'URL': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
		if (arguments.length < 1) throw TypeError("Failed to construct 'URL': 1 argument required, but only " + arguments.length + " present.");
		let r = [];
		for (let e = 0; e < arguments.length && e < 2; ++e) r[e] = arguments[e];
		r[0] = n.USVString(r[0]), r[1] !== void 0 && (r[1] = n.USVString(r[1])), t.exports.setup(this, r);
	}
	o.prototype.toJSON = function() {
		if (!this || !t.exports.is(this)) throw TypeError("Illegal invocation");
		let e = [];
		for (let t = 0; t < arguments.length && t < 0; ++t) e[t] = arguments[t];
		return this[a].toJSON.apply(this[a], e);
	}, Object.defineProperty(o.prototype, "href", {
		get() {
			return this[a].href;
		},
		set(e) {
			e = n.USVString(e), this[a].href = e;
		},
		enumerable: !0,
		configurable: !0
	}), o.prototype.toString = function() {
		if (!this || !t.exports.is(this)) throw TypeError("Illegal invocation");
		return this.href;
	}, Object.defineProperty(o.prototype, "origin", {
		get() {
			return this[a].origin;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "protocol", {
		get() {
			return this[a].protocol;
		},
		set(e) {
			e = n.USVString(e), this[a].protocol = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "username", {
		get() {
			return this[a].username;
		},
		set(e) {
			e = n.USVString(e), this[a].username = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "password", {
		get() {
			return this[a].password;
		},
		set(e) {
			e = n.USVString(e), this[a].password = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "host", {
		get() {
			return this[a].host;
		},
		set(e) {
			e = n.USVString(e), this[a].host = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "hostname", {
		get() {
			return this[a].hostname;
		},
		set(e) {
			e = n.USVString(e), this[a].hostname = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "port", {
		get() {
			return this[a].port;
		},
		set(e) {
			e = n.USVString(e), this[a].port = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "pathname", {
		get() {
			return this[a].pathname;
		},
		set(e) {
			e = n.USVString(e), this[a].pathname = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "search", {
		get() {
			return this[a].search;
		},
		set(e) {
			e = n.USVString(e), this[a].search = e;
		},
		enumerable: !0,
		configurable: !0
	}), Object.defineProperty(o.prototype, "hash", {
		get() {
			return this[a].hash;
		},
		set(e) {
			e = n.USVString(e), this[a].hash = e;
		},
		enumerable: !0,
		configurable: !0
	}), t.exports = {
		is(e) {
			return !!e && e[a] instanceof i.implementation;
		},
		create(e, t) {
			let n = Object.create(o.prototype);
			return this.setup(n, e, t), n;
		},
		setup(e, t, n) {
			n ||= {}, n.wrapper = e, e[a] = new i.implementation(t, n), e[a][r.wrapperSymbol] = e;
		},
		interface: o,
		expose: {
			Window: { URL: o },
			Worker: { URL: o }
		}
	};
})), $n = /* @__PURE__ */ A(((e) => {
	e.URL = Qn().interface, e.serializeURL = Xn().serializeURL, e.serializeURLOrigin = Xn().serializeURLOrigin, e.basicURLParse = Xn().basicURLParse, e.setTheUsername = Xn().setTheUsername, e.setThePassword = Xn().setThePassword, e.serializeHost = Xn().serializeHost, e.serializeInteger = Xn().serializeInteger, e.parseURL = Xn().parseURL;
})), er = /* @__PURE__ */ j({ default: () => tr }), tr, nr = k((() => {
	throw tr = {}, Error("Could not resolve \"encoding\" imported by \"node-fetch\". Is it installed?");
})), rr = /* @__PURE__ */ j({
	AbortError: () => Cr,
	FetchError: () => Y,
	Headers: () => Lr,
	Request: () => Jr,
	Response: () => Hr,
	default: () => wr
});
function Y(e, t, n) {
	Error.call(this, e), this.message = e, this.type = t, n && (this.code = this.errno = n.code), Error.captureStackTrace(this, this.constructor);
}
function X(e) {
	var t = this, n = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, r = n.size;
	let i = r === void 0 ? 0 : r;
	var a = n.timeout;
	let o = a === void 0 ? 0 : a;
	e == null ? e = null : or(e) ? e = Buffer.from(e.toString()) : sr(e) || Buffer.isBuffer(e) || (Object.prototype.toString.call(e) === "[object ArrayBuffer]" ? e = Buffer.from(e) : ArrayBuffer.isView(e) ? e = Buffer.from(e.buffer, e.byteOffset, e.byteLength) : e instanceof d || (e = Buffer.from(String(e)))), this[Nr] = {
		body: e,
		disturbed: !1,
		error: null
	}, this.size = i, this.timeout = o, e instanceof d && e.on("error", function(e) {
		let n = e.name === "AbortError" ? e : new Y(`Invalid response body while trying to fetch ${t.url}: ${e.message}`, "system", e);
		t[Nr].error = n;
	});
}
function ir() {
	var e = this;
	if (this[Nr].disturbed) return X.Promise.reject(/* @__PURE__ */ TypeError(`body used already for: ${this.url}`));
	if (this[Nr].disturbed = !0, this[Nr].error) return X.Promise.reject(this[Nr].error);
	let t = this.body;
	if (t === null) return X.Promise.resolve(Buffer.alloc(0));
	if (sr(t) && (t = t.stream()), Buffer.isBuffer(t)) return X.Promise.resolve(t);
	// istanbul ignore if: should never happen
	if (!(t instanceof d)) return X.Promise.resolve(Buffer.alloc(0));
	let n = [], r = 0, i = !1;
	return new X.Promise(function(a, o) {
		let s;
		e.timeout && (s = setTimeout(function() {
			i = !0, o(new Y(`Response timeout while trying to fetch ${e.url} (over ${e.timeout}ms)`, "body-timeout"));
		}, e.timeout)), t.on("error", function(t) {
			t.name === "AbortError" ? (i = !0, o(t)) : o(new Y(`Invalid response body while trying to fetch ${e.url}: ${t.message}`, "system", t));
		}), t.on("data", function(t) {
			if (!(i || t === null)) {
				if (e.size && r + t.length > e.size) {
					i = !0, o(new Y(`content size at ${e.url} over limit: ${e.size}`, "max-size"));
					return;
				}
				r += t.length, n.push(t);
			}
		}), t.on("end", function() {
			if (!i) {
				clearTimeout(s);
				try {
					a(Buffer.concat(n, r));
				} catch (t) {
					o(new Y(`Could not create Buffer from response body for ${e.url}: ${t.message}`, "system", t));
				}
			}
		});
	});
}
function ar(e, t) {
	if (typeof Mr != "function") throw Error("The package `encoding` must be installed to use the textConverted() function");
	let n = t.get("content-type"), r = "utf-8", i, a;
	return n && (i = /charset=([^;]*)/i.exec(n)), a = e.slice(0, 1024).toString(), !i && a && (i = /<meta.+?charset=(['"])(.+?)\1/i.exec(a)), !i && a && (i = /<meta[\s]+?http-equiv=(['"])content-type\1[\s]+?content=(['"])(.+?)\2/i.exec(a), i || (i = /<meta[\s]+?content=(['"])(.+?)\1[\s]+?http-equiv=(['"])content-type\3/i.exec(a), i && i.pop()), i &&= /charset=(.*)/i.exec(i.pop())), !i && a && (i = /<\?xml.+?encoding=(['"])(.+?)\1/i.exec(a)), i && (r = i.pop(), (r === "gb2312" || r === "gbk") && (r = "gb18030")), Mr(e, "UTF-8", r).toString();
}
function or(e) {
	return typeof e != "object" || typeof e.append != "function" || typeof e.delete != "function" || typeof e.get != "function" || typeof e.getAll != "function" || typeof e.has != "function" || typeof e.set != "function" ? !1 : e.constructor.name === "URLSearchParams" || Object.prototype.toString.call(e) === "[object URLSearchParams]" || typeof e.sort == "function";
}
function sr(e) {
	return typeof e == "object" && typeof e.arrayBuffer == "function" && typeof e.type == "string" && typeof e.stream == "function" && typeof e.constructor == "function" && typeof e.constructor.name == "string" && /^(Blob|File)$/.test(e.constructor.name) && /^(Blob|File)$/.test(e[Symbol.toStringTag]);
}
function cr(e) {
	let t, n, r = e.body;
	if (e.bodyUsed) throw Error("cannot clone body after it is used");
	return r instanceof d && typeof r.getBoundary != "function" && (t = new Pr(), n = new Pr(), r.pipe(t), r.pipe(n), e[Nr].body = t, r = n), r;
}
function lr(e) {
	return e === null ? null : typeof e == "string" ? "text/plain;charset=UTF-8" : or(e) ? "application/x-www-form-urlencoded;charset=UTF-8" : sr(e) ? e.type || null : Buffer.isBuffer(e) || Object.prototype.toString.call(e) === "[object ArrayBuffer]" || ArrayBuffer.isView(e) ? null : typeof e.getBoundary == "function" ? `multipart/form-data;boundary=${e.getBoundary()}` : e instanceof d ? null : "text/plain;charset=UTF-8";
}
function ur(e) {
	let t = e.body;
	return t === null ? 0 : sr(t) ? t.size : Buffer.isBuffer(t) ? t.length : t && typeof t.getLengthSync == "function" && (t._lengthRetrievers && t._lengthRetrievers.length == 0 || t.hasKnownLength && t.hasKnownLength()) ? t.getLengthSync() : null;
}
function dr(e, t) {
	let n = t.body;
	n === null ? e.end() : sr(n) ? n.stream().pipe(e) : Buffer.isBuffer(n) ? (e.write(n), e.end()) : n.pipe(e);
}
function fr(e) {
	if (e = `${e}`, Fr.test(e) || e === "") throw TypeError(`${e} is not a legal HTTP header name`);
}
function pr(e) {
	if (e = `${e}`, Ir.test(e)) throw TypeError(`${e} is not a legal HTTP header value`);
}
function mr(e, t) {
	t = t.toLowerCase();
	for (let n in e) if (n.toLowerCase() === t) return n;
}
function hr(e) {
	let t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : "key+value";
	return Object.keys(e[Z]).sort().map(t === "key" ? function(e) {
		return e.toLowerCase();
	} : t === "value" ? function(t) {
		return e[Z][t].join(", ");
	} : function(t) {
		return [t.toLowerCase(), e[Z][t].join(", ")];
	});
}
function gr(e, t) {
	let n = Object.create(zr);
	return n[Rr] = {
		target: e,
		kind: t,
		index: 0
	}, n;
}
function _r(e) {
	let t = Object.assign({ __proto__: null }, e[Z]), n = mr(e[Z], "Host");
	return n !== void 0 && (t[n] = t[n][0]), t;
}
function vr(e) {
	let t = new Lr();
	for (let n of Object.keys(e)) if (!Fr.test(n)) if (Array.isArray(e[n])) for (let r of e[n]) Ir.test(r) || (t[Z][n] === void 0 ? t[Z][n] = [r] : t[Z][n].push(r));
	else Ir.test(e[n]) || (t[Z][n] = [e[n]]);
	return t;
}
function yr(e) {
	return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.exec(e) && (e = new Wr(e).toString()), Gr(e);
}
function br(e) {
	return typeof e == "object" && typeof e[Ur] == "object";
}
function xr(e) {
	let t = e && typeof e == "object" && Object.getPrototypeOf(e);
	return !!(t && t.constructor.name === "AbortSignal");
}
function Sr(e) {
	let t = e[Ur].parsedURL, n = new Lr(e[Ur].headers);
	if (n.has("Accept") || n.set("Accept", "*/*"), !t.protocol || !t.hostname) throw TypeError("Only absolute URLs are supported");
	if (!/^https?:$/.test(t.protocol)) throw TypeError("Only HTTP(S) protocols are supported");
	if (e.signal && e.body instanceof d.Readable && !qr) throw Error("Cancellation of streamed requests with AbortSignal is not supported in node < 8");
	let r = null;
	if (e.body == null && /^(POST|PUT)$/i.test(e.method) && (r = "0"), e.body != null) {
		let t = ur(e);
		typeof t == "number" && (r = String(t));
	}
	r && n.set("Content-Length", r), n.has("User-Agent") || n.set("User-Agent", "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)"), e.compress && !n.has("Accept-Encoding") && n.set("Accept-Encoding", "gzip,deflate");
	let i = e.agent;
	return typeof i == "function" && (i = i(t)), Object.assign({}, t, {
		method: e.method,
		headers: _r(n),
		agent: i
	});
}
function Cr(e) {
	Error.call(this, e), this.type = "aborted", this.message = e, Error.captureStackTrace(this, this.constructor);
}
function wr(e, t) {
	if (!wr.Promise) throw Error("native promise missing, set fetch.Promise to your favorite alternative");
	return X.Promise = wr.Promise, new wr.Promise(function(n, r) {
		let i = new Jr(e, t), a = Sr(i), o = (a.protocol === "https:" ? v : m).request, s = i.signal, c = null, l = function() {
			let e = new Cr("The user aborted a request.");
			r(e), i.body && i.body instanceof d.Readable && Er(i.body, e), !(!c || !c.body) && c.body.emit("error", e);
		};
		if (s && s.aborted) {
			l();
			return;
		}
		let u = function() {
			l(), g();
		}, f = o(a), h;
		s && s.addEventListener("abort", u);
		function g() {
			f.abort(), s && s.removeEventListener("abort", u), clearTimeout(h);
		}
		i.timeout && f.once("socket", function(e) {
			h = setTimeout(function() {
				r(new Y(`network timeout at: ${i.url}`, "request-timeout")), g();
			}, i.timeout);
		}), f.on("error", function(e) {
			r(new Y(`request to ${i.url} failed, reason: ${e.message}`, "system", e)), c && c.body && Er(c.body, e), g();
		}), Tr(f, function(e) {
			s && s.aborted || c && c.body && Er(c.body, e);
		}), parseInt(process.version.substring(1)) < 14 && f.on("socket", function(e) {
			e.addListener("close", function(t) {
				let n = e.listenerCount("data") > 0;
				if (c && n && !t && !(s && s.aborted)) {
					let e = /* @__PURE__ */ Error("Premature close");
					e.code = "ERR_STREAM_PREMATURE_CLOSE", c.body.emit("error", e);
				}
			});
		}), f.on("response", function(e) {
			clearTimeout(h);
			let t = vr(e.headers);
			if (wr.isRedirect(e.statusCode)) {
				let a = t.get("Location"), o = null;
				try {
					o = a === null ? null : new Yr(a, i.url).toString();
				} catch {
					if (i.redirect !== "manual") {
						r(new Y(`uri requested responds with an invalid redirect URL: ${a}`, "invalid-redirect")), g();
						return;
					}
				}
				switch (i.redirect) {
					case "error":
						r(new Y(`uri requested responds with a redirect, redirect mode is set to error: ${i.url}`, "no-redirect")), g();
						return;
					case "manual":
						if (o !== null) try {
							t.set("Location", o);
						} catch (e) {
							// istanbul ignore next: nodejs server prevent invalid response headers, we can't test this through normal request
							r(e);
						}
						break;
					case "follow":
						if (o === null) break;
						if (i.counter >= i.follow) {
							r(new Y(`maximum redirect reached at: ${i.url}`, "max-redirect")), g();
							return;
						}
						let a = {
							headers: new Lr(i.headers),
							follow: i.follow,
							counter: i.counter + 1,
							agent: i.agent,
							compress: i.compress,
							method: i.method,
							body: i.body,
							signal: i.signal,
							timeout: i.timeout,
							size: i.size
						};
						if (!Zr(i.url, o) || !Qr(i.url, o)) for (let e of [
							"authorization",
							"www-authenticate",
							"cookie",
							"cookie2"
						]) a.headers.delete(e);
						if (e.statusCode !== 303 && i.body && ur(i) === null) {
							r(new Y("Cannot follow redirect with body being a readable stream", "unsupported-redirect")), g();
							return;
						}
						(e.statusCode === 303 || (e.statusCode === 301 || e.statusCode === 302) && i.method === "POST") && (a.method = "GET", a.body = void 0, a.headers.delete("content-length")), n(wr(new Jr(o, a))), g();
						return;
				}
			}
			e.once("end", function() {
				s && s.removeEventListener("abort", u);
			});
			let a = e.pipe(new Xr()), o = {
				url: i.url,
				status: e.statusCode,
				statusText: e.statusMessage,
				headers: t,
				size: i.size,
				timeout: i.timeout,
				counter: i.counter
			}, l = t.get("Content-Encoding");
			if (!i.compress || i.method === "HEAD" || l === null || e.statusCode === 204 || e.statusCode === 304) {
				c = new Hr(a, o), n(c);
				return;
			}
			let d = {
				flush: p.Z_SYNC_FLUSH,
				finishFlush: p.Z_SYNC_FLUSH
			};
			if (l == "gzip" || l == "x-gzip") {
				a = a.pipe(p.createGunzip(d)), c = new Hr(a, o), n(c);
				return;
			}
			if (l == "deflate" || l == "x-deflate") {
				let t = e.pipe(new Xr());
				t.once("data", function(e) {
					a = (e[0] & 15) == 8 ? a.pipe(p.createInflate()) : a.pipe(p.createInflateRaw()), c = new Hr(a, o), n(c);
				}), t.on("end", function() {
					c || (c = new Hr(a, o), n(c));
				});
				return;
			}
			if (l == "br" && typeof p.createBrotliDecompress == "function") {
				a = a.pipe(p.createBrotliDecompress()), c = new Hr(a, o), n(c);
				return;
			}
			c = new Hr(a, o), n(c);
		}), dr(f, i);
	});
}
function Tr(e, t) {
	let n;
	e.on("socket", function(e) {
		n = e;
	}), e.on("response", function(e) {
		let r = e.headers;
		r["transfer-encoding"] === "chunked" && !r["content-length"] && e.once("close", function(e) {
			if (n && n.listenerCount("data") > 0 && !e) {
				let e = /* @__PURE__ */ Error("Premature close");
				e.code = "ERR_STREAM_PREMATURE_CLOSE", t(e);
			}
		});
	});
}
function Er(e, t) {
	e.destroy ? e.destroy(t) : (e.emit("error", t), e.end());
}
var Dr, Or, kr, Ar, jr, Mr, Nr, Pr, Fr, Ir, Z, Lr, Rr, zr, Br, Vr, Hr, Ur, Wr, Gr, Kr, qr, Jr, Yr, Xr, Zr, Qr, $r = k((() => {
	Dr = /* @__PURE__ */ N($n(), 1), Or = d.Readable, kr = Symbol("buffer"), Ar = Symbol("type"), jr = class e {
		constructor() {
			this[Ar] = "";
			let t = arguments[0], n = arguments[1], r = [], i = 0;
			if (t) {
				let n = t, a = Number(n.length);
				for (let t = 0; t < a; t++) {
					let a = n[t], o;
					o = a instanceof Buffer ? a : ArrayBuffer.isView(a) ? Buffer.from(a.buffer, a.byteOffset, a.byteLength) : a instanceof ArrayBuffer ? Buffer.from(a) : a instanceof e ? a[kr] : Buffer.from(typeof a == "string" ? a : String(a)), i += o.length, r.push(o);
				}
			}
			this[kr] = Buffer.concat(r);
			let a = n && n.type !== void 0 && String(n.type).toLowerCase();
			a && !/[^\u0020-\u007E]/.test(a) && (this[Ar] = a);
		}
		get size() {
			return this[kr].length;
		}
		get type() {
			return this[Ar];
		}
		text() {
			return Promise.resolve(this[kr].toString());
		}
		arrayBuffer() {
			let e = this[kr], t = e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength);
			return Promise.resolve(t);
		}
		stream() {
			let e = new Or();
			return e._read = function() {}, e.push(this[kr]), e.push(null), e;
		}
		toString() {
			return "[object Blob]";
		}
		slice() {
			let t = this.size, n = arguments[0], r = arguments[1], i, a;
			i = n === void 0 ? 0 : n < 0 ? Math.max(t + n, 0) : Math.min(n, t), a = r === void 0 ? t : r < 0 ? Math.max(t + r, 0) : Math.min(r, t);
			let o = Math.max(a - i, 0), s = this[kr].slice(i, i + o), c = new e([], { type: arguments[2] });
			return c[kr] = s, c;
		}
	}, Object.defineProperties(jr.prototype, {
		size: { enumerable: !0 },
		type: { enumerable: !0 },
		slice: { enumerable: !0 }
	}), Object.defineProperty(jr.prototype, Symbol.toStringTag, {
		value: "Blob",
		writable: !1,
		enumerable: !1,
		configurable: !0
	}), Y.prototype = Object.create(Error.prototype), Y.prototype.constructor = Y, Y.prototype.name = "FetchError";
	try {
		Mr = (nr(), P(er)).convert;
	} catch {}
	Nr = Symbol("Body internals"), Pr = d.PassThrough, X.prototype = {
		get body() {
			return this[Nr].body;
		},
		get bodyUsed() {
			return this[Nr].disturbed;
		},
		arrayBuffer() {
			return ir.call(this).then(function(e) {
				return e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength);
			});
		},
		blob() {
			let e = this.headers && this.headers.get("content-type") || "";
			return ir.call(this).then(function(t) {
				return Object.assign(new jr([], { type: e.toLowerCase() }), { [kr]: t });
			});
		},
		json() {
			var e = this;
			return ir.call(this).then(function(t) {
				try {
					return JSON.parse(t.toString());
				} catch (t) {
					return X.Promise.reject(new Y(`invalid json response body at ${e.url} reason: ${t.message}`, "invalid-json"));
				}
			});
		},
		text() {
			return ir.call(this).then(function(e) {
				return e.toString();
			});
		},
		buffer() {
			return ir.call(this);
		},
		textConverted() {
			var e = this;
			return ir.call(this).then(function(t) {
				return ar(t, e.headers);
			});
		}
	}, Object.defineProperties(X.prototype, {
		body: { enumerable: !0 },
		bodyUsed: { enumerable: !0 },
		arrayBuffer: { enumerable: !0 },
		blob: { enumerable: !0 },
		json: { enumerable: !0 },
		text: { enumerable: !0 }
	}), X.mixIn = function(e) {
		for (let t of Object.getOwnPropertyNames(X.prototype))
 // istanbul ignore else: future proof
		if (!(t in e)) {
			let n = Object.getOwnPropertyDescriptor(X.prototype, t);
			Object.defineProperty(e, t, n);
		}
	}, X.Promise = global.Promise, Fr = /[^\^_`a-zA-Z\-0-9!#$%&'*+.|~]/, Ir = /[^\t\x20-\x7e\x80-\xff]/, Z = Symbol("map"), Lr = class e {
		constructor() {
			let t = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : void 0;
			if (this[Z] = Object.create(null), t instanceof e) {
				let e = t.raw(), n = Object.keys(e);
				for (let t of n) for (let n of e[t]) this.append(t, n);
				return;
			}
			if (t != null) if (typeof t == "object") {
				let e = t[Symbol.iterator];
				if (e != null) {
					if (typeof e != "function") throw TypeError("Header pairs must be iterable");
					let n = [];
					for (let e of t) {
						if (typeof e != "object" || typeof e[Symbol.iterator] != "function") throw TypeError("Each header pair must be iterable");
						n.push(Array.from(e));
					}
					for (let e of n) {
						if (e.length !== 2) throw TypeError("Each header pair must be a name/value tuple");
						this.append(e[0], e[1]);
					}
				} else for (let e of Object.keys(t)) {
					let n = t[e];
					this.append(e, n);
				}
			} else throw TypeError("Provided initializer must be an object");
		}
		get(e) {
			e = `${e}`, fr(e);
			let t = mr(this[Z], e);
			return t === void 0 ? null : this[Z][t].join(", ");
		}
		forEach(e) {
			let t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : void 0, n = hr(this), r = 0;
			for (; r < n.length;) {
				var i = n[r];
				let a = i[0], o = i[1];
				e.call(t, o, a, this), n = hr(this), r++;
			}
		}
		set(e, t) {
			e = `${e}`, t = `${t}`, fr(e), pr(t);
			let n = mr(this[Z], e);
			this[Z][n === void 0 ? e : n] = [t];
		}
		append(e, t) {
			e = `${e}`, t = `${t}`, fr(e), pr(t);
			let n = mr(this[Z], e);
			n === void 0 ? this[Z][e] = [t] : this[Z][n].push(t);
		}
		has(e) {
			return e = `${e}`, fr(e), mr(this[Z], e) !== void 0;
		}
		delete(e) {
			e = `${e}`, fr(e);
			let t = mr(this[Z], e);
			t !== void 0 && delete this[Z][t];
		}
		raw() {
			return this[Z];
		}
		keys() {
			return gr(this, "key");
		}
		values() {
			return gr(this, "value");
		}
		[Symbol.iterator]() {
			return gr(this, "key+value");
		}
	}, Lr.prototype.entries = Lr.prototype[Symbol.iterator], Object.defineProperty(Lr.prototype, Symbol.toStringTag, {
		value: "Headers",
		writable: !1,
		enumerable: !1,
		configurable: !0
	}), Object.defineProperties(Lr.prototype, {
		get: { enumerable: !0 },
		forEach: { enumerable: !0 },
		set: { enumerable: !0 },
		append: { enumerable: !0 },
		has: { enumerable: !0 },
		delete: { enumerable: !0 },
		keys: { enumerable: !0 },
		values: { enumerable: !0 },
		entries: { enumerable: !0 }
	}), Rr = Symbol("internal"), zr = Object.setPrototypeOf({ next() {
		// istanbul ignore if
		if (!this || Object.getPrototypeOf(this) !== zr) throw TypeError("Value of `this` is not a HeadersIterator");
		var e = this[Rr];
		let t = e.target, n = e.kind, r = e.index, i = hr(t, n);
		return r >= i.length ? {
			value: void 0,
			done: !0
		} : (this[Rr].index = r + 1, {
			value: i[r],
			done: !1
		});
	} }, Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))), Object.defineProperty(zr, Symbol.toStringTag, {
		value: "HeadersIterator",
		writable: !1,
		enumerable: !1,
		configurable: !0
	}), Br = Symbol("Response internals"), Vr = m.STATUS_CODES, Hr = class e {
		constructor() {
			let e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : null, t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
			X.call(this, e, t);
			let n = t.status || 200, r = new Lr(t.headers);
			if (e != null && !r.has("Content-Type")) {
				let t = lr(e);
				t && r.append("Content-Type", t);
			}
			this[Br] = {
				url: t.url,
				status: n,
				statusText: t.statusText || Vr[n],
				headers: r,
				counter: t.counter
			};
		}
		get url() {
			return this[Br].url || "";
		}
		get status() {
			return this[Br].status;
		}
		get ok() {
			return this[Br].status >= 200 && this[Br].status < 300;
		}
		get redirected() {
			return this[Br].counter > 0;
		}
		get statusText() {
			return this[Br].statusText;
		}
		get headers() {
			return this[Br].headers;
		}
		clone() {
			return new e(cr(this), {
				url: this.url,
				status: this.status,
				statusText: this.statusText,
				headers: this.headers,
				ok: this.ok,
				redirected: this.redirected
			});
		}
	}, X.mixIn(Hr.prototype), Object.defineProperties(Hr.prototype, {
		url: { enumerable: !0 },
		status: { enumerable: !0 },
		ok: { enumerable: !0 },
		redirected: { enumerable: !0 },
		statusText: { enumerable: !0 },
		headers: { enumerable: !0 },
		clone: { enumerable: !0 }
	}), Object.defineProperty(Hr.prototype, Symbol.toStringTag, {
		value: "Response",
		writable: !1,
		enumerable: !1,
		configurable: !0
	}), Ur = Symbol("Request internals"), Wr = f.URL || Dr.URL, Gr = f.parse, Kr = f.format, qr = "destroy" in d.Readable.prototype, Jr = class e {
		constructor(e) {
			let t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, n;
			br(e) ? n = yr(e.url) : (n = e && e.href ? yr(e.href) : yr(`${e}`), e = {});
			let r = t.method || e.method || "GET";
			if (r = r.toUpperCase(), (t.body != null || br(e) && e.body !== null) && (r === "GET" || r === "HEAD")) throw TypeError("Request with GET/HEAD method cannot have body");
			let i = t.body == null ? br(e) && e.body !== null ? cr(e) : null : t.body;
			X.call(this, i, {
				timeout: t.timeout || e.timeout || 0,
				size: t.size || e.size || 0
			});
			let a = new Lr(t.headers || e.headers || {});
			if (i != null && !a.has("Content-Type")) {
				let e = lr(i);
				e && a.append("Content-Type", e);
			}
			let o = br(e) ? e.signal : null;
			if ("signal" in t && (o = t.signal), o != null && !xr(o)) throw TypeError("Expected signal to be an instanceof AbortSignal");
			this[Ur] = {
				method: r,
				redirect: t.redirect || e.redirect || "follow",
				headers: a,
				parsedURL: n,
				signal: o
			}, this.follow = t.follow === void 0 ? e.follow === void 0 ? 20 : e.follow : t.follow, this.compress = t.compress === void 0 ? e.compress === void 0 ? !0 : e.compress : t.compress, this.counter = t.counter || e.counter || 0, this.agent = t.agent || e.agent;
		}
		get method() {
			return this[Ur].method;
		}
		get url() {
			return Kr(this[Ur].parsedURL);
		}
		get headers() {
			return this[Ur].headers;
		}
		get redirect() {
			return this[Ur].redirect;
		}
		get signal() {
			return this[Ur].signal;
		}
		clone() {
			return new e(this);
		}
	}, X.mixIn(Jr.prototype), Object.defineProperty(Jr.prototype, Symbol.toStringTag, {
		value: "Request",
		writable: !1,
		enumerable: !1,
		configurable: !0
	}), Object.defineProperties(Jr.prototype, {
		method: { enumerable: !0 },
		url: { enumerable: !0 },
		headers: { enumerable: !0 },
		redirect: { enumerable: !0 },
		clone: { enumerable: !0 },
		signal: { enumerable: !0 }
	}), Cr.prototype = Object.create(Error.prototype), Cr.prototype.constructor = Cr, Cr.prototype.name = "AbortError", Yr = f.URL || Dr.URL, Xr = d.PassThrough, Zr = function(e, t) {
		let n = new Yr(t).hostname, r = new Yr(e).hostname;
		return n === r || n[n.length - r.length - 1] === "." && n.endsWith(r);
	}, Qr = function(e, t) {
		return new Yr(t).protocol === new Yr(e).protocol;
	}, wr.isRedirect = function(e) {
		return e === 301 || e === 302 || e === 303 || e === 307 || e === 308;
	}, wr.Promise = global.Promise;
})), ei = /* @__PURE__ */ A(((e, t) => {
	var n = F("net"), r = F("events"), i = ($r(), P(rr)), { uuid: a } = Un(), o = {
		HANDSHAKE: 0,
		FRAME: 1,
		CLOSE: 2,
		PING: 3,
		PONG: 4
	};
	function s(e) {
		if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${e}`;
		let { env: { XDG_RUNTIME_DIR: t, TMPDIR: n, TMP: r, TEMP: i } } = process;
		return `${(t || n || r || i || "/tmp").replace(/\/$/, "")}/discord-ipc-${e}`;
	}
	function c(e = 0) {
		return new Promise((t, r) => {
			let i = s(e), a = () => {
				e < 10 ? t(c(e + 1)) : r(/* @__PURE__ */ Error("Could not connect"));
			}, o = n.createConnection(i, () => {
				o.removeListener("error", a), t(o);
			});
			o.once("error", a);
		});
	}
	async function l(e = 0) {
		if (e > 30) throw Error("Could not find endpoint");
		let t = `http://127.0.0.1:${6463 + e % 10}`;
		try {
			return (await i(t)).status === 404 ? t : l(e + 1);
		} catch {
			return l(e + 1);
		}
	}
	function u(e, t) {
		t = JSON.stringify(t);
		let n = Buffer.byteLength(t), r = Buffer.alloc(8 + n);
		return r.writeInt32LE(e, 0), r.writeInt32LE(n, 4), r.write(t, 8, n), r;
	}
	var d = {
		full: "",
		op: void 0
	};
	function f(e, t) {
		let n = e.read();
		if (!n) return;
		let { op: r } = d, i;
		if (d.full === "") {
			r = d.op = n.readInt32LE(0);
			let e = n.readInt32LE(4);
			i = n.slice(8, e + 8);
		} else i = n.toString();
		try {
			let e = JSON.parse(d.full + i);
			t({
				op: r,
				data: e
			}), d.full = "", d.op = void 0;
		} catch {
			d.full += i;
		}
		f(e, t);
	}
	t.exports = class extends r {
		constructor(e) {
			super(), this.client = e, this.socket = null;
		}
		async connect() {
			let e = this.socket = await c();
			e.on("close", this.onClose.bind(this)), e.on("error", this.onClose.bind(this)), this.emit("open"), e.write(u(o.HANDSHAKE, {
				v: 1,
				client_id: this.client.clientId
			})), e.pause(), e.on("readable", () => {
				f(e, ({ op: e, data: t }) => {
					switch (e) {
						case o.PING:
							this.send(t, o.PONG);
							break;
						case o.FRAME:
							if (!t) return;
							t.cmd === "AUTHORIZE" && t.evt !== "ERROR" && l().then((e) => {
								this.client.request.endpoint = e;
							}).catch((e) => {
								this.client.emit("error", e);
							}), this.emit("message", t);
							break;
						case o.CLOSE:
							this.emit("close", t);
							break;
						default: break;
					}
				});
			});
		}
		onClose(e) {
			this.emit("close", e);
		}
		send(e, t = o.FRAME) {
			this.socket.write(u(t, e));
		}
		async close() {
			return new Promise((e) => {
				this.once("close", e), this.send({}, o.CLOSE), this.socket.end();
			});
		}
		ping() {
			this.send(a(), o.PING);
		}
	}, t.exports.encode = u, t.exports.decode = f;
})), ti = /* @__PURE__ */ A(((e) => {
	function t(e) {
		let t = {};
		for (let n of e) t[n] = n;
		return t;
	}
	e.browser = typeof window < "u", e.RPCCommands = t(/* @__PURE__ */ "DISPATCH.AUTHORIZE.AUTHENTICATE.GET_GUILD.GET_GUILDS.GET_CHANNEL.GET_CHANNELS.CREATE_CHANNEL_INVITE.GET_RELATIONSHIPS.GET_USER.SUBSCRIBE.UNSUBSCRIBE.SET_USER_VOICE_SETTINGS.SET_USER_VOICE_SETTINGS_2.SELECT_VOICE_CHANNEL.GET_SELECTED_VOICE_CHANNEL.SELECT_TEXT_CHANNEL.GET_VOICE_SETTINGS.SET_VOICE_SETTINGS_2.SET_VOICE_SETTINGS.CAPTURE_SHORTCUT.SET_ACTIVITY.SEND_ACTIVITY_JOIN_INVITE.CLOSE_ACTIVITY_JOIN_REQUEST.ACTIVITY_INVITE_USER.ACCEPT_ACTIVITY_INVITE.INVITE_BROWSER.DEEP_LINK.CONNECTIONS_CALLBACK.BRAINTREE_POPUP_BRIDGE_CALLBACK.GIFT_CODE_BROWSER.GUILD_TEMPLATE_BROWSER.OVERLAY.BROWSER_HANDOFF.SET_CERTIFIED_DEVICES.GET_IMAGE.CREATE_LOBBY.UPDATE_LOBBY.DELETE_LOBBY.UPDATE_LOBBY_MEMBER.CONNECT_TO_LOBBY.DISCONNECT_FROM_LOBBY.SEND_TO_LOBBY.SEARCH_LOBBIES.CONNECT_TO_LOBBY_VOICE.DISCONNECT_FROM_LOBBY_VOICE.SET_OVERLAY_LOCKED.OPEN_OVERLAY_ACTIVITY_INVITE.OPEN_OVERLAY_GUILD_INVITE.OPEN_OVERLAY_VOICE_SETTINGS.VALIDATE_APPLICATION.GET_ENTITLEMENT_TICKET.GET_APPLICATION_TICKET.START_PURCHASE.GET_SKUS.GET_ENTITLEMENTS.GET_NETWORKING_CONFIG.NETWORKING_SYSTEM_METRICS.NETWORKING_PEER_METRICS.NETWORKING_CREATE_TOKEN.SET_USER_ACHIEVEMENT.GET_USER_ACHIEVEMENTS".split(".")), e.RPCEvents = t(/* @__PURE__ */ "CURRENT_USER_UPDATE.GUILD_STATUS.GUILD_CREATE.CHANNEL_CREATE.RELATIONSHIP_UPDATE.VOICE_CHANNEL_SELECT.VOICE_STATE_CREATE.VOICE_STATE_DELETE.VOICE_STATE_UPDATE.VOICE_SETTINGS_UPDATE.VOICE_SETTINGS_UPDATE_2.VOICE_CONNECTION_STATUS.SPEAKING_START.SPEAKING_STOP.GAME_JOIN.GAME_SPECTATE.ACTIVITY_JOIN.ACTIVITY_JOIN_REQUEST.ACTIVITY_SPECTATE.ACTIVITY_INVITE.NOTIFICATION_CREATE.MESSAGE_CREATE.MESSAGE_UPDATE.MESSAGE_DELETE.LOBBY_DELETE.LOBBY_UPDATE.LOBBY_MEMBER_CONNECT.LOBBY_MEMBER_DISCONNECT.LOBBY_MEMBER_UPDATE.LOBBY_MESSAGE.CAPTURE_SHORTCUT_CHANGE.OVERLAY.OVERLAY_UPDATE.ENTITLEMENT_CREATE.ENTITLEMENT_DELETE.USER_ACHIEVEMENT_UPDATE.READY.ERROR".split(".")), e.RPCErrors = {
		CAPTURE_SHORTCUT_ALREADY_LISTENING: 5004,
		GET_GUILD_TIMED_OUT: 5002,
		INVALID_ACTIVITY_JOIN_REQUEST: 4012,
		INVALID_ACTIVITY_SECRET: 5005,
		INVALID_CHANNEL: 4005,
		INVALID_CLIENTID: 4007,
		INVALID_COMMAND: 4002,
		INVALID_ENTITLEMENT: 4015,
		INVALID_EVENT: 4004,
		INVALID_GIFT_CODE: 4016,
		INVALID_GUILD: 4003,
		INVALID_INVITE: 4011,
		INVALID_LOBBY: 4013,
		INVALID_LOBBY_SECRET: 4014,
		INVALID_ORIGIN: 4008,
		INVALID_PAYLOAD: 4e3,
		INVALID_PERMISSIONS: 4006,
		INVALID_TOKEN: 4009,
		INVALID_USER: 4010,
		LOBBY_FULL: 5007,
		NO_ELIGIBLE_ACTIVITY: 5006,
		OAUTH2_ERROR: 5e3,
		PURCHASE_CANCELED: 5008,
		PURCHASE_ERROR: 5009,
		RATE_LIMITED: 5011,
		SELECT_CHANNEL_TIMED_OUT: 5001,
		SELECT_VOICE_FORCE_REQUIRED: 5003,
		SERVICE_UNAVAILABLE: 1001,
		TRANSACTION_ABORTED: 1002,
		UNAUTHORIZED_FOR_ACHIEVEMENT: 5010,
		UNKNOWN_ERROR: 1e3
	}, e.RPCCloseCodes = {
		CLOSE_NORMAL: 1e3,
		CLOSE_UNSUPPORTED: 1003,
		CLOSE_ABNORMAL: 1006,
		INVALID_CLIENTID: 4e3,
		INVALID_ORIGIN: 4001,
		RATELIMITED: 4002,
		TOKEN_REVOKED: 4003,
		INVALID_VERSION: 4004,
		INVALID_ENCODING: 4005
	}, e.LobbyTypes = {
		PRIVATE: 1,
		PUBLIC: 2
	}, e.RelationshipTypes = {
		NONE: 0,
		FRIEND: 1,
		BLOCKED: 2,
		PENDING_INCOMING: 3,
		PENDING_OUTGOING: 4,
		IMPLICIT: 5
	};
})), ni = /* @__PURE__ */ A(((e, t) => {
	t.exports = {
		BINARY_TYPES: [
			"nodebuffer",
			"arraybuffer",
			"fragments"
		],
		GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
		kStatusCode: Symbol("status-code"),
		kWebSocket: Symbol("websocket"),
		EMPTY_BUFFER: Buffer.alloc(0),
		NOOP: () => {}
	};
})), ri = /* @__PURE__ */ j({ default: () => ii }), ii, ai = k((() => {
	throw ii = {}, Error("Could not resolve \"bufferutil\" imported by \"ws\". Is it installed?");
})), oi = /* @__PURE__ */ A(((e, t) => {
	var { EMPTY_BUFFER: n } = ni();
	function r(e, t) {
		if (e.length === 0) return n;
		if (e.length === 1) return e[0];
		let r = Buffer.allocUnsafe(t), i = 0;
		for (let t = 0; t < e.length; t++) {
			let n = e[t];
			r.set(n, i), i += n.length;
		}
		return i < t ? r.slice(0, i) : r;
	}
	function i(e, t, n, r, i) {
		for (let a = 0; a < i; a++) n[r + a] = e[a] ^ t[a & 3];
	}
	function a(e, t) {
		let n = e.length;
		for (let r = 0; r < n; r++) e[r] ^= t[r & 3];
	}
	function o(e) {
		return e.byteLength === e.buffer.byteLength ? e.buffer : e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength);
	}
	function s(e) {
		if (s.readOnly = !0, Buffer.isBuffer(e)) return e;
		let t;
		return e instanceof ArrayBuffer ? t = Buffer.from(e) : ArrayBuffer.isView(e) ? t = Buffer.from(e.buffer, e.byteOffset, e.byteLength) : (t = Buffer.from(e), s.readOnly = !1), t;
	}
	try {
		let e = (ai(), P(ri)), n = e.BufferUtil || e;
		t.exports = {
			concat: r,
			mask(e, t, r, a, o) {
				o < 48 ? i(e, t, r, a, o) : n.mask(e, t, r, a, o);
			},
			toArrayBuffer: o,
			toBuffer: s,
			unmask(e, t) {
				e.length < 32 ? a(e, t) : n.unmask(e, t);
			}
		};
	} catch 	/* istanbul ignore next */ {
		t.exports = {
			concat: r,
			mask: i,
			toArrayBuffer: o,
			toBuffer: s,
			unmask: a
		};
	}
})), si = /* @__PURE__ */ A(((e, t) => {
	var n = Symbol("kDone"), r = Symbol("kRun");
	t.exports = class {
		constructor(e) {
			this[n] = () => {
				this.pending--, this[r]();
			}, this.concurrency = e || Infinity, this.jobs = [], this.pending = 0;
		}
		add(e) {
			this.jobs.push(e), this[r]();
		}
		[r]() {
			if (this.pending !== this.concurrency && this.jobs.length) {
				let e = this.jobs.shift();
				this.pending++, e(this[n]);
			}
		}
	};
})), ci = /* @__PURE__ */ A(((e, t) => {
	var n = F("zlib"), r = oi(), i = si(), { kStatusCode: a, NOOP: o } = ni(), s = Buffer.from([
		0,
		0,
		255,
		255
	]), c = Symbol("permessage-deflate"), l = Symbol("total-length"), u = Symbol("callback"), d = Symbol("buffers"), f = Symbol("error"), p;
	t.exports = class {
		constructor(e, t, n) {
			this._maxPayload = n | 0, this._options = e || {}, this._threshold = this._options.threshold === void 0 ? 1024 : this._options.threshold, this._isServer = !!t, this._deflate = null, this._inflate = null, this.params = null, p ||= new i(this._options.concurrencyLimit === void 0 ? 10 : this._options.concurrencyLimit);
		}
		static get extensionName() {
			return "permessage-deflate";
		}
		offer() {
			let e = {};
			return this._options.serverNoContextTakeover && (e.server_no_context_takeover = !0), this._options.clientNoContextTakeover && (e.client_no_context_takeover = !0), this._options.serverMaxWindowBits && (e.server_max_window_bits = this._options.serverMaxWindowBits), this._options.clientMaxWindowBits ? e.client_max_window_bits = this._options.clientMaxWindowBits : this._options.clientMaxWindowBits ?? (e.client_max_window_bits = !0), e;
		}
		accept(e) {
			return e = this.normalizeParams(e), this.params = this._isServer ? this.acceptAsServer(e) : this.acceptAsClient(e), this.params;
		}
		cleanup() {
			if (this._inflate &&= (this._inflate.close(), null), this._deflate) {
				let e = this._deflate[u];
				this._deflate.close(), this._deflate = null, e && e(/* @__PURE__ */ Error("The deflate stream was closed while data was being processed"));
			}
		}
		acceptAsServer(e) {
			let t = this._options, n = e.find((e) => !(t.serverNoContextTakeover === !1 && e.server_no_context_takeover || e.server_max_window_bits && (t.serverMaxWindowBits === !1 || typeof t.serverMaxWindowBits == "number" && t.serverMaxWindowBits > e.server_max_window_bits) || typeof t.clientMaxWindowBits == "number" && !e.client_max_window_bits));
			if (!n) throw Error("None of the extension offers can be accepted");
			return t.serverNoContextTakeover && (n.server_no_context_takeover = !0), t.clientNoContextTakeover && (n.client_no_context_takeover = !0), typeof t.serverMaxWindowBits == "number" && (n.server_max_window_bits = t.serverMaxWindowBits), typeof t.clientMaxWindowBits == "number" ? n.client_max_window_bits = t.clientMaxWindowBits : (n.client_max_window_bits === !0 || t.clientMaxWindowBits === !1) && delete n.client_max_window_bits, n;
		}
		acceptAsClient(e) {
			let t = e[0];
			if (this._options.clientNoContextTakeover === !1 && t.client_no_context_takeover) throw Error("Unexpected parameter \"client_no_context_takeover\"");
			if (!t.client_max_window_bits) typeof this._options.clientMaxWindowBits == "number" && (t.client_max_window_bits = this._options.clientMaxWindowBits);
			else if (this._options.clientMaxWindowBits === !1 || typeof this._options.clientMaxWindowBits == "number" && t.client_max_window_bits > this._options.clientMaxWindowBits) throw Error("Unexpected or invalid parameter \"client_max_window_bits\"");
			return t;
		}
		normalizeParams(e) {
			return e.forEach((e) => {
				Object.keys(e).forEach((t) => {
					let n = e[t];
					if (n.length > 1) throw Error(`Parameter "${t}" must have only a single value`);
					if (n = n[0], t === "client_max_window_bits") {
						if (n !== !0) {
							let e = +n;
							if (!Number.isInteger(e) || e < 8 || e > 15) throw TypeError(`Invalid value for parameter "${t}": ${n}`);
							n = e;
						} else if (!this._isServer) throw TypeError(`Invalid value for parameter "${t}": ${n}`);
					} else if (t === "server_max_window_bits") {
						let e = +n;
						if (!Number.isInteger(e) || e < 8 || e > 15) throw TypeError(`Invalid value for parameter "${t}": ${n}`);
						n = e;
					} else if (t === "client_no_context_takeover" || t === "server_no_context_takeover") {
						if (n !== !0) throw TypeError(`Invalid value for parameter "${t}": ${n}`);
					} else throw Error(`Unknown parameter "${t}"`);
					e[t] = n;
				});
			}), e;
		}
		decompress(e, t, n) {
			p.add((r) => {
				this._decompress(e, t, (e, t) => {
					r(), n(e, t);
				});
			});
		}
		compress(e, t, n) {
			p.add((r) => {
				this._compress(e, t, (e, t) => {
					r(), n(e, t);
				});
			});
		}
		_decompress(e, t, i) {
			let a = this._isServer ? "client" : "server";
			if (!this._inflate) {
				let e = `${a}_max_window_bits`, t = typeof this.params[e] == "number" ? this.params[e] : n.Z_DEFAULT_WINDOWBITS;
				this._inflate = n.createInflateRaw({
					...this._options.zlibInflateOptions,
					windowBits: t
				}), this._inflate[c] = this, this._inflate[l] = 0, this._inflate[d] = [], this._inflate.on("error", g), this._inflate.on("data", h);
			}
			this._inflate[u] = i, this._inflate.write(e), t && this._inflate.write(s), this._inflate.flush(() => {
				let e = this._inflate[f];
				if (e) {
					this._inflate.close(), this._inflate = null, i(e);
					return;
				}
				let n = r.concat(this._inflate[d], this._inflate[l]);
				this._inflate._readableState.endEmitted ? (this._inflate.close(), this._inflate = null) : (this._inflate[l] = 0, this._inflate[d] = [], t && this.params[`${a}_no_context_takeover`] && this._inflate.reset()), i(null, n);
			});
		}
		_compress(e, t, i) {
			let a = this._isServer ? "server" : "client";
			if (!this._deflate) {
				let e = `${a}_max_window_bits`, t = typeof this.params[e] == "number" ? this.params[e] : n.Z_DEFAULT_WINDOWBITS;
				this._deflate = n.createDeflateRaw({
					...this._options.zlibDeflateOptions,
					windowBits: t
				}), this._deflate[l] = 0, this._deflate[d] = [], this._deflate.on("error", o), this._deflate.on("data", m);
			}
			this._deflate[u] = i, this._deflate.write(e), this._deflate.flush(n.Z_SYNC_FLUSH, () => {
				if (!this._deflate) return;
				let e = r.concat(this._deflate[d], this._deflate[l]);
				t && (e = e.slice(0, e.length - 4)), this._deflate[u] = null, this._deflate[l] = 0, this._deflate[d] = [], t && this.params[`${a}_no_context_takeover`] && this._deflate.reset(), i(null, e);
			});
		}
	};
	function m(e) {
		this[d].push(e), this[l] += e.length;
	}
	function h(e) {
		if (this[l] += e.length, this[c]._maxPayload < 1 || this[l] <= this[c]._maxPayload) {
			this[d].push(e);
			return;
		}
		this[f] = /* @__PURE__ */ RangeError("Max payload size exceeded"), this[f].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH", this[f][a] = 1009, this.removeListener("data", h), this.reset();
	}
	function g(e) {
		this[c]._inflate = null, e[a] = 1007, this[u](e);
	}
})), li = /* @__PURE__ */ j({ default: () => ui }), ui, di = k((() => {
	throw ui = {}, Error("Could not resolve \"utf-8-validate\" imported by \"ws\". Is it installed?");
})), fi = /* @__PURE__ */ A(((e, t) => {
	function n(e) {
		return e >= 1e3 && e <= 1014 && e !== 1004 && e !== 1005 && e !== 1006 || e >= 3e3 && e <= 4999;
	}
	function r(e) {
		let t = e.length, n = 0;
		for (; n < t;) if (!(e[n] & 128)) n++;
		else if ((e[n] & 224) == 192) {
			if (n + 1 === t || (e[n + 1] & 192) != 128 || (e[n] & 254) == 192) return !1;
			n += 2;
		} else if ((e[n] & 240) == 224) {
			if (n + 2 >= t || (e[n + 1] & 192) != 128 || (e[n + 2] & 192) != 128 || e[n] === 224 && (e[n + 1] & 224) == 128 || e[n] === 237 && (e[n + 1] & 224) == 160) return !1;
			n += 3;
		} else if ((e[n] & 248) == 240) {
			if (n + 3 >= t || (e[n + 1] & 192) != 128 || (e[n + 2] & 192) != 128 || (e[n + 3] & 192) != 128 || e[n] === 240 && (e[n + 1] & 240) == 128 || e[n] === 244 && e[n + 1] > 143 || e[n] > 244) return !1;
			n += 4;
		} else return !1;
		return !0;
	}
	try {
		let e = (di(), P(li));
		typeof e == "object" && (e = e.Validation.isValidUTF8), t.exports = {
			isValidStatusCode: n,
			isValidUTF8(t) {
				return t.length < 150 ? r(t) : e(t);
			}
		};
	} catch 	/* istanbul ignore next */ {
		t.exports = {
			isValidStatusCode: n,
			isValidUTF8: r
		};
	}
})), pi = /* @__PURE__ */ A(((e, t) => {
	var { Writable: n } = F("stream"), r = ci(), { BINARY_TYPES: i, EMPTY_BUFFER: a, kStatusCode: o, kWebSocket: s } = ni(), { concat: c, toArrayBuffer: l, unmask: u } = oi(), { isValidStatusCode: d, isValidUTF8: f } = fi(), p = 0, m = 1, h = 2, g = 3, _ = 4, v = 5;
	t.exports = class extends n {
		constructor(e, t, n, r, a, o) {
			super(), this._binaryType = e || i[0], this[s] = void 0, this._extensions = t || {}, this._isServer = !!n, this._maxBufferedChunks = a | 0, this._maxFragments = o | 0, this._maxPayload = r | 0, this._bufferedBytes = 0, this._buffers = [], this._compressed = !1, this._payloadLength = 0, this._mask = void 0, this._fragmented = 0, this._masked = !1, this._fin = !1, this._opcode = 0, this._totalPayloadLength = 0, this._messageLength = 0, this._fragments = [], this._state = p, this._loop = !1;
		}
		_write(e, t, n) {
			if (this._opcode === 8 && this._state == p) return n();
			if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) return n(y(RangeError, "Too many buffered chunks", !1, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS"));
			this._bufferedBytes += e.length, this._buffers.push(e), this.startLoop(n);
		}
		consume(e) {
			if (this._bufferedBytes -= e, e === this._buffers[0].length) return this._buffers.shift();
			if (e < this._buffers[0].length) {
				let t = this._buffers[0];
				return this._buffers[0] = t.slice(e), t.slice(0, e);
			}
			let t = Buffer.allocUnsafe(e);
			do {
				let n = this._buffers[0], r = t.length - e;
				e >= n.length ? t.set(this._buffers.shift(), r) : (t.set(new Uint8Array(n.buffer, n.byteOffset, e), r), this._buffers[0] = n.slice(e)), e -= n.length;
			} while (e > 0);
			return t;
		}
		startLoop(e) {
			let t;
			this._loop = !0;
			do
				switch (this._state) {
					case p:
						t = this.getInfo();
						break;
					case m:
						t = this.getPayloadLength16();
						break;
					case h:
						t = this.getPayloadLength64();
						break;
					case g:
						this.getMask();
						break;
					case _:
						t = this.getData(e);
						break;
					default:
						this._loop = !1;
						return;
				}
			while (this._loop);
			e(t);
		}
		getInfo() {
			if (this._bufferedBytes < 2) {
				this._loop = !1;
				return;
			}
			let e = this.consume(2);
			if (e[0] & 48) return this._loop = !1, y(RangeError, "RSV2 and RSV3 must be clear", !0, 1002, "WS_ERR_UNEXPECTED_RSV_2_3");
			let t = (e[0] & 64) == 64;
			if (t && !this._extensions[r.extensionName]) return this._loop = !1, y(RangeError, "RSV1 must be clear", !0, 1002, "WS_ERR_UNEXPECTED_RSV_1");
			if (this._fin = (e[0] & 128) == 128, this._opcode = e[0] & 15, this._payloadLength = e[1] & 127, this._opcode === 0) {
				if (t) return this._loop = !1, y(RangeError, "RSV1 must be clear", !0, 1002, "WS_ERR_UNEXPECTED_RSV_1");
				if (!this._fragmented) return this._loop = !1, y(RangeError, "invalid opcode 0", !0, 1002, "WS_ERR_INVALID_OPCODE");
				this._opcode = this._fragmented;
			} else if (this._opcode === 1 || this._opcode === 2) {
				if (this._fragmented) return this._loop = !1, y(RangeError, `invalid opcode ${this._opcode}`, !0, 1002, "WS_ERR_INVALID_OPCODE");
				this._compressed = t;
			} else if (this._opcode > 7 && this._opcode < 11) {
				if (!this._fin) return this._loop = !1, y(RangeError, "FIN must be set", !0, 1002, "WS_ERR_EXPECTED_FIN");
				if (t) return this._loop = !1, y(RangeError, "RSV1 must be clear", !0, 1002, "WS_ERR_UNEXPECTED_RSV_1");
				if (this._payloadLength > 125) return this._loop = !1, y(RangeError, `invalid payload length ${this._payloadLength}`, !0, 1002, "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH");
			} else return this._loop = !1, y(RangeError, `invalid opcode ${this._opcode}`, !0, 1002, "WS_ERR_INVALID_OPCODE");
			if (!this._fin && !this._fragmented && (this._fragmented = this._opcode), this._masked = (e[1] & 128) == 128, this._isServer) {
				if (!this._masked) return this._loop = !1, y(RangeError, "MASK must be set", !0, 1002, "WS_ERR_EXPECTED_MASK");
			} else if (this._masked) return this._loop = !1, y(RangeError, "MASK must be clear", !0, 1002, "WS_ERR_UNEXPECTED_MASK");
			if (this._payloadLength === 126) this._state = m;
			else if (this._payloadLength === 127) this._state = h;
			else return this.haveLength();
		}
		getPayloadLength16() {
			if (this._bufferedBytes < 2) {
				this._loop = !1;
				return;
			}
			return this._payloadLength = this.consume(2).readUInt16BE(0), this.haveLength();
		}
		getPayloadLength64() {
			if (this._bufferedBytes < 8) {
				this._loop = !1;
				return;
			}
			let e = this.consume(8), t = e.readUInt32BE(0);
			return t > 2 ** 21 - 1 ? (this._loop = !1, y(RangeError, "Unsupported WebSocket frame: payload length > 2^53 - 1", !1, 1009, "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH")) : (this._payloadLength = t * 2 ** 32 + e.readUInt32BE(4), this.haveLength());
		}
		haveLength() {
			if (this._payloadLength && this._opcode < 8 && (this._totalPayloadLength += this._payloadLength, this._totalPayloadLength > this._maxPayload && this._maxPayload > 0)) return this._loop = !1, y(RangeError, "Max payload size exceeded", !1, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");
			this._masked ? this._state = g : this._state = _;
		}
		getMask() {
			if (this._bufferedBytes < 4) {
				this._loop = !1;
				return;
			}
			this._mask = this.consume(4), this._state = _;
		}
		getData(e) {
			let t = a;
			if (this._payloadLength) {
				if (this._bufferedBytes < this._payloadLength) {
					this._loop = !1;
					return;
				}
				t = this.consume(this._payloadLength), this._masked && u(t, this._mask);
			}
			if (this._opcode > 7) return this.controlMessage(t);
			if (this._compressed) {
				this._state = v, this.decompress(t, e);
				return;
			}
			if (t.length) {
				if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) return this._loop = !1, y(RangeError, "Too many message fragments", !1, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS");
				this._messageLength = this._totalPayloadLength, this._fragments.push(t);
			}
			return this.dataMessage();
		}
		decompress(e, t) {
			this._extensions[r.extensionName].decompress(e, this._fin, (e, n) => {
				if (e) return t(e);
				if (n.length) {
					if (this._messageLength += n.length, this._messageLength > this._maxPayload && this._maxPayload > 0) return t(y(RangeError, "Max payload size exceeded", !1, 1009, "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"));
					if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) return t(y(RangeError, "Too many message fragments", !1, 1008, "WS_ERR_TOO_MANY_BUFFERED_PARTS"));
					this._fragments.push(n);
				}
				let r = this.dataMessage();
				if (r) return t(r);
				this.startLoop(t);
			});
		}
		dataMessage() {
			if (this._fin) {
				let e = this._messageLength, t = this._fragments;
				if (this._totalPayloadLength = 0, this._messageLength = 0, this._fragmented = 0, this._fragments = [], this._opcode === 2) {
					let n;
					n = this._binaryType === "nodebuffer" ? c(t, e) : this._binaryType === "arraybuffer" ? l(c(t, e)) : t, this.emit("message", n);
				} else {
					let n = c(t, e);
					if (!f(n)) return this._loop = !1, y(Error, "invalid UTF-8 sequence", !0, 1007, "WS_ERR_INVALID_UTF8");
					this.emit("message", n.toString());
				}
			}
			this._state = p;
		}
		controlMessage(e) {
			if (this._opcode === 8) if (this._loop = !1, e.length === 0) this.emit("conclude", 1005, ""), this.end();
			else if (e.length === 1) return y(RangeError, "invalid payload length 1", !0, 1002, "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH");
			else {
				let t = e.readUInt16BE(0);
				if (!d(t)) return y(RangeError, `invalid status code ${t}`, !0, 1002, "WS_ERR_INVALID_CLOSE_CODE");
				let n = e.slice(2);
				if (!f(n)) return y(Error, "invalid UTF-8 sequence", !0, 1007, "WS_ERR_INVALID_UTF8");
				this.emit("conclude", t, n.toString()), this.end();
			}
			else this._opcode === 9 ? this.emit("ping", e) : this.emit("pong", e);
			this._state = p;
		}
	};
	function y(e, t, n, r, i) {
		let a = new e(n ? `Invalid WebSocket frame: ${t}` : t);
		return Error.captureStackTrace(a, y), a.code = i, a[o] = r, a;
	}
})), mi = /* @__PURE__ */ A(((e, t) => {
	F("net"), F("tls");
	var { randomFillSync: n } = F("crypto"), r = ci(), { EMPTY_BUFFER: i } = ni(), { isValidStatusCode: a } = fi(), { mask: o, toBuffer: s } = oi(), c = Buffer.alloc(4);
	t.exports = class e {
		constructor(e, t) {
			this._extensions = t || {}, this._socket = e, this._firstFragment = !0, this._compress = !1, this._bufferedBytes = 0, this._deflating = !1, this._queue = [];
		}
		static frame(e, t) {
			let r = t.mask && t.readOnly, i = t.mask ? 6 : 2, a = e.length;
			e.length >= 65536 ? (i += 8, a = 127) : e.length > 125 && (i += 2, a = 126);
			let s = Buffer.allocUnsafe(r ? e.length + i : i);
			return s[0] = t.fin ? t.opcode | 128 : t.opcode, t.rsv1 && (s[0] |= 64), s[1] = a, a === 126 ? s.writeUInt16BE(e.length, 2) : a === 127 && (s.writeUInt32BE(0, 2), s.writeUInt32BE(e.length, 6)), t.mask ? (n(c, 0, 4), s[1] |= 128, s[i - 4] = c[0], s[i - 3] = c[1], s[i - 2] = c[2], s[i - 1] = c[3], r ? (o(e, c, s, i, e.length), [s]) : (o(e, c, e, 0, e.length), [s, e])) : [s, e];
		}
		close(e, t, n, r) {
			let o;
			if (e === void 0) o = i;
			else if (typeof e != "number" || !a(e)) throw TypeError("First argument must be a valid error code number");
			else if (t === void 0 || t === "") o = Buffer.allocUnsafe(2), o.writeUInt16BE(e, 0);
			else {
				let n = Buffer.byteLength(t);
				if (n > 123) throw RangeError("The message must not be greater than 123 bytes");
				o = Buffer.allocUnsafe(2 + n), o.writeUInt16BE(e, 0), o.write(t, 2);
			}
			this._deflating ? this.enqueue([
				this.doClose,
				o,
				n,
				r
			]) : this.doClose(o, n, r);
		}
		doClose(t, n, r) {
			this.sendFrame(e.frame(t, {
				fin: !0,
				rsv1: !1,
				opcode: 8,
				mask: n,
				readOnly: !1
			}), r);
		}
		ping(e, t, n) {
			let r = s(e);
			if (r.length > 125) throw RangeError("The data size must not be greater than 125 bytes");
			this._deflating ? this.enqueue([
				this.doPing,
				r,
				t,
				s.readOnly,
				n
			]) : this.doPing(r, t, s.readOnly, n);
		}
		doPing(t, n, r, i) {
			this.sendFrame(e.frame(t, {
				fin: !0,
				rsv1: !1,
				opcode: 9,
				mask: n,
				readOnly: r
			}), i);
		}
		pong(e, t, n) {
			let r = s(e);
			if (r.length > 125) throw RangeError("The data size must not be greater than 125 bytes");
			this._deflating ? this.enqueue([
				this.doPong,
				r,
				t,
				s.readOnly,
				n
			]) : this.doPong(r, t, s.readOnly, n);
		}
		doPong(t, n, r, i) {
			this.sendFrame(e.frame(t, {
				fin: !0,
				rsv1: !1,
				opcode: 10,
				mask: n,
				readOnly: r
			}), i);
		}
		send(t, n, i) {
			let a = s(t), o = this._extensions[r.extensionName], c = n.binary ? 2 : 1, l = n.compress;
			if (this._firstFragment ? (this._firstFragment = !1, l && o && (l = a.length >= o._threshold), this._compress = l) : (l = !1, c = 0), n.fin && (this._firstFragment = !0), o) {
				let e = {
					fin: n.fin,
					rsv1: l,
					opcode: c,
					mask: n.mask,
					readOnly: s.readOnly
				};
				this._deflating ? this.enqueue([
					this.dispatch,
					a,
					this._compress,
					e,
					i
				]) : this.dispatch(a, this._compress, e, i);
			} else this.sendFrame(e.frame(a, {
				fin: n.fin,
				rsv1: !1,
				opcode: c,
				mask: n.mask,
				readOnly: s.readOnly
			}), i);
		}
		dispatch(t, n, i, a) {
			if (!n) {
				this.sendFrame(e.frame(t, i), a);
				return;
			}
			let o = this._extensions[r.extensionName];
			this._bufferedBytes += t.length, this._deflating = !0, o.compress(t, i.fin, (n, r) => {
				if (this._socket.destroyed) {
					let e = /* @__PURE__ */ Error("The socket was closed while data was being compressed");
					typeof a == "function" && a(e);
					for (let t = 0; t < this._queue.length; t++) {
						let n = this._queue[t][4];
						typeof n == "function" && n(e);
					}
					return;
				}
				this._bufferedBytes -= t.length, this._deflating = !1, i.readOnly = !1, this.sendFrame(e.frame(r, i), a), this.dequeue();
			});
		}
		dequeue() {
			for (; !this._deflating && this._queue.length;) {
				let e = this._queue.shift();
				this._bufferedBytes -= e[1].length, Reflect.apply(e[0], this, e.slice(1));
			}
		}
		enqueue(e) {
			this._bufferedBytes += e[1].length, this._queue.push(e);
		}
		sendFrame(e, t) {
			e.length === 2 ? (this._socket.cork(), this._socket.write(e[0]), this._socket.write(e[1], t), this._socket.uncork()) : this._socket.write(e[0], t);
		}
	};
})), hi = /* @__PURE__ */ A(((e, t) => {
	var n = class {
		constructor(e, t) {
			this.target = t, this.type = e;
		}
	}, r = class extends n {
		constructor(e, t) {
			super("message", t), this.data = e;
		}
	}, i = class extends n {
		constructor(e, t, n) {
			super("close", n), this.wasClean = n._closeFrameReceived && n._closeFrameSent, this.reason = t, this.code = e;
		}
	}, a = class extends n {
		constructor(e) {
			super("open", e);
		}
	}, o = class extends n {
		constructor(e, t) {
			super("error", t), this.message = e.message, this.error = e;
		}
	};
	t.exports = {
		addEventListener(e, t, n) {
			if (typeof t != "function") return;
			function s(e) {
				t.call(this, new r(e, this));
			}
			function c(e, n) {
				t.call(this, new i(e, n, this));
			}
			function l(e) {
				t.call(this, new o(e, this));
			}
			function u() {
				t.call(this, new a(this));
			}
			let d = n && n.once ? "once" : "on";
			e === "message" ? (s._listener = t, this[d](e, s)) : e === "close" ? (c._listener = t, this[d](e, c)) : e === "error" ? (l._listener = t, this[d](e, l)) : e === "open" ? (u._listener = t, this[d](e, u)) : this[d](e, t);
		},
		removeEventListener(e, t) {
			let n = this.listeners(e);
			for (let r = 0; r < n.length; r++) (n[r] === t || n[r]._listener === t) && this.removeListener(e, n[r]);
		}
	};
})), gi = /* @__PURE__ */ A(((e, t) => {
	var n = [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		1,
		1,
		0,
		1,
		1,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
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
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		0,
		0,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		1,
		0,
		1,
		0,
		1,
		0
	];
	function r(e, t, n) {
		e[t] === void 0 ? e[t] = [n] : e[t].push(n);
	}
	function i(e) {
		let t = Object.create(null);
		if (e === void 0 || e === "") return t;
		let i = Object.create(null), a = !1, o = !1, s = !1, c, l, u = -1, d = -1, f = 0;
		for (; f < e.length; f++) {
			let p = e.charCodeAt(f);
			if (c === void 0) if (d === -1 && n[p] === 1) u === -1 && (u = f);
			else if (p === 32 || p === 9) d === -1 && u !== -1 && (d = f);
			else if (p === 59 || p === 44) {
				if (u === -1) throw SyntaxError(`Unexpected character at index ${f}`);
				d === -1 && (d = f);
				let n = e.slice(u, d);
				p === 44 ? (r(t, n, i), i = Object.create(null)) : c = n, u = d = -1;
			} else throw SyntaxError(`Unexpected character at index ${f}`);
			else if (l === void 0) if (d === -1 && n[p] === 1) u === -1 && (u = f);
			else if (p === 32 || p === 9) d === -1 && u !== -1 && (d = f);
			else if (p === 59 || p === 44) {
				if (u === -1) throw SyntaxError(`Unexpected character at index ${f}`);
				d === -1 && (d = f), r(i, e.slice(u, d), !0), p === 44 && (r(t, c, i), i = Object.create(null), c = void 0), u = d = -1;
			} else if (p === 61 && u !== -1 && d === -1) l = e.slice(u, f), u = d = -1;
			else throw SyntaxError(`Unexpected character at index ${f}`);
			else if (o) {
				if (n[p] !== 1) throw SyntaxError(`Unexpected character at index ${f}`);
				u === -1 ? u = f : a ||= !0, o = !1;
			} else if (s) if (n[p] === 1) u === -1 && (u = f);
			else if (p === 34 && u !== -1) s = !1, d = f;
			else if (p === 92) o = !0;
			else throw SyntaxError(`Unexpected character at index ${f}`);
			else if (p === 34 && e.charCodeAt(f - 1) === 61) s = !0;
			else if (d === -1 && n[p] === 1) u === -1 && (u = f);
			else if (u !== -1 && (p === 32 || p === 9)) d === -1 && (d = f);
			else if (p === 59 || p === 44) {
				if (u === -1) throw SyntaxError(`Unexpected character at index ${f}`);
				d === -1 && (d = f);
				let n = e.slice(u, d);
				a &&= (n = n.replace(/\\/g, ""), !1), r(i, l, n), p === 44 && (r(t, c, i), i = Object.create(null), c = void 0), l = void 0, u = d = -1;
			} else throw SyntaxError(`Unexpected character at index ${f}`);
		}
		if (u === -1 || s) throw SyntaxError("Unexpected end of input");
		d === -1 && (d = f);
		let p = e.slice(u, d);
		return c === void 0 ? r(t, p, i) : (l === void 0 ? r(i, p, !0) : a ? r(i, l, p.replace(/\\/g, "")) : r(i, l, p), r(t, c, i)), t;
	}
	function a(e) {
		return Object.keys(e).map((t) => {
			let n = e[t];
			return Array.isArray(n) || (n = [n]), n.map((e) => [t].concat(Object.keys(e).map((t) => {
				let n = e[t];
				return Array.isArray(n) || (n = [n]), n.map((e) => e === !0 ? t : `${t}=${e}`).join("; ");
			})).join("; ")).join(", ");
		}).join(", ");
	}
	t.exports = {
		format: a,
		parse: i
	};
})), _i = /* @__PURE__ */ A(((e, t) => {
	var n = F("events"), r = F("https"), i = F("http"), a = F("net"), o = F("tls"), { randomBytes: s, createHash: c } = F("crypto"), { Readable: l } = F("stream"), { URL: u } = F("url"), d = ci(), f = pi(), p = mi(), { BINARY_TYPES: m, EMPTY_BUFFER: h, GUID: g, kStatusCode: _, kWebSocket: v, NOOP: y } = ni(), { addEventListener: b, removeEventListener: x } = hi(), { format: S, parse: C } = gi(), { toBuffer: w } = oi(), T = [
		"CONNECTING",
		"OPEN",
		"CLOSING",
		"CLOSED"
	], E = [8, 13], D = 30 * 1e3, O = class e extends n {
		constructor(t, n, r) {
			super(), this._binaryType = m[0], this._closeCode = 1006, this._closeFrameReceived = !1, this._closeFrameSent = !1, this._closeMessage = "", this._closeTimer = null, this._extensions = {}, this._protocol = "", this._readyState = e.CONNECTING, this._receiver = null, this._sender = null, this._socket = null, t === null ? this._isServer = !0 : (this._bufferedAmount = 0, this._isServer = !1, this._redirects = 0, Array.isArray(n) ? n = n.join(", ") : typeof n == "object" && n && (r = n, n = void 0), k(this, t, n, r));
		}
		get binaryType() {
			return this._binaryType;
		}
		set binaryType(e) {
			m.includes(e) && (this._binaryType = e, this._receiver && (this._receiver._binaryType = e));
		}
		get bufferedAmount() {
			return this._socket ? this._socket._writableState.length + this._sender._bufferedBytes : this._bufferedAmount;
		}
		get extensions() {
			return Object.keys(this._extensions).join();
		}
		/* istanbul ignore next */
		get onclose() {}
		/* istanbul ignore next */
		set onclose(e) {}
		/* istanbul ignore next */
		get onerror() {}
		/* istanbul ignore next */
		set onerror(e) {}
		/* istanbul ignore next */
		get onopen() {}
		/* istanbul ignore next */
		set onopen(e) {}
		/* istanbul ignore next */
		get onmessage() {}
		/* istanbul ignore next */
		set onmessage(e) {}
		get protocol() {
			return this._protocol;
		}
		get readyState() {
			return this._readyState;
		}
		get url() {
			return this._url;
		}
		setSocket(t, n, r, i, a) {
			let o = new f(this.binaryType, this._extensions, this._isServer, r, i, a);
			this._sender = new p(t, this._extensions), this._receiver = o, this._socket = t, o[v] = this, t[v] = this, o.on("conclude", I), o.on("drain", ee), o.on("error", L), o.on("message", R), o.on("ping", z), o.on("pong", B), t.setTimeout(0), t.setNoDelay(), n.length > 0 && t.unshift(n), t.on("close", H), t.on("data", U), t.on("end", W), t.on("error", G), this._readyState = e.OPEN, this.emit("open");
		}
		emitClose() {
			if (!this._socket) {
				this._readyState = e.CLOSED, this.emit("close", this._closeCode, this._closeMessage);
				return;
			}
			this._extensions[d.extensionName] && this._extensions[d.extensionName].cleanup(), this._receiver.removeAllListeners(), this._readyState = e.CLOSED, this.emit("close", this._closeCode, this._closeMessage);
		}
		close(t, n) {
			if (this.readyState !== e.CLOSED) {
				if (this.readyState === e.CONNECTING) return N(this, this._req, "WebSocket was closed before the connection was established");
				if (this.readyState === e.CLOSING) {
					this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end();
					return;
				}
				this._readyState = e.CLOSING, this._sender.close(t, n, !this._isServer, (e) => {
					e || (this._closeFrameSent = !0, (this._closeFrameReceived || this._receiver._writableState.errorEmitted) && this._socket.end());
				}), this._closeTimer = setTimeout(this._socket.destroy.bind(this._socket), D);
			}
		}
		ping(t, n, r) {
			if (this.readyState === e.CONNECTING) throw Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof t == "function" ? (r = t, t = n = void 0) : typeof n == "function" && (r = n, n = void 0), typeof t == "number" && (t = t.toString()), this.readyState !== e.OPEN) {
				P(this, t, r);
				return;
			}
			n === void 0 && (n = !this._isServer), this._sender.ping(t || h, n, r);
		}
		pong(t, n, r) {
			if (this.readyState === e.CONNECTING) throw Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof t == "function" ? (r = t, t = n = void 0) : typeof n == "function" && (r = n, n = void 0), typeof t == "number" && (t = t.toString()), this.readyState !== e.OPEN) {
				P(this, t, r);
				return;
			}
			n === void 0 && (n = !this._isServer), this._sender.pong(t || h, n, r);
		}
		send(t, n, r) {
			if (this.readyState === e.CONNECTING) throw Error("WebSocket is not open: readyState 0 (CONNECTING)");
			if (typeof n == "function" && (r = n, n = {}), typeof t == "number" && (t = t.toString()), this.readyState !== e.OPEN) {
				P(this, t, r);
				return;
			}
			let i = {
				binary: typeof t != "string",
				mask: !this._isServer,
				compress: !0,
				fin: !0,
				...n
			};
			this._extensions[d.extensionName] || (i.compress = !1), this._sender.send(t || h, i, r);
		}
		terminate() {
			if (this.readyState !== e.CLOSED) {
				if (this.readyState === e.CONNECTING) return N(this, this._req, "WebSocket was closed before the connection was established");
				this._socket && (this._readyState = e.CLOSING, this._socket.destroy());
			}
		}
	};
	Object.defineProperty(O, "CONNECTING", {
		enumerable: !0,
		value: T.indexOf("CONNECTING")
	}), Object.defineProperty(O.prototype, "CONNECTING", {
		enumerable: !0,
		value: T.indexOf("CONNECTING")
	}), Object.defineProperty(O, "OPEN", {
		enumerable: !0,
		value: T.indexOf("OPEN")
	}), Object.defineProperty(O.prototype, "OPEN", {
		enumerable: !0,
		value: T.indexOf("OPEN")
	}), Object.defineProperty(O, "CLOSING", {
		enumerable: !0,
		value: T.indexOf("CLOSING")
	}), Object.defineProperty(O.prototype, "CLOSING", {
		enumerable: !0,
		value: T.indexOf("CLOSING")
	}), Object.defineProperty(O, "CLOSED", {
		enumerable: !0,
		value: T.indexOf("CLOSED")
	}), Object.defineProperty(O.prototype, "CLOSED", {
		enumerable: !0,
		value: T.indexOf("CLOSED")
	}), [
		"binaryType",
		"bufferedAmount",
		"extensions",
		"protocol",
		"readyState",
		"url"
	].forEach((e) => {
		Object.defineProperty(O.prototype, e, { enumerable: !0 });
	}), [
		"open",
		"error",
		"close",
		"message"
	].forEach((e) => {
		Object.defineProperty(O.prototype, `on${e}`, {
			enumerable: !0,
			get() {
				let t = this.listeners(e);
				for (let e = 0; e < t.length; e++) if (t[e]._listener) return t[e]._listener;
			},
			set(t) {
				let n = this.listeners(e);
				for (let t = 0; t < n.length; t++) n[t]._listener && this.removeListener(e, n[t]);
				this.addEventListener(e, t);
			}
		});
	}), O.prototype.addEventListener = b, O.prototype.removeEventListener = x, t.exports = O;
	function k(e, t, n, a) {
		let o = {
			protocolVersion: E[1],
			maxBufferedChunks: 1024 * 1024,
			maxFragments: 128 * 1024,
			maxPayload: 100 * 1024 * 1024,
			perMessageDeflate: !0,
			followRedirects: !1,
			maxRedirects: 10,
			...a,
			createConnection: void 0,
			socketPath: void 0,
			hostname: void 0,
			protocol: void 0,
			timeout: void 0,
			method: void 0,
			host: void 0,
			path: void 0,
			port: void 0
		};
		if (!E.includes(o.protocolVersion)) throw RangeError(`Unsupported protocol version: ${o.protocolVersion} (supported versions: ${E.join(", ")})`);
		let l;
		t instanceof u ? (l = t, e._url = t.href) : (l = new u(t), e._url = t);
		let f = l.protocol === "ws+unix:";
		if (!l.host && (!f || !l.pathname)) {
			let t = /* @__PURE__ */ Error(`Invalid URL: ${e.url}`);
			if (e._redirects === 0) throw t;
			A(e, t);
			return;
		}
		let p = l.protocol === "wss:" || l.protocol === "https:", m = p ? 443 : 80, h = s(16).toString("base64"), _ = p ? r.get : i.get, v;
		if (o.createConnection = p ? M : j, o.defaultPort = o.defaultPort || m, o.port = l.port || m, o.host = l.hostname.startsWith("[") ? l.hostname.slice(1, -1) : l.hostname, o.headers = {
			"Sec-WebSocket-Version": o.protocolVersion,
			"Sec-WebSocket-Key": h,
			Connection: "Upgrade",
			Upgrade: "websocket",
			...o.headers
		}, o.path = l.pathname + l.search, o.timeout = o.handshakeTimeout, o.perMessageDeflate && (v = new d(o.perMessageDeflate === !0 ? {} : o.perMessageDeflate, !1, o.maxPayload), o.headers["Sec-WebSocket-Extensions"] = S({ [d.extensionName]: v.offer() })), n && (o.headers["Sec-WebSocket-Protocol"] = n), o.origin && (o.protocolVersion < 13 ? o.headers["Sec-WebSocket-Origin"] = o.origin : o.headers.Origin = o.origin), (l.username || l.password) && (o.auth = `${l.username}:${l.password}`), f) {
			let e = o.path.split(":");
			o.socketPath = e[0], o.path = e[1];
		}
		if (o.followRedirects) {
			if (e._redirects === 0) {
				e._originalUnixSocket = f, e._originalSecure = p, e._originalHostOrSocketPath = f ? o.socketPath : l.host;
				let t = a && a.headers;
				if (a = {
					...a,
					headers: {}
				}, t) for (let [e, n] of Object.entries(t)) a.headers[e.toLowerCase()] = n;
			} else {
				let t = f ? e._originalUnixSocket ? o.socketPath === e._originalHostOrSocketPath : !1 : e._originalUnixSocket ? !1 : l.host === e._originalHostOrSocketPath;
				(!t || e._originalSecure && !p) && (delete o.headers.authorization, delete o.headers.cookie, t || delete o.headers.host, o.auth = void 0);
			}
			o.auth && !a.headers.authorization && (a.headers.authorization = "Basic " + Buffer.from(o.auth).toString("base64"));
		}
		let y = e._req = _(o);
		o.timeout && y.on("timeout", () => {
			N(e, y, "Opening handshake has timed out");
		}), y.on("error", (t) => {
			y === null || y.aborted || (y = e._req = null, A(e, t));
		}), y.on("response", (r) => {
			let i = r.headers.location, s = r.statusCode;
			if (i && o.followRedirects && s >= 300 && s < 400) {
				if (++e._redirects > o.maxRedirects) {
					N(e, y, "Maximum redirects exceeded");
					return;
				}
				y.abort();
				let r;
				try {
					r = new u(i, t);
				} catch (t) {
					A(e, t);
					return;
				}
				k(e, r, n, a);
			} else e.emit("unexpected-response", y, r) || N(e, y, `Unexpected server response: ${r.statusCode}`);
		}), y.on("upgrade", (t, r, i) => {
			if (e.emit("upgrade", t), e.readyState !== O.CONNECTING) return;
			y = e._req = null;
			let a = t.headers.upgrade;
			if (a === void 0 || a.toLowerCase() !== "websocket") {
				N(e, r, "Invalid Upgrade header");
				return;
			}
			let s = c("sha1").update(h + g).digest("base64");
			if (t.headers["sec-websocket-accept"] !== s) {
				N(e, r, "Invalid Sec-WebSocket-Accept header");
				return;
			}
			let l = t.headers["sec-websocket-protocol"], u = (n || "").split(/, */), f;
			if (!n && l ? f = "Server sent a subprotocol but none was requested" : n && !l ? f = "Server sent no subprotocol" : l && !u.includes(l) && (f = "Server sent an invalid subprotocol"), f) {
				N(e, r, f);
				return;
			}
			l && (e._protocol = l);
			let p = t.headers["sec-websocket-extensions"];
			if (p !== void 0) {
				if (!v) {
					N(e, r, "Server sent a Sec-WebSocket-Extensions header but no extension was requested");
					return;
				}
				let t;
				try {
					t = C(p);
				} catch {
					N(e, r, "Invalid Sec-WebSocket-Extensions header");
					return;
				}
				let n = Object.keys(t);
				if (n.length) {
					if (n.length !== 1 || n[0] !== d.extensionName) {
						N(e, r, "Server indicated an extension that was not requested");
						return;
					}
					try {
						v.accept(t[d.extensionName]);
					} catch {
						N(e, r, "Invalid Sec-WebSocket-Extensions header");
						return;
					}
					e._extensions[d.extensionName] = v;
				}
			}
			e.setSocket(r, i, o.maxPayload, o.maxBufferedChunks, o.maxFragments);
		});
	}
	function A(e, t) {
		e._readyState = O.CLOSING, e.emit("error", t), e.emitClose();
	}
	function j(e) {
		return e.path = e.socketPath, a.connect(e);
	}
	function M(e) {
		return e.path = void 0, !e.servername && e.servername !== "" && (e.servername = a.isIP(e.host) ? "" : e.host), o.connect(e);
	}
	function N(e, t, n) {
		e._readyState = O.CLOSING;
		let r = Error(n);
		Error.captureStackTrace(r, N), t.setHeader ? (t.abort(), t.socket && !t.socket.destroyed && t.socket.destroy(), t.once("abort", e.emitClose.bind(e)), e.emit("error", r)) : (t.destroy(r), t.once("error", e.emit.bind(e, "error")), t.once("close", e.emitClose.bind(e)));
	}
	function P(e, t, n) {
		if (t) {
			let n = w(t).length;
			e._socket ? e._sender._bufferedBytes += n : e._bufferedAmount += n;
		}
		n && n(/* @__PURE__ */ Error(`WebSocket is not open: readyState ${e.readyState} (${T[e.readyState]})`));
	}
	function I(e, t) {
		let n = this[v];
		n._closeFrameReceived = !0, n._closeMessage = t, n._closeCode = e, n._socket[v] !== void 0 && (n._socket.removeListener("data", U), process.nextTick(V, n._socket), e === 1005 ? n.close() : n.close(e, t));
	}
	function ee() {
		this[v]._socket.resume();
	}
	function L(e) {
		let t = this[v];
		t._socket[v] !== void 0 && (t._socket.removeListener("data", U), process.nextTick(V, t._socket), t.close(e[_])), t.emit("error", e);
	}
	function te() {
		this[v].emitClose();
	}
	function R(e) {
		this[v].emit("message", e);
	}
	function z(e) {
		let t = this[v];
		t.pong(e, !t._isServer, y), t.emit("ping", e);
	}
	function B(e) {
		this[v].emit("pong", e);
	}
	function V(e) {
		e.resume();
	}
	function H() {
		let e = this[v];
		this.removeListener("close", H), this.removeListener("data", U), this.removeListener("end", W), e._readyState = O.CLOSING;
		let t;
		!this._readableState.endEmitted && !e._closeFrameReceived && !e._receiver._writableState.errorEmitted && (t = e._socket.read()) !== null && e._receiver.write(t), e._receiver.end(), this[v] = void 0, clearTimeout(e._closeTimer), e._receiver._writableState.finished || e._receiver._writableState.errorEmitted ? e.emitClose() : (e._receiver.on("error", te), e._receiver.on("finish", te));
	}
	function U(e) {
		this[v]._receiver.write(e) || this.pause();
	}
	function W() {
		let e = this[v];
		e._readyState = O.CLOSING, e._receiver.end(), this.end();
	}
	function G() {
		let e = this[v];
		this.removeListener("error", G), this.on("error", y), e && (e._readyState = O.CLOSING, this.destroy());
	}
})), vi = /* @__PURE__ */ A(((e, t) => {
	var { Duplex: n } = F("stream");
	function r(e) {
		e.emit("close");
	}
	function i() {
		!this.destroyed && this._writableState.finished && this.destroy();
	}
	function a(e) {
		this.removeListener("error", a), this.destroy(), this.listenerCount("error") === 0 && this.emit("error", e);
	}
	function o(e, t) {
		let o = !0, s = !0;
		function c() {
			o && e._socket.resume();
		}
		e.readyState === e.CONNECTING ? e.once("open", function() {
			e._receiver.removeAllListeners("drain"), e._receiver.on("drain", c);
		}) : (e._receiver.removeAllListeners("drain"), e._receiver.on("drain", c));
		let l = new n({
			...t,
			autoDestroy: !1,
			emitClose: !1,
			objectMode: !1,
			writableObjectMode: !1
		});
		return e.on("message", function(t) {
			l.push(t) || (o = !1, e._socket.pause());
		}), e.once("error", function(e) {
			l.destroyed || (s = !1, l.destroy(e));
		}), e.once("close", function() {
			l.destroyed || l.push(null);
		}), l._destroy = function(t, n) {
			if (e.readyState === e.CLOSED) {
				n(t), process.nextTick(r, l);
				return;
			}
			let i = !1;
			e.once("error", function(e) {
				i = !0, n(e);
			}), e.once("close", function() {
				i || n(t), process.nextTick(r, l);
			}), s && e.terminate();
		}, l._final = function(t) {
			if (e.readyState === e.CONNECTING) {
				e.once("open", function() {
					l._final(t);
				});
				return;
			}
			e._socket !== null && (e._socket._writableState.finished ? (t(), l._readableState.endEmitted && l.destroy()) : (e._socket.once("finish", function() {
				t();
			}), e.close()));
		}, l._read = function() {
			(e.readyState === e.OPEN || e.readyState === e.CLOSING) && !o && (o = !0, e._receiver._writableState.needDrain || e._socket.resume());
		}, l._write = function(t, n, r) {
			if (e.readyState === e.CONNECTING) {
				e.once("open", function() {
					l._write(t, n, r);
				});
				return;
			}
			e.send(t, r);
		}, l.on("end", i), l.on("error", a), l;
	}
	t.exports = o;
})), yi = /* @__PURE__ */ A(((e, t) => {
	var n = F("events"), r = F("http");
	F("https"), F("net"), F("tls");
	var { createHash: i } = F("crypto"), a = ci(), o = _i(), { format: s, parse: c } = gi(), { GUID: l, kWebSocket: u } = ni(), d = /^[+/0-9A-Za-z]{22}==$/, f = 0, p = 1, m = 2;
	t.exports = class extends n {
		constructor(e, t) {
			if (super(), e = {
				maxBufferedChunks: 1024 * 1024,
				maxFragments: 128 * 1024,
				maxPayload: 100 * 1024 * 1024,
				perMessageDeflate: !1,
				handleProtocols: null,
				clientTracking: !0,
				verifyClient: null,
				noServer: !1,
				backlog: null,
				server: null,
				host: null,
				path: null,
				port: null,
				...e
			}, e.port == null && !e.server && !e.noServer || e.port != null && (e.server || e.noServer) || e.server && e.noServer) throw TypeError("One and only one of the \"port\", \"server\", or \"noServer\" options must be specified");
			if (e.port == null ? e.server && (this._server = e.server) : (this._server = r.createServer((e, t) => {
				let n = r.STATUS_CODES[426];
				t.writeHead(426, {
					"Content-Length": n.length,
					"Content-Type": "text/plain"
				}), t.end(n);
			}), this._server.listen(e.port, e.host, e.backlog, t)), this._server) {
				let e = this.emit.bind(this, "connection");
				this._removeListeners = h(this._server, {
					listening: this.emit.bind(this, "listening"),
					error: this.emit.bind(this, "error"),
					upgrade: (t, n, r) => {
						this.handleUpgrade(t, n, r, e);
					}
				});
			}
			e.perMessageDeflate === !0 && (e.perMessageDeflate = {}), e.clientTracking && (this.clients = /* @__PURE__ */ new Set()), this.options = e, this._state = f;
		}
		address() {
			if (this.options.noServer) throw Error("The server is operating in \"noServer\" mode");
			return this._server ? this._server.address() : null;
		}
		close(e) {
			if (e && this.once("close", e), this._state === m) {
				process.nextTick(g, this);
				return;
			}
			if (this._state === p) return;
			if (this._state = p, this.clients) for (let e of this.clients) e.terminate();
			let t = this._server;
			if (t && (this._removeListeners(), this._removeListeners = this._server = null, this.options.port != null)) {
				t.close(g.bind(void 0, this));
				return;
			}
			process.nextTick(g, this);
		}
		shouldHandle(e) {
			if (this.options.path) {
				let t = e.url.indexOf("?");
				if ((t === -1 ? e.url : e.url.slice(0, t)) !== this.options.path) return !1;
			}
			return !0;
		}
		handleUpgrade(e, t, n, r) {
			t.on("error", _);
			let i = e.headers["sec-websocket-key"] === void 0 ? !1 : e.headers["sec-websocket-key"].trim(), o = e.headers.upgrade, s = +e.headers["sec-websocket-version"], l = {};
			if (e.method !== "GET" || o === void 0 || o.toLowerCase() !== "websocket" || !i || !d.test(i) || s !== 8 && s !== 13 || !this.shouldHandle(e)) return v(t, 400);
			if (this.options.perMessageDeflate) {
				let n = new a(this.options.perMessageDeflate, !0, this.options.maxPayload);
				try {
					let t = c(e.headers["sec-websocket-extensions"]);
					t[a.extensionName] && (n.accept(t[a.extensionName]), l[a.extensionName] = n);
				} catch {
					return v(t, 400);
				}
			}
			if (this.options.verifyClient) {
				let a = {
					origin: e.headers[`${s === 8 ? "sec-websocket-origin" : "origin"}`],
					secure: !!(e.socket.authorized || e.socket.encrypted),
					req: e
				};
				if (this.options.verifyClient.length === 2) {
					this.options.verifyClient(a, (a, o, s, c) => {
						if (!a) return v(t, o || 401, s, c);
						this.completeUpgrade(i, l, e, t, n, r);
					});
					return;
				}
				if (!this.options.verifyClient(a)) return v(t, 401);
			}
			this.completeUpgrade(i, l, e, t, n, r);
		}
		completeUpgrade(e, t, n, r, c, d) {
			if (!r.readable || !r.writable) return r.destroy();
			if (r[u]) throw Error("server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration");
			if (this._state > f) return v(r, 503);
			let p = [
				"HTTP/1.1 101 Switching Protocols",
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Accept: ${i("sha1").update(e + l).digest("base64")}`
			], m = new o(null), h = n.headers["sec-websocket-protocol"];
			if (h && (h = h.split(",").map(y), h = this.options.handleProtocols ? this.options.handleProtocols(h, n) : h[0], h && (p.push(`Sec-WebSocket-Protocol: ${h}`), m._protocol = h)), t[a.extensionName]) {
				let e = t[a.extensionName].params, n = s({ [a.extensionName]: [e] });
				p.push(`Sec-WebSocket-Extensions: ${n}`), m._extensions = t;
			}
			this.emit("headers", p, n), r.write(p.concat("\r\n").join("\r\n")), r.removeListener("error", _), m.setSocket(r, c, this.options.maxPayload, this.options.maxBufferedChunks, this.options.maxFragments), this.clients && (this.clients.add(m), m.on("close", () => this.clients.delete(m))), d(m, n);
		}
	};
	function h(e, t) {
		for (let n of Object.keys(t)) e.on(n, t[n]);
		return function() {
			for (let n of Object.keys(t)) e.removeListener(n, t[n]);
		};
	}
	function g(e) {
		e._state = m, e.emit("close");
	}
	function _() {
		this.destroy();
	}
	function v(e, t, n, i) {
		e.writable && (n ||= r.STATUS_CODES[t], i = {
			Connection: "close",
			"Content-Type": "text/html",
			"Content-Length": Buffer.byteLength(n),
			...i
		}, e.write(`HTTP/1.1 ${t} ${r.STATUS_CODES[t]}\r\n` + Object.keys(i).map((e) => `${e}: ${i[e]}`).join("\r\n") + "\r\n\r\n" + n)), e.removeListener("error", _), e.destroy();
	}
	function y(e) {
		return e.trim();
	}
})), bi = /* @__PURE__ */ A(((e, t) => {
	var n = _i();
	n.createWebSocketStream = vi(), n.Server = yi(), n.Receiver = pi(), n.Sender = mi(), t.exports = n;
})), xi = /* @__PURE__ */ A(((e, t) => {
	var n = F("events"), { browser: r } = ti(), i = r ? window.WebSocket : bi(), a = (e) => JSON.stringify(e), o = (e) => JSON.parse(e);
	t.exports = class extends n {
		constructor(e) {
			super(), this.client = e, this.ws = null, this.tries = 0;
		}
		async connect() {
			let e = 6463 + this.tries % 10;
			this.tries += 1, this.ws = new i(`ws://127.0.0.1:${e}/?v=1&client_id=${this.client.clientId}`, r ? void 0 : { origin: this.client.options.origin }), this.ws.onopen = this.onOpen.bind(this), this.ws.onclose = this.onClose.bind(this), this.ws.onerror = this.onError.bind(this), this.ws.onmessage = this.onMessage.bind(this);
		}
		onOpen() {
			this.emit("open");
		}
		onClose(e) {
			e.wasClean && this.emit("close", e);
		}
		onError(e) {
			try {
				this.ws.close();
			} catch {}
			this.tries > 20 ? this.emit("error", e.error) : setTimeout(() => {
				this.connect();
			}, 250);
		}
		onMessage(e) {
			this.emit("message", o(e.data));
		}
		send(e) {
			this.ws.send(a(e));
		}
		ping() {}
		close() {
			return new Promise((e) => {
				this.once("close", e), this.ws.close();
			});
		}
	};
})), Si = /* @__PURE__ */ A(((e, t) => {
	t.exports = {
		ipc: ei(),
		websocket: xi()
	};
})), Ci = /* @__PURE__ */ A(((e, t) => {
	var n = F("events"), { setTimeout: r, clearTimeout: i } = F("timers"), a = ($r(), P(rr)), o = Si(), { RPCCommands: s, RPCEvents: c, RelationshipTypes: l } = ti(), { pid: u, uuid: d } = Un();
	function f(e, t) {
		return `${e}${JSON.stringify(t)}`;
	}
	t.exports = class extends n {
		constructor(e = {}) {
			super(), this.options = e, this.accessToken = null, this.clientId = null, this.application = null, this.user = null;
			let t = o[e.transport];
			if (!t) throw TypeError("RPC_INVALID_TRANSPORT", e.transport);
			this.fetch = (e, t, { data: n, query: r } = {}) => a(`${this.fetch.endpoint}${t}${r ? new URLSearchParams(r) : ""}`, {
				method: e,
				body: n,
				headers: { Authorization: `Bearer ${this.accessToken}` }
			}).then(async (e) => {
				let t = await e.json();
				if (!e.ok) {
					let n = Error(e.status);
					throw n.body = t, n;
				}
				return t;
			}), this.fetch.endpoint = "https://discord.com/api", this.transport = new t(this), this.transport.on("message", this._onRpcMessage.bind(this)), this._expecting = /* @__PURE__ */ new Map(), this._connectPromise = void 0;
		}
		connect(e) {
			return this._connectPromise ||= new Promise((t, n) => {
				this.clientId = e;
				let a = r(() => n(/* @__PURE__ */ Error("RPC_CONNECTION_TIMEOUT")), 1e4);
				a.unref(), this.once("connected", () => {
					i(a), t(this);
				}), this.transport.once("close", () => {
					this._expecting.forEach((e) => {
						e.reject(/* @__PURE__ */ Error("connection closed"));
					}), this.emit("disconnected"), n(/* @__PURE__ */ Error("connection closed"));
				}), this.transport.connect().catch(n);
			}), this._connectPromise;
		}
		async login(e = {}) {
			let { clientId: t, accessToken: n } = e;
			return await this.connect(t), e.scopes ? (n ||= await this.authorize(e), this.authenticate(n)) : (this.emit("ready"), this);
		}
		request(e, t, n) {
			return new Promise((r, i) => {
				let a = d();
				this.transport.send({
					cmd: e,
					args: t,
					evt: n,
					nonce: a
				}), this._expecting.set(a, {
					resolve: r,
					reject: i
				});
			});
		}
		_onRpcMessage(e) {
			if (e.cmd === s.DISPATCH && e.evt === c.READY) e.data.user && (this.user = e.data.user), this.emit("connected");
			else if (this._expecting.has(e.nonce)) {
				let { resolve: t, reject: n } = this._expecting.get(e.nonce);
				if (e.evt === "ERROR") {
					let t = Error(e.data.message);
					t.code = e.data.code, t.data = e.data, n(t);
				} else t(e.data);
				this._expecting.delete(e.nonce);
			} else this.emit(e.evt, e.data);
		}
		async authorize({ scopes: e, clientSecret: t, rpcToken: n, redirectUri: r, prompt: i } = {}) {
			t && n === !0 && (n = (await this.fetch("POST", "/oauth2/token/rpc", { data: new URLSearchParams({
				client_id: this.clientId,
				client_secret: t
			}) })).rpc_token);
			let { code: a } = await this.request("AUTHORIZE", {
				scopes: e,
				client_id: this.clientId,
				prompt: i,
				rpc_token: n
			});
			return (await this.fetch("POST", "/oauth2/token", { data: new URLSearchParams({
				client_id: this.clientId,
				client_secret: t,
				code: a,
				grant_type: "authorization_code",
				redirect_uri: r
			}) })).access_token;
		}
		authenticate(e) {
			return this.request("AUTHENTICATE", { access_token: e }).then(({ application: t, user: n }) => (this.accessToken = e, this.application = t, this.user = n, this.emit("ready"), this));
		}
		getGuild(e, t) {
			return this.request(s.GET_GUILD, {
				guild_id: e,
				timeout: t
			});
		}
		getGuilds(e) {
			return this.request(s.GET_GUILDS, { timeout: e });
		}
		getChannel(e, t) {
			return this.request(s.GET_CHANNEL, {
				channel_id: e,
				timeout: t
			});
		}
		async getChannels(e, t) {
			let { channels: n } = await this.request(s.GET_CHANNELS, {
				timeout: t,
				guild_id: e
			});
			return n;
		}
		setCertifiedDevices(e) {
			return this.request(s.SET_CERTIFIED_DEVICES, { devices: e.map((e) => ({
				type: e.type,
				id: e.uuid,
				vendor: e.vendor,
				model: e.model,
				related: e.related,
				echo_cancellation: e.echoCancellation,
				noise_suppression: e.noiseSuppression,
				automatic_gain_control: e.automaticGainControl,
				hardware_mute: e.hardwareMute
			})) });
		}
		setUserVoiceSettings(e, t) {
			return this.request(s.SET_USER_VOICE_SETTINGS, {
				user_id: e,
				pan: t.pan,
				mute: t.mute,
				volume: t.volume
			});
		}
		selectVoiceChannel(e, { timeout: t, force: n = !1 } = {}) {
			return this.request(s.SELECT_VOICE_CHANNEL, {
				channel_id: e,
				timeout: t,
				force: n
			});
		}
		selectTextChannel(e, { timeout: t } = {}) {
			return this.request(s.SELECT_TEXT_CHANNEL, {
				channel_id: e,
				timeout: t
			});
		}
		getVoiceSettings() {
			return this.request(s.GET_VOICE_SETTINGS).then((e) => ({
				automaticGainControl: e.automatic_gain_control,
				echoCancellation: e.echo_cancellation,
				noiseSuppression: e.noise_suppression,
				qos: e.qos,
				silenceWarning: e.silence_warning,
				deaf: e.deaf,
				mute: e.mute,
				input: {
					availableDevices: e.input.available_devices,
					device: e.input.device_id,
					volume: e.input.volume
				},
				output: {
					availableDevices: e.output.available_devices,
					device: e.output.device_id,
					volume: e.output.volume
				},
				mode: {
					type: e.mode.type,
					autoThreshold: e.mode.auto_threshold,
					threshold: e.mode.threshold,
					shortcut: e.mode.shortcut,
					delay: e.mode.delay
				}
			}));
		}
		setVoiceSettings(e) {
			return this.request(s.SET_VOICE_SETTINGS, {
				automatic_gain_control: e.automaticGainControl,
				echo_cancellation: e.echoCancellation,
				noise_suppression: e.noiseSuppression,
				qos: e.qos,
				silence_warning: e.silenceWarning,
				deaf: e.deaf,
				mute: e.mute,
				input: e.input ? {
					device_id: e.input.device,
					volume: e.input.volume
				} : void 0,
				output: e.output ? {
					device_id: e.output.device,
					volume: e.output.volume
				} : void 0,
				mode: e.mode ? {
					type: e.mode.type,
					auto_threshold: e.mode.autoThreshold,
					threshold: e.mode.threshold,
					shortcut: e.mode.shortcut,
					delay: e.mode.delay
				} : void 0
			});
		}
		captureShortcut(e) {
			let t = f(c.CAPTURE_SHORTCUT_CHANGE), n = () => (this._subscriptions.delete(t), this.request(s.CAPTURE_SHORTCUT, { action: "STOP" }));
			return this._subscriptions.set(t, ({ shortcut: t }) => {
				e(t, n);
			}), this.request(s.CAPTURE_SHORTCUT, { action: "START" }).then(() => n);
		}
		setActivity(e = {}, t = u()) {
			let n, r, i, a;
			if (e.startTimestamp || e.endTimestamp) {
				if (n = {
					start: e.startTimestamp,
					end: e.endTimestamp
				}, n.start instanceof Date && (n.start = Math.round(n.start.getTime())), n.end instanceof Date && (n.end = Math.round(n.end.getTime())), n.start > 2147483647e3) throw RangeError("timestamps.start must fit into a unix timestamp");
				if (n.end > 2147483647e3) throw RangeError("timestamps.end must fit into a unix timestamp");
			}
			return (e.largeImageKey || e.largeImageText || e.smallImageKey || e.smallImageText) && (r = {
				large_image: e.largeImageKey,
				large_text: e.largeImageText,
				small_image: e.smallImageKey,
				small_text: e.smallImageText
			}), (e.partySize || e.partyId || e.partyMax) && (i = { id: e.partyId }, (e.partySize || e.partyMax) && (i.size = [e.partySize, e.partyMax])), (e.matchSecret || e.joinSecret || e.spectateSecret) && (a = {
				match: e.matchSecret,
				join: e.joinSecret,
				spectate: e.spectateSecret
			}), this.request(s.SET_ACTIVITY, {
				pid: t,
				activity: {
					state: e.state,
					details: e.details,
					timestamps: n,
					assets: r,
					party: i,
					secrets: a,
					buttons: e.buttons,
					instance: !!e.instance
				}
			});
		}
		clearActivity(e = u()) {
			return this.request(s.SET_ACTIVITY, { pid: e });
		}
		sendJoinInvite(e) {
			return this.request(s.SEND_ACTIVITY_JOIN_INVITE, { user_id: e.id || e });
		}
		sendJoinRequest(e) {
			return this.request(s.SEND_ACTIVITY_JOIN_REQUEST, { user_id: e.id || e });
		}
		closeJoinRequest(e) {
			return this.request(s.CLOSE_ACTIVITY_JOIN_REQUEST, { user_id: e.id || e });
		}
		createLobby(e, t, n) {
			return this.request(s.CREATE_LOBBY, {
				type: e,
				capacity: t,
				metadata: n
			});
		}
		updateLobby(e, { type: t, owner: n, capacity: r, metadata: i } = {}) {
			return this.request(s.UPDATE_LOBBY, {
				id: e.id || e,
				type: t,
				owner_id: n && n.id || n,
				capacity: r,
				metadata: i
			});
		}
		deleteLobby(e) {
			return this.request(s.DELETE_LOBBY, { id: e.id || e });
		}
		connectToLobby(e, t) {
			return this.request(s.CONNECT_TO_LOBBY, {
				id: e,
				secret: t
			});
		}
		sendToLobby(e, t) {
			return this.request(s.SEND_TO_LOBBY, {
				id: e.id || e,
				data: t
			});
		}
		disconnectFromLobby(e) {
			return this.request(s.DISCONNECT_FROM_LOBBY, { id: e.id || e });
		}
		updateLobbyMember(e, t, n) {
			return this.request(s.UPDATE_LOBBY_MEMBER, {
				lobby_id: e.id || e,
				user_id: t.id || t,
				metadata: n
			});
		}
		getRelationships() {
			let e = Object.keys(l);
			return this.request(s.GET_RELATIONSHIPS).then((t) => t.relationships.map((t) => ({
				...t,
				type: e[t.type]
			})));
		}
		async subscribe(e, t) {
			return await this.request(s.SUBSCRIBE, t, e), { unsubscribe: () => this.request(s.UNSUBSCRIBE, t, e) };
		}
		async destroy() {
			await this.transport.close();
		}
	};
})), wi = /* @__PURE__ */ A(((e, t) => {
	var n = Un();
	t.exports = {
		Client: Ci(),
		register(e) {
			return n.register(`discord-${e}`);
		}
	};
})), Ti = zn(), Ei = /* @__PURE__ */ N(wi(), 1), Di = S("/"), Oi;
try {
	Oi = Di("worker_threads"), Oi.Worker, Oi.isMarkedAsUntransferable;
} catch {}
var ki = Uint8Array, Ai = Uint16Array, ji = Int32Array, Mi = new ki([
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
]), Ni = new ki([
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
]), Pi = new ki([
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
]), Fi = function(e, t) {
	for (var n = new Ai(31), r = 0; r < 31; ++r) n[r] = t += 1 << e[r - 1];
	for (var i = new ji(n[30]), r = 1; r < 30; ++r) for (var a = n[r]; a < n[r + 1]; ++a) i[a] = a - n[r] << 5 | r;
	return {
		b: n,
		r: i
	};
}, Oi = Fi(Mi, 2), Ii = Oi.b, Li = Oi.r;
Ii[28] = 258, Li[258] = 28;
var Ri = Fi(Ni, 0), zi = Ri.b;
Ri.r;
for (var Bi = new Ai(32768), Q = 0; Q < 32768; ++Q) {
	var Vi = (Q & 43690) >> 1 | (Q & 21845) << 1;
	Vi = (Vi & 52428) >> 2 | (Vi & 13107) << 2, Vi = (Vi & 61680) >> 4 | (Vi & 3855) << 4, Bi[Q] = ((Vi & 65280) >> 8 | (Vi & 255) << 8) >> 1;
}
for (var Hi = (function(e, t, n) {
	for (var r = e.length, i = 0, a = new Ai(t); i < r; ++i) e[i] && ++a[e[i] - 1];
	var o = new Ai(t);
	for (i = 1; i < t; ++i) o[i] = o[i - 1] + a[i - 1] << 1;
	var s;
	if (n) {
		s = new Ai(1 << t);
		var c = 15 - t;
		for (i = 0; i < r; ++i) if (e[i]) for (var l = i << 4 | e[i], u = t - e[i], d = o[e[i] - 1]++ << u, f = d | (1 << u) - 1; d <= f; ++d) s[Bi[d] >> c] = l;
	} else for (s = new Ai(r), i = 0; i < r; ++i) e[i] && (s[i] = Bi[o[e[i] - 1]++] >> 15 - e[i]);
	return s;
}), Ui = new ki(288), Q = 0; Q < 144; ++Q) Ui[Q] = 8;
for (var Q = 144; Q < 256; ++Q) Ui[Q] = 9;
for (var Q = 256; Q < 280; ++Q) Ui[Q] = 7;
for (var Q = 280; Q < 288; ++Q) Ui[Q] = 8;
for (var Wi = new ki(32), Q = 0; Q < 32; ++Q) Wi[Q] = 5;
var Gi = /*#__PURE__*/ Hi(Ui, 9, 1), Ki = /*#__PURE__*/ Hi(Wi, 5, 1), qi = function(e) {
	for (var t = e[0], n = 1; n < e.length; ++n) e[n] > t && (t = e[n]);
	return t;
}, Ji = function(e, t, n) {
	var r = t / 8 | 0;
	return (e[r] | e[r + 1] << 8) >> (t & 7) & n;
}, Yi = function(e, t) {
	var n = t / 8 | 0;
	return (e[n] | e[n + 1] << 8 | e[n + 2] << 16) >> (t & 7);
}, Xi = function(e) {
	return (e + 7) / 8 | 0;
}, Zi = function(e, t, n) {
	return (t == null || t < 0) && (t = 0), (n == null || n > e.length) && (n = e.length), new ki(e.subarray(t, n));
}, Qi = [
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
], $i = function(e, t, n) {
	var r = Error(t || Qi[e]);
	if (r.code = e, Error.captureStackTrace && Error.captureStackTrace(r, $i), !n) throw r;
	return r;
}, ea = function(e, t, n, r) {
	var i = e.length, a = r ? r.length : 0;
	if (!i || t.f && !t.l) return n || new ki(0);
	var o = !n, s = o || t.i != 2, c = t.i;
	o && (n = new ki(i * 3));
	var l = function(e) {
		var t = n.length;
		if (e > t) {
			var r = new ki(Math.max(t * 2, e));
			r.set(n), n = r;
		}
	}, u = t.f || 0, d = t.p || 0, f = t.b || 0, p = t.l, m = t.d, h = t.m, g = t.n, _ = i * 8;
	do {
		if (!p) {
			u = Ji(e, d, 1);
			var v = Ji(e, d + 1, 3);
			if (d += 3, !v) {
				var y = Xi(d) + 4, b = e[y - 4] | e[y - 3] << 8, x = y + b;
				if (x > i) {
					c && $i(0);
					break;
				}
				s && l(f + b), n.set(e.subarray(y, x), f), t.b = f += b, t.p = d = x * 8, t.f = u;
				continue;
			} else if (v == 1) p = Gi, m = Ki, h = 9, g = 5;
			else if (v == 2) {
				var S = Ji(e, d, 31) + 257, C = Ji(e, d + 10, 15) + 4, w = S + Ji(e, d + 5, 31) + 1;
				d += 14;
				for (var T = new ki(w), E = new ki(19), D = 0; D < C; ++D) E[Pi[D]] = Ji(e, d + D * 3, 7);
				d += C * 3;
				for (var O = qi(E), k = (1 << O) - 1, A = Hi(E, O, 1), D = 0; D < w;) {
					var j = A[Ji(e, d, k)];
					d += j & 15;
					var y = j >> 4;
					if (y < 16) T[D++] = y;
					else {
						var M = 0, N = 0;
						for (y == 16 ? (N = 3 + Ji(e, d, 3), d += 2, M = T[D - 1]) : y == 17 ? (N = 3 + Ji(e, d, 7), d += 3) : y == 18 && (N = 11 + Ji(e, d, 127), d += 7); N--;) T[D++] = M;
					}
				}
				var P = T.subarray(0, S), F = T.subarray(S);
				h = qi(P), g = qi(F), p = Hi(P, h, 1), m = Hi(F, g, 1);
			} else $i(1);
			if (d > _) {
				c && $i(0);
				break;
			}
		}
		s && l(f + 131072);
		for (var I = (1 << h) - 1, ee = (1 << g) - 1, L = d;; L = d) {
			var M = p[Yi(e, d) & I], te = M >> 4;
			if (d += M & 15, d > _) {
				c && $i(0);
				break;
			}
			if (M || $i(2), te < 256) n[f++] = te;
			else if (te == 256) {
				L = d, p = null;
				break;
			} else {
				var R = te - 254;
				if (te > 264) {
					var D = te - 257, z = Mi[D];
					R = Ji(e, d, (1 << z) - 1) + Ii[D], d += z;
				}
				var B = m[Yi(e, d) & ee], V = B >> 4;
				B || $i(3), d += B & 15;
				var F = zi[V];
				if (V > 3) {
					var z = Ni[V];
					F += Yi(e, d) & (1 << z) - 1, d += z;
				}
				if (d > _) {
					c && $i(0);
					break;
				}
				s && l(f + 131072);
				var H = f + R;
				if (f < F) {
					var U = a - F, W = Math.min(F, H);
					for (U + f < 0 && $i(3); f < W; ++f) n[f] = r[U + f];
				}
				for (; f < H; ++f) n[f] = n[f - F];
			}
		}
		t.l = p, t.p = L, t.b = f, t.f = u, p && (u = 1, t.m = h, t.d = m, t.n = g);
	} while (!u);
	return f != n.length && o ? Zi(n, 0, f) : n.subarray(0, f);
}, ta = /*#__PURE__*/ new ki(0), na = function(e, t) {
	return e[t] | e[t + 1] << 8;
}, ra = function(e, t) {
	return (e[t] | e[t + 1] << 8 | e[t + 2] << 16 | e[t + 3] << 24) >>> 0;
}, ia = function(e, t) {
	return ra(e, t) + ra(e, t + 4) * 4294967296;
};
function aa(e, t) {
	return ea(e, { i: 2 }, t && t.out, t && t.dictionary);
}
var oa = typeof TextDecoder < "u" && /*#__PURE__*/ new TextDecoder();
try {
	oa.decode(ta, { stream: !0 });
} catch {}
var sa = function(e) {
	for (var t = "", n = 0;;) {
		var r = e[n++], i = (r > 127) + (r > 223) + (r > 239);
		if (n + i > e.length) return {
			s: t,
			r: Zi(e, n - 1)
		};
		i ? i == 3 ? (r = ((r & 15) << 18 | (e[n++] & 63) << 12 | (e[n++] & 63) << 6 | e[n++] & 63) - 65536, t += String.fromCharCode(55296 | r >> 10, 56320 | r & 1023)) : i & 1 ? t += String.fromCharCode((r & 31) << 6 | e[n++] & 63) : t += String.fromCharCode((r & 15) << 12 | (e[n++] & 63) << 6 | e[n++] & 63) : t += String.fromCharCode(r);
	}
};
function ca(e, t) {
	if (t) {
		for (var n = "", r = 0; r < e.length; r += 16384) n += String.fromCharCode.apply(null, e.subarray(r, r + 16384));
		return n;
	} else if (oa) return oa.decode(e);
	else {
		var i = sa(e), a = i.s, n = i.r;
		return n.length && $i(8), a;
	}
}
var la = function(e, t) {
	return t + 30 + na(e, t + 26) + na(e, t + 28);
}, ua = function(e, t, n) {
	var r = na(e, t + 28), i = na(e, t + 30), a = ca(e.subarray(t + 46, t + 46 + r), !(na(e, t + 8) & 2048)), o = t + 46 + r, s = da(e, o, i, n, ra(e, t + 20), ra(e, t + 24), ra(e, t + 42)), c = s[0], l = s[1], u = s[2];
	return [
		na(e, t + 10),
		c,
		l,
		a,
		o + i + na(e, t + 32),
		u
	];
}, da = function(e, t, n, r, i, a, o) {
	var s = i == 4294967295, c = a == 4294967295, l = o == 4294967295, u = t + n, d = s + c + l;
	if (r && d) {
		for (; t + 4 < u; t += 4 + na(e, t + 2)) if (na(e, t) == 1) return [
			s ? ia(e, t + 4 + 8 * c) : i,
			c ? ia(e, t + 4) : a,
			l ? ia(e, t + 4 + 8 * (c + s)) : o,
			1
		];
		r < 2 && $i(13);
	}
	return [
		i,
		a,
		o,
		0
	];
};
function fa(e, t) {
	for (var n = {}, r = e.length - 22; ra(e, r) != 101010256; --r) (!r || e.length - r > 65558) && $i(13);
	var i = na(e, r + 8);
	if (!i) return {};
	var a = ra(e, r + 16), o = ra(e, r - 20) == 117853008;
	if (o) {
		var s = ra(e, r - 12);
		o = ra(e, s) == 101075792, o && (i = ra(e, s + 32), a = ra(e, s + 48));
	}
	for (var c = t && t.filter, l = 0; l < i; ++l) {
		var u = ua(e, a, o), d = u[0], f = u[1], p = u[2], m = u[3], h = u[4], g = u[5], _ = la(e, g);
		a = h, (!c || c({
			name: m,
			size: f,
			originalSize: p,
			compression: d
		})) && (d ? d == 8 ? n[m] = aa(e.subarray(_, _ + f), { out: new ki(p) }) : $i(14, "unknown compression type " + d) : n[m] = Zi(e, _, _ + f));
	}
	return n;
}
//#endregion
//#region electron/main.ts
var pa = _(h), ma = b.dirname(y(import.meta.url));
process.env.APP_ROOT = b.join(ma, "..");
var ha = process.env.VITE_DEV_SERVER_URL, ga = b.join(process.env.APP_ROOT, "dist-electron"), _a = b.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = ha ? b.join(process.env.APP_ROOT, "public") : _a;
function va() {
	return ha ? b.join(process.env.APP_ROOT, "..", "..", "backend", "data", "configs") : b.join(i.getPath("userData"), "configs");
}
function ya() {
	return ha ? b.join(process.env.APP_ROOT, "..", "..", "backend") : process.resourcesPath;
}
function ba(e, t) {
	let n = b.resolve(e), r = b.resolve(t);
	if (n !== r && !n.startsWith(r + b.sep)) throw Error("Access denied");
}
function xa() {
	let e = b.join(va(), "fuse_host.json");
	return x.existsSync(e) ? JSON.parse(x.readFileSync(e, "utf-8")) : {
		disabled_plugins: [],
		enabled_plugins: null,
		extra_plugin_dirs: []
	};
}
function Sa(e) {
	let t = va();
	x.existsSync(t) || x.mkdirSync(t, { recursive: !0 }), x.writeFileSync(b.join(t, "fuse_host.json"), JSON.stringify(e, null, 2), "utf-8");
}
function Ca() {
	let e = !!ha, t = e ? b.join(process.env.APP_ROOT, "..", "..") : process.resourcesPath;
	return {
		core: b.join(t, e ? "backend" : "", "fuse", "plugins"),
		user: b.join(t, e ? "backend" : "", "plugins")
	};
}
function wa(e) {
	return x.existsSync(e) ? x.readdirSync(e).filter((e) => e.endsWith(".fuse")).flatMap((t) => {
		try {
			let n = x.readFileSync(b.join(e, t)), r = fa(new Uint8Array(n), { filter: (e) => e.name.endsWith("/manifest.json") }), i = Object.keys(r).find((e) => e.endsWith("/manifest.json"));
			if (!i) return [];
			let a = JSON.parse(ca(r[i]));
			return [{
				plugin_id: a.plugin_id ?? a.id ?? b.basename(t, ".fuse"),
				name: a.name ?? b.basename(t, ".fuse"),
				version: a.version ?? "0.0.0",
				description: a.description ?? "",
				author: a.author,
				status: "pending",
				configSchema: a.config_schema ?? [],
				hotkeys: a.hotkeys ?? [],
				filePath: b.join(e, t)
			}];
		} catch {
			return [];
		}
	}) : [];
}
var $ = null, Ta = null, Ea = !1, Da = !1, Oa = !1, ka = null, Aa = null, ja = "1519898189006897383", Ma = null, Na = !1, Pa = !1, Fa = null, Ia = null, La = Math.floor(Date.now() / 1e3);
function Ra() {
	if (Ma || !Pa) return;
	let e = new Ei.default.Client({ transport: "ipc" });
	e.on("ready", () => {
		Na = !0, Ia && e.setActivity(Ia);
	}), e.on("disconnected", () => {
		Na = !1, Ma = null, za();
	}), e.login({ clientId: ja }).catch(() => {
		Na = !1, Ma = null, za();
	}), Ma = e;
}
function za() {
	!Pa || Fa || (Fa = setTimeout(() => {
		Fa = null, Ra();
	}, 15e3));
}
function Ba() {
	if (Fa &&= (clearTimeout(Fa), null), Ma) {
		try {
			let e = Ma.destroy();
			e && typeof e.then == "function" && e.catch(() => {});
		} catch {}
		Ma = null;
	}
	Na = !1;
}
function Va(e) {
	if (!e) {
		if (Ia = null, Ma && Na) try {
			Ma.clearActivity();
		} catch {}
		return;
	}
	let t = {
		startTimestamp: La,
		largeImageKey: "fuse_logo",
		largeImageText: "H.E.A.T. FUSE",
		instance: !1,
		...e
	};
	if (Ia = t, Ma && Na) try {
		Ma.setActivity(t);
	} catch {}
}
function Ha() {
	if (Ta) return;
	let e = ha ? b.join(ma, "..", "build", "icon.png") : b.join(process.resourcesPath, "icon.ico");
	Ta = new r(s.createFromPath(e)), Ta.setToolTip("FUSE"), Ta.setContextMenu(n.buildFromTemplate([
		{
			label: "Show",
			click: () => {
				$?.show(), $?.focus();
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				Ea = !0, i.quit();
			}
		}
	])), Ta.on("click", () => {
		$?.show(), $?.focus();
	});
}
function Ua() {
	Ta &&= (Ta.destroy(), null);
}
function Wa() {
	$ = new t({
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
			preload: b.join(ma, "preload.mjs")
		}
	}), $.webContents.on("before-input-event", (e, t) => {
		t.type === "keyDown" && t.control && t.key.toLowerCase() === "r" && e.preventDefault();
	}), $.on("close", (e) => {
		Oa && $ && !Ea && (e.preventDefault(), $.hide());
	}), $.on("hide", () => {
		$?.webContents.send("app:suspended");
	}), $.on("show", () => {
		$?.webContents.send("app:resumed");
	}), $.webContents.session.webRequest.onHeadersReceived((e, t) => {
		t({ responseHeaders: {
			...e.responseHeaders,
			"Content-Security-Policy": [`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://*.betterstackdata.com https://us.i.posthog.com https://us-assets.i.posthog.com https://unpkg.com; frame-src ${ha ? "http://localhost:*" : "'none'"}; object-src 'none'; base-uri 'self'`]
		} });
	}), ha ? $.loadURL(ha) : $.loadFile(b.join(_a, "index.html"));
}
i.on("window-all-closed", () => {
	process.platform !== "darwin" && (i.quit(), $ = null);
});
var Ga = !1;
i.on("before-quit", (e) => {
	if (Ea = !0, Ba(), Ga) return;
	if (!ka) {
		Ga = !0;
		return;
	}
	e.preventDefault();
	let t = ka;
	ka = null, Aa = null;
	let n = setTimeout(() => t.kill("SIGKILL"), 3e3);
	t.once("exit", () => {
		clearTimeout(n), Ga = !0, i.quit();
	}), t.kill("SIGTERM");
}), i.on("activate", () => {
	t.getAllWindows().length === 0 && Wa();
}), i.whenReady().then(() => {
	Wa(), c.on("suspend", () => {
		$?.webContents.send("app:suspended");
	}), c.on("resume", () => {
		$?.webContents.send("app:resumed");
	}), o.handle("window:close", () => {
		(t.getFocusedWindow() || $)?.close();
	}), o.handle("window:minimize", () => {
		(t.getFocusedWindow() || $)?.minimize();
	}), o.handle("window:maximize", () => {
		let e = t.getFocusedWindow() || $;
		e && (e.isMaximized() ? e.unmaximize() : e.maximize());
	}), o.handle("fuse:spawn", async () => {
		if (ka) return {
			success: !1,
			error: "already running"
		};
		let e = !!ha, t, n, r;
		if (e) {
			let e = b.join(process.env.APP_ROOT, "..", "..", "backend"), i = b.join(e, ".venv", "Scripts", "python.exe"), a = b.join(e, "fuse", "requirements.txt");
			try {
				x.existsSync(i) || await pa("python", [
					"-m",
					"venv",
					b.join(e, ".venv")
				]), await pa(i, [
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
			t = i, n = [b.join(e, "fuse", "run_fuse.py")], r = {
				...process.env,
				PYTHONPATH: e
			};
		} else t = b.join(process.resourcesPath, "fuse-backend.dist", "fuse-backend.exe"), n = [], r = {
			...process.env,
			FUSE_PLUGIN_DIRS: [b.join(process.resourcesPath, "fuse", "plugins"), b.join(process.resourcesPath, "plugins")].join(";")
		};
		return new Promise((e) => {
			let i = g(t, n, {
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
				r && (r[1] === "ERROR" || r[1] === "CRITICAL" ? n = "error" : r[1] === "WARNING" ? n = "warn" : r[1] === "DEBUG" && (n = "debug")), $?.webContents.send("fuse:log", {
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
						n && r && (a = !0, clearTimeout(c), ka = i, Aa = n, i.on("exit", (e, t) => {
							ka = null, Aa = null, Ea || $?.webContents.send("fuse:exited", {
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
	}), o.handle("fuse:kill", async () => ka ? new Promise((e) => {
		let t = ka, n = setTimeout(() => t.kill("SIGKILL"), 3e3);
		t.once("exit", () => {
			clearTimeout(n), e({ success: !0 });
		}), t.kill("SIGTERM");
	}) : { success: !0 }), o.handle("fuse:status", () => ({
		running: !!ka,
		pid: ka?.pid ?? null,
		port: Aa
	})), o.handle("plugins:scan", () => {
		let { core: e, user: t } = Ca();
		return [...wa(e), ...wa(t)];
	}), o.handle("plugins:show-file", (e, t) => {
		u.showItemInFolder(t);
	}), o.handle("plugins:delete", (e, t) => {
		try {
			return x.unlinkSync(t), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), o.handle("dialog:select-dir", async () => {
		let e = await a.showOpenDialog($, { properties: ["openDirectory"] });
		return e.canceled ? null : e.filePaths[0] ?? null;
	}), o.handle("config:host:read", () => xa());
	let e = b.join(va(), "fuse_host.json");
	if (x.existsSync(e)) {
		let t = null;
		x.watch(e, () => {
			t && clearTimeout(t), t = setTimeout(() => {
				$?.webContents.send("config:host:changed", xa());
			}, 150);
		});
	}
	o.handle("config:plugin:set-enabled", (e, t, n) => {
		try {
			let e = xa(), r = e.disabled_plugins ?? [];
			return e.disabled_plugins = n ? r.filter((e) => e !== t) : r.includes(t) ? r : [...r, t], Sa(e), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), o.handle("safe-storage:is-available", () => l.isEncryptionAvailable()), o.handle("safe-storage:encrypt", (e, t) => l.encryptString(t).toJSON()), o.handle("safe-storage:decrypt", (e, t) => l.decryptString(Buffer.from(t.data))), o.handle("app:set-autostart", (e, t) => {
		i.setLoginItemSettings({ openAtLogin: t });
	}), o.handle("app:set-minimize-to-tray-on-start", (e, t) => {
		Da = t, t ? Ha() : Oa || Ua();
	}), o.handle("app:apply-minimize-to-tray-on-start", () => {
		Da && $ && i.getLoginItemSettings().wasOpenedAtLogin && $.hide();
	}), o.handle("app:set-minimize-to-tray-on-close", (e, t) => {
		Oa = t, t ? Ha() : Da || Ua();
	}), o.handle("discord:set-enabled", (e, t) => (Pa = !!t, Pa ? Ra() : (Ba(), Ia = null), { success: !0 })), o.handle("discord:set-activity", (e, t) => (Va(t), {
		success: !0,
		connected: Na
	})), o.handle("discord:clear-activity", () => (Va(null), { success: !0 })), o.handle("discord:status", () => ({
		enabled: Pa,
		connected: Na
	})), o.handle("app:open-backend-dir", () => {
		let e = ha ? b.join(process.env.APP_ROOT, "..", "..", "backend") : process.resourcesPath;
		return u.openPath(e);
	}), o.handle("fs:get-root", () => ya()), o.handle("fs:list-dir", async (e, t) => {
		ba(t, ya());
		let n = await x.promises.readdir(t);
		return (await Promise.all(n.map(async (e) => {
			let n = b.join(t, e);
			try {
				let t = await x.promises.stat(n);
				return {
					name: e,
					isDir: t.isDirectory(),
					size: t.size,
					created: t.birthtimeMs,
					modified: t.mtimeMs
				};
			} catch {
				return null;
			}
		}))).filter(Boolean);
	}), o.handle("fs:read-file", async (e, t) => {
		if (ba(t, ya()), (await x.promises.stat(t)).size > 1024 * 1024) throw Error("File too large to preview (>1 MB)");
		return x.promises.readFile(t, "utf-8");
	}), o.handle("fs:write-file", async (e, t, n) => {
		ba(t, ya()), await x.promises.writeFile(t, n, "utf-8");
	}), o.handle("config:plugin:read", (e, t) => {
		try {
			let e = b.join(va(), `fuse_${t}.json`);
			return x.existsSync(e) ? JSON.parse(x.readFileSync(e, "utf-8")) : {};
		} catch {
			return {};
		}
	}), o.handle("config:plugin:write-key", (e, t, n, r) => {
		try {
			let e = va();
			x.existsSync(e) || x.mkdirSync(e, { recursive: !0 });
			let i = b.join(e, `fuse_${t}.json`), a = x.existsSync(i) ? JSON.parse(x.readFileSync(i, "utf-8")) : {};
			return a[n] = r, x.writeFileSync(i, JSON.stringify(a, null, 2), "utf-8"), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), o.handle("hotkey:write-override", (e, t, n, r) => {
		try {
			let e = xa();
			return e.hotkey_overrides ??= {}, e.hotkey_overrides[t] ??= {}, e.hotkey_overrides[t][n] = r, Sa(e), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), ha || (Ti.autoUpdater.autoDownload = !1, Ti.autoUpdater.autoInstallOnAppQuit = !0, Ti.autoUpdater.on("checking-for-update", () => {
		$?.webContents.send("update:checking");
	}), Ti.autoUpdater.on("update-available", (e) => {
		$?.webContents.send("update:available", {
			version: e.version,
			releaseNotes: e.releaseNotes ?? "",
			releaseDate: e.releaseDate
		});
	}), Ti.autoUpdater.on("update-not-available", (e) => {
		$?.webContents.send("update:not-available", { version: e.version });
	}), Ti.autoUpdater.on("download-progress", (e) => {
		$?.webContents.send("update:progress", {
			percent: e.percent,
			bytesPerSecond: e.bytesPerSecond,
			transferred: e.transferred,
			total: e.total
		});
	}), Ti.autoUpdater.on("update-downloaded", (e) => {
		$?.webContents.send("update:downloaded", {
			version: e.version,
			releaseDate: e.releaseDate
		});
	}), Ti.autoUpdater.on("error", (e) => {
		$?.webContents.send("update:error", { message: e.message || "Unknown error" });
	})), o.handle("update:check", async () => {
		if (ha) return setTimeout(() => {
			$?.webContents.send("update:available", {
				version: "99.0.0",
				releaseNotes: "• Dev mode mock update",
				releaseDate: (/* @__PURE__ */ new Date()).toISOString()
			});
		}, 800), { success: !0 };
		try {
			return {
				success: !0,
				updateInfo: (await Ti.autoUpdater.checkForUpdates())?.updateInfo
			};
		} catch (e) {
			return {
				success: !1,
				error: e.message || "check_failed"
			};
		}
	}), o.handle("update:download", async () => {
		if (ha) {
			let e = 0, t = setInterval(() => {
				e += 10, $?.webContents.send("update:progress", {
					percent: e,
					bytesPerSecond: 1024 * 1024 * 2.5,
					transferred: e * 1024 * 100,
					total: 1024 * 1024 * 10
				}), e >= 100 && (clearInterval(t), setTimeout(() => {
					$?.webContents.send("update:downloaded", {
						version: "99.0.0",
						releaseDate: (/* @__PURE__ */ new Date()).toISOString()
					});
				}, 300));
			}, 200);
			return { success: !0 };
		}
		try {
			return await Ti.autoUpdater.downloadUpdate(), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), o.handle("update:install", () => (ha || setImmediate(() => Ti.autoUpdater.quitAndInstall(!1, !0)), { success: !0 })), o.handle("game:scan-dir", (e, t) => {
		try {
			let e, n = b.join(t, "game_info.xml");
			if (x.existsSync(n)) {
				let t = x.readFileSync(n, "utf-8").match(/<version_name>(.*?)<\/version_name>/);
				t && (e = t[1].trim());
			}
			let r = x.existsSync(b.join(t, "coldwar.project"));
			return {
				version: e,
				hasProject: r
			};
		} catch (e) {
			return { error: e.message };
		}
	}), o.handle("game:check-debugger", (e, t) => {
		try {
			let e = b.join(t, "coldwar.project"), n = x.readFileSync(e, "utf-8");
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
	}), o.handle("game:enable-debugger", (e, t) => {
		try {
			let e = b.join(t, "coldwar.project"), n = x.readFileSync(e, "utf-8");
			return n = n.replace(/"Debugger Port"\s*:\s*\d+/g, "\"Debugger Port\": 9222"), n = n.replace(/"Enable Debugger"\s*:\s*false/g, "\"Enable Debugger\": true"), x.writeFileSync(e, n, "utf-8"), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	}), o.handle("game:disable-debugger", (e, t) => {
		try {
			let e = b.join(t, "coldwar.project"), n = x.readFileSync(e, "utf-8");
			return n = n.replace(/"Enable Debugger"\s*:\s*true/g, "\"Enable Debugger\": false"), x.writeFileSync(e, n, "utf-8"), { success: !0 };
		} catch (e) {
			return {
				success: !1,
				error: e.message
			};
		}
	});
});
//#endregion
export { ga as MAIN_DIST, _a as RENDERER_DIST, ha as VITE_DEV_SERVER_URL };
