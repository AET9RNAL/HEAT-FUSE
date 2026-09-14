<script setup lang="ts">
import { computed } from 'vue'
import Icons from './Icons.vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: undefined,
})

const resolvedPlaceholder = computed(() => props.placeholder ?? t('components.dirSelector.placeholder'))

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

async function pick() {
  const path = await window.dialogAPI.selectDir()
  if (path !== null) emit('update:modelValue', path)
}

</script>

<template>
  <div
    class="e-dir-selector"
    :class="{ 'is-empty': !modelValue }"
    @click="pick"
  >
    <span class="path-text">{{ modelValue || resolvedPlaceholder }}</span>
    <Icons kind="folder" size="small" class="folder-icon" />
  </div>
</template>

<style scoped>
.e-dir-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
}

.e-dir-selector::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--black-1-a);
  corner-shape: bevel;
  border-radius: 10px 0 10px 0;
  transition: background 0.15s;
}

.e-dir-selector:hover::before {
  background: var(--black-3);
}

.path-text, .folder-icon {
  position: relative;
  z-index: 1;
}

.path-text {
  flex: 1;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  font-weight: var(--font-weight-3);
  color: var(--text-main, #f2f2f2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  user-select: none;
  -webkit-user-select: none;
}

.is-empty .path-text {
  color: var(--text-muted);
}

.folder-icon {
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.e-dir-selector:hover .folder-icon {
  opacity: 1;
}

</style>
