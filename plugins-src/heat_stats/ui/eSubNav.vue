<script lang="ts">
export const TABS = ["overview", "battles", "replays", "charts", "labs", "leaderboard", "live", "events", "tags", "loadouts"];
</script>

<script setup lang="ts">
import { computed } from "vue";
import eScrollRail from "./eScrollRail.vue";
import eTabBrowser from "./eTabBrowser.vue";
import { useI18n } from "./i18n.mjs";

defineProps<{ modelValue: string }>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();

const tabs = computed(() => TABS.map((value) => ({ value, label: t(`tabs.${value}`) })));
</script>

<template>
  <div class="subnav">
    <div class="surface" />
    <eScrollRail class="rail" gutter="var(--space-5)">
      <eTabBrowser
        class="subnav-tabs"
        :tabs="tabs"
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </eScrollRail>
  </div>
</template>

<style scoped>
.subnav {
  position: relative;
  flex: none;
  display: flex;
  height: 59px;
  box-sizing: border-box;
  background: var(--black-2-a);
  overflow: hidden;
}

.surface {
  position: absolute;
  inset: 0 0 0 1px;
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  border-top: none;
  corner-shape: bevel;
  border-radius: 0 0 6px 0;
  pointer-events: none;
}

.rail {
  flex: 1 1 auto;
}

.subnav .subnav-tabs {
  position: relative;
  gap: var(--space-5);
  border-bottom: none;
}

.subnav :deep(.tab) {
  border-bottom: 2px solid var(--base-600);
}

.subnav :deep(.tab-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
