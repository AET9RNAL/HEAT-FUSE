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

contextBridge.exposeInMainWorld('pluginConfigAPI', {
  readPlugin: (pluginId: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('config:plugin:read', pluginId),
  writeKey: (pluginId: string, key: string, value: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('config:plugin:write-key', pluginId, key, value),
  writeHotkeyOverride: (pluginId: string, action: string, combo: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('hotkey:write-override', pluginId, action, combo),
})

contextBridge.exposeInMainWorld('updateAPI', {
  check: (): Promise<{ success: boolean; updateInfo?: unknown; error?: string }> =>
    ipcRenderer.invoke('update:check'),
  download: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('update:download'),
  install: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('update:install'),
  onChecking: (cb: () => void) =>
    ipcRenderer.on('update:checking', () => cb()),
  onAvailable: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) =>
    ipcRenderer.on('update:available', (_e, data) => cb(data)),
  onNotAvailable: (cb: (info: { version: string }) => void) =>
    ipcRenderer.on('update:not-available', (_e, data) => cb(data)),
  onProgress: (cb: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) =>
    ipcRenderer.on('update:progress', (_e, data) => cb(data)),
  onDownloaded: (cb: (info: { version: string; releaseDate: string }) => void) =>
    ipcRenderer.on('update:downloaded', (_e, data) => cb(data)),
  onError: (cb: (err: { message: string }) => void) =>
    ipcRenderer.on('update:error', (_e, data) => cb(data)),
  offAll: () =>
    ['update:checking', 'update:available', 'update:not-available',
     'update:progress', 'update:downloaded', 'update:error']
      .forEach(ch => ipcRenderer.removeAllListeners(ch)),
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

contextBridge.exposeInMainWorld('discordAPI', {
  setEnabled: (enabled: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('discord:set-enabled', enabled),
  setActivity: (activity: {
    details?: string
    state?: string
    startTimestamp?: number
    endTimestamp?: number
    largeImageKey?: string
    largeImageText?: string
    smallImageKey?: string
    smallImageText?: string
    buttons?: { label: string; url: string }[]
  } | null): Promise<{ success: boolean; connected: boolean }> =>
    ipcRenderer.invoke('discord:set-activity', activity),
  clearActivity: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('discord:clear-activity'),
  status: (): Promise<{ enabled: boolean; connected: boolean }> =>
    ipcRenderer.invoke('discord:status'),
})

contextBridge.exposeInMainWorld('fsAPI', {
  getRoot: (): Promise<string> =>
    ipcRenderer.invoke('fs:get-root'),
  listDir: (dirPath: string): Promise<Array<{ name: string; isDir: boolean; size: number; created: number; modified: number }>> =>
    ipcRenderer.invoke('fs:list-dir', dirPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-file', filePath, content),
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
