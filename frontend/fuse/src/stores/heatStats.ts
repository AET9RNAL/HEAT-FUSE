import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../composables/supabase-client'
import { eventBus } from '../events/eventBus'
import { logger } from '../utils/logger'

interface SessionPayload {
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

export const useHeatStatsStore = defineStore('heatStats', () => {
    const submitting    = ref(false)
    const lastError     = ref<string | null>(null)
    const lastSessionId = ref<string | null>(null)

    async function submitSession(payload: SessionPayload): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            logger.warn('heat_stats: not authenticated — skipping submit')
            return
        }

        submitting.value = true
        lastError.value  = null

        try {
            const res = await supabase.functions.invoke('stats-submit', { body: payload })
            if (res.error) throw res.error
            lastSessionId.value = (res.data as { id: string }).id
            logger.info('heat_stats: session submitted', { id: lastSessionId.value })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            lastError.value = msg
            logger.error('heat_stats: submit failed', { error: msg })
        } finally {
            submitting.value = false
        }
    }

    eventBus.on('heat_stats.session_complete', (msg) => {
        submitSession(msg as SessionPayload)
    })

    return { submitting, lastError, lastSessionId, submitSession }
})
