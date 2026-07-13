<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import { Dynamics } from './dynamics.js'

// Label-only segmented switch. (Icon options require the Icons component, which
// isn't in the overlay kit yet — see follow-up.)
export interface eSwitchOption {
  label: string
  value: string
}

const props = defineProps<{
  options: eSwitchOption[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const hoveredValue = ref<string | null>(null)

function isActive(value: string) {
  return props.modelValue === value
}

const CUT = 8
const switchEl = ref<HTMLElement | null>(null)
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
  if (!switchEl.value) return
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    elW.value = box ? box.inlineSize : entry.contentRect.width
    elH.value = box ? box.blockSize  : entry.contentRect.height
  })
  ro.observe(switchEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div ref="switchEl" class="e-switch">
    <div
      v-for="opt in options"
      :key="opt.value"
      class="e-switch-option"
      @click="emit('update:modelValue', opt.value)"
      @mouseenter="hoveredValue = opt.value"
      @mouseleave="hoveredValue = null"
    >
      <motion.div
        class="option-glow"
        :animate="{ scale: isActive(opt.value) ? 1 : 0, opacity: isActive(opt.value) ? 1 : 0 }"
        :transition="Dynamics.circOut"
      >
        <div class="option-overlay" />
        <svg
          class="option-stroke"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="20,0 100,0 100,80 80,100 0,100 0,20"
            fill="none"
            stroke="#f2f2f2"
            stroke-width="0.2"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </motion.div>

      <div class="option-content">
        <span class="option-label">{{ opt.label }}</span>
      </div>
    </div>

    <svg
      v-if="svgPoints"
      class="switch-stroke"
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
.e-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--black-1-a);
  clip-path: polygon(
    8px 0%,
    100% 0%,
    100% calc(100% - 8px),
    calc(100% - 8px) 100%,
    0% 100%,
    0% 8px
  );
}

.switch-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.e-switch-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  cursor: pointer;
  background: transparent;
  transition: background 0.15s;
  user-select: none;
}

.e-switch-option:hover {
  background: var(--black-2-a);
}

.option-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  filter:
    drop-shadow(0px 2px 5px rgba(197, 255, 218, 0.2))
    drop-shadow(0px 0px 1px #84ffb1)
    drop-shadow(0px 1px 1px rgba(197, 255, 218, 0.2));
}

.option-overlay {
  position: absolute;
  inset: 0;
  clip-path: polygon(20% 0%, 100% 0%, 100% 80%, 80% 100%, 0% 100%, 0% 20%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background:
    linear-gradient(
      180deg,
      rgba(197, 255, 218, 0.2) 0%,
      rgba(0, 0, 0, 0) 45.68%,
      rgba(197, 255, 218, 0.2) 100%
    ),
    rgba(11, 11, 11, 0.5);
}

.option-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.option-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  white-space: nowrap;
  user-select: none;
}
</style>
