/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  safeStorageAPI: {
    isAvailable: () => Promise<boolean>
    encrypt: (value: string) => Promise<{ type: 'Buffer'; data: number[] }>
    decrypt: (buf: { type: 'Buffer'; data: number[] }) => Promise<string>
  }
  appAPI: {
    onSuspended: (cb: () => void) => void
    onResumed: (cb: () => void) => void
    setAutostart: (value: boolean) => Promise<void>
    setMinimizeToTrayOnStart: (value: boolean) => Promise<void>
    applyMinimizeToTrayOnStart: () => Promise<void>
    setMinimizeToTrayOnClose: (value: boolean) => Promise<void>
    openBackendDir: () => Promise<string>
    closeWindow: () => Promise<void>
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    onDeepLink: (cb: (route: string, params: Record<string, string>) => void) => void
  }
  pluginsAPI: {
    scan: () => Promise<Array<{
      plugin_id: string
      name: string
      version: string
      description: string
      author?: string
      status: 'pending'
      configSchema: unknown[]
      configValues: Record<string, unknown>
      hotkeys: unknown[]
      filePath: string
      checksum: string
    }>>
    showFile: (filePath: string) => Promise<void>
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
    downloadPlugin: (url: string, filename: string) => Promise<{ success: boolean; filePath?: string; checksum?: string; error?: string }>
    uploadToR2: (presignedUrl: string, fileBuffer: ArrayBuffer, contentType: string) => Promise<{ success: boolean; error?: string }>
  }
  pluginConfigAPI: {
    readPlugin: (pluginId: string) => Promise<Record<string, unknown>>
    writeKey: (pluginId: string, key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
    writeHotkeyOverride: (pluginId: string, action: string, combo: string) => Promise<{ success: boolean; error?: string }>
  }
  dialogAPI: {
    selectDir: () => Promise<string | null>
  }
  configAPI: {
    readHost: () => Promise<{ disabled_plugins: string[]; enabled_plugins: string[] | null }>
    setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
    onHostChanged: (cb: (cfg: { disabled_plugins: string[] }) => void) => void
    offHostChanged: () => void
  }
  updateAPI: {
    check: () => Promise<{ success: boolean; updateInfo?: unknown; error?: string }>
    download: () => Promise<{ success: boolean; error?: string }>
    install: () => Promise<{ success: boolean }>
    onChecking: (cb: () => void) => void
    onAvailable: (cb: (info: { version: string; releaseNotes: string; releaseDate: string }) => void) => void
    onNotAvailable: (cb: (info: { version: string }) => void) => void
    onProgress: (cb: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void
    onDownloaded: (cb: (info: { version: string; releaseDate: string }) => void) => void
    onError: (cb: (err: { message: string }) => void) => void
    offAll: () => void
  }
  gameAPI: {
    scanDir: (dirPath: string) => Promise<{ version?: string; hasProject: boolean; error?: string }>
    checkDebugger: (dirPath: string) => Promise<{ success: boolean; enabled?: boolean; error?: string }>
    enableDebugger: (dirPath: string) => Promise<{ success: boolean; error?: string }>
    disableDebugger: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  }
  discordAPI: {
    setEnabled: (enabled: boolean) => Promise<{ success: boolean }>
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
    } | null) => Promise<{ success: boolean; connected: boolean }>
    clearActivity: () => Promise<{ success: boolean }>
    status: () => Promise<{ enabled: boolean; connected: boolean }>
  }
  fsAPI: {
    getRoot: () => Promise<string>
    listDir: (dirPath: string) => Promise<Array<{ name: string; isDir: boolean; size: number; created: number; modified: number }>>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
  }
  gameProcessAPI: {
    setWatchEnabled: (enabled: boolean) => Promise<void>
    setFocusWatchEnabled: (enabled: boolean) => Promise<void>
    onProcessDetected: (cb: () => void) => void
    onProcessLost: (cb: () => void) => void
    onFocusChanged: (cb: (inFocus: boolean) => void) => void
  }
  fileAssocAPI: {
    isRegistered: () => Promise<boolean>
    register: () => Promise<{ success: boolean; error?: string }>
    unregister: () => Promise<{ success: boolean; error?: string }>
  }
  deviceAPI: {
    getFingerprint: () => Promise<string>
    getName: () => Promise<string>
    getOS: () => Promise<string>
    getIP: () => Promise<string | null>
  }
  fuseAPI: {
    spawn: () => Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; error?: string }>
    kill: () => Promise<{ success: boolean }>
    status: () => Promise<{ running: boolean; pid: number | null; port: number | null }>
    onExited: (cb: (data: { code: number | null; signal: string | null }) => void) => void
    offExited: () => void
    onLog: (cb: (entry: { level: string; text: string; timestamp: number }) => void) => void
    offLog: () => void
  }
}
