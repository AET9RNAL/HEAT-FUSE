<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { motion, AnimatePresence } from 'motion-v'
import Icons from './Icons.vue'
import eButton from './eButton.vue'
import eContextMenu from './eContextMenu.vue'
import type { MenuOption } from './eContextMenu.vue'
import { useAppStore } from '../stores/app'
import { useFuseControl } from '../composables/useFuseControl'
import { useI18n } from '../composables/useI18n'
import { Dynamics } from '../composables/useMotion'
import { eventBus } from '../events/eventBus'
import { formatCombo } from '../utils/formatCombo'
const appStore = useAppStore()
const { t } = useI18n()
const { fuseState, runtimeState, obsUrl, hostHotkeys } = useFuseControl()

const isRunning = computed(() => fuseState.value === 'running')

interface ObsDisplay { id: string; label: string; width: number; height: number; primary: boolean }

const obsCopyState = ref<'idle' | 'success'>('idle')
const obsDisplays = ref<ObsDisplay[]>([])
const obsPickerOpen = ref(false)
let obsCopyTimer: ReturnType<typeof setTimeout> | null = null
const obsReady = computed(() =>
  isRunning.value && runtimeState.value === 'locked' && !!obsUrl.value,
)

async function onObsClick() {
  try { obsDisplays.value = await window.fuseAPI.obsDisplays() } catch { obsDisplays.value = [] }
  if (obsDisplays.value.length > 1) { obsPickerOpen.value = true; return }
  await copyObsUrl(null)
}

async function copyObsUrl(displayId: string | null) {
  const url = displayId ? await window.fuseAPI.obsUrlFor(displayId) : obsUrl.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    obsPickerOpen.value = false
    obsCopyState.value = 'success'
    eventBus.emit('notification', { message: t('applaunch.obsUrlCopied'), type: 'success' })
    if (obsCopyTimer) clearTimeout(obsCopyTimer)
    obsCopyTimer = setTimeout(() => { obsCopyState.value = 'idle'; obsCopyTimer = null }, 1500)
  } catch { /* clipboard unavailable */ }
}

watch(obsReady, (ready) => { if (!ready) obsPickerOpen.value = false })

// While running but not yet locked, plugins are still in calibrate
const promptVisible = ref(false)
const promptLocked  = ref(false)
const LOCK_HOLD_MS = 500
let lockTimer: ReturnType<typeof setTimeout> | null = null

function clearLockTimer() {
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null }
}

watch([isRunning, runtimeState], ([running, state]) => {
  if (running && state === 'calibrate') {
    clearLockTimer()
    promptLocked.value = false
    promptVisible.value = true
  } else if (running && state === 'locked' && promptVisible.value) {
    // calibrate => locked
    promptLocked.value = true
    clearLockTimer()
    lockTimer = setTimeout(() => { promptVisible.value = false; lockTimer = null }, LOCK_HOLD_MS)
  } else {
    clearLockTimer()
    promptVisible.value = false
    promptLocked.value = false
  }
}, { immediate: true })

const emit = defineEmits<{ launch: []; stop: [] }>()

function handleActionClick() {
  if (isRunning.value) {
    appStore.enableFuse = false
  } else {
    emit('launch')
  }
}

const menuOptions = computed<MenuOption[]>(() => [
  {
    label: t('applaunch.showInExplorer'),
    icon: 'folder',
    iconSize: 'normal',
    shortcut: false,
    action: () => window.appAPI.openBackendDir(),
  },
])

onUnmounted(() => { clearLockTimer(); if (obsCopyTimer) clearTimeout(obsCopyTimer) })
</script>

<template>
  <div class="e-launch-panel">

    <div class="left-cluster">
      <div class="app-icon">
        <Icons kind="app-icon" size="xlarge" />
      </div>
      <div class="title-block">
        <div class="title-row">
          <span class="title-name">{{ t('common.brandName') }}</span>
          <span class="title-version">{{ appStore.backendVersion || t('applaunch.versionFallback') }}</span>
          <span class="title-name title-name-launcher">{{ t('common.launcherName') }}</span>
          <span class="title-version">{{ appStore.appVersion || t('applaunch.versionFallback') }}</span>
        </div>
        <div class="title-row">
          <span class="title-name">{{ t('common.gameName') }}</span>
          <span class="title-version">{{ appStore.gameVersion || t('applaunch.versionFallback') }}</span>
        </div>
      </div>
    </div>

    <div class="actions">
      <div class="launch-cluster">
        <AnimatePresence mode="wait">
          <motion.div
            v-if="obsReady && obsPickerOpen"
            key="obs-picker"
            class="obs-picker"
            :initial="{ opacity: 0, scale: 0.9 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.9 }"
            :transition="Dynamics.spring"
          >
            <eButton
              v-for="d in obsDisplays"
              :key="d.id"
              icon="monitor"
              :label="d.label"
              v-tip="t('applaunch.copyObsUrlFor', { w: d.width, h: d.height })"
              size="slim"
              @click="copyObsUrl(d.id)"
            />
          </motion.div>
          <motion.span
            v-else-if="obsReady"
            key="obs-copy"
            v-tip="t('applaunch.copyObsUrl')"
            :initial="{ opacity: 0, scale: 0.8 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.8 }"
            :transition="Dynamics.spring"
          >
            <eButton
              icon="obs"
              size="slim"
              :systemState="obsCopyState"
              @click="onObsClick"
            />
          </motion.span>
        </AnimatePresence>
        <div class="launch-action">
        <AnimatePresence>
          <motion.div
            v-if="promptVisible"
            key="calib"
            class="calibrate-prompt"
            :class="{ locked: promptLocked }"
            :initial="{ opacity: 0, x: 20 }"
            :animate="{ opacity: 1, x: 0 }"
            :exit="{ opacity: 0, x: 20 }"
            :transition="Dynamics.spring"
          >
            <span class="calibrate-text">{{ promptLocked ? t('applaunch.lockedPrompt') : t('applaunch.calibratePrompt') }}</span>
            <span v-if="!promptLocked" class="calibrate-hint">{{ t('applaunch.calibrateHint', { combo: formatCombo(hostHotkeys.lock) }) }}</span>
          </motion.div>
        </AnimatePresence>
        <!-- The calibration prompt slides out over this slot, so the toggle yields to it -->
        <AnimatePresence>
          <motion.span
            v-if="!promptVisible"
            key="auto-lock"
            class="auto-lock"
            :initial="{ opacity: 0, scale: 0.8 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.8 }"
            :transition="Dynamics.quick"
          >
            <eButton
              mode="toggle"
              size="slim"
              icon="unlock"
              active-icon="lock"
              :model-value="appStore.autoLockOverlays"
              v-tip="appStore.autoLockOverlays ? t('applaunch.autoLockOn') : t('applaunch.autoLockOff')"
              @update:model-value="appStore.autoLockOverlays = $event"
            />
          </motion.span>
        </AnimatePresence>
        <eButton
          class="launch-btn"
          v-tip="isRunning ? t('applaunch.stopTip') : t('applaunch.launchTip')"
          :icon="isRunning ? 'stop' : 'play'"
          :label="isRunning ? t('applaunch.stop') : t('applaunch.launch')"
          size="slim"
          @click="handleActionClick"
        />
        </div>
      </div>
      <eContextMenu :options="menuOptions" placement="bottom" />
    </div>


  </div>
</template>

<style scoped>
.e-launch-panel {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2);
  flex-shrink: 0;
  background: var(--black-1-a);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
}

.left-cluster {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.app-icon {
  /* background: var(--bg-light, #1c1c1c); */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: var(--space-1);
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
}

.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.title-name {
  font-family: var(--font-primary);
  font-size: var(--secondary-font-size-3);
  font-weight: var(--font-weight-2);
  color: var(--text-main, #f2f2f2);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.title-name-launcher {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  margin-left: var(--space-0);
  color: var(--text-muted, #b3b3b3);
}

.title-version {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  font-weight: var(--font-weight-3);
  color: var(--text-muted, #b3b3b3);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-6, 42px);
  flex-shrink: 0;
  padding: var(--space-2);
}

.launch-cluster {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.obs-picker {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.launch-action {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.auto-lock {
  display: flex;
}

.launch-btn {
  position: relative;
  z-index: 2;
}

.calibrate-prompt {
  position: absolute;
  top: 0;
  right: calc(100% - 10px);
  height: 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 1px;
  padding: 0 calc(var(--space-3) + 10px) 0 var(--space-3);
  background: var(--black-1-a);
  border-left: 2px solid var(--canary-yellow, #FDE047);
  white-space: nowrap;
  z-index: 1;
  pointer-events: none;
  corner-shape: bevel;
  border-radius: 6px 0 0 0;
  transition: border-left-color 0.3s ease;
}

.calibrate-prompt.locked {
  border-left-color: var(--light-green, #84FFB1);
}

.calibrate-text {
  font-family: var(--font-primary);
  font-size: var(--secondary-font-size-3);
  font-weight: var(--font-weight-2);
  color: var(--canary-yellow, #FDE047);
  line-height: 1;
  transition: color 0.3s ease;
}

.calibrate-prompt.locked .calibrate-text {
  color: var(--light-green, #84FFB1);
}

.calibrate-hint {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  line-height: 1;
}

</style>
