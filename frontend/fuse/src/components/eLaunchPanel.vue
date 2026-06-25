<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Icons from './Icons.vue'
import eButton from './eButton.vue'
import eContextMenu from './eContextMenu.vue'
import type { MenuOption } from './eContextMenu.vue'
import { useAppStore } from '../stores/app'
import { useFuseControl } from '../composables/useFuseControl'
import { useI18n } from '../composables/useI18n'

const appStore = useAppStore()
const { t } = useI18n()
const { fuseState } = useFuseControl()

const isRunning = computed(() => fuseState.value === 'running')

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

const CUT = 10
const panelEl = ref<HTMLElement | null>(null)
const elW = ref(0)
const elH = ref(0)

const svgPoints = computed(() => {
  const w = elW.value
  const h = elH.value
  if (!w || !h) return ''
  const cx = (CUT / w) * 100
  const cy = (CUT / h) * 100
  return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!panelEl.value) return
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    elW.value = box ? box.inlineSize : entry.contentRect.width
    elH.value = box ? box.blockSize  : entry.contentRect.height
  })
  ro.observe(panelEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div ref="panelEl" class="e-launch-panel">

    <div class="left-cluster">
      <div class="app-icon">
        <Icons kind="app-icon" size="xlarge" />
      </div>
      <div class="title-block">
        <div class="title-row">
          <span class="title-name">{{ t('common.brandName') }}</span>
          <span class="title-version">{{ appStore.backendVersion || t('applaunch.versionFallback') }}</span>
        </div>
        <div class="title-row">
          <span class="title-name">{{ t('common.gameName') }}</span>
          <span class="title-version">{{ appStore.gameVersion || t('applaunch.versionFallback') }}</span>
        </div>
      </div>
    </div>

    <div class="actions">
      <eButton :icon="isRunning ? 'stop' : 'play'" :label="isRunning ? t('applaunch.stop') : t('applaunch.launch')" size="slim" @click="handleActionClick" />
      <eContextMenu :options="menuOptions" placement="bottom" />
    </div>

    <svg
      v-if="svgPoints"
      class="panel-stroke"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        :points="svgPoints"
        fill="none"
        stroke="#525252"
        stroke-width="0.4"
        vector-effect="non-scaling-stroke"
      />
    </svg>

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
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
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

.panel-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
</style>
