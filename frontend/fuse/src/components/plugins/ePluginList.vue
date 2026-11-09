<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import ePlugin from './ePlugin.vue'
import eCheckbox from '../inputs/eCheckbox.vue'
import { usePluginsStore } from '../../stores/plugins'
import { useRegistryStore } from '../../stores/registry'
import { useNavigationStore } from '../../stores/navigation'
import type { MenuOption } from '../ui/eContextMenu.vue'
import { useI18n } from '../../composables/useI18n'
import { useFuseConnection } from '../../composables/useFuseConnection'
import { useSamplePlugins } from '../../composables/useSamplePlugins'
import { eventBus } from '../../events/eventBus'

const { t } = useI18n()
const { connected } = useFuseConnection()

const props = withDefaults(defineProps<{
  search?: string
  filterMode?: string
}>(), {
  search: '',
  filterMode: 'all',
})

const store = usePluginsStore()
const registry = useRegistryStore()
const navStore = useNavigationStore()
const samples = useSamplePlugins()

// The registry links a file by its SHA-256, so the link survives version updates.
function marketplaceMatchFor(plugin: { checksum?: string }) {
    const file = plugin.checksum ? registry.installed.find(f => f.sha256 === plugin.checksum) : undefined
    return file?.projectId ? registry.linkedProjects[file.projectId] ?? null : null
}

function updateFor(plugin: { checksum?: string }) {
    return (plugin.checksum && registry.installed.find(f => f.sha256 === plugin.checksum)?.update?.version) || null
}

function handleMarketplaceClick(projectId: string) {
    navStore.selectOption('discover')
    void registry.openProject(projectId)
}

const selected = ref<Record<string, boolean>>({})

const filteredPlugins = computed(() => {
  const q = props.search.trim().toLowerCase()
  const mode = props.filterMode
  return samples.plugins.value.filter(p => {
    if (mode === 'active'   && p.status === 'disabled') return false
    if (mode === 'disabled' && p.status !== 'disabled') return false
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  })
})

const allSelected = computed(() =>
  filteredPlugins.value.length > 0 && filteredPlugins.value.every(p => selected.value[p.plugin_id])
)

function toggleAll(val: boolean) {
  const next: Record<string, boolean> = { ...selected.value }
  filteredPlugins.value.forEach(p => { next[p.plugin_id] = val })
  selected.value = next
}

function isEnabled(status: string) {
  return status !== 'disabled'
}

async function handleToggle(pluginId: string, enabled: boolean) {
  if (samples.active.value) return
  await store.setEnabled(pluginId, enabled)
  // Toggling a plugin while the runtime is live only takes effect after a reload.
  if (enabled && connected.value) {
    eventBus.emit('notification', {
      title: t('components.plugin.reloadWarningTitle'),
      message: t('components.plugin.reloadWarningMessage'),
      type: 'warning',
    })
  }
}

function menuOptionsFor(pluginId: string): MenuOption[] {
  const plugin = store.plugins.find(p => p.plugin_id === pluginId)
  if (!plugin) return []
  const options: MenuOption[] = []
  if (plugin.configSchema.length > 0 || plugin.hotkeys.length > 0) {
    options.push({
      label: t('components.plugin.menu.settings'),
      icon: 'settings',
      iconSize: 'normal',
      action: () => eventBus.emit('plugin-config:open', { plugin_id: pluginId }),
    })
  }
  if (plugin.overrides) {
    options.push({
      label: t('components.plugin.menu.gameChanges'),
      icon: 'file',
      iconSize: 'normal',
      action: () => eventBus.emit('plugin-config:open', { plugin_id: pluginId, tab: 'overrides' }),
    })
  }
  options.push(
    {
      label: t('components.plugin.menu.showInExplorer'),
      icon: 'folder',
      iconSize: 'normal',
      shortcut: true,
      action: () => {
        if (plugin.filePath) window.pluginsAPI.showFile(plugin.filePath)
      },
    },
    {
      label: t('components.plugin.menu.delete'),
      icon: 'delete',
      iconSize: 'normal',
      shortcut: true,
      action: async () => {
        if (!plugin.filePath) return
        const result = await window.pluginsAPI.deleteFile(plugin.filePath)
        if (result.success) {
          store.remove(pluginId)
          await registry.refreshInstalled()
        }
      },
    },
  )
  return options
}

onMounted(() => void registry.refreshInstalled())
</script>

<template>
  <div class="e-plugin-list-glow">
    <div class="e-plugin-list">
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
        <span class="col-label">{{ t('components.pluginList.columnPlugin') }}</span>
        <span class="col-label">{{ t('components.pluginList.columnVersion') }}</span>
        <span class="col-label">{{ t('components.pluginList.columnStatus') }}</span>
        <span class="col-label">{{ t('components.pluginList.columnActions') }}</span>
      </div>

      <div class="list-body">
        <ePlugin
          v-for="plugin in filteredPlugins"
          :key="plugin.plugin_id"
          :plugin="plugin"
          :selected="selected[plugin.plugin_id] ?? false"
          :enabled="isEnabled(plugin.status)"
          :menu-options="menuOptionsFor(plugin.plugin_id)"
          :marketplace-project="marketplaceMatchFor(plugin)"
          :update-version="updateFor(plugin)"
          @update:selected="selected[plugin.plugin_id] = $event"
          @update:enabled="handleToggle(plugin.plugin_id, $event)"
          @marketplace-click="handleMarketplaceClick"
        />

        <div v-if="filteredPlugins.length === 0" class="empty">
          <span class="empty-text">{{ store.plugins.length === 0 ? t('components.pluginList.emptyNoPlugins') : t('components.pluginList.emptyNoMatch') }}</span>
        </div>
      </div>

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
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
}

/* SVG polygon stroke — drawn inside clip boundary, traces all 6 edges */

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
