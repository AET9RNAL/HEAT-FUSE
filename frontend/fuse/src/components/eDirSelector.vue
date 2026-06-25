<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Icons from './Icons.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: 'Select directory...',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

async function pick() {
  const path = await window.dialogAPI.selectDir()
  if (path !== null) emit('update:modelValue', path)
}

const CUT = 10
const containerEl = ref<HTMLElement | null>(null)
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
  if (!containerEl.value) return
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    elW.value = box ? box.inlineSize : entry.contentRect.width
    elH.value = box ? box.blockSize  : entry.contentRect.height
  })
  ro.observe(containerEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div
    ref="containerEl"
    class="e-dir-selector"
    :class="{ 'is-empty': !modelValue }"
    @click="pick"
  >
    <span class="path-text">{{ modelValue || placeholder }}</span>
    <Icons kind="folder" size="small" class="folder-icon" />
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
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}

.e-dir-selector::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--black-1-a);
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
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

.polygon-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
</style>
