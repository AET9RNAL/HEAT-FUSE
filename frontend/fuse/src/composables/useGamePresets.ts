import { readonly, ref } from 'vue'
import { usePluginsStore } from '../stores/plugins'
import { eventBus } from '../events/eventBus'
import { useI18n } from './useI18n'

/** The preset window over the App and the preset picks. One state for the App's lifetime. */
const open = ref<{ id: string } | null>(null)
const picking = ref<{ id: string; preset: string | null } | null>(null)
const slowPick = ref(false)
const pickError = ref('')
/** Picks run one at a time: a moved link sends an unlink and a link. */
let queue: Promise<void> = Promise.resolve()

export function useGamePresets() {
    const pluginsStore = usePluginsStore()
    const { t } = useI18n()

    function openPresets(id: string) {
        pickError.value = ''
        open.value = { id }
    }

    function close() {
        open.value = null
        pickError.value = ''
    }

    async function runPick(id: string, preset: string | null) {
        picking.value = { id, preset }
        pickError.value = ''
        // The runtime waits while the consent card is up on the stage.
        const slow = setTimeout(() => { slowPick.value = true }, 700)
        let error = ''
        try {
            const result = await pluginsStore.selectOverride(id, preset)
            if (!result.ok) error = result.error ?? ''
        } catch (e) {
            error = e instanceof Error ? e.message : String(e)
        } finally {
            clearTimeout(slow)
            slowPick.value = false
            picking.value = null
        }
        if (!error) return
        if (open.value?.id === id) pickError.value = error
        else eventBus.emit('notification', { message: t('components.plugin.overrides.pickFailed', { reason: error }), type: 'error' })
    }

    function pick(id: string, preset: string | null): Promise<void> {
        queue = queue.then(() => runPick(id, preset))
        return queue
    }

    return {
        open: readonly(open),
        picking: readonly(picking),
        slowPick: readonly(slowPick),
        pickError: readonly(pickError),
        openPresets,
        close,
        pick,
    }
}
