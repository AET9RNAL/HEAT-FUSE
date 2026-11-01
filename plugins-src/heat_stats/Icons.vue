<script lang="ts">
export type IconSize = "small" | "normal" | "large" | "xlarge";
</script>

<script setup lang="ts">
import { computed } from "vue";
// Asset imports come back as served URLs; the icons live in assets/icons.
import anchor from "./assets/icons/steam.svg";

const props = withDefaults(
  defineProps<{
    kind?: string;
    size?: IconSize;
    color?: string;
    alt?: string;
  }>(),
  { kind: "missing", size: "normal", color: "" },
);

const sizeMap: Record<IconSize, number> = {
  small: 12,
  normal: 16,
  large: 24,
  xlarge: 48,
};

const iconSize = computed(() => sizeMap[props.size] ?? 16);

// The overlay loader hands asset imports over as `{ default: url }`.
const anchorUrl = String((anchor as unknown as { default?: string })?.default ?? anchor);

const iconSrc = computed(() => {
  const base = new URL(anchorUrl, location.href);
  const url = new URL(`${encodeURIComponent(props.kind || "missing")}.svg`, base);
  url.search = base.search;
  return url.href;
});

// A colour keeps only the icon's shape, like the App's fill and stroke swap.
const tinted = computed(() => ({
  width: `${iconSize.value}px`,
  height: `${iconSize.value}px`,
  backgroundColor: props.color,
  maskImage: `url("${iconSrc.value}")`,
  WebkitMaskImage: `url("${iconSrc.value}")`,
}));
</script>

<template>
  <span v-if="color" class="icon tinted" :style="tinted" />
  <img
    v-else
    :src="iconSrc"
    :width="iconSize"
    :height="iconSize"
    :alt="alt ?? kind"
    class="icon"
  />
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  line-height: 0;
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}

.tinted {
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}
</style>
