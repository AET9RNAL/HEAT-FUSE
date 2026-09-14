<script setup lang="ts">
import { computed, ref } from "vue";
import { AnimatePresence, motion } from "motion-v";
import eColorPicker from "../../../components/eColorPicker.vue";
import { Dynamics } from "../../../composables/useMotion";
import StageSlider from "./StageSlider.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    alpha?: boolean;
    withOpacitySlider?: boolean;
    swatches?: string[];
    disabled?: boolean;
  }>(),
  { alpha: true, withOpacitySlider: false, swatches: () => [], disabled: false },
);

const emit = defineEmits<{ live: [value: string]; commit: [value: string] }>();

const open = ref(false);
const pos = ref({ left: 0, top: 0 });

const hex = computed(() => (props.modelValue && props.modelValue.startsWith("#") ? props.modelValue : "#FFFFFFFF"));

/** Alpha byte of an #RRGGBBAA value, 0..100 for the slider. */
const opacityPct = computed(() => {
  const a = hex.value.length >= 9 ? Number.parseInt(hex.value.slice(7, 9), 16) : 255;
  return Math.round((a / 255) * 100);
});

function withOpacity(pct: number): string {
  const base = hex.value.slice(0, 7);
  const byte = Math.round(Math.min(100, Math.max(0, pct)) * 2.55)
    .toString(16)
    .padStart(2, "0");
  return `${base}${byte}`.toUpperCase();
}

/** The latest live pick, committed if the popover closes before the picker reports a finished edit. */
let pending: string | null = null;

function onPick(value: string): void {
  pending = value;
  emit("live", value);
}

function onPicked(value: string): void {
  pending = null;
  emit("commit", value);
}

function close(): void {
  open.value = false;
  if (pending !== null) onPicked(pending);
}

function toggle(e: MouseEvent): void {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const PW = 264;
  const PH = 300;
  let top = box.bottom + 6;
  if (top + PH > window.innerHeight) top = Math.max(8, box.top - PH - 6);
  pos.value = { left: Math.max(8, box.right - PW), top };
  open.value = true;
}
</script>

<template>
  <div class="stage-color">
    <motion.button
      type="button"
      class="swatch"
      :class="{ open, disabled }"
      :disabled="disabled"
      :initial="false"
      :animate="{ borderColor: open ? 'var(--accent-200)' : 'rgba(255,255,255,0.18)' }"
      :transition="Dynamics.quick"
      :while-press="disabled ? {} : { scale: 0.95 }"
      @click="toggle"
    >
      <span class="checker"></span>
      <span class="fill" :style="{ background: hex }"></span>
    </motion.button>

    <StageSlider
      v-if="withOpacitySlider"
      class="opacity"
      :model-value="opacityPct"
      :min="0"
      :max="100"
      :step="1"
      unit="%"
      :disabled="disabled"
      @live="emit('live', withOpacity($event))"
      @commit="emit('commit', withOpacity($event))"
    />

    <Teleport to="body">
      <AnimatePresence>
        <div v-if="open" class="color-layer stage-ui" @mousedown.self="close">
          <motion.div
            class="color-pop"
            :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
            :initial="{ opacity: 0, scale: 0.97 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.97 }"
            :transition="Dynamics.quick"
          >
            <div v-if="swatches.length" class="swatch-row">
              <button
                v-for="s in swatches"
                :key="s"
                type="button"
                class="preset"
                :style="{ background: s }"
                @click="onPicked(s)"
              />
            </div>
            <!-- Drags stream as `live` so nothing is persisted per frame; a finished edit commits. -->
            <eColorPicker :model-value="hex" :alpha="alpha" @update:model-value="onPick" @change="onPicked" />
          </motion.div>
        </div>
      </AnimatePresence>
    </Teleport>
  </div>
</template>

<style scoped>
.stage-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.opacity {
  flex: 1;
  min-width: 0;
}

.swatch {
  position: relative;
  flex: none;
  width: 26px;
  height: 20px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.18);
  overflow: hidden;
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 7px 0 7px 0;
}

.swatch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.checker {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(45deg, #808080 25%, transparent 25%),
    linear-gradient(-45deg, #808080 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #808080 75%),
    linear-gradient(-45deg, transparent 75%, #808080 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  opacity: 0.4;
}

.fill {
  position: absolute;
  inset: 0;
}
</style>

<style>
/* Unscoped: the picker is teleported out of this component's tree. */
/* Above the App's modals (the plugin config panel is 1000), under its tooltip (100000). */
.color-layer {
  position: fixed;
  inset: 0;
  z-index: 99990;
}

.color-pop {
  position: fixed;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.6);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
  overflow: hidden;
}

.color-pop .swatch-row {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2);
  background: hsla(142, 1%, 6%, 0.97);
}

.color-pop .preset {
  width: 18px;
  height: 18px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}
</style>
