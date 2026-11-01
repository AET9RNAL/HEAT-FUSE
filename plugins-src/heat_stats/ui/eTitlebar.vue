<script setup lang="ts">
import { computed } from "vue";
import Icons from "fuse_ui/ui/Icons.vue";
import eSelect from "fuse_ui/ui/eSelect.vue";
import eTabBrowser from "./eTabBrowser.vue";
import eStatus from "./eStatus.vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  section: string;
  version: string;
  status: string;
  /** local | online | syncing | offline - what the service looks like from here. */
  connection: string;
  locale: string;
  locales: string[];
}>();

const emit = defineEmits<{ section: [value: string]; locale: [value: string]; close: [] }>();

const { t } = useI18n();
const assets = useAssets();

const sections = computed(() => ["home", "account"].map((value) => ({ value, label: t(`nav.${value}`) })));
const languages = computed(() => props.locales.map((code) => ({ value: code, label: code.toUpperCase() })));
</script>

<template>
  <div class="titlebar">
    <div class="surface" />

    <div class="brand">
      <div class="logo"><img class="mark" :src="assets.logo()" :alt="t('brand')" /></div>
      <div class="name">{{ t("brand") }}</div>
      <div class="version">{{ version }}</div>
    </div>

    <nav class="nav">
      <eTabBrowser :tabs="sections" :model-value="section" @update:model-value="emit('section', $event)" />
    </nav>

    <div class="actions">
      <div class="action">
        <div class="controls">
          <eStatus :state="connection" :label="t(`connection.${connection}`)" />
          <eStatus :state="status" :label="t(`status.${status}`)" />
          <eSelect
            class="lang"
            :model-value="locale"
            :options="languages"
            @update:model-value="emit('locale', String($event))"
          />
        </div>
        <button type="button" class="close" :aria-label="t('window.close')" @click="emit('close')">
          <Icons kind="cross" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--black-1);
  overflow: hidden;
}

.surface {
  position: absolute;
  inset: 0 0 0 1px;
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.brand {
  position: relative;
  flex: none;
  display: flex;
  align-self: stretch;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding: var(--space-0);
  box-sizing: border-box;
  background: var(--black-2-a);
  border-right: 1px solid var(--base-600);
}

/* The mark is 24x12; 20px wide keeps it inside the 32px cell with air. */
.mark {
  width: 20px;
  height: auto;
}

.name {
  display: flex;
  align-items: center;
  padding: 0 var(--space-1);
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-1);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  white-space: nowrap;
}

.version {
  display: flex;
  align-items: center;
  padding: 0 var(--space-1);
  background: color-mix(in srgb, var(--base-50) 20%, transparent);
  border-left: 1px solid var(--base-600);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-3);
  font-weight: var(--font-weight-3);
  line-height: normal;
  color: var(--text-main);
  white-space: nowrap;
}

.nav,
.actions {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--space-1);
}

.titlebar .nav :deep(.tab-bar) {
  width: auto;
  gap: 0;
  border-bottom: none;
}

.titlebar .nav :deep(.tab-underline) {
  display: none;
}

.titlebar .nav :deep(.tab) {
  min-width: 0;
  padding: 0 var(--space-2) var(--space-1);
}

.titlebar .nav :deep(.tab-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.titlebar .nav :deep(.tab .tab-label) {
  color: var(--text-main);
}

.titlebar .nav :deep(.tab.active) {
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
  border-top: 2px solid var(--accent-200);
}

.action {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  height: 100%;
  padding: var(--space-0);
  box-sizing: border-box;
}

.controls {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
}

.close {
  display: flex;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
</style>
