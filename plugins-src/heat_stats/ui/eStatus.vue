<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";

const props = withDefaults(defineProps<{ state?: string; label?: string }>(), {
  state: "idle",
  label: "",
});


const FILLS: Record<string, { body: string; stroke: string; text: string }> = {
  idle: { body: "var(--black-1-a)", stroke: "var(--base-600)", text: "var(--text-muted)" },
  recording: { body: "var(--accent-200)", stroke: "var(--accent-200)", text: "var(--base-1000)" },
  submitting: { body: "var(--accent-600)", stroke: "var(--accent-600)", text: "var(--base-1000)" },
  local: { body: "var(--black-1-a)", stroke: "var(--base-600)", text: "var(--text-muted)" },
  online: { body: "var(--black-1-a)", stroke: "var(--accent-200)", text: "var(--accent-200)" },
  syncing: { body: "var(--accent-600)", stroke: "var(--accent-600)", text: "var(--base-1000)" },
  offline: { body: "var(--error-color)", stroke: "var(--error-highlight)", text: "var(--error-highlight)" },
};

const fill = computed(() => FILLS[props.state] ?? FILLS.idle!);
</script>

<template>
  <motion.div
    class="e-status"
    :initial="false"
    :animate="{ backgroundColor: fill.body, borderColor: fill.stroke, color: fill.text }"
    :transition="Dynamics.quick"
    :title="label || undefined"
  >
    <span class="indicator"><span class="dot" /></span>
    <span class="label">{{ label }}</span>
  </motion.div>
</template>

<style scoped>
.e-status {
  position: relative;
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 18px;
  min-width: 64px;
  max-width: 100%;
  margin: 3px 0;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  overflow: hidden;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  color: var(--text-muted);
  user-select: none;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.indicator {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5.657px;
  height: 5.657px;
  overflow: hidden;
}

.dot {
  width: 4px;
  height: 4px;
  background: currentColor;
  transform: rotate(45deg);
}

.label {
  min-width: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
