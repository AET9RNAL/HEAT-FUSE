<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ cut?: number; blur?: boolean }>(), {
  cut: 8,
  blur: false,
});

const radius = computed(() => `${props.cut}px 0 ${props.cut}px 0`);
</script>

<template>
  <div class="stage-panel" :class="{ blur }" :style="{ borderRadius: radius }">
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
  backdrop-filter: blur(35px);
  -webkit-backdrop-filter: blur(35px);
}
</style>
