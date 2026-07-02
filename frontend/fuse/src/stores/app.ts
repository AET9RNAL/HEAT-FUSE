import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { logger, setDiagnosticsConsent } from '../utils/logger'
import { supabase } from '../composables/supabase-client'
import { eventBus } from '../events/eventBus'

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
    const fileAssoc = ref<boolean>(false)
    const gamePlatform = ref<'steam' | 'wgc'>('steam')
    const gameDirPaths = ref<Record<string, string>>({ steam: '', wgc: '' })
    const backendVersion = ref<string>('')
    const gameVersion = ref<string>('')
    const licenseAccepted = ref<boolean>(false)
    const analyticsConsent = ref<boolean>(false)
    const diagnosticsConsent = ref<boolean>(false)
    const username = ref<string | null>(null)
    const allowApiAccess = ref<boolean>(false)

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
        fileAssoc:              { ref: fileAssoc,              db: 'file_assoc',                 default: true },
        gamePlatform:           { ref: gamePlatform,           db: 'game_platform',              default: 'steam' },
        gameDirPaths:           { ref: gameDirPaths,           db: 'game_dir_paths',             default: { steam: '', wgc: '' } },
        analyticsConsent:       { ref: analyticsConsent,       db: 'analytics_consent',          default: false },
        diagnosticsConsent:     { ref: diagnosticsConsent,     db: 'diagnostics_consent',        default: false },
        allowApiAccess:         { ref: allowApiAccess,         db: 'allow_api_access',            default: false },
    }

    // Batched save system (wire DB when auth is ready)

    const pendingChanges = ref<Record<string, any>>({})
    let isLoading = true

    const debouncedSaveAll = debounce(async () => {
        if (Object.keys(pendingChanges.value).length === 0) return
        const toSave = { ...pendingChanges.value }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error } = await supabase
            .from('user_profiles')
            .update(toSave)
            .eq('user_id', user.id)

        if (error) {
            logger.error('Failed to save settings:', { error })
        } else {
            logger.info('Saved settings:', toSave)
            for (const key of Object.keys(toSave)) {
                if (pendingChanges.value[key] === toSave[key]) {
                    delete pendingChanges.value[key]
                }
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

    watch(fileAssoc, (value) => {
        if (value) window.fileAssocAPI?.register()
        else       window.fileAssocAPI?.unregister()
    })

    watch(diagnosticsConsent, (value) => {
        setDiagnosticsConsent(value)
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

    async function loadSettings() {
        isLoading = true
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', user.id)
            if (error) throw error
            const profile = data?.[0]
            if (!profile) return

            for (const entry of Object.values(registry)) {
                const dbValue = profile[entry.db]
                entry.ref.value = dbValue ?? entry.default
            }
            username.value = profile['username'] ?? null
            logger.info('Loaded settings from DB')
        } catch (err: any) {
            logger.error('Failed to load settings:', { error: err })
        } finally {
            pendingChanges.value = {}
            isLoading = false
        }
    }

    async function initUserProfile() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { error: upsertError } = await supabase
            .from('user_profiles')
            .upsert(
                { user_id: user.id },
                { onConflict: 'user_id', ignoreDuplicates: true }
            )

        if (upsertError) {
            logger.error('Failed to init profile:', { error: upsertError })
            return
        }

        await loadSettings()
    }

    eventBus.on('auth:success', async () => {
        // Capture consent the user may have toggled on the sign-in screen
        // before they had an account — loadSettings() will overwrite these with
        // DB defaults (false) unless we re-apply them afterward.
        const preAuthAnalytics    = analyticsConsent.value
        const preAuthDiagnostics  = diagnosticsConsent.value

        await initUserProfile()

        // isLoading is now false; watchers will queue saves normally.
        if (preAuthAnalytics)   analyticsConsent.value   = true
        if (preAuthDiagnostics) diagnosticsConsent.value = true
    })

    eventBus.on('auth:logout', () => {
        loadDefaults()
    })

    function setGameDirPath(platform: string, path: string) {
        gameDirPaths.value = { ...gameDirPaths.value, [platform]: path }
    }

    async function scanGameDir(dirPath: string) {
        if (!dirPath) { gameVersion.value = ''; return }
        const result = await window.gameAPI.scanDir(dirPath)
        gameVersion.value = result.version ?? ''
    }

    async function saveUsername(value: string): Promise<{ success: boolean; error?: string }> {
        const trimmed = value.trim()
        if (!trimmed) return { success: false, error: 'Username cannot be empty' }
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(trimmed))
            return { success: false, error: 'Username must be 3–24 characters: letters, numbers, underscores only' }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not signed in' }

        const { error } = await supabase
            .from('user_profiles')
            .update({ username: trimmed })
            .eq('user_id', user.id)

        if (error) {
            const msg = error.code === '23505'
                ? 'Username already taken'
                : error.message
            return { success: false, error: msg }
        }
        username.value = trimmed
        return { success: true }
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
        fileAssoc,
        gamePlatform,
        gameDirPaths,
        gameVersion,
        licenseAccepted,
        analyticsConsent,
        diagnosticsConsent,
        username,
        allowApiAccess,
        saveUsername,
        setGameDirPath,
        scanGameDir,
        checkDebugger,
        enableDebugger,
        disableDebugger,
        loadDefaults,
        loadSettings,
        initUserProfile,
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
            'fileAssoc',
            'gamePlatform',
            'gameDirPaths',
            'gameVersion',
            'backendVersion',
            'licenseAccepted',
            'analyticsConsent',
            'diagnosticsConsent',
            'username',
            'allowApiAccess',
        ],
    },
})
