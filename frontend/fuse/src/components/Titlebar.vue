<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import EStatus, { type StatusState } from './eStatus.vue'
import { useI18n } from '../composables/useI18n'
import { useNavigationStore } from '../stores/navigation'
import { useFuseControl } from '../composables/useFuseControl'
import AppLogoFull from '../assets/icons/app-logo-full.svg'

const { t } = useI18n()
const nav = useNavigationStore()
const closeWindow    = () => window.appAPI?.closeWindow()
const minimizeWindow = () => window.appAPI?.minimizeWindow()
const maximizeWindow = () => window.appAPI?.maximizeWindow()

const { fuseState, fuseError } = useFuseControl()

const statusState = computed<StatusState>(() => {
  const map: Record<string, StatusState> = {
    spawning:   'Initializing',
    connecting: 'Connecting',
    running:    'Running',
    error:      'Error',
    stopping:   'Connecting',
  }
  return map[fuseState.value] ?? 'None'
})

const statusLabel = computed(() => {
  if (fuseState.value === 'error') return fuseError.value || t('components.status.error')
  return t(`components.status.${statusState.value.toLowerCase()}`)
})

const pageTitle = computed(() => t(`appnav.${nav.selectedOption}`))
</script>

<template>
  <header class="titlebar" role="banner">
    <div class="left-group">
      <div class="logo-holder">
        <img :src="AppLogoFull" class="app-logo" alt="HEAT FUSE" />
      </div>
      <h2 class="page-title">{{ pageTitle }}</h2>
    </div>
    <div class="right-group">
      <EStatus :state="statusState" :status="statusLabel" />
      <div class="controls" role="group" :aria-label="t('apptitlebar.windowControls')">
        <button type="button" class="btn" :title="t('apptitlebar.minimize')" @click="minimizeWindow">
          <Icons kind="minimize" size="small" />
        </button>
        <button type="button" class="btn" :title="t('apptitlebar.maximize')" @click="maximizeWindow">
          <Icons kind="maximize" size="small" />
        </button>
        <motion.button
          type="button"
          class="btn close"
          :title="t('apptitlebar.close')"
          :aria-label="t('apptitlebar.close')"
          @click="closeWindow"
          :initial="{ scale: 1 }"
          :animate="{ scale: 1 }"
          :whileHover="{ scale: 1.05 }"
        >
          <Icons kind="cross" size="small" />
        </motion.button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  -webkit-app-region: drag;
  position: relative;
  z-index: 9999;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--base-900);
  user-select: none;
  padding-right: var(--space-3);
}
.app-logo {
  height: 32px;
  width: auto;
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}
.left-group {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.logo-holder {
  margin-left: var(--space-3);
  display: flex;
  align-items: center;
}

.app-logo {
  margin-top: 4px;
}

.page-title {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  color: var(--base-200);
  margin: 0;
  text-transform: capitalize;
  user-select: none;
}



.right-group {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  margin-left: auto;
  gap: var(--space-6);
}

.controls {
  display: flex;
  align-items: flex-start;
}

.btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
}

.btn.close:hover {
  background: #ef4444;
  animation: close-glow 3s ease-in-out infinite;
}

@keyframes close-glow {
  0%, 100% { box-shadow: 0 0 10px #ef4444; }
  50%       { box-shadow: 0 0 30px #ef4444; }
}
.btn:focus { outline: none; }
.btn:focus-visible { box-shadow: 0 0 0 2px #ef4444; outline: none; }
</style>
