/**
 * OBS browser-source server.
 *
 * Serves the overlay stage web app (the same `overlay.html` bundle the
 * transparent stage window loads) over plain HTTP on a fixed localhost port so
 * OBS can capture overlays with a **Browser Source** instead of Game Capture -
 * which cannot hook a Chromium/Electron window.
 */
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

function makeHandler(rendererDist: string): http.RequestListener {
  const root = path.resolve(rendererDist)
  const overlayHtml = path.join(root, 'overlay.html')

  const serveIndex = (res: http.ServerResponse): void => {
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

  const serveParams = (res: http.ServerResponse): void => {
    res.writeHead(200, { 'content-type': 'application/json', ...NO_STORE })
    // `running:false` (not an error) so the page can quietly retry until FUSE
    // comes back up, instead of treating downtime as a fatal condition.
    res.end(params
      ? JSON.stringify({ running: true, port: params.wsPort, token: params.token })
      : JSON.stringify({ running: false }))
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
    const pathOnly = (req.url ?? '/').split('?')[0]
    if (pathOnly === PARAMS_PATH) { serveParams(res); return }
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
  if (!fs.existsSync(path.join(rendererDist, 'overlay.html'))) return null

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

/** The OBS Browser Source URL, or null when the server isn't listening. */
export function obsUrl(): string | null {
  return boundPort === null ? null : `http://127.0.0.1:${boundPort}/obs`
}
