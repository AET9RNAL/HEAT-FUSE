<script setup lang="ts">
/**
 * Every control type resolves here, so built-in and plugin sections look
 * and behave identically. The input itself is ControlInput, which the App's
 * plugin config panel renders too.
 */
import { computed } from "vue";
import ControlInput from "./ControlInput.vue";
import { vTip } from "./tooltip";
import type { InputPhase, InspectorControl } from "./types";

const props = defineProps<{
  control: InspectorControl;
  value: unknown;
  disabled: boolean;
}>();

const emit = defineEmits<{
  set: [value: unknown, phase: InputPhase];
  action: [payload?: unknown];
}>();

const c = computed(() => props.control);

const FULL_ROW = new Set(["radio", "button", "buttonRow", "note", "divider", "segmented", "buttons"]);
const stacked = computed(() => {
  if (c.value.type === "divider") return true;
  return c.value.width === "full" || !c.value.label || FULL_ROW.has(c.value.type);
});
</script>

<template>
  <div v-if="c.type === 'divider'" class="ctl-divider"></div>

  <div v-else class="ctl-row" :class="{ stacked, disabled }">
    <div v-if="c.label" v-tip="c.tooltip" class="ctl-label">
      <span class="ctl-label-text">{{ c.label }}</span>
    </div>

    <div class="ctl-body" v-tip="c.label ? undefined : c.tooltip">
      <ControlInput
        :control="c"
        :value="value"
        :disabled="disabled"
        @set="(v, phase) => emit('set', v, phase)"
        @action="(payload) => emit('action', payload)"
      />
    </div>
  </div>

  <p v-if="c.type !== 'divider' && c.hint" class="ctl-hint">{{ c.hint }}</p>
</template>

<style scoped>
.ctl-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  min-height: 26px;
}

.ctl-row.stacked {
  grid-template-columns: minmax(0, 1fr);
}

.ctl-row.stacked .ctl-label {
  margin-bottom: var(--space-1);
}

.ctl-label {
  min-width: 0;
}

.ctl-label-text {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}

.ctl-row.disabled .ctl-label-text {
  opacity: 0.5;
}

.ctl-body {
  min-width: 0;
}

.ctl-hint {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  line-height: 1.4;
  color: var(--base-600);
}

.ctl-divider {
  height: 1px;
  background: var(--black-3);
}
</style>
