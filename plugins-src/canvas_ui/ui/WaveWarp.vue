<script lang="ts">
/** After Effects' Wave Warp: a periodic displacement of the content. */
export type WaveWarpType =
  | "sine"
  | "square"
  | "triangle"
  | "sawtooth"
  | "circle"
  | "semicircle"
  | "uncircle"
  | "noise"
  | "smoothNoise";

/** Edges held in place; the displacement fades to zero as it approaches them. */
export type WaveWarpPinning =
  | "none"
  | "allEdges"
  | "leftEdge"
  | "rightEdge"
  | "topEdge"
  | "bottomEdge"
  | "topAndBottom"
  | "leftAndRight";

export interface WaveWarpOptions {
  /** Wave shape. */
  waveType?: WaveWarpType;
  /** Displacement amplitude in CSS pixels. Negative flips the wave. */
  waveHeight?: number;
  /** Wavelength in CSS pixels. */
  waveWidth?: number;
  /** Direction the wave travels, in degrees. Displacement is perpendicular. */
  direction?: number;
  /** Cycles per second. 0 freezes the wave at its phase. */
  waveSpeed?: number;
  /** Edges pinned in place. */
  pinning?: WaveWarpPinning;
  /** Phase offset in degrees. */
  phase?: number;
  /** Sampling quality: 1, 2 or 3 taps per pixel. */
  antialiasing?: "low" | "medium" | "high";
}

export interface WaveWarpElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface WaveWarpInstance {
  setOptions: (options: WaveWarpOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<WaveWarpOptions> = {
  waveType: "sine",
  waveHeight: 10,
  waveWidth: 40,
  direction: 90,
  waveSpeed: 1,
  pinning: "none",
  phase: 0,
  antialiasing: "low",
};

const TYPE_IDS: Record<WaveWarpType, number> = {
  sine: 0,
  square: 1,
  triangle: 2,
  sawtooth: 3,
  circle: 4,
  semicircle: 5,
  uncircle: 6,
  noise: 7,
  smoothNoise: 8,
};

const PINNING_IDS: Record<WaveWarpPinning, number> = {
  none: 0,
  allEdges: 1,
  leftEdge: 2,
  rightEdge: 3,
  topEdge: 4,
  bottomEdge: 5,
  topAndBottom: 6,
  leftAndRight: 7,
};

const AA_TAPS: Record<"low" | "medium" | "high", number> = {
  low: 1,
  medium: 2,
  high: 3,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uTime;
uniform int uType;
uniform float uHeight;
uniform float uWidth;
uniform float uDirection;
uniform float uPhase;
uniform int uPinning;
uniform int uTaps;
uniform float uMaxX;

#define TAU 6.28318530718

float hash11 (float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

/* Value noise: hash per cell, smoothstep between neighbours. */
float vnoise (float x, bool smoothed) {
  float i = floor(x);
  float f = x - i;
  float a = hash11(i) * 2.0 - 1.0;
  if (!smoothed) return a;
  float b = hash11(i + 1.0) * 2.0 - 1.0;
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

/* s is in radians; every branch returns roughly -1..1. */
float waveAt (float s) {
  if (uType == 0) return sin(s);
  if (uType == 1) return sin(s) >= 0.0 ? 1.0 : -1.0;
  if (uType == 2) return asin(sin(s)) * (2.0 / 3.14159265);
  if (uType == 3) return fract(s / TAU) * 2.0 - 1.0;

  float u = fract(s / TAU) * 2.0 - 1.0;
  float arc = sqrt(max(1.0 - u * u, 0.0));
  if (uType == 4) return arc * sign(u);           // circle: mirrored arcs
  if (uType == 5) return arc;                      // semicircle: arcs above zero
  if (uType == 6) return (1.0 - arc) * sign(u);    // uncircle: inverted arcs

  if (uType == 7) return vnoise(s / TAU, false);
  return vnoise(s / TAU, true);
}

/* 1 where the wave is free to move, easing to 0 at any pinned edge. */
float pinFactor (vec2 uv) {
  if (uPinning == 0) return 1.0;
  float l = smoothstep(0.0, 0.5, uv.x);
  float r = smoothstep(0.0, 0.5, 1.0 - uv.x);
  float b = smoothstep(0.0, 0.5, uv.y);
  float t = smoothstep(0.0, 0.5, 1.0 - uv.y);
  if (uPinning == 1) return l * r * b * t;
  if (uPinning == 2) return l;
  if (uPinning == 3) return r;
  if (uPinning == 4) return t;
  if (uPinning == 5) return b;
  if (uPinning == 6) return t * b;
  return l * r;
}

vec4 sampleContent (vec2 p) {
  if (p.x < 0.0 || p.x > uMaxX || p.y < 0.0 || p.y > 1.0) return vec4(0.0);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float a = radians(uDirection);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 perp = vec2(-dir.y, dir.x);

  vec2 frag = uv * uResolution;
  float along = dot(frag, dir);
  float s = along / max(uWidth, 1.0) * TAU + uPhase + uTime;

  float amp = uHeight * pinFactor(uv);
  vec2 base = perp * amp / uResolution;

  /* Extra taps walk a fraction of a wavelength either side and average, which
     softens the hard edges of square/sawtooth without a full supersample. */
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 3; i++) {
    if (i >= uTaps) break;
    float o = uTaps == 1 ? 0.0 : (float(i) / float(uTaps - 1) - 0.5) * 0.6;
    float w = 1.0 / (1.0 + abs(o) * 2.0);
    vec2 p = uv - base * waveAt(s + o);
    acc += sampleContent(p) * w;
    wsum += w;
  }
  outColor = acc / max(wsum, 0.0001);
}`;

function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}

function createWaveWarp(
  elements: WaveWarpElements,
  options: WaveWarpOptions = {},
): WaveWarpInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable.requestPaint === "function",
  );

  let contentDirty = false;
  let wake = () => {};

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("WaveWarp shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  let dpr = 1;
  let contentMaxX = 1;

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        sourceCtx!.drawElementImage!(content, 0, 0);
        contentDirty = true;
        // Upload inside the paint pass; deferring leaves the drawn bitmap on
        // screen until the next frame, which reads as flicker.
        uploadContent();
        wake();
      } catch {}
    };
  }

  function syncCanvasSize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
    );
    if (htmlInCanvas) {
      const cssWidth = Math.max(1, Math.round(source.clientWidth));
      const cssHeight = Math.max(1, Math.round(source.clientHeight));
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  let time = 0;

  function render() {
    uploadContent();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uTime, time * Math.PI * 2 * config.waveSpeed);
    gl!.uniform1i(uniforms.uType, TYPE_IDS[config.waveType] ?? 0);
    gl!.uniform1f(uniforms.uHeight, config.waveHeight * dpr);
    gl!.uniform1f(uniforms.uWidth, Math.max(config.waveWidth, 1) * dpr);
    gl!.uniform1f(uniforms.uDirection, config.direction);
    gl!.uniform1f(uniforms.uPhase, (config.phase * Math.PI) / 180);
    gl!.uniform1i(uniforms.uPinning, PINNING_IDS[config.pinning] ?? 0);
    gl!.uniform1i(uniforms.uTaps, AA_TAPS[config.antialiasing] ?? 1);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    if (!reducedMotion) time += delta;
    render();
    // A still wave only needs redrawing when the content changes.
    if ((reducedMotion || config.waveSpeed === 0) && !contentDirty) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;
  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  observer.observe(content);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof WaveWarpOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      // Deleting GL objects does NOT release the context - it stays attached to
      // the canvas until GC, so churning instances exhausts the browser's live
      // context cap and it force-loses the oldest ones (older effects go white).
      gl!.getExtension("WEBGL_lose_context")?.loseContext();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<WaveWarpOptions>();

const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const native = ref(false);

let instance: WaveWarpInstance | null = null;
let disposed = false;

onMounted(async () => {
  native.value = supportsHtmlInCanvas();
  await nextTick();
  if (disposed) return;
  if (sourceEl.value && contentEl.value && outputEl.value) {
    instance = createWaveWarp(
      {
        source: sourceEl.value,
        content: contentEl.value,
        output: outputEl.value,
      },
      props,
    );
    if (native.value && !instance) {
      native.value = false;
      await nextTick();
      if (disposed) return;
      if (sourceEl.value && contentEl.value && outputEl.value) {
        instance = createWaveWarp(
          {
            source: sourceEl.value,
            content: contentEl.value,
            output: outputEl.value,
          },
          props,
        );
      }
    }
  }
});

onBeforeUnmount(() => {
  disposed = true;
  instance?.destroy();
  instance = null;
});

watch(
  () => ({ ...props }),
  (next) => instance?.setOptions(next),
  { deep: true },
);
</script>

<template>
  <div style="position: relative">
    <canvas
      ref="sourceEl"
      layoutsubtree="true"
      :style="
        native
          ? 'position: absolute; inset: 0; width: 100%; height: 100%'
          : 'display: none'
      "
    >
      <div
        v-if="native"
        ref="contentEl"
        style="position: relative; width: 100%; height: 100%; overflow: auto"
      >
        <slot />
      </div>
    </canvas>
    <div
      v-if="!native"
      ref="contentEl"
      style="position: relative; width: 100%; height: 100%; overflow: auto"
    >
      <slot />
    </div>
    <canvas
      ref="outputEl"
      aria-hidden="true"
      style="
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      "
    />
  </div>
</template>
