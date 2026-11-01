import { computed } from 'vue'
import { ftue } from '../directives/vFtue'
import { usePluginsStore, type PluginRecord } from '../stores/plugins'

function sample(plugin_id: string, name: string, version: string, description: string): PluginRecord {
    return {
        plugin_id,
        name,
        version,
        description,
        author: 'AETERNAL',
        status: 'active',
        configSchema: [],
        configValues: {},
        hotkeys: [],
    }
}

// HEAT Stats and the three plugins it depends on, with the values from their manifests.
const SAMPLE_PLUGINS: PluginRecord[] = [
    sample('heat_stats', 'HEATStats', '5.0.0', 'Records per-match performance data.'),
    sample('accessors', 'Accessors', '5.0.0', 'FUSE Core Service Provider. In-game values provider.'),
    sample('fuse_ui', 'FUSE UI', '2.0.0', 'Shared Vue UI components for plugin overlays: the stage\'s inputs, icons and design tokens, imported via @fuse/ui.'),
    sample('canvas_ui', 'Canvas UI', '2.0.0', 'Canvas-UI effects library'),
]

/** While a tour runs and no plugin is installed, the plugin list shows sample plugins. */
export function useSamplePlugins() {
    const store = usePluginsStore()
    const active = computed(() => !!ftue.tour && store.plugins.length === 0)
    const plugins = computed(() => (active.value ? SAMPLE_PLUGINS : store.plugins))
    return { active, plugins }
}
