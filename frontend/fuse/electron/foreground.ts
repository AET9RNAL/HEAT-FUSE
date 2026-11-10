/**
 * Keyboard handover between the game and the stage window. Windows lets only the
 * foreground process move the foreground, and a hotkey seen by the runtime gives no
 * such right, so this runs in Electron main (FUSE Apps P1 focus spike, 2026-11-09).
 */
import { createRequire } from 'node:module'
import type { BrowserWindow } from 'electron'

type Handle = bigint | number

interface User32 {
  GetForegroundWindow(): Handle
  SetForegroundWindow(hWnd: Handle): number
  GetWindowThreadProcessId(hWnd: Handle, pid: number[]): number
  AttachThreadInput(idAttach: number, idAttachTo: number, attach: number): number
  BringWindowToTop(hWnd: Handle): number
  IsWindow(hWnd: Handle): number
  GetCurrentThreadId(): number
}

let api: User32 | null | undefined

function load(): User32 | null {
  if (api !== undefined) return api
  if (process.platform !== 'win32') return (api = null)
  try {
    const koffi = createRequire(import.meta.url)('koffi')
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    api = {
      GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
      SetForegroundWindow: user32.func('int __stdcall SetForegroundWindow(intptr_t hWnd)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *pid)'),
      AttachThreadInput: user32.func('int __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, int attach)'),
      BringWindowToTop: user32.func('int __stdcall BringWindowToTop(intptr_t hWnd)'),
      IsWindow: user32.func('int __stdcall IsWindow(intptr_t hWnd)'),
      GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
    }
  } catch (e) {
    console.warn('[stage] koffi is not available: the stage takes the keyboard on a click only', e)
    api = null
  }
  return api
}

function hwndOf(win: BrowserWindow): bigint {
  return win.getNativeWindowHandle().readBigUInt64LE(0)
}

/** The window that had the keyboard before the stage took it. */
let saved: bigint | null = null

/** Takes the keyboard for the stage with no click. The window that had it comes back with `releaseForeground`. */
export function takeForeground(win: BrowserWindow): void {
  win.setFocusable(true)
  // setFocusable(true) also gives the stage a taskbar button.
  win.setSkipTaskbar(true)
  const u = load()
  if (u) {
    const stage = hwndOf(win)
    const fg = BigInt(u.GetForegroundWindow())
    if (fg && fg !== stage) saved = fg
    const fgThread = fg ? u.GetWindowThreadProcessId(fg, [0]) : 0
    const me = u.GetCurrentThreadId()
    // Joining the input queue of the foreground thread lets SetForegroundWindow through.
    const attached = fgThread !== 0 && fgThread !== me && u.AttachThreadInput(me, fgThread, 1) !== 0
    u.SetForegroundWindow(stage)
    u.BringWindowToTop(stage)
    if (attached) u.AttachThreadInput(me, fgThread, 0)
  }
  win.focus()
}

/**
 * Gives the keyboard back to the window that had it. `setFocusable(false)` activates the
 * next window in the z-order (the FUSE stage, or the Start button), so the saved window
 * comes after it. In interactive and calibrate states the stage stays focusable.
 */
export function releaseForeground(win: BrowserWindow, keepFocusable: boolean): void {
  if (!keepFocusable) {
    win.setFocusable(false)
    win.setSkipTaskbar(true)
  }
  const target = saved
  saved = null
  const u = load()
  if (u && target && u.IsWindow(target)) u.SetForegroundWindow(target)
}

/** The stage becomes focusable (a click, interactive or calibrate). The window that has the keyboard now gets it back later. */
export function noteForeground(win: BrowserWindow): void {
  const u = load()
  if (!u) return
  const fg = BigInt(u.GetForegroundWindow())
  if (fg && fg !== hwndOf(win)) saved = fg
}

/**
 * The stage stops being focusable. While it has the keyboard, the saved window gets it back
 * (Ctrl+I or Ctrl+L to locked). After a blur another window has the keyboard, so it keeps it.
 */
export function leaveForeground(win: BrowserWindow): void {
  const u = load()
  if (u && BigInt(u.GetForegroundWindow()) === hwndOf(win)) {
    releaseForeground(win, false)
    return
  }
  win.setFocusable(false)
  win.setSkipTaskbar(true)
}
