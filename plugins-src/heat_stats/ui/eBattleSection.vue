<script setup lang="ts">
import eBattleMetric from "./eBattleMetric.vue";

defineProps<{
  title: string;
  metrics: { key: string; label: string; value: string; sub?: string }[];
}>();
</script>

<template>
  <section class="section">
    <header class="head">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h4 class="title">{{ title }}</h4>
      <span class="rule" />
    </header>

    <div class="metrics">
      <eBattleMetric v-for="m in metrics" :key="m.key" :label="m.label" :value="m.value" :sub="m.sub" />
    </div>
  </section>
</template>

<style scoped>
.section {
  container-type: inline-size;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 8px;
}

.wedge {
  width: 8px;
  height: 8px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.title {
  flex: none;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.rule {
  flex: 1 1 auto;
  height: 1px;
  background: var(--base-600);
}

.metrics {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3) var(--space-4);
}

@container (max-width: 620px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
