import mitt from 'mitt'

type Events = {
    'auth:success': void
    'auth:error': void
    'auth:logout': void

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

    // Notifications
    'notification': { title?: string; message: string; type?: 'success' | 'warning' | 'error' }

    // Update lifecycle
    'update:found':       { version: string }
    'update:downloading': void
    'update:installed':   void
    'update:error':       { message: string }

    // Plugin lifecycle
    'fuse:stalled': { stale_seconds: number }
    'plugin:registered': { plugin_id: string; name: string; version: string; description: string; status: string; configSchema: unknown[]; hotkeys: { action: string; combo: string }[] }
    'plugin:deregistered': { plugin_id: string }
    'plugin:status_changed': { plugin_id: string; status: string }

    // Plugin config / keybinds
    'config:value_changed': { plugin_id: string; key: string; value: unknown }
    'hotkey:rebound': { plugin_id: string; action: string; combo: string }
    'plugin-config:open': { plugin_id: string }
    'plugin-config:saved': { plugin_id: string }
    'plugin-config:reset': { plugin_id: string }

    // Heat Stats
    'heat_stats.session_complete': {
        type: string
        session_id: string
        started_at: number
        ended_at: number
        duration_s: number
        outcome: string
        map_slug: string | null
        map_name: string | null
        game_mode: string | null
        player_name: string | null
        player_vehicle: string | null
        player_role: string | null
        player_agent_id: number | null
        final_kills: number
        final_deaths: number
        final_assists: number | null
        final_damage: number
        final_ally_score: number
        final_enemy_score: number
        peak_ping: number
        avg_ping: number
        avg_fps: number
        sample_count: number
        hmac_hex: string
        samples: Record<string, unknown>[]
        client_version: string
    }

    // Navigation
    'navigate:discover': { projectId?: string }

    // Universal floating action bar
    'modal:pending': {
        label: string
        saveLabel?: string
        cancelLabel?: string
        onConfirm: () => Promise<void> | void
        onCancel?: () => void
    }
    'modal:dismiss': void
}

export const eventBus = mitt<Events>()
