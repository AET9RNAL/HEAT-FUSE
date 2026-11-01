<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";

const props = defineProps<{
  bars: (number | null)[];
  live: boolean;
}>();

const slots = computed(() => {
  const peak = Math.max(1, ...props.bars.map((v) => v ?? 0));
  return props.bars.map((v, i) => ({
    id: i,
    empty: v == null,
    filling: props.live && i === props.bars.length - 1,
    pct: v == null ? 0 : Math.max(v > 0 ? 8 : 0, (v / peak) * 100),
  }));
});
</script>

<template>
  <div class="bars" :style="{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }" aria-hidden="true">
    <span v-for="s in slots" :key="s.id" class="slot" :class="{ empty: s.empty, filling: s.filling }">
      <motion.span class="bar" :initial="false" :animate="{ height: `${s.pct}%` }" :transition="Dynamics.smooth" />
    </span>
  </div>
</template>

<style scoped>
.bars {
  display: grid;
  gap: calc(2 * var(--u));
  height: calc(14 * var(--u));
  padding: calc(2 * var(--u)) calc(3 * var(--u));
  box-sizing: border-box;
  background: var(--black-1-a);
  border: calc(1 * var(--u)) solid var(--base-600);
  border-top: none;
}

.slot {
  display: flex;
  align-items: flex-end;
  background: color-mix(in srgb, var(--base-200) 6%, transparent);
}

.slot.empty {
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 4px);
}

.bar {
  display: block;
  width: 100%;
  background: color-mix(in srgb, var(--base-200) 55%, transparent);
}

.slot.filling .bar {
  background: var(--tone);
}
</style>
