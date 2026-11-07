/**
 * Stage window geometry in device units: physical pixels on Windows, DIP elsewhere.
 * With mixed display scales, Electron's DIP display boxes do not match the real screens.
 */
import { screen, type BrowserWindow, type Display, type Point, type Rectangle } from 'electron'

export type Rect = Rectangle

/** Where the stage page sits on the desktop: its top-left corner in device units, and device units per CSS pixel. */
export interface StageFrame {
  origin: Point
  scale: number
}

const WIN = process.platform === 'win32'
const ROUNDERS = [Math.round, Math.floor, Math.ceil]

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** A display's box in device units. */
export function deviceBounds(d: Display): Rect {
  return WIN ? screen.dipToScreenRect(null, d.bounds) : { ...d.bounds }
}

/** The union of all displays in device units: the box the stage window covers. */
export function desktopBounds(): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const d of screen.getAllDisplays()) {
    const b = deviceBounds(d)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  if (!Number.isFinite(minX)) return deviceBounds(screen.getPrimaryDisplay())
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** The DIP rect that `setBounds` turns into `target`. Electron picks the scale from the rect itself, so each display's scale is tried. */
export function dipRectFor(target: Rect): Rect {
  if (!WIN) return { ...target }
  let best: Rect | null = null
  let bestScore = Infinity
  for (const d of screen.getAllDisplays()) {
    const dev = deviceBounds(d)
    const s = d.scaleFactor
    const x = d.bounds.x + (target.x - dev.x) / s
    const y = d.bounds.y + (target.y - dev.y) / s
    for (const ro of ROUNDERS) {
      for (const rs of ROUNDERS) {
        const rect = { x: ro(x), y: ro(y), width: rs(target.width / s), height: rs(target.height / s) }
        const got = screen.dipToScreenRect(null, rect)
        if (sameRect(got, target)) return rect
        const covers = got.x <= target.x && got.y <= target.y &&
          got.x + got.width >= target.x + target.width && got.y + got.height >= target.y + target.height
        const score = (covers ? 0 : 1e9) +
          Math.abs(got.x - target.x) + Math.abs(got.y - target.y) +
          Math.abs(got.x + got.width - target.x - target.width) +
          Math.abs(got.y + got.height - target.y - target.height)
        if (score < bestScore) {
          bestScore = score
          best = rect
        }
      }
    }
  }
  return best ?? { ...target }
}

/** The window's content box in device units. */
export function windowDeviceBounds(win: BrowserWindow): Rect {
  const content = win.getContentBounds()
  return WIN ? screen.dipToScreenRect(win, content) : content
}

/** Device units per CSS pixel in the window: Chromium's scale for it, which can differ from the Windows DPI of the window. */
function windowScale(win: BrowserWindow): number {
  if (!WIN) return 1
  const probe = 10000
  const got = screen.dipToScreenRect(win, { x: 0, y: 0, width: probe, height: probe }).width / probe
  return screen.getAllDisplays().map((d) => d.scaleFactor).find((s) => Math.abs(s - got) < 0.01) ?? got
}

/** The scale a window over `area` gets: the display it overlaps most, the primary on a tie. */
function predictedScale(area: Rect): number {
  if (!WIN) return 1
  let best = screen.getPrimaryDisplay()
  let bestArea = overlapArea(deviceBounds(best), area)
  for (const d of screen.getAllDisplays()) {
    const a = overlapArea(deviceBounds(d), area)
    if (a > bestArea) {
      best = d
      bestArea = a
    }
  }
  return best.scaleFactor
}

/** The stage page's frame: from the open window, or where the window goes when it opens. */
export function stageFrame(win: BrowserWindow | null): StageFrame {
  if (win && !win.isDestroyed()) {
    const b = windowDeviceBounds(win)
    return { origin: { x: b.x, y: b.y }, scale: windowScale(win) }
  }
  const d = desktopBounds()
  return { origin: { x: d.x, y: d.y }, scale: predictedScale(d) }
}

/** A device-unit rect in the stage page's CSS pixels. Edges round, not sizes, so neighbour displays meet without a gap. */
export function toStage(r: Rect, f: StageFrame): Rect {
  const x = Math.round((r.x - f.origin.x) / f.scale)
  const y = Math.round((r.y - f.origin.y) / f.scale)
  const right = Math.round((r.x + r.width - f.origin.x) / f.scale)
  const bottom = Math.round((r.y + r.height - f.origin.y) / f.scale)
  return { x, y, width: right - x, height: bottom - y }
}

/** A display's box in the stage page's CSS pixels. */
export function displayInStage(d: Display, f: StageFrame): Rect {
  return toStage(deviceBounds(d), f)
}

/** A screen point in DIP, such as the cursor, in the stage page's CSS pixels. */
export function pointInStage(p: Point, f: StageFrame): Point {
  const dev = WIN ? screen.dipToScreenPoint(p) : p
  return { x: (dev.x - f.origin.x) / f.scale, y: (dev.y - f.origin.y) / f.scale }
}
