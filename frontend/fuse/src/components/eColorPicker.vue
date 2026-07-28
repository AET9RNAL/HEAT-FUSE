<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import Icons from './Icons.vue'
import eDropdown from './eDropdown.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  alpha?: boolean
}>(), { alpha: true })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

function clamp01(n: number) { return Math.min(1, Math.max(0, n)) }

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s
  const hh = (h % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh >= 0 && hh < 1) { r = c; g = x }
  else if (hh < 2) { r = x; g = c }
  else if (hh < 3) { g = c; b = x }
  else if (hh < 4) { g = x; b = c }
  else if (hh < 5) { r = x; b = c }
  else { r = c; b = x }
  const m = v - c
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  let h = 0, s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hh = (h % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh >= 0 && hh < 1) { r = c; g = x }
  else if (hh < 2) { r = x; g = c }
  else if (hh < 3) { g = c; b = x }
  else if (hh < 4) { g = x; b = c }
  else if (hh < 5) { r = x; b = c }
  else { r = c; b = x }
  const m = l - c / 2
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

function toHex2(n: number) { return Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0') }

function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 6) s += 'ff'
  if (s.length !== 8 || /[^0-9a-fA-F]/.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: parseInt(s.slice(6, 8), 16) / 255,
  }
}


const h = ref(0)   // 0..360
const s = ref(0)   // 0..1
const v = ref(1)   // 0..1
const a = ref(1)   // 0..1
let syncing = false

function syncFromModel(hex: string) {
  const rgba = parseHex(hex)
  if (!rgba) return
  const hsv = rgbToHsv(rgba.r, rgba.g, rgba.b)
  syncing = true
  if (hsv.s > 0.0001) h.value = hsv.h
  if (rgba.r + rgba.g + rgba.b > 0) s.value = hsv.s
  v.value = hsv.v
  a.value = props.alpha ? rgba.a : 1
  syncing = false
}
syncFromModel(props.modelValue)
watch(() => props.modelValue, (nv) => { if (!syncing) syncFromModel(nv) })

const rgb = computed(() => hsvToRgb(h.value, s.value, v.value))
const hsl = computed(() => rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b))
const hexOut = computed(() => {
  const { r, g, b } = rgb.value
  const base = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`
  return props.alpha ? `${base}${toHex2(a.value * 255)}` : base
})
const hexNoAlpha = computed(() => `#${toHex2(rgb.value.r)}${toHex2(rgb.value.g)}${toHex2(rgb.value.b)}`)
const cssCurrent = computed(() => `rgba(${rgb.value.r}, ${rgb.value.g}, ${rgb.value.b}, ${a.value})`)
const cssOpaque = computed(() => `rgb(${rgb.value.r}, ${rgb.value.g}, ${rgb.value.b})`)
const hueCss = computed(() => { const c = hsvToRgb(h.value, 1, 1); return `rgb(${c.r}, ${c.g}, ${c.b})` })

function emitColor() { emit('update:modelValue', hexOut.value) }
watch([h, s, v, a], () => { if (!syncing) emitColor() })

const svEl = ref<HTMLElement | null>(null)
const hueEl = ref<HTMLElement | null>(null)
const alphaEl = ref<HTMLElement | null>(null)
let dragMove: ((e: PointerEvent) => void) | null = null

function beginDrag(el: HTMLElement | null, onMove: (fx: number, fy: number) => void, e: PointerEvent) {
  if (!el) return
  const apply = (ev: PointerEvent) => {
    const r = el.getBoundingClientRect()
    onMove(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height))
  }
  apply(e)
  dragMove = apply
  window.addEventListener('pointermove', apply)
  window.addEventListener('pointerup', endDrag, { once: true })
}
function endDrag() {
  if (dragMove) window.removeEventListener('pointermove', dragMove)
  dragMove = null
}
onUnmounted(endDrag)

function onSvDown(e: PointerEvent) {
  beginDrag(svEl.value, (fx, fy) => { s.value = fx; v.value = 1 - fy }, e)
}
function onHueDown(e: PointerEvent) {
  beginDrag(hueEl.value, (fx) => { h.value = fx * 360 }, e)
}
function onAlphaDown(e: PointerEvent) {
  beginDrag(alphaEl.value, (fx) => { a.value = fx }, e)
}

const svKnob = computed(() => ({ left: `${s.value * 100}%`, top: `${(1 - v.value) * 100}%` }))
const hueKnob = computed(() => ({ left: `${(h.value / 360) * 100}%` }))
const alphaKnob = computed(() => ({ left: `${a.value * 100}%` }))

type Mode = 'HEX' | 'RGB' | 'HSL'
const mode = ref<Mode>('HSL')
const modes: Mode[] = ['HEX', 'RGB', 'HSL']

function setFromRgb(r: number, g: number, b: number) {
  const hsv = rgbToHsv(clamp255(r), clamp255(g), clamp255(b))
  if (hsv.s > 0.0001) h.value = hsv.h
  s.value = hsv.s; v.value = hsv.v
}
function clamp255(n: number) { return Math.min(255, Math.max(0, Math.round(Number(n) || 0))) }
function clampPct(n: number) { return Math.min(100, Math.max(0, Math.round(Number(n) || 0))) }
function clampDeg(n: number) { return ((Math.round(Number(n) || 0) % 360) + 360) % 360 }

function onHexInput(val: string) {
  const rgba = parseHex(val)
  if (!rgba) return
  setFromRgb(rgba.r, rgba.g, rgba.b)
  if (props.alpha) a.value = rgba.a
}
function onRgbInput(ch: 'r' | 'g' | 'b', val: string) {
  const c = { ...rgb.value }; c[ch] = clamp255(Number(val)); setFromRgb(c.r, c.g, c.b)
}
function onHslInput(ch: 'h' | 's' | 'l', val: string) {
  const c = { ...hsl.value }
  c[ch] = ch === 'h' ? clampDeg(Number(val)) : clampPct(Number(val))
  const rr = hslToRgb(c.h, c.s, c.l); setFromRgb(rr.r, rr.g, rr.b)
}
function onAlphaInput(val: string) { a.value = clamp01(clampPct(Number(val)) / 100) }
const alphaPct = computed(() => Math.round(a.value * 100))

// eyedropper
const hasEyeDropper = typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === 'function'
async function pickEyedropper() {
  try {
    const ED = (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper
    const res = await new ED().open()
    onHexInput(res.sRGBHex)
  } catch { /* cancelled */ }
}
</script>

<template>
  <div class="cp" @pointerdown.stop>
    <div ref="svEl" class="cp-sv" :style="{ background: hueCss }" @pointerdown="onSvDown">
      <div class="cp-sv-white"></div>
      <div class="cp-sv-black"></div>
      <div class="cp-knob cp-knob--sv" :style="{ ...svKnob, background: cssOpaque }"></div>
    </div>

    <div class="cp-sliders">
      <button v-if="hasEyeDropper" class="cp-eyedrop" title="Pick from screen" @click="pickEyedropper">
        <Icons kind="eyedropper" size="small" />
      </button>
      <div class="cp-slider-col">
        <div ref="hueEl" class="cp-hue" @pointerdown="onHueDown">
          <div class="cp-knob cp-knob--strip" :style="{ ...hueKnob, background: hueCss }"></div>
        </div>
        <div v-if="alpha" ref="alphaEl" class="cp-alpha" @pointerdown="onAlphaDown">
          <div class="cp-alpha-checker"></div>
          <div class="cp-alpha-grad" :style="{ background: `linear-gradient(to right, transparent, ${cssOpaque})` }"></div>
          <div class="cp-knob cp-knob--strip" :style="{ ...alphaKnob, background: cssCurrent }"></div>
        </div>
      </div>
    </div>

    <div class="cp-fields">
      <eDropdown
        class="cp-mode-dd"
        :model-value="mode"
        :options="modes"
        @update:model-value="mode = $event as Mode"
      />

      <template v-if="mode === 'HEX'">
        <input class="cp-in cp-in--hex" :value="alpha ? hexOut : hexNoAlpha"
               @change="onHexInput(($event.target as HTMLInputElement).value)" />
      </template>

      <template v-else-if="mode === 'RGB'">
        <input class="cp-in" :value="rgb.r" @change="onRgbInput('r', ($event.target as HTMLInputElement).value)" />
        <input class="cp-in" :value="rgb.g" @change="onRgbInput('g', ($event.target as HTMLInputElement).value)" />
        <input class="cp-in" :value="rgb.b" @change="onRgbInput('b', ($event.target as HTMLInputElement).value)" />
        <input v-if="alpha" class="cp-in cp-in--pct" :value="alphaPct"
               @change="onAlphaInput(($event.target as HTMLInputElement).value)" />
      </template>

      <template v-else>
        <input class="cp-in" :value="hsl.h" @change="onHslInput('h', ($event.target as HTMLInputElement).value)" />
        <input class="cp-in" :value="hsl.s" @change="onHslInput('s', ($event.target as HTMLInputElement).value)" />
        <input class="cp-in" :value="hsl.l" @change="onHslInput('l', ($event.target as HTMLInputElement).value)" />
        <input v-if="alpha" class="cp-in cp-in--pct" :value="alphaPct"
               @change="onAlphaInput(($event.target as HTMLInputElement).value)" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.cp {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--black-3);
  box-shadow: 0 var(--space-2) var(--space-8) rgba(0, 0, 0, 0.55);
  user-select: none;
  -webkit-user-select: none;
}

.cp-sv {
  position: relative;
  width: 100%;
  height: 168px;
  cursor: crosshair;
  overflow: hidden;
}
.cp-sv-white { position: absolute; inset: 0; background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0)); }
.cp-sv-black { position: absolute; inset: 0; background: linear-gradient(to top, #000, rgba(0, 0, 0, 0)); }

.cp-sliders { display: flex; align-items: center; gap: var(--space-2); }
.cp-slider-col { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }

.cp-eyedrop {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--black-2-a);
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s;
}
.cp-eyedrop:hover { color: var(--text-main); }

.cp-hue {
  position: relative;
  height: var(--space-3);
  border-radius: var(--space-1);
  cursor: pointer;
  background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
}

.cp-alpha {
  position: relative;
  height: var(--space-3);
  border-radius: var(--space-1);
  cursor: pointer;
  overflow: hidden;
}
.cp-alpha-checker {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(45deg, #808080 25%, transparent 25%),
    linear-gradient(-45deg, #808080 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #808080 75%),
    linear-gradient(-45deg, transparent 75%, #808080 75%);
  background-size: var(--space-2) var(--space-2);
  background-position: 0 0, 0 var(--space-1), var(--space-1) calc(-1 * var(--space-1)), calc(-1 * var(--space-1)) 0;
  opacity: 0.5;
}
.cp-alpha-grad { position: absolute; inset: 0; }

.cp-knob {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: var(--space-0) solid var(--text-main);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.cp-knob--strip { top: 50%; }

.cp-fields { display: flex; align-items: center; gap: var(--space-1); }
.cp-mode-dd { flex-shrink: 0; }

.cp-in {
  width: 0;
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 var(--space-1);
  text-align: center;
  background: var(--black-2-a);
  border: none;
  color: var(--text-main);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  outline: none;
}
.cp-in--hex { text-align: left; padding: 0 var(--space-2); }
.cp-in--pct { max-width: 44px; }
.cp-in:focus { box-shadow: inset 0 0 0 1px var(--light-green); }
</style>
