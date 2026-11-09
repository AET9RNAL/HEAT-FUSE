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
// Host shortcuts as the runtime has them bound, overrides included.
const hostHotkeys = ref({ lock: 'ctrl+l', interactive: 'ctrl+i' })
// OBS Browser Source URL for the overlay bundle, set once the runtime is up.
const obsUrl = ref<string | null>(null)

let _actionInProgress = false
let _exitHandlerRegistered = false
let _watcherSetUp = false

// ── Helpers ────────────────────────────────────────────────────────────────

function _setState(s: FuseState, err: string | null = null) {
    fuseState.value = s
    fuseError.value = err
}

/** The runtime relays the master level to the stage window; it holds no copy between launches. */
function _sendAudioMaster() {
    if (fuseState.value !== 'running') return
    const appStore = useAppStore()
    const { send } = useFuseConnection()
    void send('audio.setMaster', { volume: appStore.audioVolume / 100, muted: appStore.audioMuted }).catch(() => {})
}

/** Same for the stage's performance widget: sent on connect and on every change. */
function _sendStageSettings() {
    if (fuseState.value !== 'running') return
    const appStore = useAppStore()
    const { send } = useFuseConnection()
    void send('stage.setPerfWidget', { enabled: appStore.stagePerfWidget }).catch(() => {})
}

const STAGE_TOUR_ID = 'stage-intro'

/** The App keeps "seen" for the stage tour. The runtime relays the request to the stage window. */
function _sendStageTour() {
    if (fuseState.value !== 'running') return
    const appStore = useAppStore()
    const { send } = useFuseConnection()
    void send('stage.setTour', { show: !appStore.ftueSeen.includes(STAGE_TOUR_ID) }).catch(() => {})
}

function _markStageTourSeen() {
    const appStore = useAppStore()
    if (!appStore.ftueSeen.includes(STAGE_TOUR_ID)) appStore.ftueSeen = [...appStore.ftueSeen, STAGE_TOUR_ID]
}

/** The stage shows its tour at the next calibration, or at once if it is calibrating now. */
function replayStageTour() {
    const appStore = useAppStore()
    appStore.ftueSeen = appStore.ftueSeen.filter((id) => id !== STAGE_TOUR_ID)
}

/** Plugins read the App's language through the runtime's `language` service. */
function _sendAppLanguage() {
    if (fuseState.value !== 'running') return
    const appStore = useAppStore()
    const { send } = useFuseConnection()
    void send('app.setLanguage', { language: appStore.appLanguage }).catch(() => {})
}

/**
 * The game's debugger port and the state of coldwar.project. Plugins read this
 * through the runtime's `game_config` service
 */
function _sendGameConfig() {
    if (fuseState.value !== 'running') return
    const appStore = useAppStore()
    const { send } = useFuseConnection()
    void send('app.setGameConfig', {
        port: appStore.cdpPort,
        enabled: appStore.gameConfigEnabled === true,
        valid: appStore.gameConfigValid,
        gameRunning: appStore.gameRunning,
        dirs: { ...appStore.gameDirPaths },
    }).catch(() => {})
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

        await useAppStore().refreshGameConfig()
        const result = await window.fuseAPI.spawn({
            autoLock: useAppStore().autoLockOverlays,
            language: useAppStore().appLanguage,
            cdpPort: useAppStore().cdpPort,
            gameDirs: { ...useAppStore().gameDirPaths },
        })

        if (!result.success || !result.port || !result.connectionToken) {
            const msg = result.error ?? 'spawn failed'
            _setState('error', msg)
            eventBus.emit('agent:spawn_failed', { error: msg })
            logger.error('FUSE: spawn failed', { error: msg })
            return false
        }

        fusePid.value = result.pid ?? null
        // Taken from the spawn result rather than the 'fuse:obs-url' event: main
        // emits that before spawn() resolves, so a first launch would miss it.
        obsUrl.value = result.obsUrl ?? null
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
            } else if (type === 'plugin:overrides') {
                pluginsStore.setOverrides(msg['plugin_id'] as string, msg['overrides'] as Parameters<typeof pluginsStore.setOverrides>[1])
            } else if (type === 'config:value_changed') {
                pluginsStore.updateConfigValue(msg['plugin_id'] as string, msg['key'] as string, msg['value'])
            } else if (type === 'hotkey:rebound') {
                pluginsStore.updateHotkey(msg['plugin_id'] as string, msg['action'] as string, msg['combo'] as string)
            } else if (type === 'host:state_changed') {
                const state = msg['state'] as string
                runtimeState.value = state === 'locked' ? 'locked' : state === 'calibrate' ? 'calibrate' : null
            } else if (type === 'stage:tour_done') {
                _markStageTourSeen()
            } else if (type === 'host:hotkeys') {
                hostHotkeys.value = {
                    lock: typeof msg['lock'] === 'string' ? msg['lock'] : hostHotkeys.value.lock,
                    interactive: typeof msg['interactive'] === 'string' ? msg['interactive'] : hostHotkeys.value.interactive,
                }
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
        _sendAudioMaster()
        _sendStageSettings()
        _sendStageTour()
        _sendAppLanguage()
        _sendGameConfig()
        eventBus.emit('agent:connected')
        logger.info('FUSE: connected', { port: result.port })

        if (!_exitHandlerRegistered) {
            _exitHandlerRegistered = true
            window.fuseAPI.onExited(({ code, signal }) => {
                const { disconnect } = useFuseConnection()
                disconnect()
                fusePid.value = null
                obsUrl.value = null

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
        obsUrl.value = null
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

        // Registered before the enableFuse watcher below, which may launch FUSE
        // immediately (startWithGame), so no update can slip past.
        window.fuseAPI.onObsUrl?.((url) => { obsUrl.value = url })

        window.gameProcessAPI?.onProcessDetected(() => {
            appStore.gameRunning = true
            _sendGameConfig()
            if (appStore.startWithGame) appStore.enableFuse = true
        })
        window.gameProcessAPI?.onProcessLost(() => {
            appStore.gameRunning = false
            _sendGameConfig()
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

        watch(() => [appStore.audioVolume, appStore.audioMuted], _sendAudioMaster)
        watch(() => appStore.stagePerfWidget, _sendStageSettings)
        watch(() => appStore.ftueSeen.includes(STAGE_TOUR_ID), _sendStageTour)
        watch(() => appStore.appLanguage, _sendAppLanguage)
        watch(() => [appStore.cdpPort, appStore.gameConfigEnabled, appStore.gameConfigPort, appStore.gameDirPaths], _sendGameConfig)

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
        hostHotkeys: readonly(hostHotkeys),
        obsUrl: readonly(obsUrl),
        startFuse,
        stopFuse,
        replayStageTour,
    }
}
