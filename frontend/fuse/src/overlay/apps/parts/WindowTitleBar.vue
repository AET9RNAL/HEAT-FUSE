<script setup lang="ts">
import { motion } from "motion-v";
import Icons from "../../../components/ui/Icons.vue";
import StageIconButton from "../../inspector/controls/StageIconButton.vue";
import { Dynamics } from "../../../composables/useMotion";
import { useI18n } from "../../../composables/useI18n";

const props = defineProps<{
  title: string;
  pluginId: string;
  focused: boolean;
  maximized: boolean;
  resizable: boolean;
}>();

const emit = defineEmits<{
  grab: [e: PointerEvent];
  toggleMax: [];
  minimize: [];
  close: [];
}>();

const { t } = useI18n();

function onDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  emit("grab", e);
}

function onDouble(): void {
  if (props.resizable) emit("toggleMax");
}
</script>

<template>
  <header class="title-bar" @pointerdown="onDown" @dblclick="onDouble">
    <motion.span
      class="focus-bar"
      :initial="false"
      :animate="{ opacity: focused ? 1 : 0, scaleY: focused ? 1 : 0.4 }"
      :transition="Dynamics.quick"
    />
    <Icons kind="app-icon" size="normal" :color="focused ? 'var(--text-main)' : 'var(--text-muted)'" />
    <motion.span
      class="title"
      :initial="false"
      :animate="{ color: focused ? 'var(--text-main)' : 'var(--text-muted)' }"
      :transition="Dynamics.quick"
    >{{ title }}</motion.span>
    <span class="plugin">{{ pluginId }}</span>
    <span class="spacer" />
    <motion.div
      class="buttons"
      :initial="false"
      :animate="{ opacity: focused ? 1 : 0.6 }"
      :transition="Dynamics.quick"
      @pointerdown.stop
      @dblclick.stop
    >
      <StageIconButton icon="minimize" :tip="t('stageapps.window.minimize')" @click="emit('minimize')" />
      <StageIconButton
        v-if="resizable"
        :icon="maximized ? 'restore' : 'maximize'"
        :tip="maximized ? t('stageapps.window.restore') : t('stageapps.window.maximize')"
        @click="emit('toggleMax')"
      />
      <StageIconButton icon="cross" :tip="t('stageapps.window.close')" danger @click="emit('close')" />
    </motion.div>
  </header>
</template>

<style scoped>
.title-bar {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 48px;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  background: var(--base-900);
  corner-shape: bevel;
  border-radius: 18px 0 0 0;
  cursor: default;
  touch-action: none;
  user-select: none;
}

.focus-bar {
  position: absolute;
  left: 0;
  top: 18px;
  width: 2px;
  height: 12px;
  background: var(--accent-200);
}

.title {
  flex: none;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
}

.plugin {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-5);
  color: var(--base-600);
}

.spacer {
  flex: 1;
}

.buttons {
  flex: none;
  display: flex;
  gap: 2px;
}
</style>
