<script setup lang="ts">
import { computed } from "vue";
import StageNumberField from "../components/StageNumberField.vue";
import StageSegmented from "../components/StageSegmented.vue";
import StageSlider from "./controls/StageSlider.vue";
import StageToggle from "./controls/StageToggle.vue";
import StageSwitch from "./controls/StageSwitch.vue";
import StageSelect from "./controls/StageSelect.vue";
import StageTextField from "./controls/StageTextField.vue";
import StageButtons from "./controls/StageButtons.vue";
import StageRadio from "./controls/StageRadio.vue";
import StageButton from "./controls/StageButton.vue";
import StageColorField from "./controls/StageColorField.vue";
import StageKeybindField from "./controls/StageKeybindField.vue";
import { useTipDirective } from "./tooltip";
import type { InputPhase, InspectorControl, Option } from "./types";

const props = defineProps<{
  control: InspectorControl;
  value: unknown;
  disabled: boolean;
}>();

const emit = defineEmits<{
  set: [value: unknown, phase: InputPhase];
  action: [payload?: unknown];
}>();

const vTip = useTipDirective();

const c = computed(() => props.control);

// Older plugin saves hold some numbers as strings ("1.5").
const num = computed(() => {
  const n = typeof props.value === "number" ? props.value : Number.parseFloat(String(props.value));
  return Number.isFinite(n) ? n : 0;
});
const str = computed(() => (typeof props.value === "string" ? props.value : ""));
const bool = computed(() => Boolean(props.value));
const vec = computed(() => {
  const v = props.value as { x?: number; y?: number } | undefined;
  return { x: Number(v?.x ?? 0), y: Number(v?.y ?? 0) };
});

function commit(v: unknown): void {
  emit("set", v, "commit");
}
function live(v: unknown): void {
  emit("set", v, "live");
}

function segOptions(options: Option[]): { value: string; label: string }[] {
  return options.map((o) => ({ value: String(o.value), label: o.label }));
}

/** Segmented emits the stringified value; map back to the declared one. */
function fromSeg(options: Option[], raw: string): unknown {
  return options.find((o) => String(o.value) === raw)?.value ?? raw;
}
</script>

<template>
  <StageSlider
    v-if="c.type === 'slider'"
    :model-value="num"
    :min="c.min"
    :max="c.max"
    :step="c.step ?? 1"
    :unit="c.unit ?? ''"
    :display-mul="c.displayMul ?? 1"
    :default="c.default"
    :bipolar="c.bipolar"
    :disabled="disabled"
    @live="live"
    @commit="commit"
  />

  <StageNumberField
    v-else-if="c.type === 'number'"
    :label="c.unit || '#'"
    :model-value="num"
    :min="c.min ?? -100000"
    :max="c.max ?? 100000"
    :step="c.step ?? 1"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <div v-else-if="c.type === 'vec2'" class="vec-row">
    <StageNumberField
      :label="c.labels?.[0] ?? 'X'"
      :model-value="vec.x"
      :min="c.min ?? -100000"
      :max="c.max ?? 100000"
      :step="c.step ?? 1"
      :disabled="disabled"
      @update:model-value="commit({ x: $event, y: vec.y })"
    />
    <StageNumberField
      :label="c.labels?.[1] ?? 'Y'"
      :model-value="vec.y"
      :min="c.min ?? -100000"
      :max="c.max ?? 100000"
      :step="c.step ?? 1"
      :disabled="disabled"
      @update:model-value="commit({ x: vec.x, y: $event })"
    />
  </div>

  <StageToggle
    v-else-if="c.type === 'toggle'"
    :model-value="bool"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <StageSwitch
    v-else-if="c.type === 'switch'"
    :model-value="bool"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <StageSegmented
    v-else-if="c.type === 'segmented'"
    :model-value="String(value)"
    :options="segOptions(c.options)"
    @update:model-value="commit(fromSeg(c.options, $event))"
  />

  <StageButtons
    v-else-if="c.type === 'buttons'"
    :model-value="value"
    :options="c.options"
    :mode="c.mode"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <StageSelect
    v-else-if="c.type === 'select'"
    :model-value="value"
    :options="c.options"
    :searchable="c.searchable"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <StageTextField
    v-else-if="c.type === 'text'"
    :model-value="str"
    :placeholder="c.placeholder ?? ''"
    :max-length="c.maxLength"
    :pattern="c.pattern ?? ''"
    :multiline="c.multiline"
    :disabled="disabled"
    @live="live"
    @commit="commit"
  />

  <StageColorField
    v-else-if="c.type === 'color'"
    :model-value="str"
    :alpha="c.alpha !== false"
    :with-opacity-slider="c.withOpacitySlider"
    :swatches="c.swatches ?? []"
    :disabled="disabled"
    @live="live"
    @commit="commit"
  />

  <StageRadio
    v-else-if="c.type === 'radio'"
    :model-value="value"
    :options="c.options"
    :disabled="disabled"
    @update:model-value="commit"
  />

  <StageKeybindField
    v-else-if="c.type === 'keybind'"
    :model-value="str"
    :disabled="disabled"
    @commit="commit"
  />

  <StageButton
    v-else-if="c.type === 'button'"
    :text="c.text"
    :variant="c.variant ?? 'default'"
    :icon="c.icon ?? ''"
    :confirm="c.confirm ?? ''"
    :disabled="disabled"
    @click="emit('action')"
  />

  <div v-else-if="c.type === 'buttonRow'" class="btn-row">
    <div v-for="(b, i) in c.buttons" :key="b.id ?? i" v-tip="b.tooltip" class="btn-slot">
      <StageButton
        :text="b.text"
        :variant="b.variant ?? 'default'"
        :icon="b.icon ?? ''"
        :confirm="b.confirm ?? ''"
        :disabled="disabled"
        @click="emit('action', b.id)"
      />
    </div>
  </div>

  <p v-else-if="c.type === 'note'" class="ctl-note" :class="c.tone ?? 'muted'">{{ c.text }}</p>
</template>

<style scoped>
.vec-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.btn-row {
  display: flex;
  gap: var(--space-0);
}

.btn-slot {
  flex: 1;
  min-width: 0;
  display: flex;
}

.ctl-note {
  margin: 0;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  line-height: 1.4;
  color: var(--text-muted);
}

.ctl-note.warn {
  color: var(--warning-color);
}
</style>
