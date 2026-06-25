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

    // Notifications
    'notification': { title?: string; message: string }

    // Plugin lifecycle
    'fuse:stalled': { stale_seconds: number }
    'plugin:registered': { plugin_id: string; name: string; version: string; description: string; status: string; configSchema: unknown[]; hotkeys: { action: string; combo: string }[] }
    'plugin:deregistered': { plugin_id: string }
    'plugin:status_changed': { plugin_id: string; status: string }

    // Plugin config / keybinds
    'config:value_changed': { plugin_id: string; key: string; value: unknown }
    'hotkey:rebound': { plugin_id: string; action: string; combo: string }
    'plugin-config:open': { plugin_id: string }
    'plugin-config:dirty': { plugin_id: string; pendingConfig: Record<string, unknown>; pendingHotkeys: Record<string, string> }
    'plugin-config:saved': { plugin_id: string }
    'plugin-config:reset': { plugin_id: string }
}

export const eventBus = mitt<Events>()
