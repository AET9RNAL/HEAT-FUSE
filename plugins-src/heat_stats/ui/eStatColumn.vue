<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>

<template>
  <div class="column">
    <div class="header">{{ label }}</div>
    <div class="body">
      <span class="value">{{ value }}</span>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.column {
  position: relative;
  flex: 1 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3px 50px 3px var(--space-1);
  box-sizing: border-box;
  background: var(--black-1-a);
  border-right: 1px solid var(--base-600);
}

.column:last-child {
  border-right: none;
}

.header {
  width: 100%;
  display: flex;
  align-items: center;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.body {
  width: 100%;
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
}

.value {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-1);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-main);
  white-space: nowrap;
}
</style>
