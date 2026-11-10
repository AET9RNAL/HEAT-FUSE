import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFuseConnection } from '../composables/useFuseConnection'
import { normalizeConfigSchema, type ConfigSection } from '../utils/configSchema'

export type { ConfigSection, ConfigControl } from '../utils/configSchema'

/** idle: an app-only plugin with no window open, so no process. It starts with its app. */
export type PluginStatus = 'active' | 'disabled' | 'error' | 'skipped' | 'pending' | 'loading' | 'idle'

export interface PluginHotkey {
    action: string
    combo: string
    label: string
    /** A hold bind: it may be a bare modifier such as "shift". */
    hold?: boolean
}

/**
 * off: no preset, or the plugin is off. pending: FUSE writes it when the game is closed. applied: the game files
 * hold it. outdated: the game files changed, and the preset needs an update from its author. failed: see `reason`.
 */
export type OverrideState = 'off' | 'pending' | 'applied' | 'outdated' | 'failed'

export interface OverridePreset {
    id: string
    name: string
    /** A path inside the package, or null. */
    preview: string | null
    problem: string | null
}

export interface OverrideStatus {
    preset: string | null
    state: OverrideState
    reason?: string
    /** pending only: FUSE takes changes out of the game files, not puts them in. */
    removing?: boolean
}

/** The override part of a plugin. `active` is null while the runtime is down: only the runtime knows it. */
export interface PluginOverrides {
    presets: OverridePreset[]
    active: OverrideStatus | null
}

export interface PluginRecord {
    plugin_id: string
    name: string
    version: string
    description: string
    author?: string
    status: PluginStatus
    configSchema: ConfigSection[]
    configValues: Record<string, unknown>
    hotkeys: PluginHotkey[]
    filePath?: string
    checksum?: string
    /** False for a plugin with only an override part. */
    hasRuntime?: boolean
    overrides?: PluginOverrides | null
}

/** Incoming schemas may be sections or legacy categories; they're normalised on the way in. */
export type PluginUpsert = Partial<Omit<PluginRecord, 'configSchema'>> & { plugin_id: string; configSchema?: unknown; has_runtime?: boolean }

export const usePluginsStore = defineStore('plugins', () => {
    const plugins = ref<PluginRecord[]>([])

    function upsert(data: PluginUpsert) {
        const { configSchema: rawSchema, has_runtime, ...rest } = data
        if (has_runtime !== undefined) rest.hasRuntime = has_runtime
        const schema = rawSchema !== undefined ? normalizeConfigSchema(rawSchema) : undefined
        const idx = plugins.value.findIndex(p => p.plugin_id === data.plugin_id)
        if (idx >= 0) {
            plugins.value[idx] = {
                ...plugins.value[idx],
                ...rest,
                ...(schema ? { configSchema: schema } : {}),
            } as PluginRecord
        } else {
            plugins.value.push({
                plugin_id: data.plugin_id,
                name: data.name ?? data.plugin_id,
                version: data.version ?? '',
                description: data.description ?? '',
                author: data.author,
                status: (data.status as PluginStatus) ?? 'pending',
                configSchema: schema ?? [],
                configValues: data.configValues ?? {},
                hotkeys: data.hotkeys ?? [],
                filePath: data.filePath,
                checksum: data.checksum,
                hasRuntime: rest.hasRuntime,
                overrides: data.overrides ?? null,
            })
        }
    }

    function setOverrides(id: string, overrides: PluginOverrides) {
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) plugin.overrides = overrides
    }

    /** The `result` of a JSON-RPC reply, or its error as `{ ok: false, error }`. */
    function rpcResult<T extends { ok?: boolean; error?: string }>(reply: Record<string, unknown>): T {
        const err = reply.error as { message?: string } | undefined
        if (err) return { ok: false, error: err.message ?? 'the runtime gave an error' } as T
        return (reply.result ?? {}) as T
    }

    /** Picks a preset, or null for none. Needs the runtime: it asks for consent and checks the game files. */
    async function selectOverride(id: string, preset: string | null): Promise<{ ok: boolean; status?: OverrideStatus; error?: string }> {
        const { connected, send } = useFuseConnection()
        if (!connected.value) return { ok: false, error: 'FUSE is off' }
        // The call waits while the consent card is up.
        const result = rpcResult<{ ok?: boolean; status?: OverrideStatus; error?: string }>(
            await send('override.select', { plugin_id: id, preset }, 120_000))
        if (result.ok && result.status) {
            const plugin = plugins.value.find(p => p.plugin_id === id)
            if (plugin?.overrides) plugin.overrides = { ...plugin.overrides, active: result.status }
        }
        return { ok: !!result.ok, status: result.status, error: result.error }
    }

    /** Takes back every FUSE change to the game files. Without the runtime, Electron main does it. */
    async function removeAllOverrides(): Promise<{ ok: boolean; error?: string }> {
        const { connected, send } = useFuseConnection()
        if (connected.value) {
            const result = rpcResult<{ ok?: boolean; error?: string }>(await send('override.removeAll', {}))
            return { ok: !!result.ok, error: result.error }
        }
        const result = await window.overridesAPI.removeAll()
        return { ok: result.success, error: result.error }
    }

    function remove(id: string) {
        plugins.value = plugins.value.filter(p => p.plugin_id !== id)
    }

    function setStatus(id: string, status: PluginStatus) {
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) plugin.status = status
    }

    function resetRuntimeStatuses() {
        for (const p of plugins.value) {
            if (p.status === 'active' || p.status === 'loading' || p.status === 'idle') {
                p.status = 'pending'
            }
            if (p.overrides) p.overrides = { ...p.overrides, active: null }
        }
    }

    function updateConfigValue(id: string, key: string, value: unknown) {
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) plugin.configValues[key] = value
    }

    function updateHotkey(id: string, action: string, combo: string) {
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) {
            const hotkey = plugin.hotkeys.find(h => h.action === action)
            if (hotkey) hotkey.combo = combo
        }
    }

    async function setEnabled(id: string, enabled: boolean) {
        await window.configAPI.setPluginEnabled(id, enabled)
        const { connected, setPluginEnabled } = useFuseConnection()
        if (connected.value) {
            await setPluginEnabled(id, enabled)
        } else {
            setStatus(id, enabled ? 'pending' : 'disabled')
        }
    }

    async function setPluginConfig(id: string, key: string, value: unknown) {
        const { connected, send } = useFuseConnection()
        if (connected.value) {
            await send('config.update', { plugin_id: id, key, value })
        } else {
            await window.pluginConfigAPI.writeKey(id, key, value)
            updateConfigValue(id, key, value)
        }
    }

    /** A config-panel button. Buttons talk to the running plugin, so offline they do nothing. */
    async function configAction(id: string, controlId: string, payload?: unknown) {
        const { connected, send } = useFuseConnection()
        if (!connected.value) return
        await send('config.action', { plugin_id: id, control_id: controlId, payload })
    }

    async function rebindHotkey(id: string, action: string, combo: string) {
        const { connected, send } = useFuseConnection()
        if (connected.value) {
            await send('hotkey.rebind', { plugin_id: id, action, combo })
        } else {
            await window.pluginConfigAPI.writeHotkeyOverride(id, action, combo)
            updateHotkey(id, action, combo)
        }
    }

    async function scan() {
        if (!window.pluginsAPI || !window.configAPI) return
        const [results, hostCfg] = await Promise.all([
            window.pluginsAPI.scan(),
            window.configAPI.readHost(),
        ])
        const disabled = new Set(hostCfg.disabled_plugins ?? [])
        for (const r of results) {
            const existing = plugins.value.find(p => p.plugin_id === r.plugin_id)
            const isDisabled = disabled.has(r.plugin_id)
            upsert({
                ...r,
                status: existing?.status === 'active' ? 'active'
                    : isDisabled ? 'disabled'
                    : existing?.status ?? 'pending',
                configSchema: r.configSchema?.length
                    ? r.configSchema
                    : existing?.configSchema ?? [],
                configValues: Object.keys(r.configValues ?? {}).length
                    ? r.configValues as Record<string, unknown>
                    : existing?.configValues ?? {},
                hotkeys: r.hotkeys?.length
                    ? r.hotkeys as PluginHotkey[]
                    : existing?.hotkeys ?? [],
                // The runtime's snapshot has the state and the problems: keep it over the manifest list.
                overrides: existing?.overrides?.active ? existing.overrides : r.overrides,
            })
        }
    }

    function applyHostConfig(cfg: { disabled_plugins: string[] }) {
        const disabled = new Set(cfg.disabled_plugins ?? [])
        for (const p of plugins.value) {
            const shouldBeDisabled = disabled.has(p.plugin_id)
            if (shouldBeDisabled && p.status !== 'disabled') setStatus(p.plugin_id, 'disabled')
            else if (!shouldBeDisabled && p.status === 'disabled') setStatus(p.plugin_id, 'pending')
        }
    }

    function watchHostConfig() {
        window.configAPI.onHostChanged(applyHostConfig)
    }

    function unwatchHostConfig() {
        window.configAPI.offHostChanged()
    }

    return {
        plugins,
        upsert, remove, setStatus, resetRuntimeStatuses,
        updateConfigValue, updateHotkey, setOverrides,
        setEnabled, setPluginConfig, configAction, rebindHotkey,
        selectOverride, removeAllOverrides,
        scan, watchHostConfig, unwatchHostConfig,
    }
})
