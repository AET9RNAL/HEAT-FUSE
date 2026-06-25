<script setup lang="ts">
import Titlebar from './components/Titlebar.vue'
import AppMain from './components/AppMain.vue'
import eNotification from './components/eNotification.vue'
import { useAppStore } from './stores/app'
import { useSuspension } from './composables/useSuspension'
import { useFuseControl } from './composables/useFuseControl'
import { useFuseLogs } from './composables/useFuseLogs'
import { eventBus } from './events/eventBus'
import { ref, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import packageJson from '../package.json'

const appStore = useAppStore()
useSuspension()
useFuseControl()
const { register: registerLogs } = useFuseLogs()

const notification = ref<{ title?: string; message: string } | null>(null)

function showNotification(payload: { title?: string; message: string }) {
    notification.value = payload
}

onMounted(() => {
    registerLogs()
    appStore.appVersion = packageJson.version
    const dir = appStore.gameDirPaths[appStore.gamePlatform]
    if (dir) appStore.scanGameDir(dir)
    eventBus.on('notification', showNotification)
})

onUnmounted(() => {
    eventBus.off('notification', showNotification)
})
</script>

<template>
  <Titlebar v-once />
  <AppMain />
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
</template>

<style scoped>
.notification-anchor {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: 9999;
}
</style>
