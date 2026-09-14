/**
 * Consent card for plugin permissions, drawn in its own view layered over the
 * stage window. Plugin Vue overlays run inside the stage page, so the card can't
 * live there: they could press Allow themselves.
 */
import { BrowserWindow, WebContentsView, screen, session } from 'electron'
import path from 'node:path'
import { handleIpc, onIpc, trustSurface } from './ipcGuard'
import { getStageWindow, setStageInputOverride } from './overlayStage'

declare const __RELEASE__: boolean

export interface ConsentScope {
  id: string
  label: string
  description: string
  reason: string
  icon?: string
  /** Current state, shown when reviewing. */
  state?: string
}

export interface ConsentRequest {
  requestId: string
  /** ask: the plugin needs an answer. review: the user picked the scope on the stage. */
  mode?: 'ask' | 'review'
  plugin: { id: string; name: string; version: string; author: string }
  scopes: ConsentScope[]
}

interface ConsentEnv {
  devServerUrl?: string
  rendererDist: string
  preload: string
  onDecision: (request: ConsentRequest, grants: Record<string, boolean>) => void
}

const PARTITION = 'fuse-consent'
const CLOSE_FALLBACK_MS = 1000
/** How often the cursor is checked against the card while it's up. */
const CURSOR_POLL_MS = 16

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

let env: ConsentEnv | null = null
let view: WebContentsView | null = null
let viewHost: BrowserWindow | null = null
let viewLoaded: Promise<void> | null = null
const queue: ConsentRequest[] = []
let showing: ConsentRequest | null = null
/** Answered, and its card is still animating out. */
let closing: { requestId: string; timer: NodeJS.Timeout } | null = null
let pumping = false
let cardRect: Rect | null = null
let cursorTimer: NodeJS.Timeout | null = null

function csp(): string {
  const dev = env?.devServerUrl
  return "default-src 'self';" +
    ` script-src 'self'${dev ? " 'unsafe-inline' 'unsafe-eval'" : ''};` +
    " style-src 'self' 'unsafe-inline';" +
    " img-src 'self' data:;" +
    " font-src 'self' data:;" +
    ` connect-src 'self'${dev ? ' ws://localhost:* http://localhost:*' : ''};` +
    " object-src 'none';" +
    " base-uri 'self'"
}

export function initConsent(next: ConsentEnv): void {
  env = next
  session.fromPartition(PARTITION).webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp()] } })
  })

  handleIpc('consent:decide', (_e, requestId: unknown, grants: unknown) => {
    const req = showing
    if (!req || req.requestId !== requestId) return
    const answered = (grants ?? {}) as Record<string, unknown>
    const clean: Record<string, boolean> = {}
    for (const scope of req.scopes) clean[scope.id] = answered[scope.id] === true
    showing = null
    env?.onDecision(req, clean)
    // Hiding now would freeze the half-closed card as the view's last frame, and flash it on the next show.
    closing = { requestId: req.requestId, timer: setTimeout(finishClosing, CLOSE_FALLBACK_MS) }
  })

  onIpc('consent:closed', (_e, requestId: unknown) => {
    if (closing?.requestId === requestId) finishClosing()
  })

  onIpc('consent:card-rect', (_e, rect: unknown) => {
    cardRect = toRect(rect)
    updateInput()
  })

  screen.on('display-added', placeView)
  screen.on('display-removed', placeView)
  screen.on('display-metrics-changed', placeView)
}

export function requestConsent(req: ConsentRequest): void {
  if (!req || typeof req.requestId !== 'string' || !Array.isArray(req.scopes) || !req.plugin) return
  queue.push(req)
  void showNext()
}

/** The stage window opened: show anything that was waiting for it. */
export function stageOpened(): void {
  void showNext()
}

/** The runtime went away, and its questions with it. */
export function resetConsent(): void {
  queue.length = 0
  showing = null
  if (closing) clearTimeout(closing.timer)
  closing = null
  hideView()
}

function finishClosing(): void {
  if (!closing) return
  clearTimeout(closing.timer)
  closing = null
  void showNext()
}

async function showNext(): Promise<void> {
  if (pumping || showing || closing || !env) return
  if (!queue.length) {
    hideView()
    return
  }
  const stage = getStageWindow()
  if (!stage) return
  pumping = true
  try {
    const v = await ensureView(stage)
    const req = queue.shift()
    if (!v || !req) return
    showing = req
    placeView()
    v.setVisible(true)
    startCursorWatch()
    v.webContents.send('consent:request', req)
  } finally {
    pumping = false
  }
}

/**
 * Covers the primary display, wherever the stage window spans; the page centres
 * the card in itself. Re-run whenever the stage window or the displays change,
 * since the stage grows to the whole desktop after it opens.
 */
function placeView(): void {
  const stage = viewHost
  if (!view || !stage || stage.isDestroyed()) return
  const content = stage.getContentBounds()
  const primary = screen.getPrimaryDisplay().bounds
  view.setBounds({ x: primary.x - content.x, y: primary.y - content.y, width: primary.width, height: primary.height })
}

function ensureView(stage: BrowserWindow): Promise<WebContentsView | null> {
  if (view && viewHost === stage && viewLoaded && !view.webContents.isDestroyed()) {
    return viewLoaded.then(() => view)
  }
  const v = new WebContentsView({
    webPreferences: {
      preload: env!.preload,
      additionalArguments: ['--fuse-surface=consent'],
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !__RELEASE__,
    },
  })
  v.setBackgroundColor('#00000000')
  v.setVisible(false)
  trustSurface(v.webContents, 'consent')
  v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  v.webContents.on('will-navigate', (e) => e.preventDefault())
  stage.contentView.addChildView(v)
  stage.on('move', placeView)
  stage.on('resize', placeView)
  stage.once('closed', () => {
    if (viewHost !== stage) return
    if (showing) queue.unshift(showing)
    showing = null
    if (closing) clearTimeout(closing.timer)
    closing = null
    if (!v.webContents.isDestroyed()) v.webContents.close()
    view = null
    viewHost = null
    viewLoaded = null
  })

  view = v
  viewHost = stage
  // Sized before loading, so the page never lays out at the default size.
  placeView()
  viewLoaded = new Promise<void>((resolve) => {
    v.webContents.once('did-finish-load', () => resolve())
    v.webContents.once('did-fail-load', (_e, code, desc) => {
      console.error(`[consent] view failed to load (${code} ${desc})`)
      resolve()
    })
  })
  if (env!.devServerUrl) void v.webContents.loadURL(`${env!.devServerUrl}consent.html`)
  else void v.webContents.loadFile(path.join(env!.rendererDist, 'consent.html'))
  return viewLoaded.then(() => view)
}

function hideView(): void {
  if (view && !view.webContents.isDestroyed()) view.setVisible(false)
  stopCursorWatch()
  cardRect = null
  setStageInputOverride(null)
}

/**
 * The stage window spans the desktop and can only take clicks everywhere or
 * nowhere. So while a card is up it takes them only with the cursor over the
 * card, and the stage page's own requests wait until the card is gone.
 */
function startCursorWatch(): void {
  if (!cursorTimer) cursorTimer = setInterval(updateInput, CURSOR_POLL_MS)
  updateInput()
}

function stopCursorWatch(): void {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = null
}

function updateInput(): void {
  if (!cursorTimer) return
  setStageInputOverride(cursorOverCard())
}

function cursorOverCard(): boolean {
  const stage = viewHost
  if (!cardRect || !view || !stage || stage.isDestroyed()) return false
  const content = stage.getContentBounds()
  const bounds = view.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const x = cursor.x - content.x - bounds.x
  const y = cursor.y - content.y - bounds.y
  return x >= cardRect.x && x < cardRect.x + cardRect.width && y >= cardRect.y && y < cardRect.y + cardRect.height
}

function toRect(value: unknown): Rect | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  const [x, y, width, height] = [r.x, r.y, r.width, r.height].map(Number)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}
