<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

interface Props {
  label?: string;
  variant?: "primary" | "secondary" | "tertiary";
  fill?: string;
  color?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: "",
  variant: "primary",
  fill: "",
  color: "",
  disabled: false,
});

const buttonStyle = computed(() => {
  const vars: Record<string, string> = {};
  if (props.fill) vars["--btn-fill"] = props.fill;
  if (props.color) vars["--btn-color"] = props.color;
  return vars;
});

const CUT = 6;
const btnEl = ref<HTMLElement | null>(null);
const elW = ref(0);
const elH = ref(0);

const svgPoints = computed(() => {
  const w = elW.value;
  const h = elH.value;
  if (!w || !h) return "";
  const cx = (CUT / w) * 100;
  const cy = (CUT / h) * 100;
  return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`;
});

let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!btnEl.value) return;
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    elW.value = box ? box.inlineSize : entry.contentRect.width;
    elH.value = box ? box.blockSize : entry.contentRect.height;
  });
  ro.observe(btnEl.value);
});
onUnmounted(() => ro?.disconnect());
</script>

<template>
  <button
    ref="btnEl"
    class="material-button"
    :class="variant"
    :style="buttonStyle"
    :disabled="disabled"
    :title="label || undefined"
  >
    <span v-if="label" class="label">{{ label }}</span>
    <slot />
    <svg
      v-if="svgPoints"
      class="btn-stroke"
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
  </button>
</template>

<style scoped>
.material-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: none;
  background: var(--btn-fill, var(--black-1-a));
  color: var(--btn-color, var(--text-main));
  cursor: pointer;
  clip-path: polygon(
    6px 0%,
    100% 0%,
    100% calc(100% - 6px),
    calc(100% - 6px) 100%,
    0% 100%,
    0% 6px
  );
  transition: filter 0.15s ease;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  user-select: none;
  -webkit-user-select: none;
}

.material-button:hover {
  filter: brightness(1.25);
}

.material-button:active {
  filter: brightness(0.85);
}

.material-button.tertiary {
  background: transparent;
}

.material-button.tertiary:hover {
  background: rgba(255, 255, 255, 0.06);
  filter: none;
}

.material-button.tertiary:active {
  background: rgba(255, 255, 255, 0.03);
  filter: none;
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  position: relative;
  z-index: 1;
  white-space: nowrap;
  color: inherit;
  line-height: 1;
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

.material-button:focus-visible {
  outline: 2px solid var(--accent-200);
  outline-offset: 2px;
}

.material-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: none;
}
</style>
