<script lang="ts">
let seq = 0;
</script>

<script setup lang="ts">
import { motion } from "motion-v";

withDefaults(defineProps<{ draw?: boolean; march?: boolean }>(), { draw: true, march: false });

const SMOOTH: [number, number, number, number] = [0.4, 0.5, 0.4, 1];

function drawing(i: number) {
  return {
    pathLength: { duration: 1.1, delay: i * 0.12, ease: SMOOTH },
    fillOpacity: { duration: 0.6, delay: 0.55 + i * 0.12 },
  };
}

const HALVES = [
  "M12.0002 0H5.98665L0 6.00008H5.98665V11.9998L11.9867 6.00008L12.0002 0Z",
  "M12.0002 11.9998H18.0134L24.0001 6.00008H18.0134V0L12.0134 6.00008L12.0002 11.9998Z",
];

const gradient = `hs-mark-${(seq += 1)}`;
</script>

<template>
  <svg class="mark" :class="{ march }" viewBox="0 0 24 12" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" class="from" />
        <stop offset="100%" class="to" />
      </linearGradient>
    </defs>

    <template v-if="march">
      <path
        v-for="(d, i) in HALVES"
        :key="i"
        :d="d"
        :fill="`url(#${gradient})`"
        vector-effect="non-scaling-stroke"
        :style="{ animationDelay: `${i * -3}s` }"
      />
    </template>

    <template v-else>
      <motion.path
        v-for="(d, i) in HALVES"
        :key="i"
        :d="d"
        :fill="`url(#${gradient})`"
        vector-effect="non-scaling-stroke"
        :initial="draw ? { pathLength: 0, fillOpacity: 0 } : false"
        :animate="{ pathLength: 1, fillOpacity: 1 }"
        :transition="drawing(i)"
      />
    </template>
  </svg>
</template>

<style scoped>
.mark {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  color: color-mix(in srgb, var(--base-50) 30%, transparent);
}

.mark path {
  stroke: currentColor;
  stroke-width: 1;
  stroke-linejoin: miter;
}

.mark.march path {
  stroke-dasharray: 3 2.2;
  animation: hs-march 9s linear infinite;
}

@keyframes hs-march {
  to {
    stroke-dashoffset: -52;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mark.march path {
    animation: none;
  }
}

.from {
  stop-color: var(--base-50);
  stop-opacity: 0.045;
}

.to {
  stop-color: var(--base-50);
  stop-opacity: 0.004;
}
</style>
