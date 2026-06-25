import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('safeStorageAPI', {
  isAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('safe-storage:is-available'),
  encrypt: (value: string): Promise<{ type: 'Buffer'; data: number[] }> =>
    ipcRenderer.invoke('safe-storage:encrypt', value),
  decrypt: (buf: { type: 'Buffer'; data: number[] }): Promise<string> =>
    ipcRenderer.invoke('safe-storage:decrypt', buf),
})

contextBridge.exposeInMainWorld('appAPI', {
  onSuspended: (cb: () => void) => ipcRenderer.on('app:suspended', cb),
  onResumed: (cb: () => void) => ipcRenderer.on('app:resumed', cb),
  setAutostart: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('app:set-autostart', value),
  setMinimizeToTrayOnStart: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('app:set-minimize-to-tray-on-start', value),
  applyMinimizeToTrayOnStart: (): Promise<void> =>
    ipcRenderer.invoke('app:apply-minimize-to-tray-on-start'),
  setMinimizeToTrayOnClose: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('app:set-minimize-to-tray-on-close', value),
  openBackendDir: (): Promise<string> =>
    ipcRenderer.invoke('app:open-backend-dir'),
  closeWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:close'),
  minimizeWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:maximize'),
})

contextBridge.exposeInMainWorld('pluginsAPI', {
  scan: () => ipcRenderer.invoke('plugins:scan'),
  showFile: (filePath: string) => ipcRenderer.invoke('plugins:show-file', filePath),
  deleteFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('plugins:delete', filePath),
})

contextBridge.exposeInMainWorld('dialogAPI', {
  selectDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-dir'),
})

contextBridge.exposeInMainWorld('configAPI', {
  readHost: (): Promise<{ disabled_plugins: string[]; enabled_plugins: string[] | null; extra_plugin_dirs: string[] }> =>
    ipcRenderer.invoke('config:host:read'),
  setPluginEnabled: (pluginId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('config:plugin:set-enabled', pluginId, enabled),
  onHostChanged: (cb: (cfg: { disabled_plugins: string[] }) => void) =>
    ipcRenderer.on('config:host:changed', (_event, cfg) => cb(cfg)),
  offHostChanged: () =>
    ipcRenderer.removeAllListeners('config:host:changed'),
})

contextBridge.exposeInMainWorld('gameAPI', {
  scanDir: (dirPath: string): Promise<{ version?: string; hasProject: boolean; error?: string }> =>
    ipcRenderer.invoke('game:scan-dir', dirPath),
  checkDebugger: (dirPath: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> =>
    ipcRenderer.invoke('game:check-debugger', dirPath),
  enableDebugger: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:enable-debugger', dirPath),
  disableDebugger: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:disable-debugger', dirPath),
})

contextBridge.exposeInMainWorld('fuseAPI', {
  spawn: (): Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; error?: string }> =>
    ipcRenderer.invoke('fuse:spawn'),
  kill: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('fuse:kill'),
  status: (): Promise<{ running: boolean; pid: number | null; port: number | null }> =>
    ipcRenderer.invoke('fuse:status'),
  onExited: (cb: (data: { code: number | null; signal: string | null }) => void) =>
    ipcRenderer.on('fuse:exited', (_event, data) => cb(data)),
  offExited: () =>
    ipcRenderer.removeAllListeners('fuse:exited'),
  onLog: (cb: (entry: { level: string; text: string; timestamp: number }) => void) =>
    ipcRenderer.on('fuse:log', (_event, entry) => cb(entry)),
  offLog: () =>
    ipcRenderer.removeAllListeners('fuse:log'),
})
