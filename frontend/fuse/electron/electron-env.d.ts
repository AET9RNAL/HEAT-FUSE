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
    closeWindow: () => Promise<void>
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
  }
  fuseAPI: {
    spawn: () => Promise<{ success: boolean; pid?: number; port?: number; connectionToken?: string; error?: string }>
    kill: () => Promise<{ success: boolean }>
    status: () => Promise<{ running: boolean; pid: number | null; port: number | null }>
    onExited: (cb: (data: { code: number | null; signal: string | null }) => void) => void
    offExited: () => void
  }
}
