import { ref, readonly } from 'vue'
import { logger } from '../utils/logger'

export interface LogEntry {
    id: number
    level: 'info' | 'warn' | 'error' | 'debug'
    text: string
    timestamp: number
}

const entries = ref<LogEntry[]>([])
let nextId = 0
let _registered = false

export function useFuseLogs() {
    function register() {
        if (_registered) return
        _registered = true
        window.fuseAPI.onLog(({ level, text, timestamp }) => {
            entries.value.push({ id: nextId++, level: level as LogEntry['level'], text, timestamp })
            if (entries.value.length > 2000) entries.value.splice(0, entries.value.length - 2000)
            if (level === 'warn') logger.warn(`[host] ${text}`, { timestamp })
            else if (level === 'error') logger.error(`[host] ${text}`, { timestamp })
        })
    }

    function clear() {
        entries.value = []
    }

    return { entries: readonly(entries), register, clear }
}
