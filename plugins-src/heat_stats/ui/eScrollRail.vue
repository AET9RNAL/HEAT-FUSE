<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { motion } from "motion-v";
import Icons from "fuse_ui/ui/Icons.vue";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";

withDefaults(
  defineProps<{
    gutter?: string;
  }>(),
  { gutter: "0px" },
);

type Side = "left" | "right";

const scroller = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);
const hovered = ref<Side | null>(null);
const overflowing = computed(() => canLeft.value || canRight.value);

function arrowAnimate(side: Side): Record<string, string | number> {
  const active = side === "left" ? canLeft.value : canRight.value;
  return {
    opacity: active ? 1 : 0,
    backgroundColor: active && hovered.value === side ? "var(--black-3-a)" : "rgba(0, 0, 0, 0)",
  };
}

function measure(): void {
  const el = scroller.value;
  if (!el) return;
  canLeft.value = el.scrollLeft > 0.5;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 0.5;
}

function step(dir: -1 | 1): void {
  const el = scroller.value;
  el?.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
}

function onWheel(e: WheelEvent): void {
  const el = scroller.value;
  if (!el || !overflowing.value || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  el.scrollLeft += e.deltaY;
  e.preventDefault();
}

let resize: ResizeObserver | null = null;
let mutation: MutationObserver | null = null;
onMounted(() => {
  const el = scroller.value;
  if (!el) return;
  resize = new ResizeObserver(measure);
  resize.observe(el);
  mutation = new MutationObserver(measure);
  mutation.observe(el, { childList: true, subtree: true, characterData: true });
  measure();
});
onBeforeUnmount(() => {
  resize?.disconnect();
  mutation?.disconnect();
});
</script>

<template>
  <div class="rail" :class="{ overflowing }" :style="{ '--rail-gutter': gutter }">
    <motion.button
      v-if="overflowing"
      type="button"
      class="arrow left"
      :class="{ idle: !canLeft }"
      tabindex="-1"
      aria-hidden="true"
      :initial="false"
      :animate="arrowAnimate('left')"
      :transition="Dynamics.quick"
      @pointerenter="hovered = 'left'"
      @pointerleave="hovered = null"
      @click="step(-1)"
    >
      <Icons kind="arrow-left" size="large" />
    </motion.button>
    <div ref="scroller" class="scroller" @scroll="measure" @wheel="onWheel">
      <slot />
    </div>
    <motion.button
      v-if="overflowing"
      type="button"
      class="arrow right"
      :class="{ idle: !canRight }"
      tabindex="-1"
      aria-hidden="true"
      :initial="false"
      :animate="arrowAnimate('right')"
      :transition="Dynamics.quick"
      @pointerenter="hovered = 'right'"
      @pointerleave="hovered = null"
      @click="step(1)"
    >
      <Icons kind="arrow-left" size="large" />
    </motion.button>
  </div>
</template>

<style scoped>
.rail {
  position: relative;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 var(--rail-gutter);
}

.rail.overflowing {
  padding: 0;
}

.scroller {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.scroller::-webkit-scrollbar {
  display: none;
}

.arrow {
  position: relative;
  flex: none;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.arrow.left {
  padding-right: var(--space-2);
}

.arrow.right {
  padding-left: var(--space-2);
}

/* The one icon, mirrored. */
.arrow.right :deep(.icon) {
  transform: scaleX(-1);
}

.arrow.idle {
  pointer-events: none;
}
</style>
