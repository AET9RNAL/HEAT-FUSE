<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { motion } from "motion-v";
import { assetBase } from "../../overlayClient";
import { Dynamics } from "../../../composables/useMotion";

const props = withDefaults(
  defineProps<{
    iconUrl: string | null;
    name: string;
    running?: boolean;
    size?: "small" | "large";
  }>(),
  { running: false, size: "small" },
);

const failed = ref(false);
watch(
  () => props.iconUrl,
  () => {
    failed.value = false;
  },
);

const src = computed(() => (props.iconUrl ? assetBase() + props.iconUrl : ""));
const letter = computed(() => props.name.trim().charAt(0).toUpperCase() || "?");
</script>

<template>
  <span class="app-icon" :class="size">
    <img v-if="src && !failed" class="glyph" :src="src" alt="" draggable="false" @error="failed = true" />
    <span v-else class="letter">{{ letter }}</span>
    <motion.span
      class="running"
      :initial="false"
      :animate="{ opacity: running ? 1 : 0 }"
      :transition="Dynamics.quick"
    />
  </span>
</template>

<style scoped>
.app-icon {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 4px 0 4px 0;
}

.app-icon.large {
  width: 28px;
  height: 28px;
  border-radius: 6px 0 6px 0;
}

.glyph {
  width: 12px;
  height: 12px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.large .glyph {
  width: 16px;
  height: 16px;
}

.letter {
  font-family: var(--font-microcopy);
  font-size: 10px;
  color: var(--text-main);
  line-height: 1;
}

.large .letter {
  font-size: var(--main-font-size-4);
}

.running {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 3px;
  height: 3px;
  background: var(--accent-200);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
  pointer-events: none;
}

.large .running {
  width: 5px;
  height: 5px;
}
</style>
