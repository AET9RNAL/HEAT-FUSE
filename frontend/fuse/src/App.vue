<script setup lang="ts">
import Titlebar from './components/layout/Titlebar.vue'
import AppMain from './components/layout/AppMain.vue'
import AppWelcome from './components/welcome/AppWelcome.vue'
import AppResetPassword from './components/welcome/AppResetPassword.vue'
import eNotification from './components/ui/eNotification.vue'
import ePluginConfig from './components/plugins/ePluginConfig.vue'
import eSimpleModal from './components/dialogs/eSimpleModal.vue'
import eLicense from './components/dialogs/eLicense.vue'
import eReleaseNotes from './components/dialogs/eReleaseNotes.vue'
import eTooltip from './components/ui/eTooltip.vue'
import eFtue from './components/ftue/eFtue.vue'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useExtendedAuthStore } from './stores/extendedauth'
import { usePluginsStore } from './stores/plugins'
import { useNavigationStore } from './stores/navigation'
import { useSuspension } from './composables/useSuspension'
import { useFuseControl } from './composables/useFuseControl'
import { useFuseLogs } from './composables/useFuseLogs'
import { useDiscordPresence } from './composables/useDiscordPresence'
import { usePostHog } from './composables/usePostHog'
import { useAppTour } from './composables/useAppTour'
import { eventBus } from './events/eventBus'
import { useI18n, setI18nLocale } from './composables/useI18n'
import { ref, computed, watch, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import packageJson from '../package.json'

const appStore = useAppStore()
const authStore = useAuthStore()
useExtendedAuthStore()
const pluginsStore = usePluginsStore()
const navStore = useNavigationStore()
const { t } = useI18n()
watch(() => appStore.appLanguage, setI18nLocale, { immediate: true })

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

// The four sign-in/up variants, the OTP screen and onboarding all share the
// welcome shell's split layout.
const showWelcome = computed(() => authStore.inWelcomeFlow)
const showResetPassword = computed(() => authStore.screen === 'reset-password')
// Queues behind the license gate and the auth overlays, both full-screen.
const showReleaseNotes = computed(() =>
    appStore.releaseNotesOpen && appStore.licenseAccepted && !showWelcome.value && !showResetPassword.value
)

const ftueLabels = computed(() => ({
    skip: t('ftue.skip'),
    start: t('ftue.start'),
    back: t('ftue.back'),
    next: t('ftue.next'),
    done: t('ftue.done'),
    skipHold: [t('ftue.skipHold1'), t('ftue.skipHold2'), t('ftue.skipHold3')],
    sample: t('ftue.sample'),
}))

// auth.screen starts as 'main' before auth decides, so the tour also waits for boot.
const bootDone = ref(false)
const appTour = useAppTour()
const tourReady = computed(() =>
    bootDone.value
    && appStore.onboardingComplete
    && authStore.screen === 'main'
    && !showWelcome.value
    && !showResetPassword.value
    && !appStore.releaseNotesOpen
)
watch(tourReady, (ready) => { if (ready) appTour.runOnce() })

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


function watchGameConfig() {
    appStore.watchGameConfig((cfg) => {
        const prevEnabled = appStore.gameConfigEnabled
        const prevPort = appStore.gameConfigPort
        appStore.applyGameConfigRead(cfg)
        if (appStore.gameConfigEnabled === prevEnabled && appStore.gameConfigPort === prevPort) return
        const parts: string[] = []
        if (appStore.gameConfigEnabled !== prevEnabled) {
            parts.push(t(appStore.gameConfigEnabled ? 'appsettings.gameConfig.nowEnabled' : 'appsettings.gameConfig.nowDisabled'))
        }
        if (appStore.gameConfigPort !== prevPort) {
            parts.push(t('appsettings.gameConfig.portNow', { port: String(appStore.gameConfigPort ?? '-') }))
        }
        showNotification({
            title: t('appsettings.gameConfig.changedTitle'),
            message: parts.join(' '),
            type: appStore.gameConfigValid ? 'success' : 'warning',
        })
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
    if (dir) {
        appStore.scanGameDir(dir)
        void appStore.refreshGameConfig(dir)
    }
    watchGameConfig()

    eventBus.on('notification', showNotification)
    eventBus.on('plugin-config:open', openPluginConfig)
    eventBus.on('update:found', handleUpdateFound)
    eventBus.on('update:downloading', handleUpdateDownloading)
    eventBus.on('update:installed', handleUpdateInstalled)
    eventBus.on('update:error', handleUpdateError)

    try {
        // Logged-In? YES routes itself (main, or onboarding when incomplete).
        const restored = await authStore.initializeAuth()
        // Logged-In? NO -> Wish to log-in? Only worth asking once: a user who
        // already went through onboarding answered it, so don't re-prompt on
        // every launch. Signing in later is still available from the sidebar.
        if (!restored.success) {
            authStore.setScreen(appStore.onboardingComplete ? 'main' : 'welcome')
        }
    } finally {
        // After auth: lastSeenVersion is the DB value, not just the local one.
        // Runs even if session restore failed - notes are not auth-gated.
        await appStore.checkReleaseNotes()
        bootDone.value = true
    }
}, { immediate: true })

onUnmounted(() => {
    eventBus.off('notification', showNotification)
    eventBus.off('plugin-config:open', openPluginConfig)
    eventBus.off('update:found', handleUpdateFound)
    eventBus.off('update:downloading', handleUpdateDownloading)
    eventBus.off('update:installed', handleUpdateInstalled)
    eventBus.off('update:error', handleUpdateError)
    appStore.unwatchGameConfig()
})
</script>

<template>
  <Titlebar v-once />
  <AppMain v-if="appStore.licenseAccepted" />

  <AnimatePresence>
    <eLicense v-if="!appStore.licenseAccepted" @close="() => {}" />
  </AnimatePresence>

  <!-- Welcome shell: auth, OTP and onboarding, above AppMain -->
  <AnimatePresence>
    <AppWelcome v-if="appStore.licenseAccepted && showWelcome" key="welcome" />
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

  <!-- Release notes, once per version after an update -->
  <AnimatePresence>
    <eReleaseNotes
      v-if="showReleaseNotes"
      key="release-notes"
      :version="appStore.appVersion"
      :notes="appStore.releaseNotes?.notes ?? ''"
      :release-date="appStore.releaseNotes?.releaseDate"
      :url="appStore.releaseNotes?.url"
      :loading="appStore.releaseNotesLoading"
      @close="appStore.dismissReleaseNotes()"
    />
  </AnimatePresence>

  <!-- Unsaved changes bar -->
  <eSimpleModal />

  <!-- FTUE tours: card and highlight for every v-ftue target -->
  <eFtue :labels="ftueLabels" />

  <!-- Shared tooltip for every v-tip -->
  <eTooltip />
</template>

<style scoped>
.notification-anchor {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: 9999;
}
</style>
