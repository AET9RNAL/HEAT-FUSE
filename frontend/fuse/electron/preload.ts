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
})
