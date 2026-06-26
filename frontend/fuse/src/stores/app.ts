import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { logger } from '../utils/logger'

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
    let timeout: ReturnType<typeof setTimeout>
    return (...args: Parameters<T>) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => fn(...args), ms)
    }
}

export type AppLanguage = 'en'

export const useAppStore = defineStore('app', () => {

    // Refs

    const appVersion = ref<string>('')
    const appLanguage = ref<AppLanguage>('en')
    const enableFuse = ref<boolean>(false)
    const autostart = ref<boolean>(false)
    const minimizeToTray = ref<boolean>(false)
    const minimizeToTrayOnClose = ref<boolean>(false)
    const checkUpdatesOnStartup = ref<boolean>(true)
    const discordRpc = ref<boolean>(true)
    const startWithGame = ref<boolean>(false)
    const hideOnFocusLoss = ref<boolean>(false)
    const gamePlatform = ref<'steam' | 'wgc'>('steam')
    const gameDirPaths = ref<Record<string, string>>({ steam: '', wgc: '' })
    const backendVersion = ref<string>('')
    const gameVersion = ref<string>('')

    // Setting registry
    // Each entry maps a ref to a DB column key and a load default.
    // Adding a setting = one line here.

    interface SettingEntry {
        ref: Ref<any>
        db: string
        default: any
    }

    const registry: Record<string, SettingEntry> = {
        appLanguage:           { ref: appLanguage,           db: 'app_language',              default: 'en' },
        enableFuse:            { ref: enableFuse,            db: 'enable_fuse',               default: false },
        autostart:              { ref: autostart,              db: 'autostart',                  default: false },
        minimizeToTray:         { ref: minimizeToTray,         db: 'minimize_to_tray',           default: false },
        minimizeToTrayOnClose:  { ref: minimizeToTrayOnClose,  db: 'minimize_to_tray_on_close',  default: false },
        checkUpdatesOnStartup:  { ref: checkUpdatesOnStartup,  db: 'check_updates_on_startup',   default: true },
        discordRpc:             { ref: discordRpc,             db: 'discord_rpc',                default: true },
        startWithGame:          { ref: startWithGame,          db: 'start_with_game',            default: false },
        hideOnFocusLoss:        { ref: hideOnFocusLoss,        db: 'hide_on_focus_loss',         default: false },
        gamePlatform:           { ref: gamePlatform,           db: 'game_platform',              default: 'steam' },
        gameDirPaths:           { ref: gameDirPaths,           db: 'game_dir_paths',             default: { steam: '', wgc: '' } },
    }

    // Batched save system (wire DB when auth is ready)

    const pendingChanges = ref<Record<string, any>>({})
    let isLoading = true

    const debouncedSaveAll = debounce(async () => {
        if (Object.keys(pendingChanges.value).length === 0) return
        const toSave = { ...pendingChanges.value }
        logger.info('Settings pending save:', toSave)
        // TODO: persist toSave to DB (wire when Supabase auth is ready)
        for (const key of Object.keys(toSave)) {
            if (pendingChanges.value[key] === toSave[key]) {
                delete pendingChanges.value[key]
            }
        }
    }, 500)

    function queueSave(column: string, value: any) {
        if (isLoading) return
        pendingChanges.value[column] = value
        debouncedSaveAll()
    }

    for (const entry of Object.values(registry)) {
        watch(entry.ref, (value) => queueSave(entry.db, value))
    }

    // Electron IPC sync

    watch(autostart, (value) => {
        window.appAPI?.setAutostart(value)
    })

    watch(minimizeToTray, (value) => {
        window.appAPI?.setMinimizeToTrayOnStart(value)
    })

    watch(minimizeToTrayOnClose, (value) => {
        window.appAPI?.setMinimizeToTrayOnClose(value)
    })

    watch(discordRpc, (value) => {
        window.discordAPI?.setEnabled(value)
    }, { immediate: true })

    watch(startWithGame, (value) => {
        window.gameProcessAPI?.setWatchEnabled(value)
    }, { immediate: true })

    watch(hideOnFocusLoss, (value) => {
        window.gameProcessAPI?.setFocusWatchEnabled(value)
    }, { immediate: true })

    // Load / init

    function loadDefaults() {
        isLoading = true
        try {
            for (const entry of Object.values(registry)) {
                entry.ref.value = entry.default
            }
        } finally {
            pendingChanges.value = {}
            isLoading = false
        }
    }

    function setGameDirPath(platform: string, path: string) {
        gameDirPaths.value = { ...gameDirPaths.value, [platform]: path }
    }

    async function scanGameDir(dirPath: string) {
        if (!dirPath) { gameVersion.value = ''; return }
        const result = await window.gameAPI.scanDir(dirPath)
        gameVersion.value = result.version ?? ''
    }

    async function checkDebugger(dirPath: string) {
        return window.gameAPI.checkDebugger(dirPath)
    }

    async function enableDebugger(dirPath: string) {
        return window.gameAPI.enableDebugger(dirPath)
    }

    async function disableDebugger(dirPath: string) {
        return window.gameAPI.disableDebugger(dirPath)
    }

    return {
        appVersion,
        backendVersion,
        appLanguage,
        enableFuse,
        autostart,
        minimizeToTray,
        minimizeToTrayOnClose,
        checkUpdatesOnStartup,
        discordRpc,
        startWithGame,
        hideOnFocusLoss,
        gamePlatform,
        gameDirPaths,
        gameVersion,
        setGameDirPath,
        scanGameDir,
        checkDebugger,
        enableDebugger,
        disableDebugger,
        loadDefaults,
    }
}, {
    persist: {
        pick: [
            'appLanguage',
            'enableFuse',
            'autostart',
            'minimizeToTray',
            'minimizeToTrayOnClose',
            'checkUpdatesOnStartup',
            'discordRpc',
            'startWithGame',
            'hideOnFocusLoss',
            'gamePlatform',
            'gameDirPaths',
            'gameVersion',
            'backendVersion',
        ],
    },
})
