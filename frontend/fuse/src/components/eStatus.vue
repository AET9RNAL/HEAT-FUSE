<script lang="ts">
export type StatusState = 'None' | 'Initializing' | 'Connecting' | 'Running' | 'Error'
</script>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  state?: StatusState
  status?: string
}>(), {
  state: 'None',
  status: 'None',
})

const colorMap: Record<StatusState, string> = {
  Running:      '#84ffb1',
  Error:        '#c84554',
  Initializing: '#feff7b',
  Connecting:   '#feff7b',
  None:         '#525252',
}

const dotColor = computed(() => colorMap[props.state])

const dotGlow = computed(() =>
  props.state === 'None'
    ? 'none'
    : `0 0 4px 1px ${dotColor.value}, 0 0 10px 2px ${dotColor.value}66`
)

// Clipped corners + SVG stroke overlay, matching eUpdateProgress.
const CUT = 6
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
  <div ref="containerEl" class="e-status">
    <span class="dot" :style="{ background: dotColor, boxShadow: dotGlow }" />
    <span class="label">{{ status }}</span>
    <svg
      v-if="svgPoints"
      class="stroke-overlay"
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
.e-status {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-3);
  background-color: var(--black-1-a);
  clip-path: polygon(
    6px 0%,
    100% 0%,
    100% calc(100% - 6px),
    calc(100% - 6px) 100%,
    0% 100%,
    0% 6px
  );
  user-select: none;
}

.stroke-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  transform: rotate(45deg);
  flex-shrink: 0;
  transition: background 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--base-200);
  white-space: nowrap;
  line-height: 1;
}
</style>
