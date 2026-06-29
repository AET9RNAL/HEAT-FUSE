import { supabase } from '../composables/supabase-client'

type LogData = Record<string, unknown>

let _diagnosticsAllowed = false

/**
 * Updated by the app store whenever the diagnostics consent toggle changes.
 * When false, remote log delivery is suppressed (console output in DEV stays on).
 */
export function setDiagnosticsConsent(allowed: boolean) {
    _diagnosticsAllowed = allowed
}

async function post(level: 'warn' | 'error', message: string, data?: LogData) {
    if (!_diagnosticsAllowed) return
    await supabase.functions.invoke('logger', {
        body: { level, message, ...data, dt: new Date().toISOString() },
    }).catch(() => {})
}

export const logger = {
    info:  (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.info(msg, data ?? '') },
    warn:  (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.warn(msg, data ?? ''); post('warn',  msg, data) },
    error: (msg: string, data?: LogData) => { if (import.meta.env.DEV) console.error(msg, data ?? ''); post('error', msg, data) },
}
