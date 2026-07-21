/**
 * OBS browser-source server.
 *
 * Serves the overlay stage web app (the same `overlay.html` bundle the
 * transparent stage window loads) over plain HTTP on a fixed localhost port so
 * OBS can capture overlays with a **Browser Source** instead of Game Capture -
 * which cannot hook a Chromium/Electron window.
 */
import { screen } from 'electron'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const WEB_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const OBS_BASE_PORT = 47800
const OBS_PORT_TRIES = 10
const PARAMS_PATH = '/obs-params'

export interface ObsParams {
  wsPort: number
  token: string
}

let server: http.Server | null = null
let boundPort: number | null = null
let params: ObsParams | null = null

const NO_STORE = {
  'cache-control': 'no-store, no-cache, must-revalidate',
  pragma: 'no-cache',
  expires: '0',
  'access-control-allow-origin': '*',
}

/** Bounding box of the union of all displays - the overlay stage's coord space. */
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

/** Displays offered to the launcher's broadcast picker. */
export function listObsDisplays(): Array<{ id: string; label: string; width: number; height: number; primary: boolean }> {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    // Index-based, not `d.label`: Windows reports things like "\\.\DISPLAY1" or
    // a long OEM model name, neither of which fits a button.
    label: `${i + 1}`,
    width: d.bounds.width,
    height: d.bounds.height,
    primary: d.id === primaryId,
  }))
}

/**
 * Region of the stage a browser source should show, as an offset from the
 * virtual-desktop origin plus a size. Overlay rects live in virtual-desktop
 * coordinates, so a source sized to one monitor would otherwise render the
 * union's top-left corner - usually a monitor with no overlays on it.
 *
 * `all` broadcasts the whole virtual desktop; anything else resolves to that
 * display id, falling back to the primary display.
 */
function resolveViewport(sel: string | null): { x: number; y: number; w: number; h: number } {
  const v = virtualBounds()
  if (sel === 'all') return { x: 0, y: 0, w: v.width, h: v.height }
  const displays = screen.getAllDisplays()
  const target = (sel ? displays.find((d) => String(d.id) === sel) : undefined)
    ?? screen.getPrimaryDisplay()
  return {
    x: target.bounds.x - v.x,
    y: target.bounds.y - v.y,
    w: target.bounds.width,
    h: target.bounds.height,
  }
}

function makeHandler(rendererDist: string): http.RequestListener {
  const root = path.resolve(rendererDist)
  const overlayHtml = path.join(root, 'overlay.html')

  const serveIndex = (res: http.ServerResponse): void => {
    // Absent in dev, where Vite serves the overlay bundle instead; this server
    // still runs there to provide /obs-params.
    if (!fs.existsSync(overlayHtml)) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const html = fs.readFileSync(overlayHtml, 'utf-8')
      const boot = `<script>window.__FUSE_OVERLAY_PARAMS_URL__=${JSON.stringify(PARAMS_PATH)};</script>`
      const out = html.replace('<head>', `<head>${boot}`)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...NO_STORE })
      res.end(out)
    } catch {
      res.writeHead(500)
      res.end()
    }
  }

  const serveParams = (reqUrl: string, res: http.ServerResponse): void => {
    const query = new URLSearchParams(reqUrl.split('?')[1] ?? '')
    // Resolved per request, not per launch: the user can rearrange monitors or
    // change resolution while a source is live.
    const viewport = resolveViewport(query.get('display'))
    res.writeHead(200, { 'content-type': 'application/json', ...NO_STORE })
    // `running:false` (not an error) so the page can quietly retry until FUSE
    // comes back up, instead of treating downtime as a fatal condition.
    res.end(params
      ? JSON.stringify({ running: true, port: params.wsPort, token: params.token, viewport })
      : JSON.stringify({ running: false, viewport }))
  }

  const serveStatic = (urlPath: string, res: http.ServerResponse): void => {
    const clean = decodeURIComponent((urlPath.split('?')[0] ?? '').replace(/^\/+/, ''))
    const abs = path.resolve(root, clean)
    // Contain within the renderer dist (no path traversal).
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.writeHead(400)
      res.end()
      return
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404)
      res.end()
      return
    }
    const type = WEB_MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, ...NO_STORE })
    fs.createReadStream(abs).pipe(res)
  }

  return (req, res) => {
    const reqUrl = req.url ?? '/'
    const pathOnly = reqUrl.split('?')[0]
    if (pathOnly === PARAMS_PATH) { serveParams(reqUrl, res); return }
    if (pathOnly === '/' || pathOnly === '/obs') { serveIndex(res); return }
    serveStatic(pathOnly, res)
  }
}

function tryListen(srv: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = (): void => { srv.removeListener('listening', onListening); resolve(false) }
    const onListening = (): void => { srv.removeListener('error', onError); resolve(true) }
    srv.once('error', onError)
    srv.once('listening', onListening)
    srv.listen(port, '127.0.0.1')
  })
}

export async function startObsServer(rendererDist: string): Promise<number | null> {
  if (server) return boundPort

  const srv = http.createServer(makeHandler(rendererDist))
  for (let i = 0; i < OBS_PORT_TRIES; i++) {
    const port = OBS_BASE_PORT + i
    if (await tryListen(srv, port)) {
      server = srv
      boundPort = port
      return port
    }
  }
  try { srv.close() } catch { /* ignore */ }
  return null
}

export function setObsParams(next: ObsParams | null): void {
  params = next
}

export function stopObsServer(): void {
  params = null
  if (server) {
    try { server.close() } catch { /* ignore */ }
    server = null
  }
  boundPort = null
}

/**
 * The OBS Browser Source URL, or null when the server isn't listening.
 * `display` is a display id from {@link listObsDisplays}, or 'all' for the whole
 * virtual desktop; omitted means the primary display.
 */
export function obsUrl(display?: string | null): string | null {
  if (boundPort === null) return null
  const base = `http://127.0.0.1:${boundPort}/obs`
  return display ? `${base}?display=${encodeURIComponent(display)}` : base
}

/**
 * Absolute URL of the params endpoint, for pages this server doesn't itself
 * serve (in dev the overlay bundle comes from Vite, so it can't be handed the
 * endpoint via injection and takes it as a query param instead).
 */
export function obsParamsUrl(): string | null {
  return boundPort === null ? null : `http://127.0.0.1:${boundPort}${PARAMS_PATH}`
}
