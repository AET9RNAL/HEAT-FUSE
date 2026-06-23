import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFuseConnection } from '../composables/useFuseConnection'

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

    async function setEnabled(id: string, enabled: boolean) {
        const { setPluginEnabled } = useFuseConnection()
        await setPluginEnabled(id, enabled)
        setStatus(id, enabled ? 'active' : 'disabled')
    }

    async function rebindHotkey(id: string, action: string, combo: string) {
        const { rebindHotkey: rpcRebind } = useFuseConnection()
        await rpcRebind(id, action, combo)
        const plugin = plugins.value.find(p => p.plugin_id === id)
        if (plugin) {
            const hotkey = plugin.hotkeys.find(h => h.action === action)
            if (hotkey) hotkey.combo = combo
        }
    }

    return { plugins, upsert, remove, setStatus, setEnabled, rebindHotkey }
})
