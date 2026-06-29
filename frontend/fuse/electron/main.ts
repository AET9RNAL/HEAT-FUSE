import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, powerMonitor, shell, dialog, protocol, net } from 'electron'
import * as Sentry from '@sentry/electron/main'
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN as string })
}
import { autoUpdater } from 'electron-updater'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import crypto from 'node:crypto'
import DiscordRPC from 'discord-rpc'

const execFileAsync = promisify(execFile)
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

declare const __RELEASE__: boolean

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const IS_DEV   = !!VITE_DEV_SERVER_URL
const REPO_ROOT = path.join(process.env.APP_ROOT!, '..', '..') // HEAT_SACLOS/ — only meaningful in dev
const USER_DATA_DIR = IS_DEV ? path.join(REPO_ROOT, 'backend', 'data') : app.getPath('userData')

const PATHS: Record<string, string> = {
  configs:     IS_DEV ? path.join(REPO_ROOT, 'backend', 'data', 'configs')
                      : path.join(USER_DATA_DIR, 'configs'),
  fileBrowser: IS_DEV ? path.join(REPO_ROOT, 'backend')
                      : process.resourcesPath,
  pluginsCore: IS_DEV ? path.join(REPO_ROOT, 'backend', 'fuse', 'plugins')
                      : path.join(USER_DATA_DIR, 'plugins'),
  pluginsUser: IS_DEV ? path.join(REPO_ROOT, 'backend', 'plugins')
                      : path.join(USER_DATA_DIR, 'plugins'),
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
  hotkeys?: unknown[]
  core?: boolean
}

interface HostConfig {
  disabled_plugins: string[]
  enabled_plugins: string[] | null
  hotkey_overrides?: Record<string, Record<string, string>>
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

function scanPluginsDir(dir: string) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.fuse'))
    .flatMap(file => {
      try {
        const buf = fs.readFileSync(path.join(dir, file))
        const checksum = crypto.createHash('sha256').update(buf).digest('hex')
        const entries = unzipSync(new Uint8Array(buf), { filter: f => f.name.endsWith('/manifest.json') })
        const manifestKey = Object.keys(entries).find(k => k.endsWith('/manifest.json'))
        if (!manifestKey) return []
        const m: PluginManifest = JSON.parse(strFromU8(entries[manifestKey]))
        return [{
          plugin_id:    m.plugin_id ?? m.id ?? path.basename(file, '.fuse'),
          name:         m.name        ?? path.basename(file, '.fuse'),
          version:      m.version     ?? '0.0.0',
          description:  m.description ?? '',
          author:       m.author,
          status:       'pending' as const,
          configSchema: m.config_schema ?? [],
          hotkeys:      m.hotkeys      ?? [],
          core:         m.core         ?? false,
          filePath:     path.join(dir, file),
          checksum,
        }]
      } catch { return [] }
    })
}

//

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let minimizeToTrayOnStart = false
let minimizeToTrayOnClose = false


let fuseProcess: ChildProcess | null = null
let fusePort: number | null = null

// Game process watcher 

let gameWatcher: ReturnType<typeof setInterval> | null = null
let focusWatcher: ReturnType<typeof setInterval> | null = null
let gameDetected = false
let gameFocused = false

// Persistent PowerShell session for Win32 foreground-window queries.
let psRunner: ChildProcess | null = null
let psBuffer = ''
const psPending: Array<(result: string) => void> = []
// Sentinels: PowerShell echoes typed stdin back to stdout, so we can't write
// the literal markers — we'd find them in the echo instead of the real output.
// Instead, decode them at runtime via base64; the literal strings then only
// appear in the actual command output stream, not in the echoed input.
const PS_START = '__FUSE_START__'
const PS_END = '__FUSE_END__'
const PS_START_B64 = Buffer.from(PS_START).toString('base64')
const PS_END_B64 = Buffer.from(PS_END).toString('base64')
// Compact inline Add-Type — guard prevents recompilation after first call.
const PS_FW_DEF = `if(-not('FW'-as[type])){Add-Type 'using System;using System.Runtime.InteropServices;public class FW{[DllImport("user32")]public static extern IntPtr GetForegroundWindow();[DllImport("user32")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'}`

function _ensurePsRunner() {
  if (psRunner && !psRunner.killed) return
  psBuffer = ''
  // No -Command flag — stdin processed line-by-line. -NoLogo suppresses banner on stdout.
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


// File association helpers (.fuse → FusePlugin, HKCU — no elevation required)

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


function createWindow() {
  win = new BrowserWindow({
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
    },
  })

  // Disable Ctrl+R in production
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'r') {
      event.preventDefault()
    }
  })

  // Hide to tray on close when enabled
  win.on('close', (e) => {
    if (minimizeToTrayOnClose && win && !isQuitting) {
      e.preventDefault()
      win.hide()
    }
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
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
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

function handleDeepLink(url: string) {
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
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.whenReady().then(() => {
  createWindow()

  // Cold-start deep link (app launched by OS protocol handler)
  const deepLinkArg = process.argv.find(a => a.startsWith('fuse://'))
  if (deepLinkArg) {
    win?.webContents.once('did-finish-load', () => handleDeepLink(deepLinkArg))
  }

  // System suspend/resume
  powerMonitor.on('suspend', () => { win?.webContents.send('app:suspended') })
  powerMonitor.on('resume', () => { win?.webContents.send('app:resumed') })


  ipcMain.handle('window:close', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    target?.close()
  })

  ipcMain.handle('window:minimize', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    target?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const target = BrowserWindow.getFocusedWindow() || win
    if (!target) return
    target.isMaximized() ? target.unmaximize() : target.maximize()
  })


  ipcMain.handle('fuse:spawn', async () => {
    if (fuseProcess) return { success: false, error: 'already running' }

    let executable: string
    let args: string[]
    let spawnEnv: NodeJS.ProcessEnv

    if (IS_DEV) {
      const venvPython      = path.join(PATHS.fileBrowser, '.venv', 'Scripts', 'python.exe')
      const requirementsTxt = path.join(PATHS.fileBrowser, 'fuse', 'requirements.txt')

      try {
        if (!fs.existsSync(venvPython)) {
          await execFileAsync('python', ['-m', 'venv', path.join(PATHS.fileBrowser, '.venv')])
        }
        await execFileAsync(venvPython, ['-m', 'pip', 'install', '-r', requirementsTxt, '--quiet'])
      } catch (e: unknown) {
        return { success: false, error: `venv setup failed: ${(e as Error).message}` }
      }

      executable = venvPython
      args       = [path.join(PATHS.fileBrowser, 'fuse', 'run_fuse.py')]
      spawnEnv   = { ...process.env, PYTHONPATH: PATHS.fileBrowser }
    } else {
      executable = PATHS.backendExe
      args       = []
      spawnEnv   = {
        ...process.env,
        FUSE_DATA_DIR: USER_DATA_DIR,
        FUSE_USER_PLUGINS_DIR: PATHS.pluginsUser,
      }
    }

    return new Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; error?: string }>((resolve) => {
      const proc = spawn(executable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: spawnEnv,
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
        win?.webContents.send('fuse:log', { level, text: clean, timestamp: Date.now() })
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
              const { port, connectionToken } = JSON.parse(line)
              if (port && connectionToken) {
                settled = true
                clearTimeout(timeout)
                fuseProcess = proc
                fusePort = port
                proc.on('exit', (code, signal) => {
                  fuseProcess = null
                  fusePort = null
                  if (!isQuitting) {
                    win?.webContents.send('fuse:exited', { code: code ?? null, signal: signal ?? null })
                  }
                })
                resolve({ success: true, pid: proc.pid, port, connectionToken })
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

  ipcMain.handle('fuse:kill', async () => {
    if (!fuseProcess) return { success: true }
    return new Promise<{ success: boolean }>((resolve) => {
      const proc = fuseProcess!
      const t = setTimeout(() => proc.kill('SIGKILL'), 3_000)
      proc.once('exit', () => { clearTimeout(t); resolve({ success: true }) })
      proc.kill('SIGTERM')
    })
  })

  ipcMain.handle('fuse:status', () => ({
    running: !!fuseProcess,
    pid: fuseProcess?.pid ?? null,
    port: fusePort,
  }))

  ipcMain.handle('plugins:scan', () => {
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

  // Only allow HTTPS requests to Cloudflare R2 hostnames
  function assertR2Url(url: string): void {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('Invalid URL') }
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs are allowed')
    const { hostname } = parsed
    if (!hostname.endsWith('.r2.cloudflarestorage.com') && !hostname.endsWith('.r2.dev')) {
      throw new Error('URL must point to Cloudflare R2 storage')
    }
  }

  ipcMain.handle('plugins:show-file', (_event, filePath: string) => {
    try {
      assertInPluginsDir(filePath)
      shell.showItemInFolder(path.resolve(filePath))
    } catch { /* ignore — don't reveal why the path was rejected */ }
  })

  ipcMain.handle('plugins:delete', (_event, filePath: string) => {
    try {
      assertInPluginsDir(filePath)
      fs.unlinkSync(path.resolve(filePath))
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('plugins:download-plugin', async (_event, url: string, filename: string) => {
    try {
      assertR2Url(url)
      const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, '_')
      if (!safeFilename.endsWith('.fuse')) throw new Error('Only .fuse files can be installed')
      const dest = path.join(PATHS.pluginsUser, safeFilename)
      if (!fs.existsSync(PATHS.pluginsUser)) fs.mkdirSync(PATHS.pluginsUser, { recursive: true })
      const response = await net.fetch(url)
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const fileBuf = Buffer.from(buffer)
      fs.writeFileSync(dest, fileBuf)
      const checksum = crypto.createHash('sha256').update(fileBuf).digest('hex')
      return { success: true, filePath: dest, checksum }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('plugins:upload-to-r2', async (_event, presignedUrl: string, fileBuffer: ArrayBuffer, contentType: string) => {
    try {
      assertR2Url(presignedUrl)
      const response = await net.fetch(presignedUrl, {
        method: 'PUT',
        body: Buffer.from(fileBuffer),
        headers: { 'Content-Type': contentType },
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Upload failed: HTTP ${response.status} ${body}`)
      }
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('dialog:select-dir', async () => {
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('config:host:read', () => readHostConfig())

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

  ipcMain.handle('config:plugin:set-enabled', (_event, pluginId: string, enabled: boolean) => {
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


  ipcMain.handle('safe-storage:is-available', () => safeStorage.isEncryptionAvailable())

  ipcMain.handle('safe-storage:encrypt', (_event, value: string) =>
    safeStorage.encryptString(value).toJSON())

  ipcMain.handle('safe-storage:decrypt', (_event, buf: { type: 'Buffer'; data: number[] }) =>
    safeStorage.decryptString(Buffer.from(buf.data)))


  ipcMain.handle('app:set-autostart', (_event, value: boolean) => {
    app.setLoginItemSettings({ openAtLogin: value })
  })

  ipcMain.handle('app:set-minimize-to-tray-on-start', (_event, enabled: boolean) => {
    minimizeToTrayOnStart = enabled
    if (enabled) createTray()
    else if (!minimizeToTrayOnClose) destroyTray()
  })

  ipcMain.handle('app:apply-minimize-to-tray-on-start', () => {
    if (minimizeToTrayOnStart && win && app.getLoginItemSettings().wasOpenedAtLogin) {
      win.hide()
    }
  })

  ipcMain.handle('app:set-minimize-to-tray-on-close', (_event, enabled: boolean) => {
    minimizeToTrayOnClose = enabled
    if (enabled) createTray()
    else if (!minimizeToTrayOnStart) destroyTray()
  })

  ipcMain.handle('discord:set-enabled', (_event, enabled: boolean) => {
    discordEnabled = !!enabled
    if (discordEnabled) {
      connectDiscord()
    } else {
      disconnectDiscord()
      pendingActivity = null
    }
    return { success: true }
  })

  ipcMain.handle('discord:set-activity', (_event, activity: DiscordActivity | null) => {
    applyDiscordActivity(activity)
    return { success: true, connected: discordReady }
  })

  ipcMain.handle('discord:clear-activity', () => {
    applyDiscordActivity(null)
    return { success: true }
  })

  ipcMain.handle('discord:status', () => ({
    enabled: discordEnabled,
    connected: discordReady,
  }))

  ipcMain.handle('app:open-backend-dir', () => shell.openPath(PATHS.fileBrowser))

  ipcMain.handle('fs:get-root', () => PATHS.fileBrowser)

  ipcMain.handle('fs:list-dir', async (_event, dirPath: string) => {
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

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    assertWithinRoot(filePath, PATHS.fileBrowser)
    const stat = await fs.promises.stat(filePath)
    if (stat.size > 1024 * 1024) throw new Error('File too large to preview (>1 MB)')
    return fs.promises.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    assertWithinRoot(filePath, PATHS.fileBrowser)
    await fs.promises.writeFile(filePath, content, 'utf-8')
  })


  ipcMain.handle('config:plugin:read', (_event, pluginId: string): Record<string, unknown> => {
    try {
      const p = path.join(PATHS.configs, `fuse_${pluginId}.json`)
      if (!fs.existsSync(p)) return {}
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
    } catch { return {} }
  })

  ipcMain.handle('config:plugin:write-key', (_event, pluginId: string, key: string, value: unknown) => {
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

  ipcMain.handle('hotkey:write-override', (_event, pluginId: string, action: string, combo: string) => {
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
      win?.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes ?? '',
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
      win?.webContents.send('update:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    })
    autoUpdater.on('error', (err) => {
      win?.webContents.send('update:error', { message: err.message || 'Unknown error' })
    })
  }

  ipcMain.handle('update:check', async () => {
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

  ipcMain.handle('update:download', async () => {
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

  ipcMain.handle('update:install', () => {
    if (VITE_DEV_SERVER_URL) return { success: true }
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { success: true }
  })

  // Game process / focus watchers

  ipcMain.handle('game:watch:set', (_event, enabled: boolean) => {
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

  ipcMain.handle('game:focus:set', (_event, enabled: boolean) => {
    if (focusWatcher) { clearInterval(focusWatcher); focusWatcher = null }
    if (!enabled) { gameFocused = false; return }

    const poll = async () => {
      const inFocus = (await _checkForegroundProcess()) === 'engine_launcher'
      if (inFocus !== gameFocused) {
        gameFocused = inFocus
        win?.webContents.send('game:focus:changed', inFocus)
      }
    }
    void poll()
    focusWatcher = setInterval(() => void poll(), 1_000)
  })

  //

  ipcMain.handle('game:scan-dir', (_event, dirPath: string) => {
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

  ipcMain.handle('game:check-debugger', (_event, dirPath: string) => {
    try {
      const projectPath = path.join(dirPath, 'coldwar.project')
      const content = fs.readFileSync(projectPath, 'utf-8')
      const enabled = /"Enable Debugger"\s*:\s*true/.test(content)
      return { success: true, enabled }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('game:enable-debugger', (_event, dirPath: string) => {
    try {
      const projectPath = path.join(dirPath, 'coldwar.project')
      let content = fs.readFileSync(projectPath, 'utf-8')
      content = content.replace(/"Debugger Port"\s*:\s*\d+/g, '"Debugger Port": 9222')
      content = content.replace(/"Enable Debugger"\s*:\s*false/g, '"Enable Debugger": true')
      fs.writeFileSync(projectPath, content, 'utf-8')
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('game:disable-debugger', (_event, dirPath: string) => {
    try {
      const projectPath = path.join(dirPath, 'coldwar.project')
      let content = fs.readFileSync(projectPath, 'utf-8')
      content = content.replace(/"Enable Debugger"\s*:\s*true/g, '"Enable Debugger": false')
      fs.writeFileSync(projectPath, content, 'utf-8')
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('fileassoc:is-registered', () => _isFileAssocRegistered())
  ipcMain.handle('fileassoc:register',      () => _setFileAssoc(true))
  ipcMain.handle('fileassoc:unregister',    () => _setFileAssoc(false))

  // Device info
  ipcMain.handle('device:fingerprint', () => getDeviceFingerprint())
  ipcMain.handle('device:name',        () => os.hostname())
  ipcMain.handle('device:os',          () => `${os.platform()} ${os.release()}`)
  ipcMain.handle('device:ip',          () => getLocalIP())
})
