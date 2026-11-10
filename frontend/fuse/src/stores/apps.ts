import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFuseConnection } from '../composables/useFuseConnection'

export type TaskbarEdge = 'bottom' | 'top' | 'left' | 'right'

/** One app of the runtime's `app:list`. Mirrors `AppHub.listPayload` in runtime/src/host/AppHub.ts. */
export interface AppEntry {
    key: string
    pluginId: string
    appId: string
    name: string
    pluginName: string
    iconUrl: string | null
    keywords: string[]
    views: string[]
    instances: 'single' | 'multi'
    running: boolean
    windows: string[]
    favorite: number
    pinned: boolean
    alias: string | null
    hotkey: string | null
    hotkeyConflict: string | null
    usage: { count: number; last: number }
}

export interface LauncherSettings {
    edge: TaskbarEdge
    autoHide: boolean
    consoleHotkey: string
}

type Reply = { ok?: boolean; error?: string } & Record<string, unknown>

/** The apps on the stage, from the runtime. Empty while FUSE is off: only the runtime knows them. */
export const useAppsStore = defineStore('apps', () => {
    const apps = ref<AppEntry[]>([])
    const launcher = ref<LauncherSettings>({ edge: 'bottom', autoHide: true, consoleHotkey: 'ctrl+space' })

    function setList(list: unknown) {
        apps.value = Array.isArray(list) ? (list as AppEntry[]) : []
    }

    function setLauncher(raw: Record<string, unknown>) {
        const next = { ...launcher.value }
        if (raw.edge === 'bottom' || raw.edge === 'top' || raw.edge === 'left' || raw.edge === 'right') next.edge = raw.edge
        if (typeof raw.autoHide === 'boolean') next.autoHide = raw.autoHide
        if (typeof raw.consoleHotkey === 'string') next.consoleHotkey = raw.consoleHotkey
        launcher.value = next
    }

    function reset() {
        apps.value = []
    }

    async function call(method: string, params: Record<string, unknown> = {}): Promise<Reply> {
        const { connected, send } = useFuseConnection()
        if (!connected.value) return { ok: false, error: 'FUSE is off' }
        const reply = await send(method, params)
        const err = reply.error as { message?: string } | undefined
        if (err) return { ok: false, error: err.message ?? 'the runtime gave an error' }
        return (reply.result ?? {}) as Reply
    }

    async function refresh() {
        const result = await call('app.list')
        if (result.apps) setList(result.apps)
        if (result.launcher) setLauncher(result.launcher as Record<string, unknown>)
    }

    async function saveLauncher(fields: Partial<Pick<LauncherSettings, 'edge' | 'autoHide'>>) {
        const result = await call('launcher.settings', fields)
        if (result.ok) setLauncher(result)
        return result
    }

    return { apps, launcher, setList, setLauncher, reset, refresh, saveLauncher }
})
