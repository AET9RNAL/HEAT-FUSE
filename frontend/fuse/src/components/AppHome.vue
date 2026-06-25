<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import eLaunchPanel from './eLaunchPanel.vue'
import eSwitch from './eSwitch.vue'
import type { eSwitchOption } from './eSwitch.vue'
import ePluginList from './ePluginList.vue'
import eFiles from './eFiles.vue'
import eConsole from './eConsole.vue'
import { usePluginsStore } from '../stores/plugins'
import { useAppStore } from '../stores/app'
import Compositor from './effects/Compositor.vue'
import type { FilterStage, CSSLayerConfig } from '../compositing/types'
import {
    createTurbulenceNoise,
    createLensMap,
    buildLensMapUri,
    createLensDisplacement,
    createSpecularLight,
    createChromaticAberration,
    createAntiAlias,
} from '../compositing/filterPrimitives'
const store = usePluginsStore()
const appStore = useAppStore()

const activeTab = ref<string>('content')
const tabOptions: eSwitchOption[] = [
  { icon: 'content',  value: 'content' },
  { icon: 'folder',     value: 'files' },
  { icon: 'console',  value: 'console' },
]

async function handleLaunch() {
  const dir = appStore.gameDirPaths[appStore.gamePlatform]
  if (dir) await window.gameAPI.enableDebugger(dir)
  appStore.enableFuse = true
}

onMounted(() => {
  store.scan()
  store.watchHostConfig()
})

onUnmounted(() => {
  store.unwatchHostConfig()
})

const effects: FilterStage[] = [
    // Sources
    ...createLensMap({ mapUri: buildLensMapUri() }),
    ...createTurbulenceNoise({
        baseFrequency: '0.00425 0.00425', // splay=25 → 0.005 + 0.75*0.035
    }),
    ...createSpecularLight({
        surfaceScale: 1.5,  // depth 15 × 0.1
        exponent: 100,      // 20 + lightIntensity 100 × 0.8
        x: 212.13,          // -300 × cos(135°)
        y: -212.13,         // -300 × sin(135°)
    }),
    // Processors (chained in order)
    ...createLensDisplacement({ scale: 30 }),          // depth 15 × 2
    ...createChromaticAberration({
        scaleR: 2.5,  // refraction 5×2 − dispersion 50×0.15
        scaleG: 10,   // refraction 5×2
        scaleB: 17.5, // refraction 5×2 + dispersion 50×0.15
    }),
    ...createAntiAlias({ stdDeviation: 2 }),         // antiAlias 10 × 0.15
]

const layers: Partial<CSSLayerConfig> = {
    frostBlur: 1,                                     // frost 25 × 0.1
    // tint: { color: 'white', alpha: 0.125 },             // 0.05 + 25×0.003
    // shine: { alpha: 0.6 },                              // 0.1 + 100×0.005
    depthShadow: '0 1.5px 3px rgba(0,0,0,0.13), 0 0 0.9px rgba(0,0,0,0.1)',
    glow: { shadow: '0 0 3px 0.75px rgba(100,160,255,0.4)' },
}
</script>

<template>
  <div class="app-home">
    <eLaunchPanel @launch="handleLaunch" />
    <div class="tab-bar">
      <eSwitch v-model="activeTab" :options="tabOptions" />
    </div>
    <Compositor :effects="effects" :layers="layers" class="plugin-compositor">
      <ePluginList v-if="activeTab === 'content'" class="plugin-list" />
      <eFiles v-else-if="activeTab === 'files'" />
      <eConsole v-else-if="activeTab === 'console'" />
    </Compositor>
  </div>
</template>

<style scoped>
.app-home {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
}

.tab-bar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.plugin-compositor {
  width: 100%;
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}
</style>
