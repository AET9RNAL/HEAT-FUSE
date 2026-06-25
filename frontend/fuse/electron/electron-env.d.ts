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
    }>>
    showFile: (filePath: string) => Promise<void>
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
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
    readHost: () => Promise<{ disabled_plugins: string[]; enabled_plugins: string[] | null; extra_plugin_dirs: string[] }>
    setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
    onHostChanged: (cb: (cfg: { disabled_plugins: string[] }) => void) => void
    offHostChanged: () => void
  }
  gameAPI: {
    scanDir: (dirPath: string) => Promise<{ version?: string; hasProject: boolean; error?: string }>
    checkDebugger: (dirPath: string) => Promise<{ success: boolean; enabled?: boolean; error?: string }>
    enableDebugger: (dirPath: string) => Promise<{ success: boolean; error?: string }>
    disableDebugger: (dirPath: string) => Promise<{ success: boolean; error?: string }>
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
