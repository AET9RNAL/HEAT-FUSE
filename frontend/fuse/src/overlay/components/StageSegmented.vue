<script setup lang="ts" generic="T extends string">
import { ref } from "vue";
import { cutClipPath, useClipStroke } from "../composables/useClipStroke";

const CUT = 6;

defineProps<{
  options: { value: T; label: string }[];
  modelValue: T;
}>();

const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const el = ref<HTMLElement | null>(null);
const points = useClipStroke(el, CUT);
</script>

<template>
  <div ref="el" class="stage-segmented" :style="{ clipPath: cutClipPath(CUT) }">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="seg-btn"
      :class="{ active: o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >{{ o.label }}</button>
    <svg
      v-if="points"
      class="seg-stroke"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        :points="points"
        fill="none"
        stroke="#525252"
        stroke-width="0.4"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </div>
</template>

<style scoped>
.stage-segmented {
  position: relative;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);
  background: var(--black-1-a);
}

.seg-btn {
  flex: 1;
  height: 24px;
  border: none;
  padding: 0 var(--space-2);
  background: transparent;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.seg-btn:hover {
  color: var(--text-main);
}

.seg-btn.active {
  background: var(--accent-600);
  color: var(--base-1000);
  clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
}

.seg-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
