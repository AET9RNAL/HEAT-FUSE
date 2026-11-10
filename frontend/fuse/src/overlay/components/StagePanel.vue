<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ cut?: number; blur?: boolean; dense?: boolean }>(), {
  cut: 8,
  blur: false,
  dense: false,
});

const radius = computed(() => `${props.cut}px 0 ${props.cut}px 0`);
</script>

<template>
  <div class="stage-panel" :class="{ blur, dense }" :style="{ borderRadius: radius }">
    <slot />
  </div>
</template>

<style scoped>
.stage-panel {
  position: relative;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
}

.stage-panel.blur {
  backdrop-filter: blur(45px);
}

.stage-panel.dense {
  background: var(--black-1-s);
}
</style>
