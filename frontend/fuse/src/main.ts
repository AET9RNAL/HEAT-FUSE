import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import * as Sentry from '@sentry/electron/renderer'
import posthog from 'posthog-js'
import './style.css'
import App from './App.vue'
import vTruncateTitle from './directives/vTruncateTitle'

if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN as string })
}

if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
        api_host: 'https://us.i.posthog.com',
    })
}

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.directive('truncate-title', vTruncateTitle)

app.mount('#app')
