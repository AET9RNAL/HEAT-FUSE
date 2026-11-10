<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import AppIcon from "./AppIcon.vue";
import { formatCombo } from "../../overlayClient";
import { Dynamics } from "../../../composables/useMotion";
import { vTip } from "../../inspector/tooltip";
import type { AppEntry } from "../types";

const props = defineProps<{ app: AppEntry; focused: boolean }>();
defineEmits<{ click: []; menu: [e: MouseEvent] }>();

const hovered = ref(false);
const open = computed(() => props.app.windows.length > 0);
const tip = computed(() => (props.app.hotkey ? `${props.app.name} · ${formatCombo(props.app.hotkey)}` : props.app.name));
const fill = computed(() => (hovered.value || props.focused ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0)"));
</script>

<template>
  <motion.button
    v-tip="tip"
    type="button"
    class="taskbar-button"
    :initial="false"
    :animate="{ backgroundColor: fill }"
    :while-press="{ scale: 0.94 }"
    :transition="Dynamics.quick"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click')"
    @contextmenu.prevent="$emit('menu', $event)"
  >
    <AppIcon :icon-url="app.iconUrl" :name="app.name" :running="app.running" size="large" />
    <span v-if="app.windows.length > 1" class="count">{{ app.windows.length }}</span>
    <span class="strip">
      <motion.span
        class="indicator"
        :initial="false"
        :animate="{ width: focused ? 18 : open ? 8 : 0, opacity: open ? 1 : 0 }"
        :transition="Dynamics.snappy"
      />
    </span>
  </motion.button>
</template>

<style scoped>
.taskbar-button {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.count {
  position: absolute;
  top: 1px;
  right: 3px;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  font-weight: var(--font-weight-2);
  color: var(--accent-200);
  line-height: 1;
}

.strip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 1px;
  display: flex;
  justify-content: center;
  height: 2px;
  pointer-events: none;
}

.indicator {
  height: 2px;
  background: var(--accent-200);
}
</style>
