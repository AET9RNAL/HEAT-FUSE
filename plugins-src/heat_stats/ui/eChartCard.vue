<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import { NEGATIVE, POSITIVE } from "./palette.mjs";

export interface Reading {
  label: string;
  value: string;
  dir?: number;
}

const props = withDefaults(
  defineProps<{
    title: string;
    caption?: string;
    tall?: boolean;
    index?: string;
    readings?: Reading[];
    focused?: boolean;
    dimmed?: boolean;
    order?: number;
  }>(),
  { order: 0 },
);

const emit = defineEmits<{ enter: []; leave: [] }>();

const card = ref<{ $el?: HTMLElement } | HTMLElement | null>(null);

const visible = ref(typeof IntersectionObserver === "undefined");
let watcher: IntersectionObserver | null = null;

onMounted(() => {
  if (visible.value) return;
  const el = (card.value && "$el" in card.value ? card.value.$el : card.value) as HTMLElement | null;
  if (!el) {
    visible.value = true;
    return;
  }
  watcher = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      visible.value = true;
      watcher?.disconnect();
    },
    { rootMargin: "240px 0px" },
  );
  watcher.observe(el);
});

onBeforeUnmount(() => watcher?.disconnect());
</script>

<template>
  <motion.section
    ref="card"
    class="card"
    :class="{ tall, focused, dimmed }"
    :initial="{ opacity: 0, y: 10 }"
    :animate="{ opacity: 1, y: focused ? -2 : 0 }"
    :transition="{ ...Dynamics.snappy, delay: order * 0.04 }"
    @pointerenter="emit('enter')"
    @pointerleave="emit('leave')"
    @focusin="emit('enter')"
    @focusout="emit('leave')"
  >
    <header class="head">
      <span v-if="index" class="index">{{ index }}</span>
      <h3 class="title">{{ title }}</h3>
      <span v-if="caption" class="caption">{{ caption }}</span>
      <slot name="controls" />
    </header>

    <div v-if="readings?.length" class="readout">
      <span v-for="r in readings" :key="r.label" class="read">
        <span class="read-label">{{ r.label }}</span>
        <span
          class="read-value"
          :class="{ down: (r.dir ?? 0) < 0 }"
          :style="r.dir ? { color: r.dir > 0 ? POSITIVE : NEGATIVE } : undefined"
        >
          <i v-if="r.dir" class="trend" aria-hidden="true" />
          {{ r.value }}
        </span>
      </span>
    </div>

    <div class="body">
      <slot :visible="visible" />
    </div>
  </motion.section>
</template>

<style scoped>
.card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--black-2);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.card.focused {
  background: var(--black-1);
  border-color: color-mix(in srgb, var(--accent-200) 45%, var(--base-600));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}

.card.dimmed {
  border-color: color-mix(in srgb, var(--base-600) 45%, transparent);
}

.head {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  box-sizing: border-box;
  background: var(--black-3);
  border-bottom: 1px solid var(--base-600);
  transition: background 0.2s;
}

.card.focused .head {
  background: var(--black-2);
}

.index {
  flex: none;
  align-self: center;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--base-600);
  font-variant-numeric: tabular-nums;
  transition: color 0.2s;
}

.card.focused .index {
  color: var(--accent-200);
}

.title {
  margin: 0;
  flex: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
  transition: color 0.2s;
}

.caption {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: normal;
  color: var(--text-muted);
  transition: color 0.2s, opacity 0.2s;
}

.card.dimmed .title {
  color: var(--text-muted);
}

.card.dimmed .caption {
  opacity: 0.5;
}

.readout {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  padding: 0 var(--space-4);
  background: var(--black-2);
  border-bottom: 1px solid var(--base-600);
  transition: opacity 0.2s, background 0.2s;
}

.card.focused .readout {
  background: var(--black-1);
}

.card.dimmed .readout {
  filter: saturate(0.2);
  opacity: 0.55;
}

.read {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) var(--space-2) 0;
  margin-right: var(--space-4);
  border-right: 1px solid transparent;
}

.read:last-child {
  margin-right: 0;
  padding-right: 0;
}

.read-label {
  flex: none;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.read-value {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-3);
  line-height: 1.2;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.trend {
  flex: none;
  width: 8px;
  height: 8px;
  background: currentColor;
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.read-value.down .trend {
  transform: rotate(180deg);
}

.body {
  flex: 1 0 auto;
  min-height: 0;
  padding: var(--space-4);
  box-sizing: border-box;
  filter: saturate(0.35);
  opacity: 0.9;
  transition: filter 0.25s, opacity 0.25s;
}

.card.focused .body {
  filter: none;
  opacity: 1;
}

.card.dimmed .body {
  filter: saturate(0);
  opacity: 0.18;
}

.card :deep(.chart) {
  aspect-ratio: auto;
  height: 220px;
}

.card.tall :deep(.chart) {
  height: 300px;
}
</style>
