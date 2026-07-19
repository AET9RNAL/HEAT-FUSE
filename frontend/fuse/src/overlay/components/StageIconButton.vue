<script setup lang="ts">
import { ref } from "vue";
import { cutClipPath, useClipStroke } from "../composables/useClipStroke";

const CUT = 4;

withDefaults(
  defineProps<{
    title?: string;
    active?: boolean;
    disabled?: boolean;
    /** "ghost" drops the chrome (bg + stroke) - e.g. a panel close button. */
    variant?: "chrome" | "ghost";
  }>(),
  {
    title: "",
    active: false,
    disabled: false,
    variant: "chrome",
  },
);

const emit = defineEmits<{ click: [] }>();

const el = ref<HTMLElement | null>(null);
const points = useClipStroke(el, CUT);
</script>

<template>
  <button
    ref="el"
    type="button"
    class="stage-icon-btn"
    :class="[variant, { active }]"
    :style="variant === 'chrome' ? { clipPath: cutClipPath(CUT) } : undefined"
    :title="title"
    :disabled="disabled"
    @click="emit('click')"
  >
    <slot />
    <svg
      v-if="variant === 'chrome' && points"
      class="btn-stroke"
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
  </button>
</template>

<style scoped>
.stage-icon-btn {
  position: relative;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  padding: 0;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.stage-icon-btn.chrome {
  background: var(--black-1-a);
}

.stage-icon-btn.ghost {
  background: transparent;
}

.stage-icon-btn:hover:not(:disabled) {
  color: var(--text-main);
}

.stage-icon-btn.chrome.active {
  background: var(--accent-600);
  color: var(--base-1000);
}

.stage-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stage-icon-btn :slotted(svg) {
  width: var(--icon-normal);
  height: var(--icon-normal);
  fill: currentColor;
  stroke-linecap: round;
}

.btn-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
</style>
