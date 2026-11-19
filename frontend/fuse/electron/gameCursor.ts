/**
 * Whether a process holds the cursor. Assume held when the cursor is hidden
 */
import { createRequire } from 'node:module'

const CURSOR_SHOWING = 1
const CURSOR_SUPPRESSED = 2
const SM_XVIRTUALSCREEN = 76
const SM_YVIRTUALSCREEN = 77
const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79

interface CursorInfo {
  cbSize: number
  flags: number
  hCursor: bigint | number
  ptScreenPos: { x: number; y: number }
}

interface WinRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface User32 {
  cursorInfoSize: number
  GetCursorInfo(ci: CursorInfo): number
  GetClipCursor(rect: WinRect): number
  GetSystemMetrics(index: number): number
}

let api: User32 | null | undefined

function load(): User32 | null {
  if (api !== undefined) return api
  if (process.platform !== 'win32') return (api = null)
  try {
    const koffi = createRequire(import.meta.url)('koffi')
    const user32 = koffi.load('user32.dll')
    const point = koffi.struct('FuseCursorPoint', { x: 'int32', y: 'int32' })
    const info = koffi.struct('FuseCursorInfo', { cbSize: 'uint32', flags: 'uint32', hCursor: 'intptr_t', ptScreenPos: point })
    koffi.struct('FuseClipRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
    api = {
      cursorInfoSize: koffi.sizeof(info),
      GetCursorInfo: user32.func('int __stdcall GetCursorInfo(_Inout_ FuseCursorInfo *pci)'),
      GetClipCursor: user32.func('int __stdcall GetClipCursor(_Out_ FuseClipRect *rect)'),
      GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
    }
  } catch (e) {
    console.warn('[stage] koffi is not available: the stage takes clicks while the game holds the cursor', e)
    api = null
  }
  return api
}

export function canReadCursor(): boolean {
  return load() !== null
}

/** True while the cursor is hidden, or clipped to less than the desktop. */
export function gameHoldsCursor(): boolean {
  const u = load()
  if (!u) return false
  const ci: CursorInfo = { cbSize: u.cursorInfoSize, flags: 0, hCursor: 0, ptScreenPos: { x: 0, y: 0 } }
  if (!u.GetCursorInfo(ci)) return false
  // A touch or pen hides the cursor too (suppressed). That is not the game.
  if ((ci.flags & (CURSOR_SHOWING | CURSOR_SUPPRESSED)) === 0 || !ci.hCursor) return true
  const clip: WinRect = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!u.GetClipCursor(clip)) return false
  const x = u.GetSystemMetrics(SM_XVIRTUALSCREEN)
  const y = u.GetSystemMetrics(SM_YVIRTUALSCREEN)
  return (
    clip.left > x ||
    clip.top > y ||
    clip.right < x + u.GetSystemMetrics(SM_CXVIRTUALSCREEN) ||
    clip.bottom < y + u.GetSystemMetrics(SM_CYVIRTUALSCREEN)
  )
}
