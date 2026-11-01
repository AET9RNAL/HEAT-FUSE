<script setup lang="ts">
import { ref } from "vue";
import Icons from "fuse_ui/ui/Icons.vue";
import { useI18n } from "./i18n.mjs";

/** The manifest's `frames` lists this site. The stage cancels a frame on any other site. */
const HOME = "https://heatlabs.net/";

const { t } = useI18n();

const loading = ref(true);
// A new key loads the frame again from the home page.
const visit = ref(0);

function home(): void {
  loading.value = true;
  visit.value += 1;
}
</script>

<template>
  <div class="labs">
    <header class="bar">
      <span class="seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
      <h3 class="title">{{ t("labs.title") }}</h3>
      <span class="note">{{ loading ? t("labs.loading") : "heatlabs.net" }}</span>
      <button type="button" class="home" :aria-label="t('labs.home')" :title="t('labs.home')" @click="home">
        <Icons kind="home" size="small" color="currentColor" />
      </button>
    </header>
    <div class="plate">
      <iframe :key="visit" class="frame" :src="HOME" :title="t('labs.title')" @load="loading = false" />
    </div>
  </div>
</template>

<style scoped>
.labs {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  box-sizing: border-box;
}

.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 0 0;
}

.seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 10px;
}

.wedge {
  width: 10px;
  height: 10px;
  background: var(--base-600);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.wedge.flip {
  transform: rotate(180deg);
}

.title {
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.note {
  margin-left: auto;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

.home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--base-600);
  background: var(--black-1-a);
  color: var(--text-muted);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.home:hover {
  color: var(--text-main);
}

.plate {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--black-1);
  border: 1px solid var(--base-600);
  border-top: none;
  corner-shape: bevel;
  border-radius: 0 0 6px 0;
}

.frame {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
