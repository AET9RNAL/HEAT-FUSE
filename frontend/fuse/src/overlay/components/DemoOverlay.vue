<script setup lang="ts">
import eButton from "../../components/inputs/eButton.vue";
import { useI18n } from "../../composables/useI18n";
import { demoCount } from "../stageTour";

const { t } = useI18n();
</script>

<template>
  <div class="demo-overlay">
    <span class="demo-dots" aria-hidden="true" />
    <span class="demo-tag">{{ t("stagetour.demo.name") }}</span>
    <eButton
      v-ftue="'stage-demo-count'"
      size="half"
      :label="t('stagetour.demo.count', { n: demoCount })"
      @click="demoCount++"
    />
  </div>
</template>

<style scoped>
.demo-overlay {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.demo-dots {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.5;
  background: conic-gradient(from 270deg at 2px 2px, var(--base-600) 25%, transparent 0) 6px 6px / 10px 10px;
}

.demo-tag {
  position: absolute;
  top: var(--space-2);
  left: var(--space-3);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 16px;
  color: #84ffb1;
  user-select: none;
  -webkit-user-select: none;
}
</style>
