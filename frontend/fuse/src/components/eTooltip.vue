<script setup lang="ts">
import { computed } from "vue";
import Icons from "./Icons.vue";
import { tip } from "../directives/vTip";

const style = computed(() => ({
  left: `${tip.x}px`,
  top: `${tip.y}px`,
  transform: tip.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
}));
</script>

<template>
  <Teleport to="body">
    <div v-if="tip.visible && tip.text" class="stage-tip" :style="style">
      <Icons kind="about" size="small" color="var(--text-muted)" />
      <span class="tip-text">{{ tip.text }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.stage-tip {
  position: fixed;
  /* Above every app layer; modals reach 10000. */
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  max-width: 260px;
  padding: var(--space-2);
  background: hsla(142, 1%, 6%, 0.96);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: none;
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.tip-text {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.4;
  color: var(--text-main);
}
</style>
