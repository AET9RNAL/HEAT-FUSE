<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { motion } from "motion-v";
import Icons from "../../../components/ui/Icons.vue";
import { Dynamics } from "../../../composables/useMotion";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    size?: "default" | "large";
    icon?: boolean;
    autofocus?: boolean;
    maxLength?: number;
  }>(),
  { placeholder: "", size: "default", icon: true, autofocus: false, maxLength: undefined },
);

const emit = defineEmits<{ "update:modelValue": [value: string]; keydown: [e: KeyboardEvent] }>();

const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);

const borderColor = computed(() => (props.size === "large" ? "rgba(0, 0, 0, 0)" : focused.value ? "var(--accent-200)" : "rgba(82, 82, 82, 0)"));

function focus(): void {
  input.value?.focus();
}

onMounted(() => {
  if (props.autofocus) focus();
});

defineExpose({ focus });
</script>

<template>
  <motion.label
    class="stage-search"
    :class="size"
    :initial="false"
    :animate="{ borderColor }"
    :transition="Dynamics.quick"
  >
    <Icons v-if="icon" kind="search" :size="size === 'large' ? 'normal' : 'small'" color="var(--text-muted)" />
    <input
      ref="input"
      class="field"
      type="text"
      spellcheck="false"
      autocomplete="off"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxLength"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="emit('keydown', $event)"
      @focus="focused = true"
      @blur="focused = false"
    />
  </motion.label>
</template>

<style scoped>
.stage-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: 26px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  background: var(--black-2-a);
  border: 1px solid transparent;
  cursor: text;
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.stage-search.large {
  gap: var(--space-3);
  height: 52px;
  padding: 0 var(--space-4);
  background: transparent;
  border-radius: 0;
}

.field {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-microcopy);
  font-size: var(--main-font-size-4);
  color: var(--text-main);
}

.large .field {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
}

.field::placeholder {
  color: var(--base-600);
}
</style>
