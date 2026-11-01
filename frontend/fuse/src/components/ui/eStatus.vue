<script lang="ts">
export type StatusState = 'None' | 'Initializing' | 'Connecting' | 'Running' | 'Error'
</script>

<script setup lang="ts">
import { computed } from 'vue'

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

</script>

<template>
  <div class="e-status">
    <span class="dot" :style="{ background: dotColor, boxShadow: dotGlow }" />
    <span class="label">{{ status }}</span>
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
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  user-select: none;
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
