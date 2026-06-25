<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import eCheckbox from './eCheckbox.vue'
import eSwitch from './eSwitch.vue'
import eDirSelector from './eDirSelector.vue'
import type { eSwitchOption } from './eSwitch.vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()

const platformOptions: eSwitchOption[] = [
  { icon: 'steam', value: 'steam' },
  { icon: 'wgc',   value: 'wgc' },
]

const gameDirPath = computed({
  get: () => store.gameDirPaths[store.gamePlatform] ?? '',
  set: (val) => store.setGameDirPath(store.gamePlatform, val),
})

watch(gameDirPath, (dir) => store.scanGameDir(dir), { immediate: true })

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
  <div class="app-settings">
    <div class="settings-glow">
      <div ref="panelEl" class="settings-panel">

        <div class="section">
          <h2 class="section-header">Game Installation</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">Platform</span>
              <eSwitch :options="platformOptions" v-model="store.gamePlatform" />
            </div>

            <div class="setting-row">
              <span class="setting-label">Path To Game Directory</span>
              <div class="dir-wrapper">
                <eDirSelector v-model="gameDirPath" />
              </div>
            </div>

          </div>
        </div>

        <div class="section">
          <h2 class="section-header">General</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">Launch App At System Startup</span>
              <eCheckbox v-model="store.autostart" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">Start Minimized To Tray</span>
              <eCheckbox v-model="store.minimizeToTray" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">Close Button Minimizes To Tray</span>
              <eCheckbox v-model="store.minimizeToTrayOnClose" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">Check For Updates On Startup</span>
              <eCheckbox v-model="store.checkUpdatesOnStartup" :width="18" :height="18" />
            </div>

          </div>
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
    </div>
  </div>
</template>

<style scoped>
.app-settings {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
  overflow-y: auto;
}

.settings-glow {
  /* filter:
    drop-shadow(0px 2px 5px rgba(197, 255, 218, 0.2))
    drop-shadow(0px 0px 1px #84ffb1)
    drop-shadow(0px 1px 1px rgba(197, 255, 218, 0.2)); */
}

.settings-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-2);
  /* background: var(--black-2-alpha, rgba(25, 25, 25, 0.5)); */
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
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

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
  z-index: 2;
}

.section-header {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2, 20px);
  font-weight: var(--font-weight-2);
  color: var(--text-main, #f2f2f2);
  padding-top: var(--space-2);
  margin: 0;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-width: 0;
}

.setting-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  font-weight: var(--font-weight-3);
  color: var(--text-main, #f2f2f2);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.dir-wrapper {
  width: 240px;
  flex-shrink: 0;
}
</style>
