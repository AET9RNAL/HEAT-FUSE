import { computed, readonly, ref } from 'vue'
import { usePluginsStore } from '../stores/plugins'

/** What Electron main's ledger says FUSE holds in the game files. One listener for the App's lifetime. */
const held = ref<HeldGameChanges | null>(null)
let started = false

export function useGameChanges() {
    if (!started && window.overridesAPI) {
        started = true
        window.overridesAPI.onHeldChanged((next) => { held.value = next })
        void window.overridesAPI.held().then((next) => { held.value = next })
    }
    const pluginsStore = usePluginsStore()
    const heldAny = computed(() => !!held.value && (!!held.value.pack || held.value.files.length > 0))
    /** The Game Changes tab shows when a plugin has presets, or FUSE still holds changes. */
    const relevant = computed(() => heldAny.value || pluginsStore.plugins.some(p => p.overrides))
    return { held: readonly(held), heldAny, relevant }
}
