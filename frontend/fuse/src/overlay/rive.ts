/**
 * Rive overlay controller - wraps @rive-app/canvas and applies the FUSE overlay
 * view-model data-binding protocol (the `overlay:data` inputs streamed from the
 * runtime). Shared by the Vue `RiveOverlay` component and the Rive gate spike.
 */
import { Rive, type ViewModelInstance } from "@rive-app/canvas";

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

export class RiveOverlayController {
  private rive: Rive;
  private inst: ViewModelInstance | null = null;
  private ready = false;
  private pending: Record<string, OverlayInput> = {};

  constructor(canvas: HTMLCanvasElement, opts: RiveOverlayOptions) {
    const useAutoBind = !opts.viewModel;
    this.rive = new Rive({
      canvas,
      buffer: opts.buffer,
      autoplay: true,
      autoBind: useAutoBind,
      artboard: opts.artboard ?? undefined,
      stateMachines: opts.stateMachine ? [opts.stateMachine] : undefined,
      onLoad: () => {
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
          this.rive.resizeDrawingSurfaceToCanvas();
          this.ready = true;
          const p = this.pending;
          this.pending = {};
          this.apply(p);
          opts.onReady?.();
        } catch (e) {
          opts.onError?.(String(e));
        }
      },
      onLoadError: (e) => opts.onError?.(String(e)),
    });
  }

  /** Apply a batch of view-model inputs (from `overlay:data` / hydration). */
  apply(inputs: Record<string, OverlayInput>): void {
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
    if (!inst) return;
    switch (input.t) {
      case "number": {
        const h = inst.number(path);
        if (h) h.value = Number(input.v);
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

  resize(): void {
    try {
      this.rive.resizeDrawingSurfaceToCanvas();
    } catch {
      /* not yet loaded */
    }
  }

  destroy(): void {
    try {
      this.rive.cleanup();
    } catch {
      /* ignore */
    }
  }
}
