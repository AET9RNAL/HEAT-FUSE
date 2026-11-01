<script setup lang="ts">
import { motion } from "motion-v";
import Icons from "fuse_ui/ui/Icons.vue";
import { useI18n } from "./i18n.mjs";

defineProps<{ title: string; subtitle?: string }>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

function close(): void {
  emit("close");
}
</script>

<template>
  <div class="legal-backdrop" @mousedown.self="close">
    <motion.div
      class="legal-motion"
      :initial="{ opacity: 0, scale: 0.96 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.96 }"
      :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
    >
      <div class="legal-panel">
        <div class="panel-blur" />
        <div class="panel-inner">
          <div class="panel-header">
            <div class="panel-title-group">
              <span class="panel-name">{{ title }}</span>
              <span v-if="subtitle" class="panel-sub">{{ subtitle }}</span>
            </div>
            <button type="button" class="close-btn" :aria-label="t('window.close')" @click="close">
              <Icons kind="cross" size="normal" />
            </button>
          </div>

          <div class="panel-body">
            <slot />
          </div>
        </div>
      </div>
    </motion.div>
  </div>
</template>

<style scoped>
.legal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.6);
}

.legal-motion {
  position: relative;
  width: 100%;
  max-width: 560px;
  height: 100%;
  max-height: 640px;
}

.legal-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: hsla(142, 10%, 4%, 0.92);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.panel-blur {
  position: absolute;
  inset: 0;
  z-index: 0;
  backdrop-filter: blur(35px);
  -webkit-backdrop-filter: blur(35px);
  pointer-events: none;
}

.panel-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-title-group {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.panel-name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  -webkit-user-select: none;
}

.panel-sub {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
}

.close-btn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s;
}

.close-btn:hover {
  color: var(--text-main);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  user-select: text;
  -webkit-user-select: text;
}

:slotted(.intro),
:slotted(.outro) {
  margin: 0 0 var(--space-3) 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  color: var(--text-main);
  line-height: 1.6;
}

:slotted(.outro) {
  margin: 0;
}

:slotted(.section-title) {
  margin: var(--space-4) 0 var(--space-2) 0;
  padding-top: var(--space-3);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-1);
  color: var(--light-green);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

:slotted(.section-title:first-of-type) {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

:slotted(.term-intro) {
  margin: 0 0 var(--space-2) 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
  line-height: 1.5;
}

:slotted(.term-list) {
  margin: 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  list-style: disc;
}

:slotted(.term-list li) {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-main);
  line-height: 1.5;
}

:slotted(.term-list strong) {
  font-weight: var(--font-weight-1);
  color: var(--text-main);
}
</style>
