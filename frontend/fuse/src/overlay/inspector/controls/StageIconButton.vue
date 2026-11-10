<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import Icons, { type IconKind } from "../../../components/ui/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";
import { vTip } from "../tooltip";

const props = withDefaults(
  defineProps<{
    icon: IconKind;
    tip?: string;
    danger?: boolean;
    active?: boolean;
    disabled?: boolean;
  }>(),
  { tip: "", danger: false, active: false, disabled: false },
);

defineEmits<{ click: [e: MouseEvent] }>();

const hovered = ref(false);

const fill = computed(() => {
  if (props.active) return "var(--accent-200-a)";
  if (!hovered.value || props.disabled) return "rgba(255, 255, 255, 0)";
  return props.danger ? "var(--error-color)" : "rgba(255, 255, 255, 0.06)";
});

const ico = computed(() => (hovered.value || props.active ? "var(--text-main)" : "var(--text-muted)"));
</script>

<template>
  <motion.button
    v-tip="tip || undefined"
    type="button"
    class="stage-icon-button"
    :class="{ disabled }"
    :disabled="disabled"
    :initial="false"
    :animate="{ backgroundColor: fill }"
    :while-press="disabled ? {} : { scale: 0.92 }"
    :transition="Dynamics.quick"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click', $event)"
  >
    <Icons :kind="icon" size="small" :color="ico" />
  </motion.button>
</template>

<style scoped>
.stage-icon-button {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.stage-icon-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
