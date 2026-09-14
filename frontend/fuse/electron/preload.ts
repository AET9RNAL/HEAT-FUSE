import { ipcRenderer, contextBridge } from 'electron'

// Set by Electron main per window. The stage page also runs plugin Vue overlays,
// so it gets only what the stage itself needs. A window without one gets nothing.
const SURFACE = process.argv.find((a) => a.startsWith('--fuse-surface='))?.slice('--fuse-surface='.length) ?? 'none'

if (SURFACE === 'stage') {
  contextBridge.exposeInMainWorld('stageAPI', {
    setIgnore: (ignore: boolean): void => ipcRenderer.send('overlay:set-ignore', !!ignore),
    setFocusable: (focusable: boolean): void => ipcRenderer.send('overlay:set-focusable', !!focusable),
    /** The runtime socket's port and stage token, answered once per page load. */
    connection: (): Promise<{ port: number; token: string } | null> => ipcRenderer.invoke('overlay:connection'),
  })
}

if (SURFACE === 'splash') {
  contextBridge.exposeInMainWorld('splashAPI', {
    done: (): void => ipcRenderer.send('splash:done'),
  })
}

if (SURFACE === 'consent') {
  contextBridge.exposeInMainWorld('consentAPI', {
    onRequest: (cb: (request: unknown) => void): void => {
      ipcRenderer.on('consent:request', (_e, request) => cb(request))
    },
    decide: (requestId: string, grants: Record<string, boolean>): Promise<void> =>
      ipcRenderer.invoke('consent:decide', requestId, grants),
    /** The answered card has animated out. */
    closed: (requestId: string): void => ipcRenderer.send('consent:closed', requestId),
    /** Where the card is in the page, so only it takes clicks; null while there's none. */
    cardRect: (rect: { x: number; y: number; width: number; height: number } | null): void =>
      ipcRenderer.send('consent:card-rect', rect),
  })
}

function exposeApp(key: string, api: Record<string, unknown>): void {
  if (SURFACE === 'app') contextBridge.exposeInMainWorld(key, api)
}

exposeApp('safeStorageAPI', {
  isAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('safe-storage:is-available'),
  encrypt: (value: string): Promise<{ type: 'Buffer'; data: number[] }> =>
    ipcRenderer.invoke('safe-storage:encrypt', value),
  decrypt: (buf: { type: 'Buffer'; data: number[] }): Promise<string> =>
    ipcRenderer.invoke('safe-storage:decrypt', buf),
})

exposeApp('appAPI', {
  onSuspended: (cb: () => void) => ipcRenderer.on('app:suspended', cb),
  onResumed: (cb: () => void) => ipcRenderer.on('app:resumed', cb),
  onDeepLink: (cb: (route: string, params: Record<string, string>) => void) =>
    ipcRenderer.on('app:deep-link', (_event, route, params) => cb(route, params)),
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
  toggleStageDevtools: (): void => ipcRenderer.send('overlay:toggle-devtools'),
  toggleRuntimeDevtools: (): void => ipcRenderer.send('runtime:toggle-devtools'),
})

exposeApp('pluginsAPI', {
  scan: () => ipcRenderer.invoke('plugins:scan'),
  showFile: (filePath: string) => ipcRenderer.invoke('plugins:show-file', filePath),
  deleteFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('plugins:delete', filePath),
  downloadPlugin: (url: string, filename: string): Promise<{ success: boolean; filePath?: string; checksum?: string; error?: string }> =>
    ipcRenderer.invoke('plugins:download-plugin', url, filename),
  uploadToR2: (presignedUrl: string, fileBuffer: ArrayBuffer, contentType: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('plugins:upload-to-r2', presignedUrl, fileBuffer, contentType),
})

exposeApp('dialogAPI', {
  selectDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-dir'),
})

exposeApp('configAPI', {
  readHost: (): Promise<{ disabled_plugins: string[]; enabled_plugins: string[] | null }> =>
    ipcRenderer.invoke('config:host:read'),
  setPluginEnabled: (pluginId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('config:plugin:set-enabled', pluginId, enabled),
  onHostChanged: (cb: (cfg: { disabled_plugins: string[] }) => void) =>
    ipcRenderer.on('config:host:changed', (_event, cfg) => cb(cfg)),
  offHostChanged: () =>
    ipcRenderer.removeAllListeners('config:host:changed'),
})

exposeApp('pluginConfigAPI', {
  readPlugin: (pluginId: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('config:plugin:read', pluginId),
  writeKey: (pluginId: string, key: string, value: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('config:plugin:write-key', pluginId, key, value),
  writeHotkeyOverride: (pluginId: string, action: string, combo: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('hotkey:write-override', pluginId, action, combo),
})

exposeApp('updateAPI', {
  check: (): Promise<{ success: boolean; updateInfo?: unknown; error?: string }> =>
    ipcRenderer.invoke('update:check'),
  download: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('update:download'),
  install: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('update:install'),
  getReleaseNotes: (
    version: string,
    opts?: { refresh?: boolean },
  ): Promise<{
    success: boolean
    error?: string
    entry?: { version: string; notes: string; releaseDate?: string; url?: string } | null
  }> => ipcRenderer.invoke('update:release-notes', version, opts),
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

exposeApp('gameAPI', {
  scanDir: (dirPath: string): Promise<{ version?: string; hasProject: boolean; error?: string }> =>
    ipcRenderer.invoke('game:scan-dir', dirPath),
  checkDebugger: (dirPath: string): Promise<{ success: boolean; enabled?: boolean; error?: string }> =>
    ipcRenderer.invoke('game:check-debugger', dirPath),
  enableDebugger: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:enable-debugger', dirPath),
  disableDebugger: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:disable-debugger', dirPath),
})

exposeApp('discordAPI', {
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

exposeApp('fsAPI', {
  getRoot: (): Promise<string> =>
    ipcRenderer.invoke('fs:get-root'),
  listDir: (dirPath: string): Promise<Array<{ name: string; isDir: boolean; size: number; created: number; modified: number }>> =>
    ipcRenderer.invoke('fs:list-dir', dirPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-file', filePath, content),
})

exposeApp('gameProcessAPI', {
  setWatchEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('game:watch:set', enabled),
  setFocusWatchEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('game:focus:set', enabled),
  onProcessDetected: (cb: () => void) =>
    ipcRenderer.on('game:process:detected', () => cb()),
  onProcessLost: (cb: () => void) =>
    ipcRenderer.on('game:process:lost', () => cb()),
  onFocusChanged: (cb: (inFocus: boolean) => void) =>
    ipcRenderer.on('game:focus:changed', (_e, inFocus: boolean) => cb(inFocus)),
})

exposeApp('fileAssocAPI', {
  isRegistered: (): Promise<boolean> =>
    ipcRenderer.invoke('fileassoc:is-registered'),
  register: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fileassoc:register'),
  unregister: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fileassoc:unregister'),
})

exposeApp('deviceAPI', {
  getFingerprint: (): Promise<string> =>
    ipcRenderer.invoke('device:fingerprint'),
  getName: (): Promise<string> =>
    ipcRenderer.invoke('device:name'),
  getOS: (): Promise<string> =>
    ipcRenderer.invoke('device:os'),
  getIP: (): Promise<string | null> =>
    ipcRenderer.invoke('device:ip'),
})

exposeApp('fuseAPI', {
  spawn: (opts?: { autoLock?: boolean }): Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; obsUrl?: string | null; error?: string }> =>
    ipcRenderer.invoke('fuse:spawn', opts),
  kill: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('fuse:kill'),
  status: (): Promise<{ running: boolean; pid: number | null; port: number | null; obsUrl: string | null }> =>
    ipcRenderer.invoke('fuse:status'),
  onExited: (cb: (data: { code: number | null; signal: string | null }) => void) =>
    ipcRenderer.on('fuse:exited', (_event, data) => cb(data)),
  offExited: () =>
    ipcRenderer.removeAllListeners('fuse:exited'),
  onObsUrl: (cb: (url: string | null) => void) =>
    ipcRenderer.on('fuse:obs-url', (_event, url) => cb(url)),
  offObsUrl: () =>
    ipcRenderer.removeAllListeners('fuse:obs-url'),
  obsDisplays: (): Promise<Array<{ id: string; label: string; width: number; height: number; primary: boolean }>> =>
    ipcRenderer.invoke('obs:displays'),
  obsUrlFor: (display?: string | null): Promise<string | null> =>
    ipcRenderer.invoke('obs:url', display),
  onLog: (cb: (entry: { level: string; text: string; timestamp: number }) => void) =>
    ipcRenderer.on('fuse:log', (_event, entry) => cb(entry)),
  offLog: () =>
    ipcRenderer.removeAllListeners('fuse:log'),
})
