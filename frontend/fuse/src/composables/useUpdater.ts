import { ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { eventBus } from '../events/eventBus'

export type UpdaterState = 'idle' | 'available' | 'downloading' | 'downloaded'

// Module-level singleton state shared across all callers
const state = ref<UpdaterState>('idle')
const updateVersion = ref('')
const downloadProgress = ref(0)

let initialized = false
let intervalId: ReturnType<typeof setInterval> | null = null

const CHECK_INTERVAL_MS = 150_000 // 2.5 minutes

export function useUpdater() {
    const appStore = useAppStore()

    function check() {
        if (state.value === 'downloading' || state.value === 'downloaded') return
        window.updateAPI?.check()
    }

    function startDownload() {
        if (state.value !== 'available') return
        state.value = 'downloading'
        eventBus.emit('update:downloading')
        window.updateAPI?.download()
    }

    function init() {
        if (initialized) return
        initialized = true

        window.updateAPI?.onAvailable((info) => {
            state.value = 'available'
            updateVersion.value = info.version
            eventBus.emit('update:found', { version: info.version })
        })

        window.updateAPI?.onNotAvailable(() => {
            // intentionally no state change — re-checks shouldn't clear a found update
        })

        window.updateAPI?.onProgress((p) => {
            state.value = 'downloading'
            downloadProgress.value = p.percent
        })

        window.updateAPI?.onDownloaded(() => {
            downloadProgress.value = 100
            state.value = 'downloaded'
            eventBus.emit('update:installed')
            setTimeout(() => window.updateAPI?.install(), 1500)
        })

        window.updateAPI?.onError((err) => {
            console.error('[updater]', err.message)
            if (state.value === 'downloading') {
                state.value = 'available'
                downloadProgress.value = 0
                eventBus.emit('update:error', { message: err.message })
            }
        })

        // Initial check after app settles
        if (appStore.checkUpdatesOnStartup) {
            setTimeout(check, 3000)
        }

        // React if setting is enabled mid-session
        watch(() => appStore.checkUpdatesOnStartup, (enabled) => {
            if (enabled && state.value === 'idle') check()
        })

        // Periodic re-check
        intervalId = setInterval(() => {
            if (appStore.checkUpdatesOnStartup && state.value === 'idle') check()
        }, CHECK_INTERVAL_MS)
    }

    function cleanup() {
        if (intervalId !== null) {
            clearInterval(intervalId)
            intervalId = null
        }
        window.updateAPI?.offAll()
        initialized = false
        state.value = 'idle'
        downloadProgress.value = 0
        updateVersion.value = ''
    }

    return { state, updateVersion, downloadProgress, init, startDownload, cleanup }
}
