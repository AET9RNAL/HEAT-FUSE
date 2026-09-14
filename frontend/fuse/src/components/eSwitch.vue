<script setup lang="ts">
import { ref } from 'vue'
import { motion } from 'motion-v'
import Icons, { type IconKind } from './Icons.vue'
import { Dynamics } from '../composables/useMotion'

export interface eSwitchOption {
  icon?: IconKind
  label?: string
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

function showOverlay(value: string) {
  return isActive(value)
}

</script>

<template>
  <div class="e-switch">
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
        :animate="{ scale: showOverlay(opt.value) ? 1 : 0, opacity: showOverlay(opt.value) ? 1 : 0 }"
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
        <span v-if="opt.label" class="option-label">{{ opt.label }}</span>
        <Icons v-else-if="opt.icon" :kind="opt.icon" size="large" />
      </div>
    </div>

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
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
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
  -webkit-user-drag: none;
}

.e-switch-option:hover {
  background: var(--black-2-alpha, rgba(25, 25, 25, 0.5));
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
  corner-shape: bevel;
  border-radius: 20% 0 20% 0;
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
