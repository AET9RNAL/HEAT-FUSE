<script setup lang="ts">
import { motion, AnimatePresence } from 'motion-v'
import AppSidebar from './AppSidebar.vue'
import AppTab from './AppTab.vue'
</script>

<template>
  <div class="app-main-wrapper">
    <AnimatePresence>
      <motion.div
        class="app-main"
        key="main"
        :initial="{ '--dot-radius': '0%', filter: 'blur(8px) brightness(1.4) saturate(1.3)' }"
        :animate="{ '--dot-radius': '150%', filter: 'blur(0px) brightness(1) saturate(1)' }"
        :transition="{ duration: 1, ease: 'easeOut' }"
      >
        <AppSidebar />
        <AppTab />
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.app-main-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1;
  background-color: rgba(7, 9, 14, 0.5);
}

.app-main {
  --dot-radius: 150%;
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  --glow-size: 40%;
  mask-image: radial-gradient(circle at center, black 0%, black calc(var(--dot-radius) - var(--glow-size)), transparent var(--dot-radius));
  -webkit-mask-image: radial-gradient(circle at center, black 0%, black calc(var(--dot-radius) - var(--glow-size)), transparent var(--dot-radius));
  mask-size: 4px 4px;
  -webkit-mask-size: 4px 4px;
  mask-repeat: repeat;
  -webkit-mask-repeat: repeat;
  background-color: var(--glass-surfaces-elevated-900);
}
</style>
