<script setup lang="ts">
withDefaults(defineProps<{ label: string; tone?: "muted" | "accent" }>(), { tone: "muted" });
</script>

<template>
  <span class="stage-chip" :class="tone">{{ label }}</span>
</template>

<style scoped>
.stage-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  line-height: 1;
  white-space: nowrap;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.stage-chip.accent {
  background: transparent;
  border-style: dashed;
  border-color: var(--accent-200);
  color: var(--accent-200);
}
</style>
