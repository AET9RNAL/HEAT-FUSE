<script setup lang="ts">
import { motion } from "motion-v";
import AppIcon from "./AppIcon.vue";
import StageChip from "../../inspector/controls/StageChip.vue";
import eKey from "../../../components/ui/eKey.vue";
import { Dynamics } from "../../../composables/useMotion";
import type { AppEntry } from "../types";

defineProps<{
  app: AppEntry;
  selected: boolean;
  aliasMatch: boolean;
  typeLabel: string;
}>();

defineEmits<{ open: []; menu: [e: MouseEvent]; hover: [] }>();
</script>

<template>
  <motion.button
    type="button"
    class="console-row"
    :initial="false"
    :animate="{ backgroundColor: selected ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0)' }"
    :transition="Dynamics.quick"
    @click="$emit('open')"
    @contextmenu.prevent="$emit('menu', $event)"
    @mousemove="$emit('hover')"
  >
    <motion.span class="bar" :initial="false" :animate="{ opacity: selected ? 1 : 0 }" :transition="Dynamics.quick" />
    <AppIcon :icon-url="app.iconUrl" :name="app.name" :running="app.running" />
    <span class="name">{{ app.name }}</span>
    <span class="plugin">{{ app.pluginId }}</span>
    <StageChip v-if="app.alias" :label="app.alias" :tone="aliasMatch ? 'accent' : 'muted'" />
    <span class="spacer" />
    <span v-if="app.hotkey" class="keys">
      <eKey
        v-for="(k, i) in app.hotkey.split('+')"
        :key="k + i"
        :label="k.toUpperCase()"
        :variant="i === app.hotkey.split('+').length - 1 ? 'standalone' : 'functional'"
        size="mini"
      />
    </span>
    <span class="type">{{ typeLabel }}</span>
  </motion.button>
</template>

<style scoped>
.console-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  border: none;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.bar {
  position: absolute;
  left: 0;
  top: 12px;
  width: 2px;
  height: 16px;
  background: var(--accent-200);
}

.name {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
}

.plugin {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--base-600);
}

.spacer {
  flex: 1;
}

.keys {
  flex: none;
  display: flex;
  gap: 2px;
}

.type {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
}
</style>
