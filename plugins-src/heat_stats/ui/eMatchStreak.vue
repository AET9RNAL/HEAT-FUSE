<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "./i18n.mjs";

const props = withDefaults(defineProps<{ outcomes: string[]; longest: number | null; length?: number }>(), {
  length: 75,
});

const { t, n } = useI18n();

const GLYPH = "M42 0H23.9249L0.105143 23.9744L0 36H18.0273L41.9809 11.9776L42 0Z";
const GLYPH_W = 42;
const GLYPH_H = 36;

const shown = computed(() => props.outcomes.slice(-props.length));
const width = computed(() => shown.value.length * GLYPH_W);

function tone(outcome: string): string {
  if (outcome === "win") return "win";
  if (outcome === "loss") return "loss";
  return "even";
}
</script>

<template>
  <div class="streak">
    <svg class="strip" :width="width" :height="GLYPH_H" :viewBox="`0 0 ${width} ${GLYPH_H}`" aria-hidden="true">
      <path
        v-for="(outcome, i) in shown"
        :key="i"
        :class="tone(outcome)"
        :d="GLYPH"
        :transform="`translate(${i * GLYPH_W} 0)`"
      />
    </svg>
    <span class="label">{{ t("overview.longestWinStreak", { count: n(longest, { maximumFractionDigits: 0 }) }) }}</span>
  </div>
</template>

<style scoped>
.streak {
  flex: none;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-2);
}

.strip {
  display: block;
  flex: none;
  max-width: 100%;
  height: auto;
}

.win {
  fill: var(--accent-200);
}

.loss {
  fill: var(--error-base);
}

.even {
  fill: var(--base-600);
}

.label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
