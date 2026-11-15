export interface SurfaceOptions {
  /** False when the effect writes straight alpha. Default true. */
  premultipliedAlpha?: boolean;
  /** Draw into a multisampled buffer. Default false. */
  antialias?: boolean;
  /** Called after the shared context is lost. The surface is dead then. */
  onLost?: () => void;
}

export interface Surface {
  /** The shared context. Bind your own VAO before each draw. */
  gl: WebGL2RenderingContext;
  /** Reset shared state, then bind and clear the frame. False when the context is gone. */
  begin(): boolean;
  /** Bind the frame as the draw target, sized to the output canvas. */
  bindOutput(): void;
  /** Copy the frame to the output canvas. */
  end(): void;
  /** Free the frame. The host frees the context when no surface is left. */
  release(): void;
}

export function createSurface(output: HTMLCanvasElement, options?: SurfaceOptions): Surface | null;
export function requestFrame(callback: FrameRequestCallback): number;
export function cancelFrame(id: number): void;
