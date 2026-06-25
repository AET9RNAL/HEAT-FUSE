<script setup lang="ts">
import Titlebar from './components/Titlebar.vue'
import AppMain from './components/AppMain.vue'
import eNotification from './components/eNotification.vue'
import ePluginConfig from './components/ePluginConfig.vue'
import eSimpleModal from './components/eSimpleModal.vue'
import { useAppStore } from './stores/app'
import { usePluginsStore } from './stores/plugins'
import { useSuspension } from './composables/useSuspension'
import { useFuseControl } from './composables/useFuseControl'
import { useFuseLogs } from './composables/useFuseLogs'
import { eventBus } from './events/eventBus'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import packageJson from '../package.json'

const appStore = useAppStore()
const pluginsStore = usePluginsStore()
useSuspension()
useFuseControl()
const { register: registerLogs } = useFuseLogs()

const notification = ref<{ title?: string; message: string } | null>(null)
const activePluginConfigId = ref<string | null>(null)
const activePlugin = computed(() =>
    activePluginConfigId.value
        ? pluginsStore.plugins.find(p => p.plugin_id === activePluginConfigId.value) ?? null
        : null
)

function showNotification(payload: { title?: string; message: string }) {
    notification.value = payload
}

function openPluginConfig({ plugin_id }: { plugin_id: string }) {
    activePluginConfigId.value = plugin_id
}

onMounted(() => {
    registerLogs()
    appStore.appVersion = packageJson.version
    const dir = appStore.gameDirPaths[appStore.gamePlatform]
    if (dir) appStore.scanGameDir(dir)
    eventBus.on('notification', showNotification)
    eventBus.on('plugin-config:open', openPluginConfig)
})

onUnmounted(() => {
    eventBus.off('notification', showNotification)
    eventBus.off('plugin-config:open', openPluginConfig)
})
</script>

<template>
  <Titlebar v-once />
  <AppMain />

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
