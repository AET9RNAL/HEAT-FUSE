<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNavigationStore } from '../stores/navigation'
import { motion, AnimatePresence } from 'motion-v'
import { Dynamics } from '../composables/useMotion'
import AppHome from './AppHome.vue'
import AppSettings from './AppSettings.vue'
import AppDiscover from './AppDiscover.vue'
import AppAbout from './AppAbout.vue'

const store = useNavigationStore()
const containerRef = ref<HTMLElement>()

const tabComponents = {
  home:     AppHome,
  discover: AppDiscover,
  settings: AppSettings,
  about:    AppAbout,
} as const

const currentComponent = computed(() => tabComponents[store.selectedOption])

// Freeze exiting tab DOM before transition — replaces live component tree
// with a static snapshot so the exit animation composites a lightweight raster.
watch(() => store.selectedOption, () => {
  const container = containerRef.value
  if (!container) return
  const exitingWrapper = container.querySelector('.tab-wrapper')
  if (!exitingWrapper) return
  exitingWrapper.innerHTML = exitingWrapper.innerHTML
}, { flush: 'sync' })
</script>

<template>
  <div ref="containerRef" class="container main-ui-gradient">
    <AnimatePresence mode="popLayout">
      <motion.div
        :key="store.selectedOption"
        :initial="{ opacity: 0, scale: 1, x: 25, y: 25 }"
        :animate="{ opacity: 1, scale: 1, x: 0, y: 0 }"
        :exit="{ opacity: 0, scale: 0.9, x: -25, y: -25 }"
        :transition="Dynamics.smooth"
        class="tab-wrapper"
      >
        <component :is="currentComponent" />
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.container {
  flex: 1;
  height: 100%;
  width: 100%;
  min-width: 0;
  padding: var(--space-4);
  position: relative;
}

.container::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 1px solid transparent;
  border-image: linear-gradient(to right, rgba(102, 102, 102, 1), rgba(0, 0, 0, 0)) 1;
}

.tab-wrapper {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overflow-anchor: none;
  padding-right: var(--space-2);
  contain: layout style paint;
  
}

.tab-wrapper::-webkit-scrollbar { width: 6px; }
.tab-wrapper::-webkit-scrollbar-track { background: transparent; }
.tab-wrapper::-webkit-scrollbar-thumb {
  background-color: hsla(0, 0%, 100%, 0.15);
  border-radius: 4px;
  border-left: 4px solid transparent;
  background-clip: padding-box;
}
.tab-wrapper::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.25);
}
</style>
