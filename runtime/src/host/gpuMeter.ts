import { createRequire } from "node:module";
import { logger } from "../log.js";

export interface GpuSample {
  /** Percent for the busiest engine type, its engines summed, as Task Manager shows it. */
  percent: number;
  /** That engine type, e.g. "3D"; "none" while the process uses no engine. */
  engine: string;
}

export interface GpuMeter {
  /** Null when Windows can't read the counters. */
  sample(): GpuSample | null;
  close(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdhFn = (...args: any[]) => any;

interface Pdh {
  address: (value: unknown) => bigint | number;
  open: PdhFn;
  add: PdhFn;
  collect: PdhFn;
  array: PdhFn;
  close: PdhFn;
}

const PDH_MORE_DATA = 0x800007d2;
const PDH_NO_DATA = 0x800007d5;
const PDH_FMT_DOUBLE = 0x200;
/** PDH_FMT_COUNTERVALUE_ITEM_W on 64-bit: name pointer, status and padding, double. */
const ITEM_BYTES = 24;

let pdh: Pdh | null | undefined;

function bindPdh(): Pdh | null {
  if (pdh !== undefined) return pdh;
  pdh = null;
  if (process.platform !== "win32" || (process.arch !== "x64" && process.arch !== "arm64")) return null;
  try {
    // required, not imported: a native addon the bundle keeps external.
    const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
    const lib = koffi.load("pdh.dll");
    koffi.pointer("FUSE_PDH_HANDLE", koffi.opaque());
    pdh = {
      address: (koffi as unknown as { address: (value: unknown) => bigint | number }).address,
      open: lib.func("uint32 __stdcall PdhOpenQueryW(const char16_t *source, uintptr_t user, _Out_ FUSE_PDH_HANDLE *query)"),
      add: lib.func(
        "uint32 __stdcall PdhAddEnglishCounterW(FUSE_PDH_HANDLE query, const char16_t *path, uintptr_t user, _Out_ FUSE_PDH_HANDLE *counter)",
      ),
      collect: lib.func("uint32 __stdcall PdhCollectQueryData(FUSE_PDH_HANDLE query)"),
      array: lib.func(
        "uint32 __stdcall PdhGetFormattedCounterArrayW(FUSE_PDH_HANDLE counter, uint32 format, _Inout_ uint32 *size, _Out_ uint32 *count, _Out_ uint8_t *items)",
      ),
      close: lib.func("uint32 __stdcall PdhCloseQuery(FUSE_PDH_HANDLE query)"),
    };
  } catch (e) {
    logger.warning(`GPU metering unavailable (${e instanceof Error ? e.message : String(e)})`);
    pdh = null;
  }
  return pdh;
}

function readUtf16(buf: Buffer, offset: number): string {
  let text = "";
  for (let at = offset; at >= 0 && at + 1 < buf.length; at += 2) {
    const ch = buf.readUInt16LE(at);
    if (ch === 0) break;
    text += String.fromCharCode(ch);
  }
  return text;
}

/** Every matching instance with its value; empty while none exists; null on error. */
function readInstances(api: Pdh, counter: unknown): Array<{ name: string; value: number }> | null {
  const size = [0];
  const count = [0];
  let status = api.array(counter, PDH_FMT_DOUBLE, size, count, null);
  if (status === PDH_NO_DATA) return [];
  if (status !== PDH_MORE_DATA) return null;
  const buf = Buffer.alloc(size[0]!);
  status = api.array(counter, PDH_FMT_DOUBLE, size, count, buf);
  if (status !== 0) return null;
  // Names point into the same buffer, after the items.
  const base = BigInt(api.address(buf));
  const items: Array<{ name: string; value: number }> = [];
  for (let i = 0; i < count[0]!; i++) {
    const at = i * ITEM_BYTES;
    const value = buf.readDoubleLE(at + 16);
    items.push({ name: readUtf16(buf, Number(buf.readBigUInt64LE(at) - base)), value: Number.isFinite(value) ? value : 0 });
  }
  return items;
}

export function openGpuMeter(pid: number | undefined): GpuMeter | null {
  if (!pid) return null;
  const api = bindPdh();
  if (!api) return null;
  const query: unknown[] = [null];
  if (api.open(null, 0, query) !== 0 || !query[0]) return null;
  const counter: unknown[] = [null];
  if (api.add(query[0], `\\GPU Engine(pid_${pid}_*)\\Utilization Percentage`, 0, counter) !== 0) {
    api.close(query[0]);
    return null;
  }
  // Utilization is a rate: the first collection is only the baseline.
  api.collect(query[0]);
  let open = true;
  return {
    sample() {
      if (!open) return null;
      const status = api.collect(query[0]);
      if (status === PDH_NO_DATA) return { percent: 0, engine: "none" };
      if (status !== 0) return null;
      const items = readInstances(api, counter[0]);
      if (!items) return null;
      const perEngine = new Map<string, number>();
      for (const { name, value } of items) {
        const engine = /engtype_(.+)$/.exec(name)?.[1] ?? "other";
        perEngine.set(engine, (perEngine.get(engine) ?? 0) + value);
      }
      let busiest: GpuSample = { percent: 0, engine: "none" };
      for (const [engine, percent] of perEngine) if (percent > busiest.percent) busiest = { percent, engine };
      return { percent: Math.min(100, busiest.percent), engine: busiest.engine };
    },
    close() {
      if (!open) return;
      open = false;
      api.close(query[0]);
    },
  };
}
