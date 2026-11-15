<script setup lang="ts">
import StageButton from "../../inspector/controls/StageButton.vue";
import { useI18n } from "../../../composables/useI18n";
import type { WindowStatus } from "../types";

defineProps<{
  status: WindowStatus;
  pluginId: string;
  /** A frame has no title bar, so the panel offers Close too. */
  closable?: boolean;
}>();

const emit = defineEmits<{ restart: []; close: [] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="status === 'waiting'" class="status">
    <span class="status-title">{{ t("stageapps.window.starting") }}</span>
  </div>
  <div v-else-if="status === 'crashed'" class="status">
    <span class="status-title crashed">{{ t("stageapps.window.stoppedTitle") }}</span>
    <span class="status-note">{{ t("stageapps.window.stoppedNote", { plugin: pluginId }) }}</span>
    <div class="status-actions">
      <StageButton :text="t('stageapps.window.restart')" variant="accent" @click="emit('restart')" />
      <StageButton v-if="closable" :text="t('stageapps.window.close')" @click="emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-4);
  text-align: center;
}

.status-title {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.status-title.crashed {
  color: var(--error-highlight);
}

.status-note {
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--text-muted);
}

.status-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.status-actions > * {
  width: 120px;
}
</style>
