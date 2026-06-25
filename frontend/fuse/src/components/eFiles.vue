<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

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
  <div class="e-files-glow">
    <div ref="containerEl" class="e-files">
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
.e-files-glow {
  width: 100%;
}

.e-files {
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
