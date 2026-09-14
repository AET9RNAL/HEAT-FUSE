import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'

/** The window a channel belongs to. Channels not listed are App-only. */
export type Surface = 'app' | 'splash' | 'stage' | 'consent'

const CHANNEL_SURFACE: Record<string, Surface> = {
  'splash:done': 'splash',
  'overlay:set-ignore': 'stage',
  'overlay:set-focusable': 'stage',
  'overlay:connection': 'stage',
  'consent:decide': 'consent',
  'consent:closed': 'consent',
  'consent:card-rect': 'consent',
}

const surfaces = new Map<number, Surface>()

/** Allow a window's top frame to call the channels of its surface. */
export function trustSurface(wc: WebContents, surface: Surface): void {
  const id = wc.id
  surfaces.set(id, surface)
  wc.once('destroyed', () => { if (surfaces.get(id) === surface) surfaces.delete(id) })
}

function allowed(channel: string, e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!e.senderFrame || e.senderFrame.parent !== null) return false
  return surfaces.get(e.sender.id) === (CHANNEL_SURFACE[channel] ?? 'app')
}

function refuse(channel: string, e: IpcMainEvent | IpcMainInvokeEvent): void {
  console.warn(`[ipc] refused ${channel} from ${e.senderFrame?.url ?? 'unknown frame'}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvokeListener = (e: IpcMainInvokeEvent, ...args: any[]) => unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SendListener = (e: IpcMainEvent, ...args: any[]) => void

export function handleIpc(channel: string, listener: InvokeListener): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!allowed(channel, e)) {
      refuse(channel, e)
      throw new Error(`IPC ${channel} refused`)
    }
    return listener(e, ...args)
  })
}

export function onIpc(channel: string, listener: SendListener): void {
  ipcMain.on(channel, (e, ...args) => {
    if (!allowed(channel, e)) { refuse(channel, e); return }
    listener(e, ...args)
  })
}

/** One-shot listener. Returns a disposer for callers that stop waiting early. */
export function onceIpc(channel: string, listener: SendListener): () => void {
  const wrapped = (e: IpcMainEvent, ...args: unknown[]): void => {
    if (!allowed(channel, e)) { refuse(channel, e); return }
    ipcMain.removeListener(channel, wrapped)
    listener(e, ...args)
  }
  ipcMain.on(channel, wrapped)
  return () => { ipcMain.removeListener(channel, wrapped) }
}
