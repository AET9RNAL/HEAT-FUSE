/**
 * What the overlay stage costs: its renderer process, and Chromium's GPU process,
 * which the App window and the consent card share. Electron main reports both ids.
 */
import os from "node:os";
import { openMeter, type ProcessMeter } from "./processMeter.js";
import { openGpuMeter, type GpuMeter } from "./gpuMeter.js";

const CORES = os.availableParallelism();

export interface StageProcessMetrics {
  /** Share of all cores, 0-100; null until two samples. */
  cpu: number | null;
  /** Private working set, in bytes. */
  ram: number;
}

export interface StageMetrics {
  renderer: StageProcessMetrics | null;
  gpuProcess: (StageProcessMetrics & { gpu: number | null; engine: string | null }) | null;
}

class TrackedProcess {
  private last: { cpuMs: number; at: number } | null = null;

  constructor(
    readonly pid: number,
    private readonly meter: ProcessMeter,
  ) {}

  read(): StageProcessMetrics | null {
    const s = this.meter.sample();
    if (!s) return null;
    const at = Date.now();
    const prev = this.last;
    this.last = { cpuMs: s.cpuMs, at };
    const cpu =
      prev && at > prev.at ? Math.min(100, Math.max(0, ((s.cpuMs - prev.cpuMs) / (at - prev.at) / CORES) * 100)) : null;
    return { cpu, ram: s.ram };
  }

  close(): void {
    this.meter.close();
  }
}

function track(pid: number): TrackedProcess | null {
  const meter = pid > 0 ? openMeter(pid) : null;
  return meter ? new TrackedProcess(pid, meter) : null;
}

export class StageMeter {
  private renderer: TrackedProcess | null = null;
  private gpuProcess: TrackedProcess | null = null;
  private gpu: GpuMeter | null = null;

  /** Reopens only what changed: a reloaded stage gets a new renderer, a restarted GPU process a new id. */
  setProcesses(rendererPid: number, gpuPid: number): void {
    if ((this.renderer?.pid ?? 0) !== rendererPid) {
      this.renderer?.close();
      this.renderer = track(rendererPid);
    }
    if ((this.gpuProcess?.pid ?? 0) !== gpuPid) {
      this.gpuProcess?.close();
      this.gpu?.close();
      this.gpuProcess = track(gpuPid);
      this.gpu = this.gpuProcess ? openGpuMeter(gpuPid) : null;
    }
  }

  /** Null while neither process can be read. */
  sample(): StageMetrics | null {
    const renderer = this.renderer?.read() ?? null;
    const proc = this.gpuProcess?.read() ?? null;
    if (!renderer && !proc) return null;
    const gpu = proc ? (this.gpu?.sample() ?? null) : null;
    return {
      renderer,
      gpuProcess: proc ? { ...proc, gpu: gpu ? gpu.percent : null, engine: gpu ? gpu.engine : null } : null,
    };
  }

  close(): void {
    this.renderer?.close();
    this.gpuProcess?.close();
    this.gpu?.close();
    this.renderer = null;
    this.gpuProcess = null;
    this.gpu = null;
  }
}
