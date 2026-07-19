<script setup lang="ts">
import { computed, ref } from "vue";
import { cutClipPath, useClipStroke } from "../composables/useClipStroke";

const props = withDefaults(defineProps<{ cut?: number; blur?: boolean }>(), {
  cut: 8,
  blur: false,
});

const el = ref<HTMLElement | null>(null);
const points = useClipStroke(el, props.cut);
const clip = computed(() => cutClipPath(props.cut));
</script>

<template>
  <div ref="el" class="stage-panel" :class="{ blur }" :style="{ clipPath: clip }">
    <slot />
    <svg
      v-if="points"
      class="panel-stroke"
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
.stage-panel {
  position: relative;
  background: var(--black-1-a);
}

.stage-panel.blur {
  backdrop-filter: blur(35px);
  -webkit-backdrop-filter: blur(35px);
}

.panel-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
</style>
