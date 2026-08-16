<script setup lang="ts">
import "fuse_ui/ui/tokens.css";

defineProps<{ health: number; side: "ally" | "enemy"; dead?: boolean }>();
</script>

<template>
  <div class="ehp" :class="[side, { dead }]">
    <span class="ehp-fill" :style="{ width: health + '%' }" />
  </div>
</template>

<style scoped>
.ehp {
  width: 100%;
  height: 100%;
  background: var(--black-3-a);
  --hp: var(--woth-ally);
}
.ehp.enemy {
  --hp: var(--woth-enemy);
}
.ehp-fill {
  display: block;
  height: 100%;
  background: var(--hp);
  transition: width 0.2s;
}
.ehp.dead .ehp-fill {
  width: 0 !important;
}
</style>
