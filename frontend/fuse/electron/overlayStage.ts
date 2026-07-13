import { BrowserWindow, ipcMain, screen, session } from 'electron'
import path from 'node:path'

declare const __RELEASE__: boolean

const OVERLAY_PARTITION = 'fuse-overlay'
const OVERLAY_CSP =
  "default-src 'self';" +
  " script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';" +
  " style-src 'self' 'unsafe-inline';" +
  " img-src 'self' data: blob: https:;" +
  " font-src 'self' data:;" +
  " connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*;" +
  " object-src 'none';" +
  " base-uri 'self'"

interface StageEnv {
  devServerUrl?: string
  rendererDist: string
  preload: string
}

let stageWindow: BrowserWindow | null = null
let stageParams: { port: number; token: string } | null = null
let env: StageEnv | null = null

/** Bounding box of the union of all displays (the virtual desktop). */
function virtualBounds(): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
  }
  if (!Number.isFinite(minX)) {
    const p = screen.getPrimaryDisplay().bounds
    return { x: p.x, y: p.y, width: p.width, height: p.height }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Resize the stage to span the whole virtual desktop.
 *
 * On Windows a `resizable: false` window caps its maximum size at the size it
 * was created with, so a later setBounds can't grow it to reach a second
 * monitor. We lift the constraint around the resize.
 */
function applyVirtualBounds(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const wasResizable = win.isResizable()
  if (!wasResizable) win.setResizable(true)
  win.setBounds(virtualBounds())
  if (!wasResizable) win.setResizable(false)
}

function createStageWindow(): void {
  if (!stageParams || !env) return
  const b = virtualBounds()
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: !__RELEASE__,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: env.preload,
      partition: OVERLAY_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      devTools: true,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // Click-through by default; the renderer flips this while hovering an overlay.
  win.setIgnoreMouseEvents(true, { forward: true })

  const query = { port: String(stageParams.port), token: stageParams.token }
  if (env.devServerUrl) {
    win.loadURL(`${env.devServerUrl}overlay.html?port=${query.port}&token=${query.token}`)
  } else {
    win.loadFile(path.join(env.rendererDist, 'overlay.html'), { query })
  }
  win.once('ready-to-show', () => {
    win.showInactive()
    applyVirtualBounds(win)
    setTimeout(() => applyVirtualBounds(win), 500)
    setTimeout(() => applyVirtualBounds(win), 1500)
    if (env?.devServerUrl) win.webContents.openDevTools({ mode: 'detach' })
  })
  win.on('closed', () => { if (stageWindow === win) stageWindow = null })
  stageWindow = win
}

function resizeToVirtualDesktop(): void {
  if (stageWindow && !stageWindow.isDestroyed()) applyVirtualBounds(stageWindow)
}

export function initOverlayStage(stageEnv: StageEnv): void {
  env = stageEnv

  session.fromPartition(OVERLAY_PARTITION).webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [OVERLAY_CSP],
      },
    })
  })

  ipcMain.on('overlay:set-ignore', (_e, ignore: boolean) => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.setIgnoreMouseEvents(!!ignore, { forward: true })
    }
  })

  // Interactive state only: allow the stage to take keyboard focus so Vue
  // <input>s work. Otherwise the always-on-top stage stays non-focusable so it
  // never steals focus from the game.
  ipcMain.on('overlay:set-focusable', (_e, focusable: boolean) => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.setFocusable(!!focusable)
      if (!focusable) return
      // A focusable overlay still needs an explicit focus to route key events to
      // the clicked input; showInactive() left it unfocused.
      stageWindow.focus()
    }
  })

  ipcMain.on('overlay:toggle-devtools', () => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      const wc = stageWindow.webContents
      if (wc.isDevToolsOpened()) wc.closeDevTools()
      else wc.openDevTools({ mode: 'detach' })
    }
  })

  screen.on('display-added', resizeToVirtualDesktop)
  screen.on('display-removed', resizeToVirtualDesktop)
  screen.on('display-metrics-changed', resizeToVirtualDesktop)
}

export function startOverlayStage(port: number, token: string): void {
  stopOverlayStage()
  stageParams = { port, token }
  createStageWindow()
}

export function stopOverlayStage(): void {
  if (stageWindow && !stageWindow.isDestroyed()) {
    try { stageWindow.close() } catch { /* ignore */ }
  }
  stageWindow = null
  stageParams = null
}
