<script setup lang="ts">
import { NEGATIVE, NEUTRAL, POSITIVE } from "./palette.mjs";

const props = withDefaults(
  defineProps<{
    rank: string;
    name: string;
    values: number[];
    formats: ((v: number) => string)[];
    share: number;
    delta: number | null;
    sorted?: number;
  }>(),
  { sorted: -1 },
);

const rail = (): string => {
  if (props.delta == null || Math.abs(props.delta) < 0.5) return NEUTRAL;
  return props.delta > 0 ? POSITIVE : NEGATIVE;
};
</script>

<template>
  <div class="entry" :style="{ '--rail': rail() }">
    <div class="rule" />
    <div class="row">
      <span class="rank">{{ rank }}</span>
      <span class="name">{{ name }}</span>
      <span v-for="(value, i) in values" :key="i" class="cell" :class="{ lit: i === sorted }">
        {{ formats[i](value) }}
      </span>
    </div>
    <div class="share">
      <span class="share-fill" :style="{ width: `${Math.round(share * 100)}%` }" />
    </div>
  </div>
</template>

<style scoped>
.entry {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-2);
}

.entry::before {
  content: "";
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 0;
  width: 2px;
  background: var(--rail);
  clip-path: polygon(0 3px, 100% 0, 100% calc(100% - 3px), 0 100%);
  transition: width 0.15s;
}

.entry:hover::before {
  width: 4px;
}

.rule {
  position: relative;
  width: 100%;
  height: 0;
}

.rule::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 1px;
  background: var(--base-600);
}

.row {
  width: 100%;
  display: grid;
  grid-template-columns: var(--perf-columns);
  align-items: center;
}

.rank,
.name,
.cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: normal;
  white-space: nowrap;
}

.rank {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  letter-spacing: 0.08em;
  color: var(--base-600);
  font-variant-numeric: tabular-nums;
  transition: color 0.15s;
}

.entry:hover .rank {
  color: var(--text-muted);
}

.name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  color: var(--text-main);
  text-transform: uppercase;
}

.cell {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  transition: color 0.15s;
}

.cell.lit {
  color: var(--text-main);
}

.share {
  position: relative;
  height: 2px;
  background: color-mix(in srgb, var(--base-600) 45%, transparent);
}

.share-fill {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--rail) 55%, transparent);
}
</style>
