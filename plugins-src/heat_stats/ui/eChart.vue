<script lang="ts">
export type Paint = (token: string, alpha?: number) => string;
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Chart } from "chart.js/auto";

const props = withDefaults(
  defineProps<{
    build: (paint: Paint, font: string) => object;
    /** Off until the chart may be built; the plot keeps its size meanwhile. */
    active?: boolean;
  }>(),
  { active: true },
);

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;
let probe: CanvasRenderingContext2D | null = null;

/** Canvas normalizes any CSS color to #rrggbb or rgba(), which can take an alpha. */
function toRgba(color: string, alpha: number): string {
  if (!probe) probe = document.createElement("canvas").getContext("2d");
  if (!probe) return color;
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  const normal = String(probe.fillStyle);
  const hex = /^#([0-9a-f]{6})$/i.exec(normal);
  if (hex) {
    const v = parseInt(hex[1]!, 16);
    return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(normal);
  if (!rgb) return normal;
  const [r, g, b, a = "1"] = rgb[1]!.split(",").map((s) => s.trim());
  return `rgba(${r}, ${g}, ${b}, ${Number(a) * alpha})`;
}

function render(): void {
  chart?.destroy();
  chart = null;
  const el = canvas.value;
  if (!el || !props.active) return;
  const style = getComputedStyle(el);
  const paint: Paint = (token, alpha = 1) => toRgba(style.getPropertyValue(token).trim() || token, alpha);
  const font = style.getPropertyValue("--font-microcopy").trim() || "monospace";
  chart = new Chart(el, props.build(paint, font) as never);
}

onMounted(render);
watch(() => [props.build, props.active], render);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart"><canvas ref="canvas" /></div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 1;
}
</style>
