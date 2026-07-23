<script setup lang="ts">
import "fuse_ui/ui/tokens.css";

withDefaults(
  defineProps<{
    label: string;
    value: string;
    accent?: string;
    sub?: string;
  }>(),
  { accent: "var(--text-main)", sub: "" },
);
</script>

<template>
  <div class="estat">
    <div class="estat-label">{{ label }}</div>
    <div class="estat-value" :style="{ color: accent }">{{ value }}</div>
    <div v-if="sub" class="estat-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.estat {
  user-select: none;
  -webkit-user-select: none;
  --ch6: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
  min-width: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  clip-path: var(--ch6);
  padding: var(--space-1) var(--space-2);
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.estat-label {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.estat-value {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1.15;
  white-space: nowrap;
}

.estat-sub {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
