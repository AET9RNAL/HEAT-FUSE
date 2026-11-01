import { ref, onUnmounted } from 'vue'
import { eventBus } from '../events/eventBus'
import { useI18n } from './useI18n'

// Non-alphanumeric keys accepted as a binding target
const STANDALONE_KEYS = new Set<string>([
    ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
    'home', 'end', 'pageup', 'pagedown', 'insert', 'delete', 'enter', 'space',
])

function modsOf(e: KeyboardEvent): string[] {
    const mods: string[] = []
    if (e.ctrlKey)  mods.push('ctrl')
    if (e.altKey)   mods.push('alt')
    if (e.shiftKey) mods.push('shift')
    return mods
}

const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta']
// Modifiers a hold bind may use alone. Meta opens the Start menu, so it is left out.
const BARE_MODIFIER: Record<string, string> = { Control: 'ctrl', Alt: 'alt', Shift: 'shift' }

// Only one capture may be live at a time, across every component using this.
let activeCancel: (() => void) | null = null

/**
 * Captures the next keystroke as a `mod+mod+key` combo string.
 * `onProgress` fires whenever the held modifiers change, so the UI can show the
 * combo building up - and shrinking again when a modifier is released.
 */
export function useKeybindCapture(
    onCombo: (action: string, combo: string) => void,
    options?: {
        onProgress?: (action: string, mods: string[]) => void
        /** Fires with the key that was refused, so the UI can show what went wrong. */
        onReject?: (action: string, rejectedKey: string) => void
    },
) {
    const { t } = useI18n()
    const capturingAction = ref<string | null>(null)
    let captureListener: ((e: KeyboardEvent) => void) | null = null
    let releaseListener: ((e: KeyboardEvent) => void) | null = null

    function fail(message: string, rejectedKey: string) {
        const action = capturingAction.value
        cancelCapture()
        if (action) options?.onReject?.(action, rejectedKey)
        eventBus.emit('notification', {
            title: t('appsettings.keybindings.latinOnlyTitle'),
            message,
            type: 'error',
        })
    }

    /** `allowModifier`: a modifier released before any other key is the bind (for hold binds). */
    function startCapture(action: string, opts: { allowModifier?: boolean } = {}) {
        // Starting a capture anywhere aborts whichever one was already running
        if (activeCancel && activeCancel !== cancelCapture) activeCancel()
        if (capturingAction.value) cancelCapture()
        capturingAction.value = action
        activeCancel = cancelCapture

        // The last modifier pressed and every modifier down at that moment
        let lastMod = ''
        let modsAtLast: string[] = []

        captureListener = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            // Modifiers don't end the capture - they extend the combo in progress
            if (MODIFIER_KEYS.includes(e.key)) {
                if (!e.repeat) {
                    lastMod = BARE_MODIFIER[e.key] ?? ''
                    modsAtLast = modsOf(e)
                }
                options?.onProgress?.(action, modsOf(e))
                return
            }
            if (e.key === 'Escape') { cancelCapture(); return }

            // Reject non-Latin keys (e.g. Cyrillic layouts)
            if (/[^\x00-\x7F]/.test(e.key)) {
                fail(t('appsettings.keybindings.latinOnly'), e.key)
                return
            }

            // Key must be a letter, digit, or function/navigation key; modifiers optional
            const key = e.key === ' ' ? 'space' : e.key.toLowerCase()
            if (!/^[a-z0-9]$/.test(key) && !STANDALONE_KEYS.has(key)) {
                fail(t('appsettings.keybindings.invalidCombo'), key)
                return
            }

            cancelCapture()
            onCombo(action, [...modsOf(e), key].join('+'))
        }

        // A released modifier is no longer part of the combo
        releaseListener = (e: KeyboardEvent) => {
            if (!MODIFIER_KEYS.includes(e.key)) return
            if (opts.allowModifier && lastMod) {
                const combo = [...modsAtLast.filter(m => m !== lastMod), lastMod].join('+')
                cancelCapture()
                onCombo(action, combo)
                return
            }
            options?.onProgress?.(action, modsOf(e))
        }

        document.addEventListener('keydown', captureListener, true)
        document.addEventListener('keyup', releaseListener, true)
    }

    function cancelCapture() {
        if (captureListener) {
            document.removeEventListener('keydown', captureListener, true)
            captureListener = null
        }
        if (releaseListener) {
            document.removeEventListener('keyup', releaseListener, true)
            releaseListener = null
        }
        if (activeCancel === cancelCapture) activeCancel = null
        capturingAction.value = null
    }

    onUnmounted(cancelCapture)

    return { capturingAction, startCapture, cancelCapture }
}
