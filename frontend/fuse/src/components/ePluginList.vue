<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ePlugin from './ePlugin.vue'
import eCheckbox from './eCheckbox.vue'
import { usePluginsStore } from '../stores/plugins'
import type { MenuOption } from './eContextMenu.vue'

const store = usePluginsStore()

const selected = ref<Record<string, boolean>>({})

const allSelected = computed(() =>
  store.plugins.length > 0 && store.plugins.every(p => selected.value[p.plugin_id])
)

function toggleAll(val: boolean) {
  const next: Record<string, boolean> = {}
  store.plugins.forEach(p => { next[p.plugin_id] = val })
  selected.value = next
}

function isEnabled(status: string) {
  return status !== 'disabled'
}

async function handleToggle(pluginId: string, enabled: boolean) {
  await store.setEnabled(pluginId, enabled)
}

function menuOptionsFor(pluginId: string): MenuOption[] {
  const plugin = store.plugins.find(p => p.plugin_id === pluginId)
  if (!plugin) return []
  return [
    {
      label: 'Show in Explorer',
      icon: 'folder',
      iconSize: 'normal',
      shortcut: true,
      action: () => {
        if (plugin.filePath) window.pluginsAPI.showFile(plugin.filePath)
      },
    },
    {
      label: 'Delete',
      icon: 'delete',
      iconSize: 'normal',
      shortcut: true,
      action: async () => {
        if (!plugin.filePath) return
        const result = await window.pluginsAPI.deleteFile(plugin.filePath)
        if (result.success) store.remove(pluginId)
      },
    },
  ]
}

// Dynamic SVG polygon stroke — maps 10px cut to viewBox(0 0 100 100) coords
const CUT = 10
const listEl = ref<HTMLElement | null>(null)
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
  if (!listEl.value) return
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    elW.value = box ? box.inlineSize : entry.contentRect.width
    elH.value = box ? box.blockSize  : entry.contentRect.height
  })
  ro.observe(listEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div class="e-plugin-list-glow">
    <div class="e-plugin-list" ref="listEl">
      <div class="list-header">
        <div class="col-select">
          <eCheckbox
            :model-value="allSelected"
            :width="18"
            :height="18"
            @update:model-value="toggleAll"
          />
        </div>
        <div class="col-thumb" />
        <span class="col-label">Plugin</span>
        <span class="col-label">Version</span>
        <span class="col-label">Status</span>
        <span class="col-label">Actions</span>
      </div>

      <div class="list-body">
        <ePlugin
          v-for="plugin in store.plugins"
          :key="plugin.plugin_id"
          :plugin="plugin"
          :selected="selected[plugin.plugin_id] ?? false"
          :enabled="isEnabled(plugin.status)"
          :menu-options="menuOptionsFor(plugin.plugin_id)"
          @update:selected="selected[plugin.plugin_id] = $event"
          @update:enabled="handleToggle(plugin.plugin_id, $event)"
        />

        <div v-if="store.plugins.length === 0" class="empty">
          <span class="empty-text">No plugins discovered</span>
        </div>
      </div>

      <svg
        v-if="svgPoints"
        class="polygon-stroke"
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
</template>

<style scoped>
/* Outer wrapper: drop-shadow traces the inner polygon alpha boundary */
.e-plugin-list-glow {
  width: 100%;
  /* filter:
    drop-shadow(0px 0px 1px #84ffb1)
    drop-shadow(0px 2px 5px rgba(197, 255, 218, 0.2))
    drop-shadow(0px 1px 1px rgba(197, 255, 218, 0.2)); */
}

.e-plugin-list {
  background-color: var(--black-1-a);
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}

/* SVG polygon stroke — drawn inside clip boundary, traces all 6 edges */
.polygon-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.list-header {
  display: grid;
  grid-template-columns: var(--plugin-grid-cols, 26px 56px 1fr 180px 130px 100px);
  align-items: center;
  padding: var(--space-3) var(--space-4);
  flex-shrink: 0;
    user-select: none;
  -webkit-user-select: none;
}

.col-select {
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-thumb { width: 100%; }

.col-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  white-space: nowrap;
}

.list-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.empty-text {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
}
</style>
