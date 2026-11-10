<script lang="ts">
import type { IconKind } from "../../../components/ui/Icons.vue";

export interface StageMenuItem {
  id: string;
  label?: string;
  icon?: IconKind;
  /** Key caps on the right: modifiers first, the main key last. */
  keys?: string[];
  /** Opens a sub-menu: an arrow on the right. */
  submenu?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** A line between groups. Takes no other field. */
  divider?: boolean;
}
</script>

<script setup lang="ts">
import { motion } from "motion-v";
import Icons from "../../../components/ui/Icons.vue";
import eKey from "../../../components/ui/eKey.vue";
import { Dynamics } from "../../../composables/useMotion";

defineProps<{ items: StageMenuItem[]; activeId?: string | null }>();
const emit = defineEmits<{ select: [id: string]; hover: [id: string] }>();

function pick(item: StageMenuItem): void {
  if (!item.disabled && !item.divider) emit("select", item.id);
}
</script>

<template>
  <div class="stage-menu" role="menu">
    <template v-for="item in items" :key="item.id">
      <div v-if="item.divider" class="divider" role="separator" />
      <motion.button
        v-else
        type="button"
        role="menuitem"
        class="menu-item"
        :class="{ active: activeId === item.id, disabled: item.disabled, danger: item.danger }"
        :disabled="item.disabled"
        :initial="false"
        :animate="{ backgroundColor: activeId === item.id ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0)' }"
        :transition="Dynamics.quick"
        @click="pick(item)"
        @mouseenter="emit('hover', item.id)"
      >
        <motion.span
          class="bar"
          :initial="false"
          :animate="{ opacity: activeId === item.id ? 1 : 0 }"
          :transition="Dynamics.quick"
        />
        <Icons v-if="item.icon" :kind="item.icon" size="small" :color="item.danger ? 'var(--error-highlight)' : 'var(--text-muted)'" />
        <span class="label">{{ item.label }}</span>
        <span v-if="item.keys?.length" class="keys">
          <eKey
            v-for="(k, i) in item.keys"
            :key="k + i"
            :label="k.toUpperCase()"
            :variant="i === item.keys.length - 1 ? 'standalone' : 'functional'"
            size="mini"
          />
        </span>
        <Icons v-if="item.submenu" class="sub" kind="chevron-down" size="small" color="var(--text-muted)" />
      </motion.button>
    </template>
  </div>
</template>

<style scoped>
.stage-menu {
  display: flex;
  flex-direction: column;
  padding: var(--space-1);
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 28px;
  padding: 0 var(--space-2) 0 10px;
  border: none;
  color: var(--text-main);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  text-align: left;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.menu-item.danger {
  color: var(--error-highlight);
}

.menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bar {
  position: absolute;
  left: 0;
  top: 7px;
  width: 2px;
  height: 14px;
  background: var(--accent-200);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keys {
  flex: none;
  display: flex;
  gap: 2px;
}

.sub {
  transform: rotate(-90deg);
}

.divider {
  height: 1px;
  margin: var(--space-1) var(--space-2);
  background: var(--black-3);
}
</style>
