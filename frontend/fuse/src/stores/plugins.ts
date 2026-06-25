import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PluginStatus = 'active' | 'disabled' | 'error' | 'skipped' | 'pending' | 'loading'

export interface PluginHotkey {
    action: string
    combo: string
}

export interface PluginConfigField {
    key: string
    label: string
    type: 'bool' | 'int' | 'float' | 'string' | 'select'
    default: unknown
    min?: number
    max?: number
    options?: string[]
}

export interface PluginRecord {
    plugin_id: string
    name: string
    version: string
    description: string
    author?: string
    status: PluginStatus
    configSchema: PluginConfigField[]
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

    async function setEnabled(id: string, enabled: boolean) {
        await window.configAPI.setPluginEnabled(id, enabled)
        setStatus(id, enabled ? 'pending' : 'disabled')
    }

    async function rebindHotkey(id: string, action: string, combo: string) {
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) {
            const hotkey = plugin.hotkeys.find(h => h.action === action)
            if (hotkey) hotkey.combo = combo
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
                configSchema: (r.configSchema ?? []) as PluginConfigField[],
                hotkeys: (r.hotkeys ?? []) as PluginHotkey[],
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

    return { plugins, upsert, remove, setStatus, resetRuntimeStatuses, setEnabled, rebindHotkey, scan, watchHostConfig, unwatchHostConfig }
})
