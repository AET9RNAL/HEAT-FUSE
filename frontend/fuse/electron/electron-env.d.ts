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
  }
}
