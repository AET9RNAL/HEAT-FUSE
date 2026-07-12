import { ref, readonly, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePluginsStore } from '../stores/plugins'
import { useFuseConnection } from './useFuseConnection'
import { eventBus } from '../events/eventBus'
import { logger } from '../utils/logger'

export type FuseState = 'idle' | 'spawning' | 'connecting' | 'running' | 'stopping' | 'error'
// Runtime sub-state reported by the host while running. 'calibrate' means the
// user still needs to lock plugins (Ctrl+L); 'locked' means they're initialized.
export type FuseRuntimeState = 'calibrate' | 'locked' | null

// ── Singleton state ────────────────────────────────────────────────────────

const fuseState = ref<FuseState>('idle')
const fuseError = ref<string | null>(null)
const fusePid = ref<number | null>(null)
const runtimeState = ref<FuseRuntimeState>(null)

let _actionInProgress = false
let _exitHandlerRegistered = false
let _watcherSetUp = false

// ── Helpers ────────────────────────────────────────────────────────────────

function _setState(s: FuseState, err: string | null = null) {
    fuseState.value = s
    fuseError.value = err
}

// ── Start / stop ───────────────────────────────────────────────────────────

async function startFuse(): Promise<boolean> {
    if (_actionInProgress || fuseState.value === 'running') return false
    _actionInProgress = true

    try {
        runtimeState.value = null
        _setState('spawning')
        eventBus.emit('agent:spawning')
        logger.info('FUSE: spawning process')

        const result = await window.fuseAPI.spawn()

        if (!result.success || !result.port || !result.connectionToken) {
            const msg = result.error ?? 'spawn failed'
            _setState('error', msg)
            eventBus.emit('agent:spawn_failed', { error: msg })
            logger.error('FUSE: spawn failed', { error: msg })
            return false
        }

        fusePid.value = result.pid ?? null
        eventBus.emit('agent:started', { pid: result.pid ?? 0, port: result.port })

        _setState('connecting')
        eventBus.emit('agent:connecting')

        const { connect, onNotification } = useFuseConnection()

        onNotification((msg) => {
            const pluginsStore = usePluginsStore()
            const type = msg['type'] as string
            if (type === 'plugin:registered') {
                pluginsStore.upsert(msg as Parameters<typeof pluginsStore.upsert>[0])
            } else if (type === 'plugin:deregistered') {
                pluginsStore.remove(msg['plugin_id'] as string)
            } else if (type === 'plugin:status_changed') {
                pluginsStore.setStatus(msg['plugin_id'] as string, msg['status'] as Parameters<typeof pluginsStore.setStatus>[1])
            } else if (type === 'config:value_changed') {
                pluginsStore.updateConfigValue(msg['plugin_id'] as string, msg['key'] as string, msg['value'])
            } else if (type === 'hotkey:rebound') {
                pluginsStore.updateHotkey(msg['plugin_id'] as string, msg['action'] as string, msg['combo'] as string)
            } else if (type === 'host:state_changed') {
                const state = msg['state'] as string
                runtimeState.value = state === 'locked' ? 'locked' : state === 'calibrate' ? 'calibrate' : null
            }
        })

        let connectResult: { version?: string }
        try {
            connectResult = await connect(result.port, result.connectionToken)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'connect failed'
            _setState('error', msg)
            eventBus.emit('agent:connect_failed', { error: msg })
            logger.error('FUSE: connect failed', { error: msg })
            return false
        }

        if (connectResult.version) useAppStore().backendVersion = connectResult.version

        _setState('running')
        eventBus.emit('agent:connected')
        logger.info('FUSE: connected', { port: result.port })

        if (!_exitHandlerRegistered) {
            _exitHandlerRegistered = true
            window.fuseAPI.onExited(({ code, signal }) => {
                const { disconnect } = useFuseConnection()
                disconnect()
                fusePid.value = null

                usePluginsStore().resetRuntimeStatuses()
                runtimeState.value = null
                if (fuseState.value === 'running') {
                    _setState('idle')
                    eventBus.emit('agent:crashed', { code, signal })
                    const appStore = useAppStore()
                    appStore.enableFuse = false
                }
            })
        }

        return true
    } finally {
        _actionInProgress = false
    }
}

async function stopFuse(): Promise<void> {
    if (_actionInProgress) return
    if (fuseState.value === 'idle') return
    _actionInProgress = true

    try {
        _setState('stopping')
        eventBus.emit('agent:stopping')

        const { disconnect } = useFuseConnection()
        disconnect()

        await window.fuseAPI.kill()
        fusePid.value = null
        usePluginsStore().resetRuntimeStatuses()
        runtimeState.value = null
        _setState('idle')
        eventBus.emit('agent:stopped', { code: null, signal: null })
        logger.info('FUSE: stopped')
    } finally {
        _actionInProgress = false
    }
}

// ── Composable ─────────────────────────────────────────────────────────────

export function useFuseControl() {
    if (!_watcherSetUp) {
        _watcherSetUp = true
        const appStore = useAppStore()

        window.gameProcessAPI?.onProcessDetected(() => {
            if (appStore.startWithGame) appStore.enableFuse = true
        })
        window.gameProcessAPI?.onProcessLost(() => {
            if (appStore.startWithGame) appStore.enableFuse = false
        })
        window.gameProcessAPI?.onFocusChanged((inFocus: boolean) => {
            if (!appStore.hideOnFocusLoss || fuseState.value !== 'running') return
            const { send } = useFuseConnection()
            void send('overlay.setVisible', { visible: inFocus }).catch(() => {})
        })

        // Disabling focus-hiding stops the watcher, which would otherwise leave
        // overlays stuck hidden f the game
        // wasn't focused. Restore visibility when the feature is turned off.
        watch(() => appStore.hideOnFocusLoss, (enabled) => {
            if (enabled || fuseState.value !== 'running') return
            const { send } = useFuseConnection()
            void send('overlay.setVisible', { visible: true }).catch(() => {})
        })

        watch(() => appStore.enableFuse, async (enabled) => {
            if (enabled) {
                const ok = await startFuse()
                if (!ok) appStore.enableFuse = false
            } else {
                await stopFuse()
            }
        }, { immediate: true })
    }

    return {
        fuseState: readonly(fuseState),
        fuseError: readonly(fuseError),
        fusePid: readonly(fusePid),
        runtimeState: readonly(runtimeState),
        startFuse,
        stopFuse,
    }
}
