<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="console-section">{{ title }}</div>
</template>

<style scoped>
.console-section {
  padding: var(--space-3) var(--space-3) var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  letter-spacing: 0.04em;
  color: var(--text-muted);
  user-select: none;
}
</style>
