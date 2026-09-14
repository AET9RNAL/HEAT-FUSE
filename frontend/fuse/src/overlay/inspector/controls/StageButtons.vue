<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import Icons from "../../../components/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";
import { useTipDirective } from "../tooltip";
import type { Option } from "../types";

const vTip = useTipDirective();

const props = withDefaults(
  defineProps<{
    modelValue: unknown;
    options: (Option & { icon?: string })[];
    mode?: "exclusive" | "multi";
    disabled?: boolean;
  }>(),
  { mode: "exclusive", disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: unknown] }>();

const selection = computed<unknown[]>(() =>
  props.mode === "multi" ? (Array.isArray(props.modelValue) ? props.modelValue : []) : [props.modelValue],
);

function isOn(v: unknown): boolean {
  return selection.value.includes(v);
}

function pick(v: unknown): void {
  if (props.mode !== "multi") {
    emit("update:modelValue", v);
    return;
  }
  const next = isOn(v) ? selection.value.filter((x) => x !== v) : [...selection.value, v];
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="stage-buttons" :class="{ disabled }">
    <motion.button
      v-for="o in options"
      :key="String(o.value)"
      v-tip="o.tooltip"
      type="button"
      class="btn"
      :class="{ active: isOn(o.value), 'icon-only': !!o.icon && !o.label }"
      :disabled="disabled"
      :initial="false"
      :animate="{
        backgroundColor: isOn(o.value) ? 'var(--accent-200)' : 'rgba(255,255,255,0)',
        color: isOn(o.value) ? 'var(--base-1000)' : 'var(--text-muted)',
      }"
      :transition="Dynamics.quick"
      :while-press="disabled ? {} : { scale: 0.96 }"
      @click="pick(o.value)"
    >
      <Icons v-if="o.icon" :kind="o.icon as never" size="small" color="var(--ico)" />
      <span v-if="o.label">{{ o.label }}</span>
    </motion.button>
  </div>
</template>

<style scoped>
.stage-buttons {
  position: relative;
  display: flex;
  gap: var(--space-0);
  padding: var(--space-0);
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.btn {
  --ico: var(--text-muted);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  height: 22px;
  padding: 0 var(--space-2);
  border: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  cursor: pointer;
  white-space: nowrap;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.btn.icon-only {
  flex: none;
  width: 26px;
  padding: 0;
}

.btn:hover:not(:disabled) { --ico: var(--text-main); }
.btn.active { --ico: var(--base-1000); }

.stage-buttons.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
