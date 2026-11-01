<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ modelValue: string; length?: number; disabled?: boolean; autofocus?: boolean }>(),
  {
    length: 8,
    disabled: false,
    autofocus: true,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: string]; complete: [value: string] }>();

const count = computed(() => Math.max(1, Math.round(props.length)));
const digits = ref<string[]>([]);
const inputs = ref<HTMLInputElement[]>([]);

function fill(value: string): void {
  const nums = String(value ?? "").replace(/\D/g, "").slice(0, count.value);
  digits.value = Array.from({ length: count.value }, (_, i) => nums[i] ?? "");
}

fill(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    if (value === digits.value.join("")) return;
    fill(value);
    if (!digits.value.join("")) inputs.value[0]?.focus();
  },
);

watch(count, () => {
  fill("");
  inputs.value = [];
  emit("update:modelValue", "");
});

function push(): void {
  const value = digits.value.join("");
  emit("update:modelValue", value);
  if (value.length === count.value) emit("complete", value);
}

function setInput(index: number, el: unknown): void {
  if (el) inputs.value[index] = el as HTMLInputElement;
}

function onFocus(event: Event): void {
  (event.target as HTMLInputElement).select();
}

function onInput(index: number, event: Event): void {
  const el = event.target as HTMLInputElement;
  const value = el.value.replace(/\D/g, "").slice(-1);
  digits.value[index] = value;
  el.value = value;
  if (value && index < count.value - 1) inputs.value[index + 1]?.focus();
  push();
}

function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === "Backspace" && !digits.value[index] && index > 0) inputs.value[index - 1]?.focus();
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault();
  const nums = (event.clipboardData?.getData("text") ?? "").replace(/\D/g, "").slice(0, count.value);
  fill(nums);
  inputs.value[Math.min(nums.length, count.value - 1)]?.focus();
  push();
}

onMounted(() => {
  if (props.autofocus) inputs.value[0]?.focus();
});
</script>

<template>
  <div class="otp">
    <input
      v-for="i in count"
      :key="i"
      :ref="(el) => setInput(i - 1, el)"
      class="otp-digit"
      type="text"
      inputmode="numeric"
      maxlength="1"
      autocomplete="one-time-code"
      :disabled="disabled"
      :value="digits[i - 1]"
      @input="onInput(i - 1, $event)"
      @keydown="onKeydown(i - 1, $event)"
      @paste="onPaste"
      @focus="onFocus"
    />
  </div>
</template>

<style scoped>
.otp {
  display: flex;
  gap: var(--space-1);
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.otp-digit {
  flex: 1 1 0;
  min-width: 0;
  max-width: 38px;
  height: 44px;
  background: var(--black-1-a);
  border: none;
  outline: none;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-1);
  color: var(--text-main);
  text-align: center;
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
  caret-color: var(--accent-200);
  transition: background 0.12s;
}

.otp-digit:focus {
  background: var(--black-3-a);
}

.otp-digit:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}
</style>
