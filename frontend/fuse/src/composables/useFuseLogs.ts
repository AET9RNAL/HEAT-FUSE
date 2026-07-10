import { ref, readonly } from 'vue'
import { logger } from '../utils/logger'
import { eventBus } from '../events/eventBus'
import { useI18n } from './useI18n'

// Matches the backend log for a plugin skipped due to an unmet dependency, e.g.
const DEPENDENCY_SKIP_RE = /Plugin '([^']+)'[^']*missing required dependency:\s*'([^']+)'/i

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
    const { t } = useI18n()

    function register() {
        if (_registered) return
        _registered = true
        window.fuseAPI.onLog(({ level, text, timestamp }) => {
            entries.value.push({ id: nextId++, level: level as LogEntry['level'], text, timestamp })
            if (entries.value.length > 2000) entries.value.splice(0, entries.value.length - 2000)
            if (level === 'warn') logger.warn(`[host] ${text}`, { timestamp })
            else if (level === 'error') logger.error(`[host] ${text}`, { timestamp })

            // Surface unmet-dependency skips as a toasst
            if (level === 'error') {
                const match = DEPENDENCY_SKIP_RE.exec(text)
                if (match) {
                    eventBus.emit('notification', {
                        title: t('components.notification.dependencyErrorTitle'),
                        message: t('components.notification.dependencyErrorMessage', {
                            plugin: match[1],
                            dependency: match[2],
                        }),
                        type: 'error',
                    })
                }
            }
        })
    }

    function clear() {
        entries.value = []
    }

    return { entries: readonly(entries), register, clear }
}
