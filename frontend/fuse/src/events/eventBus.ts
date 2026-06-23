import mitt from 'mitt'

type Events = {
    'app:ready': void
    'settings:loaded': void

    // Agent lifecycle
    'agent:spawning': void
    'agent:spawn_failed': { error: string }
    'agent:started': { pid: number; port: number }
    'agent:connecting': void
    'agent:connected': void
    'agent:connect_failed': { error: string }
    'agent:disconnected': { reason?: string }
    'agent:stopping': void
    'agent:stopped': { code?: number | null; signal?: string | null }
    'agent:crashed': { code: number | null; signal: string | null }
    'agent:error': { error: string }
}

export const eventBus = mitt<Events>()
