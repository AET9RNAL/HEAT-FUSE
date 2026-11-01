import { computed, markRaw, reactive, shallowReactive, watch, type Directive } from 'vue'

export type FtueSide = 'top' | 'bottom' | 'left' | 'right'
export type FtueAlign = 'start' | 'center' | 'end'
export type FtueResult = 'done' | 'skipped' | 'cancelled'

export interface FtueStep {
  /** Anchor id from `v-ftue`. No target centers the card with no highlight. */
  target?: string
  side?: FtueSide
  align?: FtueAlign
  title: string
  body: string
  /** Runs before the step shows, e.g. to open the tab that holds the target. */
  before?: () => void | Promise<void>
  /** True when the step shows sample data. The card then marks it. */
  sample?: boolean | (() => boolean)
  /** The step waits for an outside event, e.g. a hotkey: Next is off until true, then the tour moves on. */
  advanceWhen?: () => boolean
  /** The highlighted target takes clicks during this step. */
  interactive?: boolean
  /** Back stays off, e.g. after a mode change the previous step cannot undo. */
  noBack?: boolean
  /** False keeps the area clear, e.g. for a prompt over a running game. */
  dim?: boolean
}

export interface FtueTour {
  id: string
  steps: FtueStep[]
}

export interface FtueRect { x: number; y: number; width: number; height: number }
export interface FtueSize { width: number; height: number }
export interface FtuePlacement { x: number; y: number; side: FtueSide }

const ANCHOR_WAIT_MS = 1500
const GAP = 12
const MARGIN = 16

const anchors = shallowReactive(new Map<string, HTMLElement>())

export const ftue = reactive({
  tour: null as FtueTour | null,
  /** Shown step; -1 until the first step is ready. */
  index: -1,
  /** True while a step runs `before()` and waits for its anchor. */
  busy: false,
})

export const ftueStep = computed<FtueStep | null>(() =>
  ftue.tour && ftue.index >= 0 ? ftue.tour.steps[ftue.index] ?? null : null,
)

export const ftueSample = computed(() => {
  const sample = ftueStep.value?.sample
  return typeof sample === 'function' ? sample() : !!sample
})

/** True while the step's `advanceWhen` is false. */
export const ftueWaiting = computed(() => {
  const ready = ftueStep.value?.advanceWhen
  return !!ready && !ready()
})

// A step that waits moves on by itself once its condition turns true.
watch(
  () => (ftueStep.value?.advanceWhen ? ftueStep.value.advanceWhen() : null),
  (ready) => { if (ready === true) go(1, true) },
)

let resolveRun: ((result: FtueResult) => void) | null = null
let runSeq = 0

/** The registered element for `id`, or null when it is missing or detached. */
export function ftueAnchor(id: string | undefined): HTMLElement | null {
  if (!id) return null
  const el = anchors.get(id)
  return el && el.isConnected ? el : null
}

function waitForAnchor(id: string): Promise<void> {
  if (ftueAnchor(id)) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(() => anchors.get(id), (el) => { if (el) done() })
    const timer = window.setTimeout(done, ANCHOR_WAIT_MS)
    function done(): void {
      stop()
      window.clearTimeout(timer)
      resolve()
    }
  })
}

async function enter(index: number): Promise<void> {
  const tour = ftue.tour
  const step = tour?.steps[index]
  if (!tour || !step) return
  const seq = ++runSeq
  ftue.busy = true
  try {
    await step.before?.()
  } catch (e) {
    console.warn('[ftue] step before() failed', e)
  }
  if (step.target) await waitForAnchor(step.target)
  if (seq !== runSeq || ftue.tour !== tour) return
  ftue.index = index
  ftue.busy = false
}

function finish(result: FtueResult): void {
  runSeq++
  ftue.tour = null
  ftue.index = -1
  ftue.busy = false
  const resolve = resolveRun
  resolveRun = null
  resolve?.(result)
}

/** Runs `tour` and settles when the user finishes or skips it. A running tour ends as skipped. */
export function startFtue(tour: FtueTour): Promise<FtueResult> {
  if (ftue.tour) finish('skipped')
  ftue.tour = markRaw(tour)
  const run = new Promise<FtueResult>((resolve) => { resolveRun = resolve })
  void enter(0)
  return run
}

/** `forced` is the step's own `advanceWhen`, which may move on while the user may not. */
function go(delta: number, forced = false): void {
  const tour = ftue.tour
  if (!tour || ftue.busy) return
  if (!forced && delta > 0 && ftueWaiting.value) return
  if (delta < 0 && ftueStep.value?.noBack) return
  const index = ftue.index + delta
  if (index < 0) return
  if (index >= tour.steps.length) return finish('done')
  void enter(index)
}

export function nextFtue(): void { go(1) }
export function backFtue(): void { go(-1) }
export function skipFtue(): void { if (ftue.tour) finish('skipped') }
/** Ends the tour with no user choice, e.g. when its surface goes away. The caller may show it again. */
export function cancelFtue(): void { if (ftue.tour) finish('cancelled') }

const OPPOSITE: Record<FtueSide, FtueSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

function alignOn(start: number, length: number, size: number, align: FtueAlign): number {
  if (align === 'start') return start
  if (align === 'end') return start + length - size
  return start + (length - size) / 2
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(value, Math.max(min, max))))
}

/** Card position on `side` of `rect`; flips when only the opposite side fits, then clamps to the view. */
export function placeFtue(
  rect: FtueRect | null,
  card: FtueSize,
  side: FtueSide,
  align: FtueAlign,
  view: FtueSize,
): FtuePlacement {
  const maxX = view.width - MARGIN - card.width
  const maxY = view.height - MARGIN - card.height
  if (!rect) {
    return { x: clamp((view.width - card.width) / 2, MARGIN, maxX), y: clamp((view.height - card.height) / 2, MARGIN, maxY), side }
  }
  const fits = (s: FtueSide): boolean => {
    if (s === 'top') return rect.y - GAP - card.height >= MARGIN
    if (s === 'bottom') return rect.y + rect.height + GAP + card.height <= view.height - MARGIN
    if (s === 'left') return rect.x - GAP - card.width >= MARGIN
    return rect.x + rect.width + GAP + card.width <= view.width - MARGIN
  }
  const placed = !fits(side) && fits(OPPOSITE[side]) ? OPPOSITE[side] : side
  let x: number
  let y: number
  if (placed === 'top' || placed === 'bottom') {
    x = alignOn(rect.x, rect.width, card.width, align)
    y = placed === 'top' ? rect.y - GAP - card.height : rect.y + rect.height + GAP
  } else {
    x = placed === 'left' ? rect.x - GAP - card.width : rect.x + rect.width + GAP
    y = alignOn(rect.y, rect.height, card.height, align)
  }
  return { x: clamp(x, MARGIN, maxX), y: clamp(y, MARGIN, maxY), side: placed }
}

type FtueEl = HTMLElement & { _ftueId?: string }

function register(el: FtueEl, id: string | undefined): void {
  if (!id) return
  el._ftueId = id
  anchors.set(id, el)
}

// A tab that exits after the new tab mounts must not drop the new tab's anchor.
function unregister(el: FtueEl): void {
  const id = el._ftueId
  if (id && anchors.get(id) === el) anchors.delete(id)
  el._ftueId = undefined
}

/** Marks an element as an FTUE target: `v-ftue="'nav-settings'"`. */
export const vFtue: Directive<FtueEl, string | undefined> = {
  mounted(el, binding) {
    register(el, binding.value)
  },
  updated(el, binding) {
    if (binding.value === el._ftueId) return
    unregister(el)
    register(el, binding.value)
  },
  unmounted(el) {
    unregister(el)
  },
}
