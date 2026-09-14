<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { motion } from "motion-v";
import { Dynamics } from "../../../composables/useMotion";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    maxLength?: number;
    pattern?: string;
    multiline?: boolean;
    disabled?: boolean;
  }>(),
  { placeholder: "", maxLength: undefined, pattern: "", multiline: false, disabled: false },
);

const emit = defineEmits<{ live: [value: string]; commit: [value: string] }>();

const draft = ref(props.modelValue);
const focused = ref(false);
const invalid = ref(false);

const borderColor = computed(() => {
  if (invalid.value) return "var(--error-highlight)";
  if (focused.value) return "var(--accent-200)";
  return "var(--base-600)";
});

watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value) draft.value = v;
  },
);

function validate(v: string): boolean {
  if (!props.pattern) return true;
  try {
    return new RegExp(props.pattern).test(v);
  } catch {
    return true; // A malformed pattern from a plugin shouldn't block typing.
  }
}

function onInput(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  draft.value = v;
  invalid.value = !validate(v);
  if (!invalid.value) emit("live", v);
}

function commit(): void {
  focused.value = false;
  if (!validate(draft.value)) {
    draft.value = props.modelValue;
    invalid.value = false;
    return;
  }
  emit("commit", draft.value);
}
</script>

<template>
  <motion.div
    class="stage-text"
    :class="{ disabled, multiline }"
    :initial="false"
    :animate="{ borderColor }"
    :transition="Dynamics.quick"
  >
    <textarea
      v-if="multiline"
      class="text-input"
      rows="3"
      :value="draft"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :disabled="disabled"
      @input="onInput"
      @focus="focused = true"
      @blur="commit"
    ></textarea>
    <input
      v-else
      class="text-input"
      type="text"
      :value="draft"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :disabled="disabled"
      @input="onInput"
      @focus="focused = true"
      @blur="commit"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />
  </motion.div>
</template>

<style scoped>
.stage-text {
  position: relative;
  display: flex;
  min-width: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.text-input {
  width: 100%;
  min-width: 0;
  height: 24px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
  resize: none;
}

.stage-text.multiline .text-input {
  height: auto;
  padding: var(--space-2);
  line-height: 1.4;
}

.text-input::placeholder {
  color: var(--base-600);
}

.stage-text.disabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
