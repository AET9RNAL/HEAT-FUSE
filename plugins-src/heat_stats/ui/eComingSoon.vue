<script setup lang="ts">
import { computed } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import eBrandMark from "./eBrandMark.vue";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{ tab: string }>();

const { t } = useI18n();

const title = computed(() => t(`tabs.${props.tab}`));
</script>

<template>
  <motion.section
    class="soon"
    :initial="{ opacity: 0, y: 10 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="Dynamics.snappy"
  >
    <span class="soon-surface" />

    <eBrandMark class="soon-mark" :draw="false" march />

    <div class="soon-copy">
      <span class="soon-label">
        <i class="wedge flip" aria-hidden="true" />
        {{ t("tabs.comingSoon") }}
        <i class="wedge" aria-hidden="true" />
      </span>
      <h2 class="soon-title">{{ title }}</h2>
      <p class="soon-note">{{ t("tabs.comingSoonNote") }}</p>
    </div>
  </motion.section>
</template>

<style scoped>
.soon {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  width: 100%;
  min-height: 420px;
  padding: var(--space-8) var(--space-4);
  box-sizing: border-box;
  overflow: hidden;
}

.soon-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  pointer-events: none;
}

.soon-mark {
  position: relative;
  width: 320px;
  max-width: 70%;
  pointer-events: none;
}

.soon-copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.soon-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1;
  letter-spacing: 0.3em;
  color: var(--accent-200);
  text-transform: uppercase;
  text-indent: 0.3em;
}

.wedge {
  flex: none;
  width: 8px;
  height: 8px;
  background: var(--accent-200);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.soon-title {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-1);
  font-weight: var(--font-weight-2);
  line-height: 1.1;
  color: var(--text-main);
  text-transform: uppercase;
}

.soon-note {
  margin: 0;
  max-width: 420px;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
