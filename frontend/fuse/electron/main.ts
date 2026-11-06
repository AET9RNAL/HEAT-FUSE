import { app, BrowserWindow, Tray, Menu, nativeImage, safeStorage, powerMonitor, shell, dialog, protocol, net } from 'electron'
import * as Sentry from '@sentry/electron/main'
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN as string })
}
import { autoUpdater } from 'electron-updater'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import crypto from 'node:crypto'
import https from 'node:https'
import DiscordRPC from 'discord-rpc'

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { strFromU8 } from 'fflate'
import { inspectPackage, readCentralDirectory, readEntry, type RangeSource } from '../../../workers/registry-processor/src/zip.ts'
import { checkImage, sniffImage, MAX_IMAGE_BYTES } from '../../../workers/registry-processor/src/image.ts'
import { getStageWindow, initOverlayStage, setFrameSources, startOverlayStage, stopOverlayStage } from './overlayStage'
import { handleIpc, onIpc, onceIpc, trustSurface } from './ipcGuard'
import { PermissionStore } from './permissionStore'
import { SecretStore } from './secretStore'
import { initConsent, requestConsent, resetConsent, stageOpened, type ConsentRequest } from './consentView'
import { startObsServer, stopObsServer, setObsParams, obsUrl, obsParamsUrl, listObsDisplays } from './obsServer'

declare const __RELEASE__: boolean

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const IS_DEV   = !!VITE_DEV_SERVER_URL
const REPO_ROOT = path.join(process.env.APP_ROOT!, '..', '..') // HEAT_SACLOS/ - only meaningful in dev
const USER_DATA_DIR = IS_DEV ? path.join(REPO_ROOT, 'backend', 'data') : app.getPath('userData')

const PATHS: Record<string, string> = {
  configs:     IS_DEV ? path.join(REPO_ROOT, 'backend', 'data', 'configs')
                      : path.join(USER_DATA_DIR, 'configs'),
  // Never the install folder: it holds the runtime's own code.
  fileBrowser: IS_DEV ? path.join(REPO_ROOT, 'backend')
                      : USER_DATA_DIR,
  pluginsCore: IS_DEV ? path.join(REPO_ROOT, 'backend', 'fuse', 'plugins')
                      : path.join(USER_DATA_DIR, 'plugins'),
  pluginsUser: IS_DEV ? path.join(REPO_ROOT, 'plugins-dist')
                      : path.join(USER_DATA_DIR, 'plugins'),
  runtimeEntry: IS_DEV ? path.join(REPO_ROOT, 'runtime', 'dist', 'index.js')
                      : path.join(process.resourcesPath, 'runtime', 'index.js'),
  trayIcon:    IS_DEV ? path.join(__dirname, '..', 'build', 'icon.png')
                      : path.join(process.resourcesPath, 'icon.png'),
  fileTypeIco: IS_DEV ? path.join(__dirname, '..', 'src', 'assets', 'fuse_filetype.ico')
                      : path.join(process.resourcesPath, 'fuse_filetype.ico'),
  backendExe:  path.join(process.resourcesPath, 'fuse-backend.dist', 'fuse-backend.exe'),
  preload:     path.join(__dirname, 'preload.mjs'),
}


// Plugin scanning

interface PluginManifest {
  plugin_id?: string
  id?: string
  name?: string
  version?: string
  description?: string
  author?: string
  config_schema?: unknown[]
  /** Action name -> default combo. */
  hotkeys?: Record<string, string>
  core?: boolean
}

interface HostConfig {
  disabled_plugins: string[]
  enabled_plugins: string[] | null
  hotkey_overrides?: Record<string, Record<string, string>>
}

// Release notes (GitHub release body)

const GH_OWNER = 'AET9RNAL'
const GH_REPO  = 'HEAT-FUSE'
const RELEASE_NOTES_CACHE = path.join(USER_DATA_DIR, 'release-notes.json')
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

interface ReleaseNotesEntry {
  version: string
  notes: string
  releaseDate?: string
  url?: string
}

// electron-updater hands back either a markdown string or [{ version, note }]
function normalizeReleaseNotes(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (Array.isArray(raw)) {
    return raw
      .map(item => (item && typeof item === 'object' && 'note' in item
        ? String((item as { note?: unknown }).note ?? '')
        : String(item ?? '')))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return ''
}

function readReleaseNotesCache(): ReleaseNotesEntry | null {
  try {
    if (!fs.existsSync(RELEASE_NOTES_CACHE)) return null
    const entry = JSON.parse(fs.readFileSync(RELEASE_NOTES_CACHE, 'utf-8')) as ReleaseNotesEntry
    return entry && typeof entry.version === 'string' && typeof entry.notes === 'string' ? entry : null
  } catch {
    return null
  }
}

function writeReleaseNotesCache(entry: ReleaseNotesEntry) {
  if (!entry.notes) return
  try {
    fs.mkdirSync(path.dirname(RELEASE_NOTES_CACHE), { recursive: true })
    fs.writeFileSync(RELEASE_NOTES_CACHE, JSON.stringify(entry, null, 2), 'utf-8')
  } catch { /* cache is best-effort */ }
}

// Anonymous API access only sees published releases - drafts fall back to the
// cache written while the update was still being downloaded.
async function fetchReleaseNotesFromGitHub(version: string): Promise<ReleaseNotesEntry | null> {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': `FUSE/${app.getVersion()}`,
  }
  for (const tag of [`v${version}`, version]) {
    try {
      const res = await net.fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/tags/${encodeURIComponent(tag)}`,
        { headers },
      )
      if (!res.ok) continue
      const data = await res.json() as { body?: string; published_at?: string; html_url?: string }
      const notes = (data.body ?? '').trim()
      if (!notes) continue
      return { version, notes, releaseDate: data.published_at, url: data.html_url }
    } catch { /* offline / rate limited - try next tag form */ }
  }
  return null
}

function assertWithinRoot(target: string, root: string) {
  const a = path.resolve(target)
  const r = path.resolve(root)
  if (a !== r && !a.startsWith(r + path.sep)) throw new Error('Access denied')
}

function readHostConfig(): HostConfig {
  const p = path.join(PATHS.configs, 'fuse_host.json')
  if (!fs.existsSync(p)) return { disabled_plugins: [], enabled_plugins: null }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as HostConfig
}

function writeHostConfig(cfg: HostConfig) {
  if (!fs.existsSync(PATHS.configs)) fs.mkdirSync(PATHS.configs, { recursive: true })
  fs.writeFileSync(path.join(PATHS.configs, 'fuse_host.json'), JSON.stringify(cfg, null, 2), 'utf-8')
}

/** The manifest hotkeys as the App lists them while the runtime is down: action names, with the combos saved under them. */
function manifestHotkeys(hotkeys: PluginManifest['hotkeys'], saved: Record<string, string> = {}) {
  return Object.entries(hotkeys ?? {}).map(([action, combo]) => ({ action, combo: saved[action] ?? String(combo), label: action }))
}

/** Streams the file through SHA-256 in chunks, so a large package does not block the main process. */
function hashFile(filePath: string, start?: number, end?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fs.createReadStream(filePath, { start, end })
      .on('data', c => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

interface ScannedFile {
  checksum: string
  manifest: PluginManifest | null
}

// A package is read again only when its size or file times change.
const scanCache = new Map<string, { stamp: string; result: Promise<ScannedFile> }>()

/** Reads the zip index and the manifest only, not the whole package. */
async function readPluginFile(filePath: string, size: number): Promise<ScannedFile> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const src: RangeSource = {
      size,
      read: async (offset, length) => {
        const b = Buffer.alloc(length)
        const { bytesRead } = await handle.read(b, 0, length, offset)
        return new Uint8Array(b.buffer, b.byteOffset, bytesRead)
      },
    }
    const entry = (await readCentralDirectory(src)).find(e => e.name.endsWith('/manifest.json'))
    const manifest = entry ? JSON.parse(strFromU8(await readEntry(src, entry))) as PluginManifest : null
    return { checksum: await hashFile(filePath), manifest }
  } finally {
    await handle.close()
  }
}

function scanPluginFile(filePath: string, stat: fs.Stats): Promise<ScannedFile> {
  const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
  const hit = scanCache.get(filePath)
  if (hit?.stamp === stamp) return hit.result
  const result = readPluginFile(filePath, stat.size)
  scanCache.set(filePath, { stamp, result })
  // A failed read, for example of a file still downloading, runs again on the next scan.
  result.catch(() => { if (scanCache.get(filePath)?.result === result) scanCache.delete(filePath) })
  return result
}

async function scanPluginsDir(dir: string) {
  const files = (await fs.promises.readdir(dir).catch(() => [] as string[])).filter(f => f.endsWith('.fuse'))
  const present = new Set(files.map(f => path.join(dir, f)))
  for (const key of scanCache.keys()) if (!present.has(key)) scanCache.delete(key)
  let saved: HostConfig['hotkey_overrides'] = {}
  try { saved = readHostConfig().hotkey_overrides ?? {} } catch { /* an unreadable host config: the defaults show */ }
  const rows = await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file)
    try {
      const { checksum, manifest: m } = await scanPluginFile(filePath, await fs.promises.stat(filePath))
      if (!m) return null
      const pluginId = m.plugin_id ?? m.id ?? path.basename(file, '.fuse')
      return {
        plugin_id:    pluginId,
        name:         m.name        ?? path.basename(file, '.fuse'),
        version:      m.version     ?? '0.0.0',
        description:  m.description ?? '',
        author:       m.author,
        status:       'pending' as const,
        configSchema: m.config_schema ?? [],
        hotkeys:      manifestHotkeys(m.hotkeys, saved?.[pluginId]),
        core:         m.core         ?? false,
        filePath,
        checksum,
      }
    } catch { return null }
  }))
  return rows.filter((r): r is NonNullable<typeof r> => r !== null)
}

//

let win: BrowserWindow | null = null
let splash: BrowserWindow | null = null
let mainReady: Promise<void> = Promise.resolve()
let startHidden = false
let tray: Tray | null = null
let isQuitting = false
let minimizeToTrayOnStart = false
let minimizeToTrayOnClose = false


let fuseProcess: ChildProcess | null = null
let fusePort: number | null = null
let obsToken: string | null = null
let currentObsUrl: string | null = null
let permissionStore: PermissionStore | null = null
let secretStore: SecretStore | null = null

const PLUGIN_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/
const SECRET_KEY_RE = /^[A-Za-z0-9._-]{1,128}$/

/** Runtime requests only main can serve: OS encryption and the user's browser. */
async function answerRuntime(proc: ChildProcess, msg: Record<string, unknown>): Promise<void> {
  const reply = (result: { ok: true; value?: unknown } | { ok: false; error: string }) => {
    if (proc.connected) proc.send({ type: 'bridge:result', requestId: msg.requestId, ...result })
  }
  try {
    const pluginId = String(msg.pluginId ?? '')
    if (!PLUGIN_ID_RE.test(pluginId)) throw new Error('invalid plugin id')
    if (msg.type === 'links:open') {
      const url = new URL(String(msg.url ?? ''))
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
        throw new Error('only plain https links can be opened')
      }
      await shell.openExternal(url.href)
      reply({ ok: true, value: true })
      return
    }
    if (!secretStore) throw new Error('secrets are unavailable')
    const key = String(msg.key ?? '')
    if (!SECRET_KEY_RE.test(key)) throw new Error('invalid secret key')
    switch (msg.op) {
      case 'get': reply({ ok: true, value: secretStore.get(pluginId, key) }); return
      case 'has': reply({ ok: true, value: secretStore.has(pluginId, key) }); return
      case 'delete': reply({ ok: true, value: secretStore.delete(pluginId, key) }); return
      case 'set':
        if (typeof msg.value !== 'string') throw new Error('secret values must be strings')
        secretStore.set(pluginId, key, msg.value)
        reply({ ok: true })
        return
      default:
        throw new Error('unknown secrets operation')
    }
  } catch (e) {
    reply({ ok: false, error: (e as Error).message })
  }
}

const STAGE_PROCESS_CHECK_MS = 2000
let stageProcessTimer: ReturnType<typeof setInterval> | null = null
let lastStageProcesses = ''

/** The runtime measures the stage's renderer and Chromium's GPU process; it's told their ids whenever they change. */
function reportStageProcesses(proc: ChildProcess): void {
  if (!proc.connected) return
  const stage = getStageWindow()
  let rendererPid = 0
  try {
    if (stage && !stage.webContents.isDestroyed()) rendererPid = stage.webContents.getOSProcessId()
  } catch { /* renderer not started yet */ }
  const gpuPid = app.getAppMetrics().find(m => m.type === 'GPU')?.pid ?? 0
  const key = `${rendererPid}:${gpuPid}`
  if (key === lastStageProcesses) return
  lastStageProcesses = key
  proc.send({ type: 'stage:processes', rendererPid, gpuPid })
}

function stopStageProcessReports(): void {
  if (stageProcessTimer) clearInterval(stageProcessTimer)
  stageProcessTimer = null
  lastStageProcesses = ''
}

/** Only while the runtime says the widget is on; off means nothing samples, here or there. */
function startStageProcessReports(proc: ChildProcess): void {
  stopStageProcessReports()
  stageProcessTimer = setInterval(() => reportStageProcesses(proc), STAGE_PROCESS_CHECK_MS)
  reportStageProcesses(proc)
}

/** Inspector port the sidecar was spawned with, and the DevTools window attached to it. */
let runtimeInspectPort = 9229
let runtimeDevtoolsWindow: BrowserWindow | null = null

/**
 * Browser Source URL for a display selection ('all' = whole virtual desktop,
 * null/unknown = primary).
 *
 * In prod the OBS server serves the overlay bundle itself and injects the params
 * endpoint. In dev Vite serves it, so the URL has to carry the runtime params
 * plus an absolute pointer at /obs-params for the display viewport.
 */
function buildObsUrl(display?: string | null): string | null {
  if (!VITE_DEV_SERVER_URL) return obsUrl(display)
  if (fusePort === null || obsToken === null) return null
  const q = new URLSearchParams({ port: String(fusePort), token: obsToken })
  const paramsUrl = obsParamsUrl()
  if (paramsUrl) q.set('paramsUrl', paramsUrl)
  if (display) q.set('display', display)
  return `${VITE_DEV_SERVER_URL}overlay.html?${q.toString()}`
}

// Game process watcher

let gameWatcher: ReturnType<typeof setInterval> | null = null
let focusWatcher: ReturnType<typeof setInterval> | null = null
let gameDetected = false
let gameFocused = false

// Game config (coldwar.project)

const PROJECT_FILE = 'coldwar.project'
const DEFAULT_CDP_PORT = 17503
const ENABLE_RE = /"Enable Debugger"\s*:\s*(true|false)/
const PORT_RE = /"Debugger Port"\s*:\s*(\d+)/

interface GameConfigRead {
  success: boolean
  enabled?: boolean
  /** null when the file carries no "Debugger Port" key. */
  port?: number | null
  error?: string
}

// Read, never parse: the file is JSON-like and the game may keep comments in it.
function _readGameConfig(dirPath: string): GameConfigRead {
  try {
    const content = fs.readFileSync(path.join(dirPath, PROJECT_FILE), 'utf-8')
    const enable = content.match(ENABLE_RE)
    const port = content.match(PORT_RE)
    return { success: true, enabled: enable?.[1] === 'true', port: port ? Number(port[1]) : null }
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message }
  }
}

function _validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}

function _writeGameConfig(dirPath: string, opts: { enabled?: boolean; port?: number }): { success: boolean; error?: string } {
  try {
    const projectPath = path.join(dirPath, PROJECT_FILE)
    let content = fs.readFileSync(projectPath, 'utf-8')
    if (opts.port !== undefined) {
      if (!_validPort(opts.port)) return { success: false, error: `Port ${opts.port} is outside 1024-65535` }
      if (!PORT_RE.test(content)) return { success: false, error: `No "Debugger Port" key in ${PROJECT_FILE}` }
      content = content.replace(new RegExp(PORT_RE.source, 'g'), `"Debugger Port": ${opts.port}`)
    }
    if (opts.enabled !== undefined) {
      if (!ENABLE_RE.test(content)) return { success: false, error: `No "Enable Debugger" key in ${PROJECT_FILE}` }
      content = content.replace(new RegExp(ENABLE_RE.source, 'g'), `"Enable Debugger": ${opts.enabled}`)
    }
    fs.writeFileSync(projectPath, content, 'utf-8')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message }
  }
}

let projectWatcher: fs.FSWatcher | null = null
let projectWatchDir = ''

/**
 * Watch the game folder, because the game replaces the file rather than editing
 * it. The renderer decides what a change means; nothing is written back.
 */
function _watchGameConfig(dirPath: string): void {
  const dir = dirPath ? path.resolve(dirPath) : ''
  if (dir === projectWatchDir) return
  projectWatcher?.close()
  projectWatcher = null
  projectWatchDir = dir
  if (!dir || !fs.existsSync(dir)) return
  let debounce: ReturnType<typeof setTimeout> | null = null
  try {
    const w = fs.watch(dir, (_event: unknown, filename: unknown) => {
      if (filename !== PROJECT_FILE) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        win?.webContents.send('game:config:changed', _readGameConfig(dir))
      }, 150)
    })
    w.on('error', () => { w.close(); if (projectWatcher === w) { projectWatcher = null; projectWatchDir = '' } })
    projectWatcher = w
  } catch { /* an unreadable folder just gets no watcher */ }
}

// Persistent PowerShell session for Win32 foreground-window queries.
let psRunner: ChildProcess | null = null
let psBuffer = ''
const psPending: Array<(result: string) => void> = []
// Sentinels: PowerShell echoes typed stdin back to stdout, so we can't write
// the literal markers - we'd find them in the echo instead of the real output.
// Instead, decode them at runtime via base64; the literal strings then only
// appear in the actual command output stream, not in the echoed input.
const PS_START = '__FUSE_START__'
const PS_END = '__FUSE_END__'
const PS_START_B64 = Buffer.from(PS_START).toString('base64')
const PS_END_B64 = Buffer.from(PS_END).toString('base64')
// Compact inline Add-Type - guard prevents recompilation after first call.
const PS_FW_DEF = `if(-not('FW'-as[type])){Add-Type 'using System;using System.Runtime.InteropServices;public class FW{[DllImport("user32")]public static extern IntPtr GetForegroundWindow();[DllImport("user32")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'}`

function _ensurePsRunner() {
  if (psRunner && !psRunner.killed) return
  psBuffer = ''
  // No -Command flag - stdin processed line-by-line. -NoLogo suppresses banner on stdout.
  psRunner = spawn('powershell', ['-NoProfile', '-NonInteractive', '-NoLogo'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  })
  psRunner.stdout?.on('data', (chunk: Buffer) => {
    psBuffer += chunk.toString()
    let endIdx: number
    while ((endIdx = psBuffer.indexOf(PS_END)) !== -1) {
      // PowerShell echoes the prompt + typed input back to stdout, so strip
      // everything before our START sentinel to isolate the real result.
      const startIdx = psBuffer.indexOf(PS_START)
      const result = (startIdx !== -1 && startIdx < endIdx)
        ? psBuffer.slice(startIdx + PS_START.length, endIdx).trim()
        : psBuffer.slice(0, endIdx).trim()
      psBuffer = psBuffer.slice(endIdx + PS_END.length).replace(/^\r?\n/, '')
      psPending.shift()?.(result)
    }
  })
  psRunner.on('exit', () => {
    psRunner = null
    psBuffer = ''
    const drained = psPending.splice(0)
    for (const cb of drained) cb('')
  })
}

function _psRun(cmd: string): Promise<string> {
  _ensurePsRunner()
  return new Promise(resolve => {
    psPending.push(resolve)
    // try-catch ensures sentinel always arrives even if cmd throws.
    // [Console]::Out.Flush() forces immediate flush of .NET's buffered stdout
    // (piped stdout is block-buffered by default, not line-buffered).
    // Decode sentinels at runtime; literal PS_START / PS_END never appear in
    // the stdin line and therefore can't be confused with PowerShell's echo.
    const decode = (b64: string) => `([Text.Encoding]::ASCII.GetString([Convert]::FromBase64String('${b64}')))`
    psRunner!.stdin!.write(`Write-Output ${decode(PS_START_B64)}; try { ${cmd} } catch {}; Write-Output ${decode(PS_END_B64)}; [Console]::Out.Flush()\r\n`)
  })
}

async function _checkGameProcess(): Promise<{ running: boolean; pid?: number }> {
  return new Promise(resolve => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq engine_launcher.exe', '/FO', 'CSV', '/NH'],
      (_err, stdout) => {
        if (!stdout.includes('engine_launcher.exe')) { resolve({ running: false }); return }
        const m = stdout.match(/"engine_launcher\.exe","(\d+)"/)
        resolve({ running: true, pid: m ? parseInt(m[1]) : undefined })
      }
    )
  })
}

async function _checkForegroundProcess(): Promise<string> {
  const cmd = `${PS_FW_DEF};$h=[FW]::GetForegroundWindow();$p=[uint32]0;[FW]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null;(Get-Process -Id $p -EA 0).Name`
  return (await _psRun(cmd)).toLowerCase()
}

const OWN_PROC = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase()

function _isGameFocused(fg: string): boolean {
  return fg === 'engine_launcher' || fg === OWN_PROC
}


// File association helpers (.fuse → FusePlugin, HKCU - no elevation required)

const FUSE_EXT     = '.fuse'
const FUSE_PROG_ID = 'FusePlugin'

function _isFileAssocRegistered(): Promise<boolean> {
  return new Promise(resolve =>
    execFile('reg', ['query', `HKCU\\Software\\Classes\\${FUSE_EXT}`], err => resolve(!err))
  )
}

function _notifyShellAssocChanged(): Promise<void> {
  return new Promise<void>(resolve =>
    execFile('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -TypeDefinition 'using System.Runtime.InteropServices;public class FuseShellAssoc{[DllImport("shell32")]public static extern void SHChangeNotify(int e,uint f,System.IntPtr a,System.IntPtr b);}' -EA SilentlyContinue;[FuseShellAssoc]::SHChangeNotify(0x08000000,0,[System.IntPtr]::Zero,[System.IntPtr]::Zero)`,
    ], () => resolve())
  )
}

async function _setFileAssoc(register: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    if (register) {
      const iconVal = `"${PATHS.fileTypeIco}",0`
      const adds: [string, string[]][] = [
        ['reg', ['add', `HKCU\\Software\\Classes\\${FUSE_EXT}`,                    '/ve', '/d', FUSE_PROG_ID,            '/f']],
        ['reg', ['add', `HKCU\\Software\\Classes\\${FUSE_PROG_ID}`,                '/ve', '/d', 'FUSE Plugin Archive',   '/f']],
        ['reg', ['add', `HKCU\\Software\\Classes\\${FUSE_PROG_ID}\\DefaultIcon`,   '/ve', '/d', iconVal,                 '/f']],
      ]
      for (const [cmd, args] of adds)
        await new Promise<void>((res, rej) => execFile(cmd, args, err => err ? rej(err) : res()))
    } else {
      for (const key of [`HKCU\\Software\\Classes\\${FUSE_PROG_ID}`, `HKCU\\Software\\Classes\\${FUSE_EXT}`])
        await new Promise<void>(res => execFile('reg', ['delete', key, '/f'], () => res()))
    }
    await _notifyShellAssocChanged()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message }
  }
}

// --- Device info helpers ---

function getDeviceFingerprint(): string {
    const cpuModel = os.cpus()[0]?.model ?? 'unknown'
    const hostname = os.hostname()
    const platform = os.platform()
    return crypto.createHash('sha256')
        .update(`${cpuModel}|${hostname}|${platform}`)
        .digest('hex')
        .slice(0, 32)
}

function getLocalIP(): string | null {
    const ifaces = os.networkInterfaces()
    for (const iface of Object.values(ifaces)) {
        for (const addr of (iface ?? [])) {
            if (!addr.internal && addr.family === 'IPv4') return addr.address
        }
    }
    return null
}

const DISCORD_CLIENT_ID = '1519898189006897383'

interface DiscordActivity {
  details?: string
  state?: string
  startTimestamp?: number
  endTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  instance?: boolean
  buttons?: { label: string; url: string }[]
}

let discordClient: DiscordRPC.Client | null = null
let discordReady = false
let discordEnabled = false
let discordReconnectTimer: ReturnType<typeof setTimeout> | null = null
let pendingActivity: DiscordActivity | null = null
const discordStartTime = Math.floor(Date.now() / 1000)

function connectDiscord() {
  if (discordClient || !discordEnabled) return
  const client = new DiscordRPC.Client({ transport: 'ipc' })

  client.on('ready', () => {
    discordReady = true
    if (pendingActivity) {
      void client.setActivity(pendingActivity as DiscordRPC.Presence)
    }
  })

  // The `disconnected` event isn't exported in @types/discord-rpc but is emitted
  // by the underlying transport. We attach via untyped `on` to be safe.
  ;(client as unknown as { on: (e: string, cb: () => void) => void }).on('disconnected', () => {
    discordReady = false
    discordClient = null
    scheduleDiscordReconnect()
  })

  client.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {
    discordReady = false
    discordClient = null
    scheduleDiscordReconnect()
  })

  discordClient = client
}

function scheduleDiscordReconnect() {
  if (!discordEnabled || discordReconnectTimer) return
  discordReconnectTimer = setTimeout(() => {
    discordReconnectTimer = null
    connectDiscord()
  }, 15_000)
}

function disconnectDiscord() {
  if (discordReconnectTimer) {
    clearTimeout(discordReconnectTimer)
    discordReconnectTimer = null
  }
  if (discordClient) {
    try {
      const p = discordClient.destroy() as unknown as Promise<void> | void
      if (p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>).catch(() => { /* ignore */ })
      }
    } catch { /* ignore */ }
    discordClient = null
  }
  discordReady = false
}

function applyDiscordActivity(activity: DiscordActivity | null) {
  if (!activity) {
    pendingActivity = null
    if (discordClient && discordReady) {
      try { void discordClient.clearActivity() } catch { /* ignore */ }
    }
    return
  }
  const normalized: DiscordActivity = {
    startTimestamp: discordStartTime,
    largeImageKey: 'fuse_logo',
    largeImageText: 'WoT HEAT FUSE',
    instance: false,
    ...activity,
  }
  pendingActivity = normalized
  if (discordClient && discordReady) {
    try { void discordClient.setActivity(normalized as DiscordRPC.Presence) } catch { /* ignore */ }
  }
}


function createTray() {
  if (tray) return
  const icon = nativeImage.createFromPath(PATHS.trayIcon)
  tray = new Tray(icon)
  tray.setToolTip('FUSE')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { win?.show(); win?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', () => { win?.show(); win?.focus() })
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null }
}


// splash screen
function createSplash() {
  splash = new BrowserWindow({
    width: 210,
    height: 210,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !__RELEASE__,
      preload: PATHS.preload,
      additionalArguments: ['--fuse-surface=splash'],
    },
  })

  trustSurface(splash.webContents, 'splash')
  splash.setIgnoreMouseEvents(true)
  splash.once('ready-to-show', () => splash?.show())

  if (VITE_DEV_SERVER_URL) {
    splash.loadURL(new URL('splash.html', VITE_DEV_SERVER_URL).toString())
  } else {
    splash.loadFile(path.join(RENDERER_DIST, 'splash.html'))
  }
}

function destroySplash() {
  if (splash && !splash.isDestroyed()) splash.destroy()
  splash = null
}

// Resolves when the splash reports playback finished, or on a hard timeout
function waitForSplash(): Promise<void> {
  return new Promise(resolve => {
    if (!splash) { resolve(); return }
    const finish = () => {
      clearTimeout(timer)
      stopListening()
      splash?.removeListener('closed', finish)
      resolve()
    }
    const timer = setTimeout(finish, 6_000)
    const stopListening = onceIpc('splash:done', finish)
    splash.once('closed', finish)
  })
}

async function revealMainWindow() {
  await Promise.all([mainReady, waitForSplash()])
  destroySplash()
  if (!win || win.isDestroyed() || startHidden) return
  win.show()
  win.focus()
}

function createWindow() {
  win = new BrowserWindow({
    show: false,
    frame: false,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    fullscreenable: false,
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0.01)',
    backgroundMaterial: 'acrylic',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !__RELEASE__,
      preload: PATHS.preload,
      additionalArguments: ['--fuse-surface=app'],
    },
  })

  trustSurface(win.webContents, 'app')

  mainReady = new Promise<void>(resolve => {
    win!.once('ready-to-show', () => resolve())
    // A failed load still has to release the splash gate.
    win!.webContents.once('did-fail-load', () => resolve())
  })

  // Disable Ctrl+R in production
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault()
    }
  })

  //Route any cross-origin http(s) URL to the user's real browser.
  const openExternalIfWeb = (url: string): void => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  }
  const isSameOrigin = (url: string): boolean => {
    try {
      return new URL(url).origin === new URL(win!.webContents.getURL()).origin
    } catch {
      return false
    }
  }

  // window.open / target=_blank / ctrl+click, never open an in-app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfWeb(url)
    return { action: 'deny' }
  })

  // Plain clicks / location changes, allow same-origin SPA nav, externalize the rest.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url)) {
      event.preventDefault()
      openExternalIfWeb(url)
    }
  })

  // Hide to tray on close when enabled
  win.on('close', (e) => {
    if (minimizeToTrayOnClose && win && !isQuitting) {
      e.preventDefault()
      win.hide()
      return
    }
    stopOverlayStage()
  })

  // Inform renderer of visibility changes (useSuspension)
  win.on('hide', () => { win?.webContents.send('app:suspended') })
  win.on('show', () => { win?.webContents.send('app:resumed') })

  // CSP
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self' 'wasm-unsafe-eval' https://us-assets.i.posthog.com;" +
          " style-src 'self' 'unsafe-inline';" +
          " img-src 'self' data: https:;" +
          " media-src 'self' blob: data:;" +
          " font-src 'self';" +
          " connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*" +
          " https://*.supabase.co wss://*.supabase.co" +
          " https://*.betterstackdata.com" +
          " https://us.i.posthog.com https://us-assets.i.posthog.com" +
          " sentry-ipc:" +
          " https://unpkg.com;" +
          ` frame-src ${VITE_DEV_SERVER_URL ? 'http://localhost:*' : "'none'"};` +
          " object-src 'none';" +
          " base-uri 'self'",
        ],
      },
    })
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

//lifecycle

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

let fuseCleanupDone = false
app.on('before-quit', (event) => {
  isQuitting = true
  disconnectDiscord()
  stopOverlayStage()
  stopObsServer()

  if (gameWatcher) { clearInterval(gameWatcher); gameWatcher = null }
  if (focusWatcher) { clearInterval(focusWatcher); focusWatcher = null }
  if (psRunner) { try { psRunner.kill() } catch { /* ignore */ } psRunner = null }

  if (fuseCleanupDone) return
  if (!fuseProcess) { fuseCleanupDone = true; return }

  event.preventDefault()
  const proc = fuseProcess
  fuseProcess = null
  fusePort = null
  const forceKill = setTimeout(() => proc.kill('SIGKILL'), 3_000)
  proc.once('exit', () => { clearTimeout(forceKill); fuseCleanupDone = true; app.quit() })
  proc.kill('SIGTERM')
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    win?.once('ready-to-show', () => { win?.show(); win?.focus() })
  }
})


protocol.registerSchemesAsPrivileged([
  { scheme: 'sentry-ipc', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } },
])

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fuse', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('fuse')
}

const ALLOWED_DEEP_LINK_ROUTES = new Set(['reset-password'])
const PLUGIN_LINK_RE = /^fuse:\/\/plugin\/([A-Za-z0-9_.-]{1,64})(?:[/?#]|$)/
const MAX_PLUGIN_LINK = 4096

function handleDeepLink(url: string) {
  // fuse://plugin/<id>/... goes to that plugin's process, never the App.
  const pluginLink = PLUGIN_LINK_RE.exec(url)
  if (pluginLink) {
    if (url.length <= MAX_PLUGIN_LINK && fuseProcess?.connected) {
      fuseProcess.send({ type: 'links:callback', pluginId: pluginLink[1], url })
    }
    return
  }
  const route = url.replace('fuse://', '').split(/[?#]/)[0].replace(/\/$/, '')
  if (!ALLOWED_DEEP_LINK_ROUTES.has(route)) return
  const fakeUrl = new URL(url.replace('fuse://', 'https://placeholder/'))
  const queryParams = Object.fromEntries(fakeUrl.searchParams)
  const hashParams = Object.fromEntries(new URLSearchParams(fakeUrl.hash.slice(1)))
  const params = { ...queryParams, ...hashParams }
  win?.webContents.send('app:deep-link', route, params)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // In dev argv is ['electron', 'script', 'fuse://...']; in prod ['app.exe', 'fuse://...']
    const url = argv.find(a => a.startsWith('fuse://'))
    if (url) handleDeepLink(url)
    // A plugin's sign-in callback shouldn't pull the App over the game.
    if (url && PLUGIN_LINK_RE.test(url)) return
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}
app.commandLine.appendSwitch('enable-features', 'CanvasDrawElement')
app.whenReady().then(() => {
  createWindow()
  createSplash()
  // Main window stays hidden until it is painted AND the reveal has played out.
  void revealMainWindow()

  // Register overlay-stage IPC + display listeners (windows open on fuse:spawn).
  initOverlayStage({
    devServerUrl: VITE_DEV_SERVER_URL,
    rendererDist: RENDERER_DIST,
    preload: PATHS.preload,
  })

  // Decisions live here, encrypted; the runtime asks and is told.
  permissionStore = new PermissionStore(path.join(USER_DATA_DIR, 'permissions.bin'))
  secretStore = new SecretStore(path.join(USER_DATA_DIR, 'secrets.bin'))
  initConsent({
    devServerUrl: VITE_DEV_SERVER_URL,
    rendererDist: RENDERER_DIST,
    preload: PATHS.preload,
    onDecision: (req, grants) => {
      permissionStore?.set(req.plugin.id, grants)
      if (fuseProcess?.connected) {
        fuseProcess.send({ type: 'permissions:decision', requestId: req.requestId, pluginId: req.plugin.id, grants })
      }
    },
  })

  // Bind the OBS browser-source listener once, for the whole app lifetime, so
  // its URL never changes under a configured OBS source. Params are published
  // per FUSE launch via setObsParams(). Runs in dev too: Vite serves the overlay
  // bundle there, but /obs-params (display viewports) still comes from here.
  void startObsServer(RENDERER_DIST)

  // Cold-start deep link (app launched by OS protocol handler)
  const deepLinkArg = process.argv.find(a => a.startsWith('fuse://'))
  if (deepLinkArg) {
    win?.webContents.once('did-finish-load', () => handleDeepLink(deepLinkArg))
  }

  // System suspend/resume
  powerMonitor.on('suspend', () => { win?.webContents.send('app:suspended') })
  powerMonitor.on('resume', () => { win?.webContents.send('app:resumed') })


  handleIpc('window:close', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    target?.close()
  })

  handleIpc('window:minimize', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    target?.minimize()
  })

  handleIpc('window:maximize', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    if (!target) return
    target.isMaximized() ? target.unmaximize() : target.maximize()
  })


  // Opens a DevTools window attached to the sidecar's inspector. The frontend URL
  // has to be read off the inspector itself because it embeds the target's uuid.
  onIpc('runtime:toggle-devtools', async () => {
    if (runtimeDevtoolsWindow && !runtimeDevtoolsWindow.isDestroyed()) {
      runtimeDevtoolsWindow.close()
      runtimeDevtoolsWindow = null
      return
    }
    if (!fuseProcess) {
      console.warn('[runtime:devtools] runtime is not running')
      return
    }
    try {
      const res = await fetch(`http://127.0.0.1:${runtimeInspectPort}/json/list`)
      const targets = await res.json() as { devtoolsFrontendUrl?: string; id?: string }[]
      const target = targets[0]
      if (!target) throw new Error('inspector reported no targets')
      const url = target.devtoolsFrontendUrl
        ?? `devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1:${runtimeInspectPort}/${target.id}`

      runtimeDevtoolsWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'FUSE Runtime DevTools',
        autoHideMenuBar: true,
      })
      runtimeDevtoolsWindow.on('closed', () => { runtimeDevtoolsWindow = null })
      runtimeDevtoolsWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        console.error(`[runtime:devtools] could not load frontend (${code} ${desc}); attach manually via ${url}`)
      })
      await runtimeDevtoolsWindow.loadURL(url)
    } catch (err) {
      runtimeDevtoolsWindow = null
      console.error('[runtime:devtools]', err instanceof Error ? err.message : err)
    }
  })

  handleIpc('fuse:spawn', async (_event, opts?: { autoLock?: boolean; language?: string; cdpPort?: number; gameDirs?: Record<string, string> }) => {
    if (fuseProcess) return { success: false, error: 'already running' }

    // The runtime is a Node sidecar (runtime/dist/index.js). We run it with
    // Electron's own Node via ELECTRON_RUN_AS_NODE so no system Node install is
    // required in production; the sidecar prints {port,connectionToken} on its
    // first stdout line, exactly as the old Python backend did.
    if (!fs.existsSync(PATHS.runtimeEntry)) {
      return { success: false, error: `runtime not built: ${PATHS.runtimeEntry} (run "npm run build:runtime")` }
    }
    const executable = process.execPath
    // binds 127.0.0.1 only. FUSE_INSPECT=brk (dev)
    // pauses at the first line so early setup() code can be stepped.
    const args: string[] = []
    {
      const brk = IS_DEV && (process.env.FUSE_INSPECT ?? '').toLowerCase().startsWith('brk')
      runtimeInspectPort = Number(process.env.FUSE_INSPECT_PORT) || 9229
      args.push(`--${brk ? 'inspect-brk' : 'inspect'}=${runtimeInspectPort}`)
      console.log(`[fuse:spawn] runtime inspector on ws://127.0.0.1:${runtimeInspectPort}${brk ? ' (paused at start)' : ''}`)
    }
    args.push(PATHS.runtimeEntry)
    // Plugin processes need Node 25+ to deny network per plugin; fetched by build:runtime.
    const pluginNode = IS_DEV
      ? path.join(__dirname, '..', 'build', 'node', process.platform === 'win32' ? 'node.exe' : 'node')
      : path.join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(fs.existsSync(pluginNode) ? { FUSE_PLUGIN_NODE: pluginNode } : {}),
      ELECTRON_RUN_AS_NODE: '1',
      FUSE_DATA_DIR: USER_DATA_DIR,
      FUSE_USER_PLUGINS_DIR: PATHS.pluginsUser,
      FUSE_AUTO_LOCK: opts?.autoLock ? '1' : '0',
      FUSE_APP_LANGUAGE: typeof opts?.language === 'string' ? opts.language : '',
      FUSE_CDP_PORT: String(_validPort(Number(opts?.cdpPort)) ? opts!.cdpPort : DEFAULT_CDP_PORT),
      FUSE_GAME_DIRS: JSON.stringify(Object.fromEntries(
        Object.entries(opts?.gameDirs ?? {}).filter(([, dir]) => typeof dir === 'string'),
      )),
    }

    return new Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; obsUrl?: string | null; error?: string }>((resolve) => {
      const proc = spawn(executable, args, {
        // fd 3: IPC channel for permission requests and decisions.
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
        env: spawnEnv,
      })

      proc.on('message', (msg: Record<string, unknown>) => {
        if (msg?.type === 'permissions:ready') {
          permissionStore?.reload()
          if (proc.connected) proc.send({ type: 'permissions:init', decisions: permissionStore?.all() ?? {} })
        } else if (msg?.type === 'permissions:request') {
          requestConsent(msg as unknown as ConsentRequest)
        } else if (msg?.type === 'secrets' || msg?.type === 'links:open') {
          void answerRuntime(proc, msg)
        } else if (msg?.type === 'stage:perf') {
          if (msg.enabled === true) startStageProcessReports(proc)
          else stopStageProcessReports()
        } else if (msg?.type === 'stage:frames') {
          setFrameSources(msg.sources)
        }
      })

      let settled = false
      let stdoutBuf = ''
      let stderrBuf = ''

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; proc.kill(); resolve({ success: false, error: 'spawn timeout' }) }
      }, 10_000)

      const sendLog = (line: string) => {
        if (!line) return
        // eslint-disable-next-line no-control-regex
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '')
        if (!clean) return
        let level: 'info' | 'warn' | 'error' | 'debug' = 'info'
        const m = clean.match(/\|\s*(DEBUG|INFO|SUCCESS|WARNING|ERROR|CRITICAL)\s*\|/)
        if (m) {
          if (m[1] === 'ERROR' || m[1] === 'CRITICAL') level = 'error'
          else if (m[1] === 'WARNING') level = 'warn'
          else if (m[1] === 'DEBUG') level = 'debug'
        }
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('fuse:log', { level, text: clean, timestamp: Date.now() })
        }
      }

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString()
        let nl: number
        while ((nl = stderrBuf.indexOf('\n')) !== -1) {
          const line = stderrBuf.slice(0, nl).trim()
          stderrBuf = stderrBuf.slice(nl + 1)
          if (line) sendLog(line)
        }
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        let nl: number
        while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
          const line = stdoutBuf.slice(0, nl).trim()
          stdoutBuf = stdoutBuf.slice(nl + 1)
          if (!line) continue
          if (!settled) {
            try {
              const { port, connectionToken, stageToken, obsToken: viewToken } = JSON.parse(line)
              if (port && connectionToken && stageToken && viewToken) {
                settled = true
                clearTimeout(timeout)
                fuseProcess = proc
                fusePort = port
                obsToken = viewToken
                proc.on('exit', (code, signal) => {
                  fuseProcess = null
                  fusePort = null
                  obsToken = null
                  stopStageProcessReports()
                  stopOverlayStage()
                  setFrameSources([])
                  resetConsent()
                  // Leave the OBS listener bound (its URL must stay valid) and
                  // just clear the params - the captured page polls until FUSE
                  // is back, then reconnects on its own.
                  setObsParams(null)
                  currentObsUrl = null
                  if (!isQuitting) {
                    win?.webContents.send('fuse:exited', { code: code ?? null, signal: signal ?? null })
                  }
                })
                // Open the transparent overlay stage windows now that the
                // sidecar is up (they connect over WS with role:overlay).
                startOverlayStage(port, stageToken)
                stageOpened()
                // Expose the overlay bundle to OBS as a Browser Source. In dev
                // the bundle is served by Vite, so hand over that URL and point
                // it at our params endpoint; in prod the (already bound) OBS
                // server serves the page and injects that itself.
                setObsParams({ wsPort: port, token: viewToken })
                currentObsUrl = buildObsUrl(null)
                win?.webContents.send('fuse:obs-url', currentObsUrl)
                // Also returned inline: the event above races the renderer's
                // listener registration and would be missed on a first launch.
                resolve({ success: true, pid: proc.pid, port, connectionToken, obsUrl: currentObsUrl })
              }
            } catch { /* not startup line yet */ }
          } else {
            sendLog(line)
          }
        }
      })

      proc.on('error', (err) => {
        if (!settled) { settled = true; clearTimeout(timeout); resolve({ success: false, error: err.message }) }
      })

      proc.on('exit', (code) => {
        if (!settled) { settled = true; clearTimeout(timeout); resolve({ success: false, error: `exited early with code ${code}: ${stderrBuf.trim()}` }) }
      })
    })
  })

  handleIpc('fuse:kill', async () => {
    stopStageProcessReports()
    stopOverlayStage()
    resetConsent()
    setObsParams(null)
    obsToken = null
    currentObsUrl = null
    if (!fuseProcess) return { success: true }
    return new Promise<{ success: boolean }>((resolve) => {
      const proc = fuseProcess!
      const t = setTimeout(() => proc.kill('SIGKILL'), 3_000)
      proc.once('exit', () => { clearTimeout(t); resolve({ success: true }) })
      proc.kill('SIGTERM')
    })
  })

  // Broadcast target picker: which monitor's region the OBS source should show.
  handleIpc('obs:displays', () => listObsDisplays())
  handleIpc('obs:url', (_event, display?: string | null) => buildObsUrl(display))

  handleIpc('fuse:status', () => ({
    running: !!fuseProcess,
    pid: fuseProcess?.pid ?? null,
    port: fusePort,
    obsUrl: currentObsUrl,
  }))

  handleIpc('plugins:scan', () => {
    return scanPluginsDir(PATHS.pluginsUser)
  })

  // Restrict file operations to plugins directory only
  function assertInPluginsDir(filePath: string): void {
    const resolved = path.resolve(filePath)
    const pluginsDir = path.resolve(PATHS.pluginsUser)
    if (!resolved.startsWith(pluginsDir + path.sep)) {
      throw new Error('Path is outside plugins directory')
    }
  }

  handleIpc('plugins:show-file', (_event, filePath: string) => {
    try {
      assertInPluginsDir(filePath)
      shell.showItemInFolder(path.resolve(filePath))
    } catch { /* ignore - don't reveal why the path was rejected */ }
  })

  handleIpc('plugins:delete', (_event, filePath: string) => {
    try {
      assertInPluginsDir(filePath)
      fs.unlinkSync(path.resolve(filePath))
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Registry: packages and images stream from disk, so no file passes over IPC ──

  const CDN_HOST = new URL((import.meta.env.VITE_CDN_URL as string | undefined) || 'https://cdn.wotheatfuse.com').hostname
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

  /** The same checks the processor Worker runs, so the form shows problems before the upload. */
  async function inspectLocalPackage(filePath: string) {
    if (!filePath.toLowerCase().endsWith('.fuse')) throw new Error('not_a_package')
    const handle = await fs.promises.open(filePath, 'r')
    try {
      const { size } = await handle.stat()
      const check = await inspectPackage({
        size,
        read: async (offset, length) => {
          const b = Buffer.alloc(length)
          const { bytesRead } = await handle.read(b, 0, length, offset)
          return new Uint8Array(b.buffer, b.byteOffset, bytesRead)
        },
      })
      return {
        filePath, fileName: path.basename(filePath), size, sha256: await hashFile(filePath),
        manifest: check.manifest ?? null, problem: check.problem ?? null,
      }
    } finally {
      await handle.close()
    }
  }

  async function inspectLocalImage(filePath: string, kind: 'icon' | 'avatar') {
    if (!IMAGE_EXT.test(filePath)) return { filePath, size: 0, problem: 'image_type' }
    const { size } = await fs.promises.stat(filePath)
    if (size > MAX_IMAGE_BYTES) return { filePath, size, problem: 'image_size' }
    const bytes = new Uint8Array(await fs.promises.readFile(filePath))
    const res = checkImage(kind, sniffImage(bytes)?.type ?? '', bytes)
    if (!res.info) return { filePath, size, problem: res.problem ?? 'image_unreadable' }
    return {
      filePath, size, type: res.info.type, width: res.info.width, height: res.info.height, problem: null,
      preview: `data:${res.info.type};base64,${Buffer.from(bytes).toString('base64')}`,
    }
  }

  /** One PUT with an exact Content-Length, streamed from a byte range of the file. */
  function putRange(url: string, filePath: string, start: number, length: number, headers: Record<string, string>,
                    onBytes: (n: number) => void): Promise<string> {
    const target = new URL(url)
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return Promise.reject(new Error('upload_host_refused'))
    }
    return new Promise((resolve, reject) => {
      const req = https.request(target, { method: 'PUT', headers: { ...headers, 'Content-Length': String(length) } }, res => {
        let body = ''
        res.on('data', c => { body += c })
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 300) reject(new Error(`upload_failed: HTTP ${res.statusCode} ${body.slice(0, 300)}`))
          else resolve(String(res.headers.etag ?? '').replace(/"/g, ''))
        })
      })
      req.on('error', reject)
      const stream = fs.createReadStream(filePath, { start, end: start + length - 1 })
      stream.on('data', c => onBytes(c.length))
      stream.on('error', e => { req.destroy(e); reject(e) })
      stream.pipe(req)
    })
  }

  handleIpc('registry:pick-file', async (_event, kind: 'package' | 'image') => {
    const filters = kind === 'package'
      ? [{ name: 'FUSE plugin', extensions: ['fuse'] }]
      : [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    const result = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handleIpc('registry:inspect-package', async (_event, filePath: string) => {
    try { return { success: true, ...(await inspectLocalPackage(String(filePath))) } }
    catch (e: unknown) { return { success: false, error: (e as Error).message } }
  })

  handleIpc('registry:inspect-image', async (_event, filePath: string, kind: 'icon' | 'avatar') => {
    try { return { success: true, ...(await inspectLocalImage(String(filePath), kind === 'avatar' ? 'avatar' : 'icon')) } }
    catch (e: unknown) { return { success: false, error: (e as Error).message } }
  })

  // The plan comes from registry-upload-create: one signed PUT, or one signed URL per part.
  handleIpc('registry:upload', async (event, req: {
    token: string; filePath: string; kind: 'package' | 'image'
    mode: 'single' | 'multipart'; url?: string; headers?: Record<string, string>
    partSize?: number; parts?: { n: number; url: string; size: number }[]
  }) => {
    try {
      const filePath = String(req.filePath)
      if (req.kind === 'package' ? !filePath.toLowerCase().endsWith('.fuse') : !IMAGE_EXT.test(filePath)) throw new Error('upload_type_refused')
      const { size } = await fs.promises.stat(filePath)
      let sent = 0
      const progress = (n: number) => {
        sent += n
        if (!event.sender.isDestroyed()) event.sender.send('registry:upload-progress', { token: req.token, sent, total: size })
      }
      if (req.mode === 'single') {
        await putRange(String(req.url), filePath, 0, size, req.headers ?? {}, progress)
        return { success: true }
      }
      const partSize = Number(req.partSize)
      const done: { n: number; etag: string }[] = []
      for (const part of req.parts ?? []) {
        const start = (part.n - 1) * partSize
        let etag = ''
        for (let attempt = 1; ; attempt++) {
          const before = sent
          try { etag = await putRange(part.url, filePath, start, part.size, {}, progress); break }
          catch (e) { sent = before; if (attempt >= 3) throw e }
        }
        done.push({ n: part.n, etag })
      }
      return { success: true, parts: done }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  // Streams a CDN file to plugins/.downloads, checks size and SHA-256, and only then moves it into the plugins folder.
  handleIpc('registry:install', async (event, req: {
    token: string; url: string; sha256: string; size: number; fileName: string; replace?: string[]
  }) => {
    const tmpDir = path.join(PATHS.pluginsUser, '.downloads')
    const tmp = path.join(tmpDir, `${String(req.sha256).slice(0, 16)}.part`)
    let out: fs.WriteStream | null = null
    try {
      const target = new URL(String(req.url))
      if (target.protocol !== 'https:' || target.hostname !== CDN_HOST) throw new Error('download_host_refused')
      if (!/^[0-9a-f]{64}$/.test(String(req.sha256))) throw new Error('sha256_invalid')
      const fileName = path.basename(String(req.fileName)).replace(/[^a-zA-Z0-9._-]/g, '_')
      if (!fileName.endsWith('.fuse')) throw new Error('not_a_package')
      fs.mkdirSync(tmpDir, { recursive: true })

      const response = await net.fetch(target.href)
      if (!response.ok || !response.body) throw new Error(`download_failed: HTTP ${response.status}`)
      const hash = crypto.createHash('sha256')
      const file = fs.createWriteStream(tmp)
      out = file
      const reader = response.body.getReader()
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        if (received > req.size) throw new Error('size_mismatch')
        hash.update(value)
        if (!file.write(value)) await new Promise<void>(r => file.once('drain', () => r()))
        if (!event.sender.isDestroyed()) event.sender.send('registry:install-progress', { token: req.token, received, total: req.size })
      }
      await new Promise<void>((resolve, reject) => file.end((err?: Error | null) => err ? reject(err) : resolve()))
      out = null
      if (received !== req.size) throw new Error('size_mismatch')
      if (hash.digest('hex') !== req.sha256) throw new Error('checksum_mismatch')

      const dest = path.join(PATHS.pluginsUser, fileName)
      fs.renameSync(tmp, dest)
      for (const old of req.replace ?? []) {
        if (path.resolve(old) === path.resolve(dest)) continue
        try { assertInPluginsDir(old); fs.unlinkSync(path.resolve(old)) } catch { /* already gone */ }
      }
      return { success: true, filePath: dest }
    } catch (e: unknown) {
      if (out) await new Promise<void>(r => out!.destroy().once('close', () => r()))
      try { fs.unlinkSync(tmp) } catch { /* no partial file */ }
      return { success: false, error: (e as Error).message }
    }
  })

  handleIpc('dialog:select-dir', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handleIpc('config:host:read', () => readHostConfig())

  // Watch fuse_host.json and push changes to renderer
  {
    if (!fs.existsSync(PATHS.configs)) fs.mkdirSync(PATHS.configs, { recursive: true })
    let debounce: ReturnType<typeof setTimeout> | null = null
    fs.watch(PATHS.configs, (_event: unknown, filename: unknown) => {
      if (filename !== 'fuse_host.json') return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        win?.webContents.send('config:host:changed', readHostConfig())
      }, 150)
    })
  }

  handleIpc('config:plugin:set-enabled', (_event, pluginId: string, enabled: boolean) => {
    try {
      const cfg = readHostConfig()
      const disabled = cfg.disabled_plugins ?? []
      cfg.disabled_plugins = enabled
        ? disabled.filter(id => id !== pluginId)
        : disabled.includes(pluginId) ? disabled : [...disabled, pluginId]
      writeHostConfig(cfg)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })


  handleIpc('safe-storage:is-available', () => safeStorage.isEncryptionAvailable())

  handleIpc('safe-storage:encrypt', (_event, value: string) =>
    safeStorage.encryptString(value).toJSON())

  handleIpc('safe-storage:decrypt', (_event, buf: { type: 'Buffer'; data: number[] }) =>
    safeStorage.decryptString(Buffer.from(buf.data)))


  handleIpc('app:set-autostart', (_event, value: boolean) => {
    app.setLoginItemSettings({ openAtLogin: value })
  })

  handleIpc('app:set-minimize-to-tray-on-start', (_event, enabled: boolean) => {
    minimizeToTrayOnStart = enabled
    if (enabled) createTray()
    else if (!minimizeToTrayOnClose) destroyTray()
  })

  handleIpc('app:apply-minimize-to-tray-on-start', () => {
    if (minimizeToTrayOnStart && win && app.getLoginItemSettings().wasOpenedAtLogin) {
      startHidden = true
      win.hide()
    }
  })

  handleIpc('app:set-minimize-to-tray-on-close', (_event, enabled: boolean) => {
    minimizeToTrayOnClose = enabled
    if (enabled) createTray()
    else if (!minimizeToTrayOnStart) destroyTray()
  })

  handleIpc('discord:set-enabled', (_event, enabled: boolean) => {
    discordEnabled = !!enabled
    if (discordEnabled) {
      connectDiscord()
    } else {
      disconnectDiscord()
      pendingActivity = null
    }
    return { success: true }
  })

  handleIpc('discord:set-activity', (_event, activity: DiscordActivity | null) => {
    applyDiscordActivity(activity)
    return { success: true, connected: discordReady }
  })

  handleIpc('discord:clear-activity', () => {
    applyDiscordActivity(null)
    return { success: true }
  })

  handleIpc('discord:status', () => ({
    enabled: discordEnabled,
    connected: discordReady,
  }))

  handleIpc('app:open-backend-dir', () => shell.openPath(PATHS.fileBrowser))

  handleIpc('fs:get-root', () => PATHS.fileBrowser)

  handleIpc('fs:list-dir', async (_event, dirPath: string) => {
    assertWithinRoot(dirPath, PATHS.fileBrowser)
    const names = await fs.promises.readdir(dirPath)
    const entries = await Promise.all(names.map(async (name) => {
      const full = path.join(dirPath, name)
      try {
        const stat = await fs.promises.stat(full)
        return { name, isDir: stat.isDirectory(), size: stat.size, created: stat.birthtimeMs, modified: stat.mtimeMs }
      } catch { return null }
    }))
    return entries.filter(Boolean)
  })

  handleIpc('fs:read-file', async (_event, filePath: string) => {
    assertWithinRoot(filePath, PATHS.fileBrowser)
    const stat = await fs.promises.stat(filePath)
    if (stat.size > 1024 * 1024) throw new Error('File too large to preview (>1 MB)')
    return fs.promises.readFile(filePath, 'utf-8')
  })

  handleIpc('fs:write-file', async (_event, filePath: string, content: string) => {
    assertWithinRoot(filePath, PATHS.fileBrowser)
    await fs.promises.writeFile(filePath, content, 'utf-8')
  })


  handleIpc('config:plugin:read', (_event, pluginId: string): Record<string, unknown> => {
    try {
      const p = path.join(PATHS.configs, `fuse_${pluginId}.json`)
      if (!fs.existsSync(p)) return {}
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
    } catch { return {} }
  })

  handleIpc('config:plugin:write-key', (_event, pluginId: string, key: string, value: unknown) => {
    try {
      if (!fs.existsSync(PATHS.configs)) fs.mkdirSync(PATHS.configs, { recursive: true })
      const p = path.join(PATHS.configs, `fuse_${pluginId}.json`)
      const current: Record<string, unknown> = fs.existsSync(p)
        ? JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
        : {}
      current[key] = value
      fs.writeFileSync(p, JSON.stringify(current, null, 2), 'utf-8')
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  handleIpc('hotkey:write-override', (_event, pluginId: string, action: string, combo: string) => {
    try {
      const cfg = readHostConfig()
      cfg.hotkey_overrides ??= {}
      cfg.hotkey_overrides[pluginId] ??= {}
      cfg.hotkey_overrides[pluginId][action] = combo
      writeHostConfig(cfg)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Auto-updater ─────────────────────────────────────────────────────────

  if (!VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      win?.webContents.send('update:checking')
    })
    autoUpdater.on('update-available', (info) => {
      const notes = normalizeReleaseNotes(info.releaseNotes)
      // Cache now: after restart the release may still be a draft, invisible to
      // the anonymous GitHub API.
      writeReleaseNotesCache({ version: info.version, notes, releaseDate: info.releaseDate })
      win?.webContents.send('update:available', {
        version: info.version,
        releaseNotes: notes,
        releaseDate: info.releaseDate,
      })
    })
    autoUpdater.on('update-not-available', (info) => {
      win?.webContents.send('update:not-available', { version: info.version })
    })
    autoUpdater.on('download-progress', (progress) => {
      win?.webContents.send('update:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      writeReleaseNotesCache({
        version: info.version,
        notes: normalizeReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate,
      })
      win?.webContents.send('update:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })
    autoUpdater.on('error', (err) => {
      win?.webContents.send('update:error', { message: err.message || 'Unknown error' })
    })
  }

  handleIpc('update:check', async () => {
    if (VITE_DEV_SERVER_URL) {
      setTimeout(() => {
        win?.webContents.send('update:available', {
          version: '99.0.0',
          releaseNotes: '• Dev mode mock update',
          releaseDate: new Date().toISOString(),
        })
      }, 800)
      return { success: true }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message || 'check_failed' }
    }
  })

  handleIpc('update:download', async () => {
    if (VITE_DEV_SERVER_URL) {
      let progress = 0
      const interval = setInterval(() => {
        progress += 10
        win?.webContents.send('update:progress', {
          percent: progress,
          bytesPerSecond: 1024 * 1024 * 2.5,
          transferred: progress * 1024 * 100,
          total: 1024 * 1024 * 10,
        })
        if (progress >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            win?.webContents.send('update:downloaded', {
              version: '99.0.0',
              releaseDate: new Date().toISOString(),
            })
          }, 300)
        }
      }, 200)
      return { success: true }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  })

  handleIpc('update:release-notes', async (_event, version: string, opts?: { refresh?: boolean }) => {
    if (typeof version !== 'string' || !VERSION_RE.test(version)) {
      return { success: false, error: 'invalid_version' }
    }
    if (VITE_DEV_SERVER_URL) {
      return {
        success: true,
        entry: {
          version,
          notes: [
            `## FUSE ${version}`,
            '',
            '**NEW**',
            '',
            '- Dev mode mock release notes - the real body comes from the GitHub release',
            '- Second mock entry',
            '',
            '**IMPROVEMENTS**',
            '',
            '- Mock improvement entry',
            '',
            '**FIXED**',
            '',
            '- Nothing, this is a mock',
          ].join('\n'),
          releaseDate: new Date().toISOString(),
          url: `https://github.com/${GH_OWNER}/${GH_REPO}/releases`,
        } satisfies ReleaseNotesEntry,
      }
    }

    const cached = readReleaseNotesCache()
    const cacheHit = cached?.version === version && !!cached.notes
    if (cacheHit && !opts?.refresh) return { success: true, entry: cached }

    const fetched = await fetchReleaseNotesFromGitHub(version)
    if (fetched) {
      writeReleaseNotesCache(fetched)
      return { success: true, entry: fetched }
    }
    if (cacheHit) return { success: true, entry: cached }
    return { success: true, entry: null }
  })

  handleIpc('update:install', () => {
    if (VITE_DEV_SERVER_URL) return { success: true }
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { success: true }
  })

  // Game process / focus watchers

  handleIpc('game:watch:set', (_event, enabled: boolean) => {
    if (gameWatcher) { clearInterval(gameWatcher); gameWatcher = null }
    if (!enabled) { gameDetected = false; return }

    const poll = async () => {
      const prev = gameDetected
      const { running } = await _checkGameProcess()
      gameDetected = running
      if (!prev && running) win?.webContents.send('game:process:detected')
      else if (prev && !running) win?.webContents.send('game:process:lost')
    }
    void poll()
    gameWatcher = setInterval(() => void poll(), 2_000)
  })

  handleIpc('game:focus:set', (_event, enabled: boolean) => {
    if (focusWatcher) { clearInterval(focusWatcher); focusWatcher = null }
    if (!enabled) { gameFocused = false; return }

    // Emit the initial state even if it matches the default `false`: consumers
    // (e.g. cruise_control) start assuming focused, so without this first send
    // they never learn the game ISN'T focused until it's focused once — and keep
    // injecting keys into whatever app is foreground. `initialized` forces the
    // first poll to broadcast unconditionally.
    let initialized = false
    const poll = async () => {
      const inFocus = _isGameFocused(await _checkForegroundProcess())
      if (!initialized || inFocus !== gameFocused) {
        initialized = true
        gameFocused = inFocus
        win?.webContents.send('game:focus:changed', inFocus)
      }
    }
    void poll()
    focusWatcher = setInterval(() => void poll(), 1_000)
  })

  //

  handleIpc('game:scan-dir', (_event, dirPath: string) => {
    try {
      let version: string | undefined 
      const gameInfoPath = path.join(dirPath, 'game_info.xml')
      if (fs.existsSync(gameInfoPath)) {
        const xml = fs.readFileSync(gameInfoPath, 'utf-8')
        const m = xml.match(/<version_name>(.*?)<\/version_name>/)
        if (m) version = m[1].trim()
      }
      const hasProject = fs.existsSync(path.join(dirPath, 'coldwar.project'))
      return { version, hasProject }
    } catch (e: unknown) {
      return { error: (e as Error).message }
    }
  })

  handleIpc('game:check-debugger', (_event, dirPath: string) => _readGameConfig(dirPath))

  handleIpc('game:enable-debugger', (_event, dirPath: string, port?: number) =>
    _writeGameConfig(dirPath, { enabled: true, port: port ?? DEFAULT_CDP_PORT }))

  handleIpc('game:disable-debugger', (_event, dirPath: string) =>
    _writeGameConfig(dirPath, { enabled: false }))

  handleIpc('game:set-debugger-port', (_event, dirPath: string, port: number) =>
    _writeGameConfig(dirPath, { port }))

  handleIpc('game:config:watch', (_event, dirPath: string) => {
    _watchGameConfig(dirPath)
    return { success: true }
  })

  handleIpc('fileassoc:is-registered', () => _isFileAssocRegistered())
  handleIpc('fileassoc:register',      () => _setFileAssoc(true))
  handleIpc('fileassoc:unregister',    () => _setFileAssoc(false))

  // Device info
  handleIpc('device:fingerprint', () => getDeviceFingerprint())
  handleIpc('device:name',        () => os.hostname())
  handleIpc('device:os',          () => `${os.platform()} ${os.release()}`)
  handleIpc('device:ip',          () => getLocalIP())
})
