import posthog from 'posthog-js'
import { watch } from 'vue'
import { eventBus } from '../events/eventBus'
import { supabase } from './supabase-client'
import { useAppStore } from '../stores/app'

let initialized = false

export function usePostHog() {
    const appStore = useAppStore()

    if (!initialized) {
        initialized = true
        posthog.init('phc_xcEB8zXeV7XTWWV5Fw3LJ7pq2iyPgUXcBBqoheJYKA9a', {
            api_host: 'https://us.i.posthog.com',
            defaults: '2026-05-30',
            opt_out_capturing_by_default: true,
        })

        eventBus.on('auth:success', async () => {
            if (!appStore.analyticsConsent) return
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                posthog.identify(user.id, { email: user.email })
            }
        })

        eventBus.on('auth:logout', () => {
            posthog.reset()
        })

        // React to consent toggle in real time
        watch(() => appStore.analyticsConsent, (allowed) => {
            if (allowed) {
                posthog.opt_in_capturing()
            } else {
                posthog.opt_out_capturing()
                posthog.reset()
            }
        }, { immediate: true })
    }

    return { posthog }
}
