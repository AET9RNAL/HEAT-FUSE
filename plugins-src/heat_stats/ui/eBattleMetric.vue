<script setup lang="ts">
withDefaults(defineProps<{ label: string; value: string; sub?: string }>(), { sub: "" });
</script>

<template>
  <div class="metric">
    <span class="label">{{ label }}</span>
    <span class="value">{{ value }}</span>
    <span class="sub">{{ sub }}</span>
  </div>
</template>

<style scoped>
.metric {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label,
.value,
.sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  line-height: 1.1;
}

.label {
  font-size: var(--secondary-font-size-5);
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.value {
  font-size: var(--main-font-size-3);
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.sub {
  min-height: 1em;
  font-size: var(--secondary-font-size-5);
  color: var(--base-600);
}
</style>
