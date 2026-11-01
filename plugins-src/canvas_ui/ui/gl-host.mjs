// Chromium allows 16 live WebGL contexts for all overlays together, so every canvas_ui effect shares one.
// Each overlay loads its own copy of this module, so each overlay gets one context.

const ATTRIBUTES = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
};

/** An unused host keeps its context this long, so a remount reuses it. */
const IDLE_MS = 2000;
/** Lost surfaces wait this long before they rebuild, so the GPU can come back. */
const RESTART_MS = 1000;
const ATLAS_START = 512;
const ATLAS_MAX_SIDE = 4096;
/** Overflow doubles the atlas until it reaches this area. */
const ATLAS_MAX_AREA = 2048 * 2048;
/** Each copy reads the whole atlas, so it shrinks to the area used over this many copies. */
const ATLAS_SHRINK_FLUSHES = 300;

const VERT = `#version 300 es
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
uniform sampler2D uFrame;
uniform bool uPremultiply;
void main () {
  vec4 c = texture(uFrame, vUv);
  outColor = uPremultiply ? vec4(c.rgb * c.a, c.a) : c;
}`;

/**
 * @typedef {object} SurfaceOptions
 * @property {boolean} [premultipliedAlpha] False when the effect writes straight alpha. Default true.
 * @property {boolean} [antialias] Draw into a multisampled buffer. Default false.
 * @property {() => void} [onLost] Called after the shared context is lost. The surface is dead then.
 */

/**
 * @typedef {object} Surface
 * @property {WebGL2RenderingContext} gl The shared context. Bind your own VAO before each draw.
 * @property {() => boolean} begin Reset shared state, then bind and clear the frame. False when the context is gone.
 * @property {() => void} bindOutput Bind the frame as the draw target, sized to the output canvas.
 * @property {() => void} end Copy the frame to the output canvas.
 * @property {() => void} release Free the frame. The host frees the context when no surface is left.
 */

/**
 * @typedef {object} Host
 * @property {(output: HTMLCanvasElement, options: SurfaceOptions) => Surface | null} acquire
 * @property {() => void} flush
 */

/** @type {Host | null} */
let host = null;

/**
 * A frame in the shared context that shows on `output`, which gets a 2D context.
 * @param {HTMLCanvasElement} output
 * @param {SurfaceOptions} [options]
 * @returns {Surface | null}
 */
export function createSurface(output, options = {}) {
  host ??= createHost();
  return host ? host.acquire(output, options) : null;
}

let nextFrameId = 0;
/** @type {Map<number, FrameRequestCallback>} */
let queued = new Map();
/** @type {Map<number, FrameRequestCallback>} */
let running = new Map();
let rafHandle = 0;
let dispatching = false;

/**
 * requestAnimationFrame that runs every effect, then copies all their frames in one batch.
 * @param {FrameRequestCallback} callback
 * @returns {number}
 */
export function requestFrame(callback) {
  const id = ++nextFrameId;
  queued.set(id, callback);
  if (!rafHandle) rafHandle = requestAnimationFrame(runFrame);
  return id;
}

/** @param {number} id */
export function cancelFrame(id) {
  queued.delete(id);
  running.delete(id);
}

/** @param {number} now */
function runFrame(now) {
  rafHandle = 0;
  running = queued;
  queued = new Map();
  dispatching = true;
  for (const callback of running.values()) {
    try {
      callback(now);
    } catch (error) {
      reportError(error);
    }
  }
  running = new Map();
  dispatching = false;
  host?.flush();
}

/** @returns {Host | null} */
function createHost() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_START;
  canvas.height = ATLAS_START;
  const context = /** @type {WebGL2RenderingContext | null} */ (
    canvas.getContext("webgl2", ATTRIBUTES)
  );
  if (!context || context.isContextLost()) return null;
  const gl = context;

  /** @param {number} type @param {string} text */
  function compile(type, text) {
    const shader = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("canvas_ui host shader error:", gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  const uFrame = gl.getUniformLocation(program, "uFrame");
  const uPremultiply = gl.getUniformLocation(program, "uPremultiply");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxSide = Math.min(
    ATLAS_MAX_SIDE,
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxViewport[0],
    maxViewport[1],
  );
  const maxSamples = gl.getParameter(gl.MAX_SAMPLES);

  /**
   * @typedef {object} Blit
   * @property {{ released: boolean }} owner
   * @property {CanvasRenderingContext2D} ctx
   * @property {HTMLCanvasElement} output
   * @property {number} x
   * @property {number} y
   * @property {number} w
   * @property {number} h
   */

  /** @type {Set<{ released: boolean, lose: () => void }>} */
  const surfaces = new Set();
  /** @type {Blit[]} */
  let pending = [];
  let flushQueued = false;
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;
  let usedW = 0;
  let usedH = 0;
  let peakW = 0;
  let peakH = 0;
  let flushes = 0;
  let lost = false;
  let disposed = false;
  let idleTimer = 0;

  /** @type {Host} */
  const self = { acquire, flush };

  canvas.addEventListener("webglcontextlost", () => {
    if (disposed) return;
    lost = true;
    pending = [];
    if (host === self) host = null;
    const victims = [...surfaces];
    setTimeout(() => {
      for (const surface of victims) if (!surface.released) surface.lose();
    }, RESTART_MS);
  });

  /** @param {number} n */
  function side(n) {
    return Math.min(maxSide, Math.ceil(n / 256) * 256);
  }

  /** @param {number} w @param {number} h */
  function resizeAtlas(w, h) {
    canvas.width = side(w);
    canvas.height = side(h);
  }

  /** @param {number} w @param {number} h */
  function allocate(w, h) {
    if (w > canvas.width || h > canvas.height) {
      flush(false);
      resizeAtlas(Math.max(canvas.width, w), Math.max(canvas.height, h));
    }
    if (cursorX + w > canvas.width) {
      cursorX = 0;
      cursorY += rowH;
      rowH = 0;
    }
    if (cursorY + h > canvas.height) {
      flush(false);
      if (canvas.width * canvas.height < ATLAS_MAX_AREA) {
        if (canvas.width <= canvas.height) resizeAtlas(canvas.width * 2, canvas.height);
        else resizeAtlas(canvas.width, canvas.height * 2);
      }
    }
    const region = { x: cursorX, y: cursorY };
    cursorX += w;
    rowH = Math.max(rowH, h);
    usedW = Math.max(usedW, cursorX);
    usedH = Math.max(usedH, cursorY + rowH);
    return region;
  }

  function shrink() {
    peakW = Math.max(peakW, usedW);
    peakH = Math.max(peakH, usedH);
    usedW = 0;
    usedH = 0;
    if (++flushes < ATLAS_SHRINK_FLUSHES) return;
    const w = side(Math.max(peakW, ATLAS_START));
    const h = side(Math.max(peakH, ATLAS_START));
    if (w < canvas.width || h < canvas.height) resizeAtlas(w, h);
    flushes = 0;
    peakW = 0;
    peakH = 0;
  }

  /** @param {boolean} [final] False for a flush in the middle of a batch, which must not resize. */
  function flush(final = true) {
    flushQueued = false;
    const blits = pending;
    pending = [];
    cursorX = 0;
    cursorY = 0;
    rowH = 0;
    if (lost) return;
    // GL rows count up from the bottom. Canvas rows count down from the top.
    const height = canvas.height;
    for (const blit of blits) {
      if (blit.owner.released) continue;
      blit.ctx.globalCompositeOperation = "copy";
      blit.ctx.drawImage(
        canvas,
        blit.x,
        height - blit.y - blit.h,
        blit.w,
        blit.h,
        0,
        0,
        blit.output.width,
        blit.output.height,
      );
    }
    if (final && blits.length) shrink();
  }

  function scheduleFlush() {
    if (dispatching || flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
  }

  function dispose() {
    if (surfaces.size || disposed) return;
    disposed = true;
    if (host === self) host = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /**
   * @param {HTMLCanvasElement} output
   * @param {SurfaceOptions} options
   * @returns {Surface | null}
   */
  function acquire(output, options) {
    if (lost || disposed) return null;
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    clearTimeout(idleTimer);

    const premultiplied = options.premultipliedAlpha !== false;
    const samples = options.antialias ? Math.min(4, maxSamples) : 0;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const msaaBuffer = samples ? gl.createRenderbuffer() : null;
    const msaaFramebuffer = samples ? gl.createFramebuffer() : null;
    const target = msaaFramebuffer ?? framebuffer;
    let width = 0;
    let height = 0;
    let active = false;

    const owner = {
      released: false,
      lose() {
        options.onLost?.();
      },
    };
    surfaces.add(owner);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    function syncSize() {
      const w = Math.max(1, Math.min(output.width, maxTexture));
      const h = Math.max(1, Math.min(output.height, maxTexture));
      if (w === width && h === height) return;
      width = w;
      height = h;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (msaaFramebuffer) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, msaaBuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msaaBuffer);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      }
    }

    function begin() {
      if (owner.released || lost || gl.isContextLost()) return false;
      syncSize();
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      active = true;
      return true;
    }

    function bindOutput() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, width, height);
    }

    function end() {
      if (!active) return;
      active = false;
      if (owner.released || lost) return;
      const w = Math.min(width, maxSide);
      const h = Math.min(height, maxSide);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.colorMask(true, true, true, true);
      if (msaaFramebuffer) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
      const region = allocate(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(region.x, region.y, w, h);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uFrame, 0);
      gl.uniform1i(uPremultiply, premultiplied ? 0 : 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      pending.push({ owner, ctx: /** @type {CanvasRenderingContext2D} */ (ctx), output, x: region.x, y: region.y, w, h });
      scheduleFlush();
    }

    function release() {
      if (owner.released) return;
      owner.released = true;
      surfaces.delete(owner);
      if (!lost) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteRenderbuffer(msaaBuffer);
        gl.deleteFramebuffer(msaaFramebuffer);
      }
      if (!surfaces.size && !lost) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(dispose, IDLE_MS);
      }
    }

    return { gl, begin, bindOutput, end, release };
  }

  return self;
}
