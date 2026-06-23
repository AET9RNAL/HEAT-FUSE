import { app, BrowserWindow, ipcMain, safeStorage, powerMonitor } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ── safeStorage IPC ──

ipcMain.handle('safe-storage:is-available', () => {
  return safeStorage.isEncryptionAvailable()
})

ipcMain.handle('safe-storage:encrypt', (_event, value: string) => {
  const buf = safeStorage.encryptString(value)
  return buf.toJSON()
})

ipcMain.handle('safe-storage:decrypt', (_event, buf: { type: 'Buffer'; data: number[] }) => {
  return safeStorage.decryptString(Buffer.from(buf.data))
})

// ── App settings IPC ──

ipcMain.handle('app:set-autostart', (_event, value: boolean) => {
  app.setLoginItemSettings({ openAtLogin: value })
})

// ── Power monitor (suspend/resume) ──

app.whenReady().then(() => {
  createWindow()

  powerMonitor.on('suspend', () => {
    win?.webContents.send('app:suspended')
  })

  powerMonitor.on('resume', () => {
    win?.webContents.send('app:resumed')
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
