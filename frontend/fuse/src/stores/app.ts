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
    const lastSeenVersion = ref<string>('')

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
        lastSeenVersion:        { ref: lastSeenVersion,        db: 'last_seen_version',           default: '' },
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

    // `auth:success` starts the profile load out-of-band, so startup code that reads
    // a synced setting must await this or it sees the pre-load default instead.
    let settingsLoaded: Promise<void> = Promise.resolve()
    let finishSettingsLoad: (() => void) | null = null

    function beginSettingsLoad() {
        if (finishSettingsLoad) return
        settingsLoaded = new Promise<void>(resolve => { finishSettingsLoad = resolve })
    }

    function endSettingsLoad() {
        finishSettingsLoad?.()
        finishSettingsLoad = null
    }

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
        beginSettingsLoad()
        // Capture consent the user may have toggled on the sign-in screen
        // before they had an account — loadSettings() will overwrite these with
        // DB defaults (false) unless we re-apply them afterward.
        const preAuthAnalytics    = analyticsConsent.value
        const preAuthDiagnostics  = diagnosticsConsent.value

        try {
            await initUserProfile()

            // isLoading is now false; watchers will queue saves normally.
            if (preAuthAnalytics)   analyticsConsent.value   = true
            if (preAuthDiagnostics) diagnosticsConsent.value = true
        } finally {
            endSettingsLoad()
        }

        void checkReleaseNotes()
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

    // Release notes ("what's new" after an update)

    // A fresh install has no recorded version - record it silently rather than
    // greeting a first-time user with the changelog.
    const SHOW_NOTES_ON_FIRST_RUN = false

    interface ReleaseNotesEntry {
        version: string
        notes: string
        releaseDate?: string
        url?: string
    }

    const releaseNotes = ref<ReleaseNotesEntry | null>(null)
    const releaseNotesLoading = ref<boolean>(false)
    const releaseNotesOpen = ref<boolean>(false)

    async function fetchReleaseNotes(version = appVersion.value, refresh = false): Promise<ReleaseNotesEntry | null> {
        if (!version) return null
        if (!refresh && releaseNotes.value?.version === version) return releaseNotes.value

        releaseNotesLoading.value = true
        try {
            const result = await window.updateAPI?.getReleaseNotes(version, { refresh })
            if (result && !result.success) {
                logger.warn('Release notes lookup failed:', { error: result.error })
            }
            releaseNotes.value = result?.entry ?? null
            return releaseNotes.value
        } catch (err: any) {
            logger.error('Failed to load release notes:', { error: err })
            return null
        } finally {
            releaseNotesLoading.value = false
        }
    }

    // Dev only
    function forceReleaseNotes(): boolean {
        try {
            return import.meta.env.DEV && localStorage.getItem('fuse:force-release-notes') === '1'
        } catch {
            return false
        }
    }

    // Auto-show once per version, right after an update installed.
    async function checkReleaseNotes() {
        const version = appVersion.value
        if (!version) return

        await settingsLoaded

        const forced = forceReleaseNotes()
        logger.info('[release-notes] check', { version, lastSeen: lastSeenVersion.value, forced })

        if (!forced) {
            if (lastSeenVersion.value === version) return

            if (!lastSeenVersion.value && !SHOW_NOTES_ON_FIRST_RUN) {
                lastSeenVersion.value = version
                return
            }
        }

        const entry = await fetchReleaseNotes(version)
        logger.info('[release-notes] fetched', { version, hasNotes: !!entry?.notes })
        // No notes yet (draft release, offline) - leave lastSeenVersion alone so
        // the next launch retries.
        if (!entry?.notes) return
        releaseNotesOpen.value = true
    }

    // TO-DO wire that up in AppAbout
    async function openReleaseNotes(refresh = false) {
        releaseNotesOpen.value = true
        await fetchReleaseNotes(appVersion.value, refresh)
    }

    // Dismiss marks the version seen - a crash before dismiss re-shows it.
    function dismissReleaseNotes() {
        releaseNotesOpen.value = false
        if (appVersion.value) lastSeenVersion.value = appVersion.value
    }

    if (import.meta.env.DEV) {
        // Console testing
        ;(window as any).__fuseNotes = {
            check: checkReleaseNotes,
            open:  openReleaseNotes,
            fetch: fetchReleaseNotes,
            state: () => ({
                appVersion:  appVersion.value,
                lastSeen:    lastSeenVersion.value,
                open:        releaseNotesOpen.value,
                loading:     releaseNotesLoading.value,
                notesLength: releaseNotes.value?.notes.length ?? 0,
            }),
        }
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
        lastSeenVersion,
        releaseNotes,
        releaseNotesLoading,
        releaseNotesOpen,
        fetchReleaseNotes,
        checkReleaseNotes,
        openReleaseNotes,
        dismissReleaseNotes,
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
            'lastSeenVersion',
        ],
    },
})
