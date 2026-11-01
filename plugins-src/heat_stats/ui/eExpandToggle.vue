<script setup lang="ts">
import { computed, ref } from "vue";
import { motion } from "motion-v";
import Icons from "fuse_ui/ui/Icons.vue";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";

const props = withDefaults(
  defineProps<{
    open: boolean;
    anchor?: "left" | "right";
  }>(),
  { anchor: "left" },
);

const hovered = ref(false);

const OPEN = "inset(0% 0% 0% 0%)";
const closed = computed(() => (props.anchor === "right" ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)"));

const filled = computed(() => hovered.value || props.open);
</script>

<template>
  <span class="expand" aria-hidden="true" @pointerenter="hovered = true" @pointerleave="hovered = false">
    <motion.span
      class="fill"
      :initial="false"
      :animate="{ clipPath: filled ? OPEN : closed }"
      :transition="Dynamics.snappy"
    />
    <motion.span class="arrow" :initial="false" :animate="{ rotate: open ? -90 : 0 }" :transition="Dynamics.snappy">
      <Icons kind="arrow-left" size="large" color="var(--base-1000)" />
    </motion.span>
  </span>
</template>

<style scoped>
.expand {
  position: relative;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-1);
  overflow: hidden;
  background: var(--base-50);
  corner-shape: bevel;
  border-radius: 0 0 6px 0;
}

.fill {
  position: absolute;
  inset: 0;
  background: var(--canary-yellow);
  pointer-events: none;
}

.arrow {
  position: relative;
  display: flex;
}
</style>
