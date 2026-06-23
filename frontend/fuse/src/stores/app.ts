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

    // ── Refs ──

    const appVersion = ref<string>('')
    const appLanguage = ref<AppLanguage>('en')
    const autostart = ref<boolean>(false)
    const minimizeToTray = ref<boolean>(false)
    const checkUpdatesOnStartup = ref<boolean>(true)

    // ── Setting registry ──
    // Each entry maps a ref to a DB column key and a load default.
    // Adding a setting = one line here.

    interface SettingEntry {
        ref: Ref<any>
        db: string
        default: any
    }

    const registry: Record<string, SettingEntry> = {
        appLanguage:           { ref: appLanguage,           db: 'app_language',              default: 'en' },
        autostart:             { ref: autostart,             db: 'autostart',                 default: false },
        minimizeToTray:        { ref: minimizeToTray,        db: 'minimize_to_tray',          default: false },
        checkUpdatesOnStartup: { ref: checkUpdatesOnStartup, db: 'check_updates_on_startup',  default: true },
    }

    // ── Batched save system (stub — wire DB when auth is ready) ──

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

    // ── Electron IPC sync ──

    watch(autostart, (value) => {
        window.appAPI?.setAutostart(value)
    })

    // ── Load / init ──

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

    return {
        appVersion,
        appLanguage,
        autostart,
        minimizeToTray,
        checkUpdatesOnStartup,
        loadDefaults,
    }
}, {
    persist: {
        pick: [
            'appLanguage',
            'autostart',
            'minimizeToTray',
            'checkUpdatesOnStartup',
        ],
    },
})
