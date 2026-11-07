import { BrowserWindow, screen, session, shell, type WebFrameMain } from 'electron'
import { handleIpc, onIpc, trustSurface } from './ipcGuard'
import { desktopBounds, dipRectFor, displayInStage, stageFrame, windowDeviceBounds, type Rect } from './stageGeometry'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

declare const __RELEASE__: boolean

const OVERLAY_PARTITION = 'fuse-overlay'
const OVERLAY_CSP =
  "default-src 'self';" +
  " script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';" +
  " style-src 'self' 'unsafe-inline';" +
  " img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:*;" +
  " font-src 'self' data:;" +
  " connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*;" +
  // Any https frame passes the CSP. Main then cancels every one outside `frameSources`.
  " frame-src https:;" +
  " object-src 'none';" +
  " base-uri 'self'"

interface StageEnv {
  devServerUrl?: string
  rendererDist: string
  preload: string
}

let stageWindow: BrowserWindow | null = null
let stageParams: { port: number; token: string } | null = null
/** The stage page's own URL; the window may load nothing else. */
let stageUrl = ''
/** The current page load already took the connection params. */
let connectionTaken = false
/** While a consent card is up, main decides where the stage takes clicks; null leaves it to the stage page. */
let inputOverride: boolean | null = null
/** What the stage page last asked for, restored when the override lifts. */
let requestedIgnore = true
/** Last state sent to the window, so frequent requests don't repeat it. */
let appliedIgnore: boolean | null = null
let env: StageEnv | null = null
/** What the enabled plugins declared in `frames`: `https://site.net` or `https://*.site.net`. */
let frameSources: string[] = []

/** The runtime sends this whenever the set of enabled plugins changes. */
export function setFrameSources(raw: unknown): void {
  frameSources = (Array.isArray(raw) ? raw : []).filter(
    (s): s is string => typeof s === 'string' && s.startsWith('https://'),
  )
}

function frameAllowed(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port) return false
  return frameSources.some((s) =>
    s.startsWith('https://*.') ? u.hostname.endsWith(s.slice('https://*'.length)) : u.origin === s,
  )
}

/** A frame inside the stage page, not the page itself. A gone frame reads as no frame. */
function isSubFrame(frame: WebFrameMain | null | undefined): boolean {
  try {
    return !!frame?.parent
  } catch {
    return false
  }
}

/** Device pixels the window may be off before a refit. */
const FIT_TOLERANCE = 2
/** Refits allowed until the displays change, so the window never fights Windows in a loop. */
const MAX_FITS = 6
const FIT_DELAY_MS = 100
const DISPLAY_DELAY_MS = 250

let fitsLeft = MAX_FITS
let fitTimer: ReturnType<typeof setTimeout> | null = null
let lastDisplays = ''

function fitsDesktop(win: BrowserWindow, target: Rect): boolean {
  const b = windowDeviceBounds(win)
  return Math.abs(b.x - target.x) <= FIT_TOLERANCE &&
    Math.abs(b.y - target.y) <= FIT_TOLERANCE &&
    Math.abs(b.x + b.width - target.x - target.width) <= FIT_TOLERANCE &&
    Math.abs(b.y + b.height - target.y - target.height) <= FIT_TOLERANCE
}

/** Moves the window over the whole desktop, unless it is there already. */
function fitToDesktop(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const target = desktopBounds()
  if (!fitsDesktop(win, target)) {
    if (fitsLeft > 0) {
      fitsLeft--
      // A non-resizable window keeps its old size as its max size on Windows, so the limit lifts for the move.
      const wasResizable = win.isResizable()
      if (!wasResizable) win.setResizable(true)
      win.setBounds(dipRectFor(target))
      if (!wasResizable) win.setResizable(false)
    } else if (fitsLeft === 0) {
      fitsLeft--
      console.warn('[stage] window does not fit the desktop', JSON.stringify({ target, got: windowDeviceBounds(win) }))
    }
  }
  sendDisplays()
}

/** A DPI change can resize the window after a move, so every fit gets a check once things settle. */
function scheduleFit(delay = FIT_DELAY_MS): void {
  if (fitTimer) clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    fitTimer = null
    const win = getStageWindow()
    if (win) fitToDesktop(win)
  }, delay)
}

function applyIgnore(ignore: boolean, win: BrowserWindow | null = getStageWindow()): void {
  if (!win || win.isDestroyed() || appliedIgnore === ignore) return
  appliedIgnore = ignore
  win.setIgnoreMouseEvents(ignore, { forward: true })
}

/** Every display's box in the stage page's CSS pixels. The window also covers the gaps between them. */
function stageDisplays(win: BrowserWindow): Array<{ x: number; y: number; w: number; h: number; primary: boolean }> {
  const frame = stageFrame(win)
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d) => {
    const r = displayInStage(d, frame)
    return { x: r.x, y: r.y, w: r.width, h: r.height, primary: d.id === primaryId }
  })
}

function sendDisplays(): void {
  const win = getStageWindow()
  if (!win || win.webContents.isDestroyed()) return
  const list = stageDisplays(win)
  const key = JSON.stringify(list)
  if (key === lastDisplays) return
  lastDisplays = key
  win.webContents.send('overlay:displays-changed', list)
}

function isStagePage(url: string): boolean {
  const bare = (u: string) => u.split(/[?#]/)[0].toLowerCase()
  return !!stageUrl && bare(url) === bare(stageUrl)
}

function createStageWindow(): void {
  if (!stageParams || !env) return
  const b = dipRectFor(desktopBounds())
  fitsLeft = MAX_FITS
  lastDisplays = ''
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
      additionalArguments: ['--fuse-surface=stage'],
      partition: OVERLAY_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      devTools: true,
    },
  })
  trustSurface(win.webContents, 'stage')
  win.setAlwaysOnTop(true, 'screen-saver')
  // Click-through by default; the renderer flips this while hovering an overlay.
  requestedIgnore = true
  appliedIgnore = null
  applyIgnore(inputOverride === null ? true : !inputOverride, win)

  // Plugin overlays run in this page: no popups, and no navigating it anywhere else.
  // A new-window link inside an allowed frame opens in the browser. The referrer is the only clue to the opener.
  win.webContents.setWindowOpenHandler(({ url, referrer }) => {
    if (url.startsWith('https://') && frameAllowed(referrer.url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!isStagePage(url)) e.preventDefault()
  })
  // A frame stays on its declared sites. A link the site itself follows elsewhere opens in the browser.
  win.webContents.on('will-frame-navigate', (e) => {
    if (e.isMainFrame || frameAllowed(e.url)) return
    e.preventDefault()
    const initiator = e.initiator
    if (e.url.startsWith('https://') && isSubFrame(initiator) && frameAllowed(initiator?.url ?? '')) {
      void shell.openExternal(e.url)
    }
  })
  // Windows can move or resize the window on its own, for example on a DPI change.
  win.on('move', () => scheduleFit())
  win.on('resize', () => scheduleFit())
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) connectionTaken = false
  })

  // No token in the URL: the stage app asks for it over IPC before any plugin code loads.
  connectionTaken = false
  if (env.devServerUrl) {
    stageUrl = `${env.devServerUrl}overlay.html`
    win.loadURL(stageUrl)
  } else {
    const file = path.join(env.rendererDist, 'overlay.html')
    stageUrl = pathToFileURL(file).href
    win.loadFile(file)
  }
  win.once('ready-to-show', () => {
    win.showInactive()
    // Windows limits a new window to the work area, so the real size comes after show.
    fitToDesktop(win)
    setTimeout(() => fitToDesktop(win), 500)
    setTimeout(() => fitToDesktop(win), 1500)
    if (env?.devServerUrl) win.webContents.openDevTools({ mode: 'detach' })
  })
  win.on('closed', () => { if (stageWindow === win) stageWindow = null })
  stageWindow = win
}

/** Displays can send several events for one change, so the fit waits for the last one. */
function onDisplaysChanged(): void {
  fitsLeft = MAX_FITS
  scheduleFit(DISPLAY_DELAY_MS)
}

export function initOverlayStage(stageEnv: StageEnv): void {
  env = stageEnv

  const stageSession = session.fromPartition(OVERLAY_PARTITION)
  stageSession.webRequest.onHeadersReceived((details, cb) => {
    // A framed site keeps its own headers. The stage policy would block its files.
    if (details.resourceType === 'subFrame' || isSubFrame(details.frame)) {
      cb({})
      return
    }
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [OVERLAY_CSP],
      },
    })
  })
  // The second check: it also catches redirects, which `will-frame-navigate` does not see.
  stageSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: details.resourceType === 'subFrame' && !frameAllowed(details.url) })
  })

  handleIpc('overlay:displays', (e) => {
    const win = getStageWindow()
    return win && e.sender === win.webContents ? stageDisplays(win) : null
  })

  // Once per page load. The stage app takes it first, so plugin code that asks later gets null.
  handleIpc('overlay:connection', (e) => {
    const win = getStageWindow()
    if (connectionTaken || !stageParams || !win || e.sender !== win.webContents) return null
    if (!isStagePage(e.senderFrame?.url ?? '')) return null
    connectionTaken = true
    return { ...stageParams }
  })

  onIpc('overlay:set-ignore', (_e, ignore: boolean) => {
    requestedIgnore = !!ignore
    if (inputOverride === null) applyIgnore(requestedIgnore)
  })

  // Interactive state only: allow the stage to take keyboard focus so Vue
  // <input>s work. Otherwise the always-on-top stage stays non-focusable so it
  // never steals focus from the game.
  onIpc('overlay:set-focusable', (_e, focusable: boolean) => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.setFocusable(!!focusable)
      if (!focusable) return
      // A focusable overlay still needs an explicit focus to route key events to
      // the clicked input; showInactive() left it unfocused.
      stageWindow.focus()
    }
  })

  onIpc('overlay:toggle-devtools', () => {
    if (stageWindow && !stageWindow.isDestroyed()) {
      const wc = stageWindow.webContents
      if (wc.isDevToolsOpened()) wc.closeDevTools()
      else wc.openDevTools({ mode: 'detach' })
    }
  })

  screen.on('display-added', onDisplaysChanged)
  screen.on('display-removed', onDisplaysChanged)
  screen.on('display-metrics-changed', onDisplaysChanged)
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

export function getStageWindow(): BrowserWindow | null {
  return stageWindow && !stageWindow.isDestroyed() ? stageWindow : null
}

/**
 * For the consent card: true takes clicks, false lets them through, whatever the
 * stage page asks for. null hands control back to the stage page.
 */
export function setStageInputOverride(takeClicks: boolean | null): void {
  inputOverride = takeClicks
  applyIgnore(takeClicks === null ? requestedIgnore : !takeClicks)
}
