/**
 * Rive overlay controller - wraps the Rive WebGL2 runtime (the Rive Renderer)
 * and applies the FUSE overlay view-model data-binding protocol (the
 * `overlay:data` inputs streamed from the runtime). Shared by the Vue
 * `RiveOverlay` component and the Rive gate spike.
 */
import { Rive, type ViewModelInstance } from "@rive-app/webgl2";

export type OverlayInputType = "number" | "bool" | "string" | "color" | "enum" | "trigger" | "json";
export interface OverlayInput {
  t: OverlayInputType;
  v: unknown;
}

export interface RiveOverlayOptions {
  buffer: ArrayBuffer;
  artboard?: string | null;
  stateMachine?: string | null;
  viewModel?: string | null;
  onReady?: () => void;
  onError?: (msg: string) => void;
}

/** Rive reports a wasm fault as a bare object, which `String()` turns into "[object Object]". */
function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  try {
    const s = JSON.stringify(e);
    if (s && s !== "{}") return s;
  } catch {
    /* cyclic */
  }
  const msg = (e as { message?: unknown })?.message;
  return typeof msg === "string" && msg ? msg : Object.prototype.toString.call(e);
}

export class RiveOverlayController {
  private rive: Rive;
  private canvas: HTMLCanvasElement;
  private inst: ViewModelInstance | null = null;
  private ready = false;
  private pending: Record<string, OverlayInput> = {};
  /** Set by destroy() or by a failed load: every wasm call after this would fault. */
  private dead = false;

  constructor(canvas: HTMLCanvasElement, opts: RiveOverlayOptions) {
    this.canvas = canvas;
    const useAutoBind = !opts.viewModel;
    this.rive = new Rive({
      canvas,
      buffer: opts.buffer,
      autoplay: true,
      autoBind: useAutoBind,
      artboard: opts.artboard ?? undefined,
      stateMachines: opts.stateMachine ? [opts.stateMachine] : undefined,
      onLoad: () => {
        if (this.dead) return;
        try {
          if (opts.viewModel) {
            const vm = this.rive.viewModelByName(opts.viewModel);
            const inst = vm?.defaultInstance() ?? vm?.instanceByIndex(0) ?? null;
            if (inst) {
              this.rive.bindViewModelInstance(inst);
              this.inst = inst;
            } else {
              opts.onError?.(`view model '${opts.viewModel}' not found in .riv`);
            }
          } else {
            this.inst = this.rive.viewModelInstance;
          }
          // Not while the overlay is display:none - see resize().
          this.resize();
          this.ready = true;
          const p = this.pending;
          this.pending = {};
          this.apply(p);
          opts.onReady?.();
        } catch (e) {
          this.fail(errText(e), opts.onError);
        }
      },
      // A failed load leaves a WebGL2 context on the canvas. Release it
      onLoadError: (e) => this.fail(errText(e), opts.onError),
    });
  }

  private fail(msg: string, onError?: (m: string) => void): void {
    if (this.dead) return;
    this.dead = true;
    this.ready = false;
    this.inst = null;
    this.pending = {};
    onError?.(msg);
    try {
      this.rive.cleanup();
    } catch {
      /* the context is already gone */
    }
  }

  /** Apply a batch of view-model inputs (from `overlay:data` / hydration). */
  apply(inputs: Record<string, OverlayInput>): void {
    if (this.dead) return;
    for (const [path, input] of Object.entries(inputs)) {
      if (!this.ready || !this.inst) {
        this.pending[path] = input;
        continue;
      }
      this.set(path, input);
    }
  }

  private set(path: string, input: OverlayInput): void {
    const inst = this.inst;
    if (!inst || this.dead) return;
    switch (input.t) {
      case "number": {
        // NaN or Infinity reaches the wasm heap as a raw double and can fault it.
        const v = Number(input.v);
        if (!Number.isFinite(v)) break;
        const h = inst.number(path);
        if (h) h.value = v;
        break;
      }
      case "bool": {
        const h = inst.boolean(path);
        if (h) h.value = Boolean(input.v);
        break;
      }
      case "string": {
        const h = inst.string(path);
        if (h) h.value = String(input.v);
        break;
      }
      case "enum": {
        const h = inst.enum(path);
        if (h) h.value = String(input.v);
        break;
      }
      case "color": {
        const argb = Number(input.v) >>> 0;
        const h = inst.color(path);
        if (h) h.argb((argb >>> 24) & 0xff, (argb >>> 16) & 0xff, (argb >>> 8) & 0xff, argb & 0xff);
        break;
      }
      case "trigger": {
        inst.trigger(path)?.trigger();
        break;
      }
    }
  }

  /** True once the canvas has a CSS box. A hidden overlay (display:none) has none. */
  hasBox(): boolean {
    const r = this.canvas.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /**
   * Rive sizes its drawing surface from the canvas's CSS box. A hidden overlay
   * measures 0x0, and the WebGL2 renderer faults on a 0x0 surface
   */
  resize(): void {
    if (this.dead || !this.hasBox()) return;
    try {
      this.rive.resizeDrawingSurfaceToCanvas();
    } catch {
      /* not yet loaded */
    }
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.ready = false;
    this.inst = null;
    this.pending = {};
    try {
      this.rive.cleanup();
    } catch {
      /* ignore */
    }
  }
}
