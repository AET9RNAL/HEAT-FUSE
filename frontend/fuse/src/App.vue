<script setup lang="ts">
import Titlebar from './components/Titlebar.vue'
import AppMain from './components/AppMain.vue'
import AppAuth from './components/AppAuth.vue'
import AppResetPassword from './components/AppResetPassword.vue'
import eNotification from './components/eNotification.vue'
import ePluginConfig from './components/ePluginConfig.vue'
import eSimpleModal from './components/eSimpleModal.vue'
import eLicense from './components/eLicense.vue'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useExtendedAuthStore } from './stores/extendedauth'
import { usePluginsStore } from './stores/plugins'
import { useNavigationStore } from './stores/navigation'
import { useHeatStatsStore } from './stores/heatStats'
import { useSuspension } from './composables/useSuspension'
import { useFuseControl } from './composables/useFuseControl'
import { useFuseLogs } from './composables/useFuseLogs'
import { useDiscordPresence } from './composables/useDiscordPresence'
import { usePostHog } from './composables/usePostHog'
import { eventBus } from './events/eventBus'
import { useI18n } from './composables/useI18n'
import { ref, computed, watch, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import packageJson from '../package.json'

const appStore = useAppStore()
const authStore = useAuthStore()
useExtendedAuthStore()
const pluginsStore = usePluginsStore()
const navStore = useNavigationStore()
useHeatStatsStore()
const { t } = useI18n()

// Register deep-link listener early (before any component mounts)
// Handles second-instance deep links while app is running
window.appAPI?.onDeepLink?.((route: string, params: Record<string, string>) => {
    if (route === 'reset-password') {
        authStore.handlePasswordRecoveryDeepLink(params)
    }
})

watch(() => authStore.isSignedIn(), (signedIn) => {
    if (!signedIn && navStore.selectedOption === 'account') {
        navStore.selectOption('home')
    }
})
useDiscordPresence()
usePostHog()
const { register: registerLogs } = useFuseLogs()

type NotificationType = 'success' | 'warning' | 'error'
const notification = ref<{ title?: string; message: string; type?: NotificationType } | null>(null)
const activePluginConfigId = ref<string | null>(null)
const activePlugin = computed(() =>
    activePluginConfigId.value
        ? pluginsStore.plugins.find(p => p.plugin_id === activePluginConfigId.value) ?? null
        : null
)

const showAuth = computed(() => ['welcome', 'auth', 'otp', 'forgot-password'].includes(authStore.screen))
const showResetPassword = computed(() => authStore.screen === 'reset-password')

function showNotification(payload: { title?: string; message: string; type?: NotificationType }) {
    notification.value = payload
}

function openPluginConfig({ plugin_id }: { plugin_id: string }) {
    activePluginConfigId.value = plugin_id
}

function handleUpdateFound({ version }: { version: string }) {
    showNotification({
        title: t('components.updateProgress.notifFoundTitle'),
        message: t('components.updateProgress.notifFoundMessage', { version }),
    })
}

function handleUpdateDownloading() {
    showNotification({
        title: t('components.updateProgress.notifDownloadingTitle'),
        message: t('components.updateProgress.notifDownloadingMessage'),
    })
}

function handleUpdateInstalled() {
    showNotification({
        title: t('components.updateProgress.notifReadyTitle'),
        message: t('components.updateProgress.notifReadyMessage'),
    })
}

function handleUpdateError({ message }: { message: string }) {
    showNotification({
        title: t('components.updateProgress.notifErrorTitle'),
        message: message,
        type: 'error',
    })
}

let appInitialized = false

watch(() => appStore.licenseAccepted, async (accepted) => {
    if (!accepted || appInitialized) return
    appInitialized = true

    useSuspension()
    useFuseControl()
    registerLogs()

    appStore.appVersion = packageJson.version
    const dir = appStore.gameDirPaths[appStore.gamePlatform]
    if (dir) appStore.scanGameDir(dir)

    eventBus.on('notification', showNotification)
    eventBus.on('plugin-config:open', openPluginConfig)
    eventBus.on('update:found', handleUpdateFound)
    eventBus.on('update:downloading', handleUpdateDownloading)
    eventBus.on('update:installed', handleUpdateInstalled)
    eventBus.on('update:error', handleUpdateError)

    await authStore.initializeAuth()
}, { immediate: true })

onUnmounted(() => {
    eventBus.off('notification', showNotification)
    eventBus.off('plugin-config:open', openPluginConfig)
    eventBus.off('update:found', handleUpdateFound)
    eventBus.off('update:downloading', handleUpdateDownloading)
    eventBus.off('update:installed', handleUpdateInstalled)
    eventBus.off('update:error', handleUpdateError)
})
</script>

<template>
  <Titlebar v-once />
  <AppMain v-if="appStore.licenseAccepted" />

  <AnimatePresence>
    <eLicense v-if="!appStore.licenseAccepted" @close="() => {}" />
  </AnimatePresence>

  <!-- Auth overlay (sit above AppMain) -->
  <AnimatePresence>
    <AppAuth v-if="appStore.licenseAccepted && showAuth" key="auth" />
  </AnimatePresence>
  <AnimatePresence>
    <AppResetPassword v-if="appStore.licenseAccepted && showResetPassword" key="reset" />
  </AnimatePresence>

  <!-- Notification toast -->
  <AnimatePresence>
    <motion.div
      v-if="notification"
      class="notification-anchor"
      :initial="{ opacity: 0, y: 12 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: 12 }"
      :transition="{ duration: 0.2 }"
    >
      <eNotification
        :title="notification.title"
        :message="notification.message"
        :type="notification.type"
        @close="notification = null"
      />
    </motion.div>
  </AnimatePresence>

  <!-- Plugin config window (root-level) -->
  <AnimatePresence>
    <ePluginConfig
      v-if="activePlugin"
      :plugin="activePlugin"
      @close="activePluginConfigId = null"
    />
  </AnimatePresence>

  <!-- Unsaved changes bar -->
  <eSimpleModal />
</template>

<style scoped>
.notification-anchor {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: 9999;
}
</style>
