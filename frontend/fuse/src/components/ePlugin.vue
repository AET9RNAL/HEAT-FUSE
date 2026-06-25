<script setup lang="ts">
import { computed, ref } from 'vue'
import eCheckbox from './eCheckbox.vue'
import eToggle from './eToggle.vue'
import eContextMenu, { type MenuOption } from './eContextMenu.vue'
import Icons from './Icons.vue'
import type { PluginRecord, PluginStatus } from '../stores/plugins'

const props = withDefaults(defineProps<{
  plugin: PluginRecord
  selected?: boolean
  enabled: boolean
  thumbnail?: string
  menuOptions?: MenuOption[]
}>(), {
  selected: false,
  menuOptions: () => [],
})

const emit = defineEmits<{
  'update:selected': [value: boolean]
  'update:enabled': [value: boolean]
}>()

const rowEl = ref<HTMLElement | null>(null)

const statusColors: Record<PluginStatus, string> = {
  active:   '#84ffb1',
  error:    '#c84554',
  pending:  '#feff7b',
  loading:  '#feff7b',
  skipped:  '#525252',
  disabled: '#525252',
}

const indicatorColor = computed(() => statusColors[props.plugin.status])

const indicatorGlow = computed(() => {
  const s = props.plugin.status
  if (s === 'skipped' || s === 'disabled') return 'none'
  const c = statusColors[s]
  return `0 0 4px 2px ${c}, 0 0 8px 3px ${c}66`
})

const filename = computed(() =>
  `${props.plugin.name}-${props.plugin.version}.fuse`
)

const statusLabel = computed(() =>
  props.plugin.status.charAt(0).toUpperCase() + props.plugin.status.slice(1)
)
</script>

<template>
  <div ref="rowEl" class="e-plugin">
    <div class="col-select">
      <eCheckbox
        :model-value="selected"
        :width="18"
        :height="18"
        @update:model-value="emit('update:selected', $event)"
      />
    </div>

    <div class="col-thumb">
      <div class="icon-thumb">
        <img v-if="thumbnail" :src="thumbnail" class="thumb-img" alt="" />
        <Icons v-else kind="missingImage" size="large" />
      </div>
    </div>

    <div class="col-info">
      <div class="title-row">
        <span class="name">{{ plugin.name }}</span>
        <span class="by">by</span>
        <span class="author">{{ plugin.author ?? '—' }}</span>
      </div>
      <span class="description">{{ plugin.description }}</span>
    </div>

    <div class="col-version">
      <span class="version">{{ plugin.version }}</span>
      <span class="filename">{{ filename }}</span>
    </div>

    <div class="col-status">
      <span
        class="indicator"
        :style="{ background: indicatorColor, boxShadow: indicatorGlow }"
      />
      <span class="status-label">{{ statusLabel }}</span>
    </div>

    <div class="col-actions">
      <eToggle
        :model-value="enabled"
        :width="48"
        :height="24"
        @update:model-value="emit('update:enabled', $event)"
      />
      <eContextMenu
        :options="menuOptions"
        :keystrokeTarget="rowEl"
        :keystrokeKey="'Control'"
        :keystrokeMode="'hold'"
        placement="bottom"
        trigger-icon="more"
      />
    </div>
  </div>
</template>

<style scoped>
.e-plugin {
  display: grid;
  grid-template-columns: var(--plugin-grid-cols, 26px 56px 1fr 180px 130px 100px);
  align-items: center;
  padding: 0 var(--space-4);
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
}

.col-select {
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-thumb {
  display: flex;
  align-items: center;
}

.icon-thumb {
  width: 48px;
  height: 48px;
  background: #1c1c1c;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.col-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
  padding: 0 10px;
  min-width: 0;
  overflow: hidden;
}

.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-0);
  overflow: hidden;
  min-width: 0;
}

.name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
  user-select: none;
  -webkit-user-select: none;
}

.by {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.author {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-main);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  text-overflow: ellipsis;
}

.description {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  -webkit-user-select: none;
}

.col-version {
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
}

.version {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.filename {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  -webkit-user-select: none;
}

.col-status {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.indicator {
  display: inline-block;
  width: 4px;
  height: 4px;
  transform: rotate(45deg);
  flex-shrink: 0;
  transition: background 0.4s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.status-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.col-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
</style>
