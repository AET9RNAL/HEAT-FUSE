<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{ ally: number; enemy: number }>();

const { t, n } = useI18n();

/** Ally's share of the combined final score; an even split when neither scored. */
const share = computed(() => {
  const total = props.ally + props.enemy;
  return total > 0 ? props.ally / total : 0.5;
});
</script>

<template>
  <section class="teambar">
    <div class="teams">
      <span class="team">
        <span class="label">{{ t("battles.ally") }}</span>
        <span class="value">{{ n(ally, { maximumFractionDigits: 0 }) }}</span>
      </span>
      <span class="team">
        <span class="label">{{ t("battles.enemyTeam") }}</span>
        <span class="value">{{ n(enemy, { maximumFractionDigits: 0 }) }}</span>
      </span>
    </div>
    <div class="bar">
      <span class="fill ally" :style="{ flexGrow: share }" />
      <span class="fill enemy" :style="{ flexGrow: 1 - share }" />
    </div>
  </section>
</template>

<style scoped>
.teambar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-bottom: var(--space-1);
}

.teams {
  position: relative;
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) var(--space-3);
  background: var(--black-3-a);
}

.team {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.label,
.value {
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: normal;
  white-space: nowrap;
}

.label {
  font-family: var(--font-primary);
  color: var(--text-muted);
  text-transform: uppercase;
}

.value {
  font-family: var(--font-microcopy);
  color: var(--text-main);
}

.bar {
  --slant: 10px;
  position: relative;
  display: flex;
  gap: var(--space-0);
  height: 12px;
  padding: 0 var(--space-0, 2px);
}

.fill {
  --bevel: 6px;
  flex-basis: 0;
  min-width: calc(var(--slant) + var(--bevel));
}

.ally {
  background: var(--accent-200);
  clip-path: polygon(var(--bevel) 0, 100% 0, calc(100% - var(--slant)) 100%, 0 100%, 0 var(--bevel));
}

.enemy {
  background: var(--error-base);
  clip-path: polygon(var(--slant) 0, 100% 0, 100% calc(100% - var(--bevel)), calc(100% - var(--bevel)) 100%, 0 100%);
}
</style>
