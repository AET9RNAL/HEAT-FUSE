<script setup lang="ts">
import { activeGuides } from "../stageState";
import type { Guide } from "../stageState";

function styleFor(g: Guide): Record<string, string> {
  if (g.axis === "x") {
    return { left: `${g.at}px`, top: `${g.from}px`, height: `${g.to - g.from}px`, width: "1px" };
  }
  return { top: `${g.at}px`, left: `${g.from}px`, width: `${g.to - g.from}px`, height: "1px" };
}
</script>

<template>
  <div class="snap-guides">
    <div
      v-for="(g, i) in activeGuides"
      :key="`${g.axis}-${g.at}-${i}`"
      class="guide"
      :style="styleFor(g)"
    />
  </div>
</template>

<style scoped>
.snap-guides {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

.guide {
  position: absolute;
  background: #ff3b30;
}
</style>
