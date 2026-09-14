/**
 * Plugin process RAM and CPU, measured by the runtime through Win32 so a plugin
 * can't report its own numbers. Unavailable off Windows or without koffi; the
 * caller then falls back to the plugin's self-report.
 */
import { createRequire } from "node:module";
import { logger } from "../log.js";

export interface ProcessSample {
  /** Private working set in bytes; private bytes on Windows versions without it. */
  ram: number;
  /** Kernel plus user CPU time since the process started, in ms. */
  cpuMs: number;
}

export interface ProcessMeter {
  /** Null once the process has exited, the meter is closed, or Windows refuses. */
  sample(): ProcessSample | null;
  close(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win32Fn = (...args: any[]) => any;

interface Win32 {
  openProcess: Win32Fn;
  closeHandle: Win32Fn;
  getProcessTimes: Win32Fn;
  memoryInfoEx2: Win32Fn;
  memoryInfoEx: Win32Fn;
  ex2Size: number;
  exSize: number;
}

interface FileTime {
  low: number;
  high: number;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const FILETIME_TICKS_PER_MS = 10_000;

let win32: Win32 | null | undefined;
/** Cleared once Windows shows it has no private working set (before PROCESS_MEMORY_COUNTERS_EX2). */
let ex2Supported = true;

function bindWin32(): Win32 | null {
  if (win32 !== undefined) return win32;
  win32 = null;
  if (process.platform !== "win32") return null;
  try {
    // required, not imported: a native addon the bundle keeps external.
    const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
    const kernel32 = koffi.load("kernel32.dll");
    koffi.pointer("FUSE_HANDLE", koffi.opaque());
    koffi.struct("FUSE_FILETIME", { low: "uint32", high: "uint32" });
    const counters = {
      cb: "uint32",
      PageFaultCount: "uint32",
      PeakWorkingSetSize: "size_t",
      WorkingSetSize: "size_t",
      QuotaPeakPagedPoolUsage: "size_t",
      QuotaPagedPoolUsage: "size_t",
      QuotaPeakNonPagedPoolUsage: "size_t",
      QuotaNonPagedPoolUsage: "size_t",
      PagefileUsage: "size_t",
      PeakPagefileUsage: "size_t",
      PrivateUsage: "size_t",
    };
    const ex = koffi.struct("FUSE_PMC_EX", counters);
    const ex2 = koffi.struct("FUSE_PMC_EX2", { ...counters, PrivateWorkingSetSize: "size_t", SharedCommitUsage: "uint64" });
    win32 = {
      openProcess: kernel32.func("FUSE_HANDLE __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)"),
      closeHandle: kernel32.func("int __stdcall CloseHandle(FUSE_HANDLE handle)"),
      getProcessTimes: kernel32.func(
        "int __stdcall GetProcessTimes(FUSE_HANDLE handle, _Out_ FUSE_FILETIME *creation, _Out_ FUSE_FILETIME *exit, _Out_ FUSE_FILETIME *kernel, _Out_ FUSE_FILETIME *user)",
      ),
      memoryInfoEx2: kernel32.func("int __stdcall K32GetProcessMemoryInfo(FUSE_HANDLE handle, _Out_ FUSE_PMC_EX2 *counters, uint32 cb)"),
      memoryInfoEx: kernel32.func("int __stdcall K32GetProcessMemoryInfo(FUSE_HANDLE handle, _Out_ FUSE_PMC_EX *counters, uint32 cb)"),
      ex2Size: koffi.sizeof(ex2),
      exSize: koffi.sizeof(ex),
    };
  } catch (e) {
    logger.warning(`process metering unavailable (${e instanceof Error ? e.message : String(e)}); plugins report their own RAM and CPU`);
    win32 = null;
  }
  return win32;
}

function filetimeMs(ft: FileTime): number {
  return (ft.high * 2 ** 32 + ft.low) / FILETIME_TICKS_PER_MS;
}

function readRam(api: Win32, handle: unknown): number | null {
  if (ex2Supported) {
    const c: Record<string, unknown> = {};
    if (api.memoryInfoEx2(handle, c, api.ex2Size) && Number(c.PrivateWorkingSetSize) > 0) {
      return Number(c.PrivateWorkingSetSize);
    }
  }
  const c: Record<string, unknown> = {};
  if (!api.memoryInfoEx(handle, c, api.exSize)) return null;
  if (ex2Supported) {
    // The older call works where the newer one gave nothing: this Windows has no private working set.
    ex2Supported = false;
    logger.debug("process metering: private working set unavailable, using private bytes");
  }
  return Number(c.PrivateUsage);
}

/** Opens the process for querying; the handle keeps its id from being reused until close(). */
export function openMeter(pid: number | undefined): ProcessMeter | null {
  if (!pid) return null;
  const api = bindWin32();
  if (!api) return null;
  const handle: unknown = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return null;
  let open = true;
  return {
    sample() {
      if (!open) return null;
      const creation = {} as FileTime;
      const exit = {} as FileTime;
      const kernel = {} as FileTime;
      const user = {} as FileTime;
      if (!api.getProcessTimes(handle, creation, exit, kernel, user)) return null;
      if (filetimeMs(exit) > 0) return null;
      const ram = readRam(api, handle);
      return ram === null ? null : { ram, cpuMs: filetimeMs(kernel) + filetimeMs(user) };
    },
    close() {
      if (!open) return;
      open = false;
      api.closeHandle(handle);
    },
  };
}
