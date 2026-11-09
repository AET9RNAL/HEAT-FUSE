<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import eLaunchPanel from '../home/eLaunchPanel.vue'
import eSwitch from '../inputs/eSwitch.vue'
import type { eSwitchOption } from '../inputs/eSwitch.vue'
import ePluginList from '../plugins/ePluginList.vue'
import eFiles from '../home/eFiles.vue'
import eConsole from '../home/eConsole.vue'
import eGameChanges from '../home/eGameChanges.vue'
import { useGameChanges } from '../../composables/useGameChanges'
import eMaterialButton from '../inputs/eMaterialButton.vue'
import eListSelector from '../inputs/eListSelector.vue'
import Icons from '../ui/Icons.vue'
import { usePluginsStore } from '../../stores/plugins'
import { useAppStore } from '../../stores/app'
import { useNavigationStore } from '../../stores/navigation'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { requestSettingAttention } from '../../composables/useSettingAttention'

const { t } = useI18n()
// import Compositor from '../effects/Compositor.vue'
// import type { FilterStage, CSSLayerConfig } from '../../compositing/types'
// import {
//     createTurbulenceNoise,
//     createLensMap,
//     buildLensMapUri,
//     createLensDisplacement,
//     createSpecularLight,
//     createChromaticAberration,
//     createAntiAlias,
// } from '../../compositing/filterPrimitives'
const store = usePluginsStore()
const appStore = useAppStore()
const navStore = useNavigationStore()

const activeTab = ref<string>('content')
const { relevant: gameChangesRelevant } = useGameChanges()
// Game Changes shows only when a plugin has presets or FUSE still holds changes.
const tabOptions = computed<eSwitchOption[]>(() => [
  { icon: 'content',  value: 'content' },
  ...(gameChangesRelevant.value ? [{ icon: 'file' as const, value: 'gameChanges' }] : []),
  { icon: 'folder',   value: 'files' },
  { icon: 'console',  value: 'console' },
])
watch(gameChangesRelevant, (shown) => {
  if (!shown && activeTab.value === 'gameChanges') activeTab.value = 'content'
})

const searchQuery = ref('')
const filterMode = ref('all')
const filterOptions = computed(() => [
  t('apphome.filters.all'),
  t('apphome.filters.active'),
  t('apphome.filters.disabled'),
])
const filterValues  = ['all', 'active', 'disabled']

async function handleLaunch() {
  if (!appStore.licenseAccepted) return

  const dir = appStore.gameDirPaths[appStore.gamePlatform] ?? ''
  if (!dir) {
    eventBus.emit('notification', {
      title: t('applaunch.notifications.noGamePathTitle'),
      message: t('applaunch.notifications.noGamePathMessage'),
      type: 'warning',
    })
    navStore.selectOption('settings')
    requestSettingAttention('gameDir')
    return
  }

  const result = await appStore.refreshGameConfig(dir)
  if (!result.success) {
    eventBus.emit('notification', {
      title: t('applaunch.notifications.noGamePathTitle'),
      message: t('applaunch.notifications.noGamePathMessage'),
      type: 'warning',
    })
    navStore.selectOption('settings')
    requestSettingAttention('gameDir')
    return
  }
  if (!result.enabled) {
    // FUSE disabled via the master switch - send the user there to enable it.
    eventBus.emit('notification', {
      title: t('applaunch.notifications.fuseDisabledTitle'),
      message: t('applaunch.notifications.fuseDisabledMessage'),
      type: 'warning',
    })
    navStore.selectOption('settings')
    requestSettingAttention('gameConfig')
    return
  }
  // The debugger is on, but on another port: the runtime would never attach.
  if (!appStore.gameConfigValid) {
    eventBus.emit('notification', {
      title: t('applaunch.notifications.portMismatchTitle'),
      message: t('applaunch.notifications.portMismatchMessage', {
        filePort: String(result.port ?? '-'),
        appPort: String(appStore.cdpPort),
      }),
      type: 'warning',
    })
    navStore.selectOption('settings')
    requestSettingAttention('cdpPort')
    return
  }

  appStore.enableFuse = true
}

onMounted(() => {
  store.scan()
  store.watchHostConfig()
})

onUnmounted(() => {
  store.unwatchHostConfig()
})

// const effects: FilterStage[] = [
//     // Sources
//     ...createLensMap({ mapUri: buildLensMapUri() }),
//     ...createTurbulenceNoise({
//         baseFrequency: '0.00425 0.00425', // splay=25 → 0.005 + 0.75*0.035
//     }),
//     ...createSpecularLight({
//         surfaceScale: 1.5,  // depth 15 × 0.1
//         exponent: 100,      // 20 + lightIntensity 100 × 0.8
//         x: 212.13,          // -300 × cos(135°)
//         y: -212.13,         // -300 × sin(135°)
//     }),
//     // Processors (chained in order)
//     ...createLensDisplacement({ scale: 30 }),          // depth 15 × 2
//     ...createChromaticAberration({
//         scaleR: 2.5,  // refraction 5×2 − dispersion 50×0.15
//         scaleG: 10,   // refraction 5×2
//         scaleB: 17.5, // refraction 5×2 + dispersion 50×0.15
//     }),
//     ...createAntiAlias({ stdDeviation: 2 }),         // antiAlias 10 × 0.15
// ]

// const layers: Partial<CSSLayerConfig> = {
//     frostBlur: 1,                                     // frost 25 × 0.1
//     // tint: { color: 'white', alpha: 0.125 },             // 0.05 + 25×0.003
//     // shine: { alpha: 0.6 },                              // 0.1 + 100×0.005
//     depthShadow: '0 1.5px 3px rgba(0,0,0,0.13), 0 0 0.9px rgba(0,0,0,0.1)',
//     glow: { shadow: '0 0 3px 0.75px rgba(100,160,255,0.4)' },
// }
</script>

<template>
  <div class="app-home">
    <eLaunchPanel v-ftue="'home-launch'" @launch="handleLaunch" />
    <div v-ftue="'home-views'" class="tab-bar">
      <eSwitch v-model="activeTab" :options="tabOptions" />
    </div>

    <template v-if="activeTab === 'content'">
      <div v-ftue="'home-search'" class="search-row">
        <input
          class="search-input"
          v-model="searchQuery"
          :placeholder="t('apphome.searchPlaceholder')"
          autocomplete="off"
          spellcheck="false"
        />
        <eMaterialButton
          :label="t('apphome.discover')"
          icon="discover"
          @click="navStore.selectOption('discover')"
        />
      </div>
      <div class="filter-row">
        <Icons kind="filter" size="small" class="filter-icon" />
        <eListSelector
          :label="t('apphome.filtering')"
          :options="filterOptions"
          :values="filterValues"
          v-model="filterMode"
        />
        <eMaterialButton :label="t('apphome.refresh')" icon="reload" @click="store.scan()" />
      </div>
    </template>

    <!-- <Compositor :effects="effects" :layers="layers" class="plugin-compositor"> -->
      <ePluginList
        v-if="activeTab === 'content'"
        v-ftue="'home-plugins'"
        class="plugin-list"
        :search="searchQuery"
        :filter-mode="filterMode"
      />
      <eGameChanges v-else-if="activeTab === 'gameChanges'" />
      <eFiles v-else-if="activeTab === 'files'" />
      <eConsole v-else-if="activeTab === 'console'" />
    <!-- </Compositor> -->
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

.search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.search-input {
  user-select: none;
  -webkit-user-select: none;
  flex: 1;
  height: 32px;
  padding: 0 var(--space-3);
  background: var(--black-1-a);
  border: none;
  outline: none;
  color: var(--text-main);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-row :deep(.material-button) {
  height: 32px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.filter-icon {
  opacity: 0.6;
  flex-shrink: 0;
}

.filter-row :deep(.material-button) {
  height: 24px;
  margin-left: auto;
}

.plugin-compositor {
  width: 100%;
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
}
</style>
