import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFuseConnection } from '../composables/useFuseConnection'

export type PluginStatus = 'active' | 'disabled' | 'error' | 'skipped' | 'pending' | 'loading'

export interface PluginHotkey {
    action: string
    combo: string
    label: string
}

export interface ConfigEntry {
    key: string
    label: string
    type: 'bool' | 'int' | 'float' | 'string' | 'select' | 'position'
    min?: number
    max?: number
    choices?: string[]
    description?: string
}

export interface ConfigCategory {
    label: string
    entries: ConfigEntry[]
}

export interface PluginRecord {
    plugin_id: string
    name: string
    version: string
    description: string
    author?: string
    status: PluginStatus
    configSchema: ConfigCategory[]
    configValues: Record<string, unknown>
    hotkeys: PluginHotkey[]
    filePath?: string
}

export const usePluginsStore = defineStore('plugins', () => {
    const plugins = ref<PluginRecord[]>([])

    function upsert(data: Partial<PluginRecord> & { plugin_id: string }) {
        const idx = plugins.value.findIndex(p => p.plugin_id === data.plugin_id)
        if (idx >= 0) {
            plugins.value[idx] = { ...plugins.value[idx], ...data } as PluginRecord
        } else {
            plugins.value.push({
                plugin_id: data.plugin_id,
                name: data.name ?? data.plugin_id,
                version: data.version ?? '',
                description: data.description ?? '',
                author: data.author,
                status: (data.status as PluginStatus) ?? 'pending',
                configSchema: data.configSchema ?? [],
                configValues: data.configValues ?? {},
                hotkeys: data.hotkeys ?? [],
                filePath: data.filePath,
            })
        }
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
            if (p.status === 'active' || p.status === 'loading') {
                p.status = 'pending'
            }
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
                    ? r.configSchema as ConfigCategory[]
                    : existing?.configSchema ?? [],
                configValues: Object.keys(r.configValues ?? {}).length
                    ? r.configValues as Record<string, unknown>
                    : existing?.configValues ?? {},
                hotkeys: r.hotkeys?.length
                    ? r.hotkeys as PluginHotkey[]
                    : existing?.hotkeys ?? [],
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
        updateConfigValue, updateHotkey,
        setEnabled, setPluginConfig, rebindHotkey,
        scan, watchHostConfig, unwatchHostConfig,
    }
})
