import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, powerMonitor, shell, dialog } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'

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
}

interface HostConfig {
  disabled_plugins: string[]
  enabled_plugins: string[] | null
  extra_plugin_dirs: string[]
}

function getConfigsDir() {
  const isDev = !!VITE_DEV_SERVER_URL
  return isDev
    ? path.join(process.env.APP_ROOT!, '..', '..', 'backend', 'data', 'configs')
    : path.join(app.getPath('userData'), 'configs')
}

function readHostConfig(): HostConfig {
  const p = path.join(getConfigsDir(), 'fuse_host.json')
  if (!fs.existsSync(p)) return { disabled_plugins: [], enabled_plugins: null, extra_plugin_dirs: [] }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as HostConfig
}

function writeHostConfig(cfg: HostConfig) {
  const dir = getConfigsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'fuse_host.json'), JSON.stringify(cfg, null, 2), 'utf-8')
}

function getPluginDirs() {
  const isDev = !!VITE_DEV_SERVER_URL
  const root = isDev
    ? path.join(process.env.APP_ROOT!, '..', '..')  // repo root: HEAT_SACLOS/
    : process.resourcesPath
  return {
    core: path.join(root, isDev ? 'backend' : '', 'fuse', 'plugins'),
    user: path.join(root, isDev ? 'backend' : '', 'plugins'),
  }
}

function scanPluginsDir(dir: string) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.fuse'))
    .flatMap(file => {
      try {
        const buf = fs.readFileSync(path.join(dir, file))
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
          filePath:     path.join(dir, file),
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


function createTray() {
  if (tray) return
  const iconPath = VITE_DEV_SERVER_URL
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
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
    backgroundColor: 'rgba(0, 0, 0, 0.0)',
    backgroundMaterial: 'acrylic',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !__RELEASE__,
      preload: path.join(__dirname, 'preload.mjs'),
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


app.whenReady().then(() => {
  createWindow()

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

    const isDev = !!VITE_DEV_SERVER_URL
    const backendRoot = isDev
      ? path.join(process.env.APP_ROOT!, '..', '..', 'backend')
      : process.resourcesPath
    const scriptPath = path.join(backendRoot, 'fuse', 'run_heat_overlay.py')
    const venvPython = path.join(backendRoot, '.venv', 'Scripts', 'python.exe')
    const requirementsTxt = path.join(backendRoot, 'fuse', 'requirements.txt')

    try {
      if (!fs.existsSync(venvPython)) {
        await execFileAsync('python', ['-m', 'venv', path.join(backendRoot, '.venv')])
      }
      await execFileAsync(venvPython, ['-m', 'pip', 'install', '-r', requirementsTxt, '--quiet'])
    } catch (e: unknown) {
      return { success: false, error: `venv setup failed: ${(e as Error).message}` }
    }

    const args = [scriptPath]

    return new Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; error?: string }>((resolve) => {
      const proc = spawn(venvPython, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONPATH: backendRoot },
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
    const { core, user } = getPluginDirs()
    return [...scanPluginsDir(core), ...scanPluginsDir(user)]
  })

  ipcMain.handle('plugins:show-file', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('plugins:delete', (_event, filePath: string) => {
    try {
      fs.unlinkSync(filePath)
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
  const hostCfgPath = path.join(getConfigsDir(), 'fuse_host.json')
  if (fs.existsSync(hostCfgPath)) {
    let debounce: ReturnType<typeof setTimeout> | null = null
    fs.watch(hostCfgPath, () => {
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

  ipcMain.handle('app:open-backend-dir', () => {
    const isDev = !!VITE_DEV_SERVER_URL
    const dir = isDev
      ? path.join(process.env.APP_ROOT!, '..', '..', 'backend')
      : process.resourcesPath
    return shell.openPath(dir)
  })

  ipcMain.handle('app:get-backend-version', () => {
    try {
      const isDev = !!VITE_DEV_SERVER_URL
      const hostPath = isDev
        ? path.join(process.env.APP_ROOT!, '..', '..', 'backend', 'fuse', 'core', 'host.py')
        : path.join(process.resourcesPath, 'fuse', 'core', 'host.py')
      const src = fs.readFileSync(hostPath, 'utf-8')
      const m = src.match(/HOST_VERSION\s*=\s*["']([^"']+)["']/)
      return m ? m[1] : ''
    } catch { return '' }
  })

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
})
