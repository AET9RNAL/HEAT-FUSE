<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ full: string; short: string }>();

const el = ref<HTMLElement | null>(null);
const probe = ref<HTMLElement | null>(null);
const fits = ref(true);

function measure(): void {
  const box = el.value;
  if (!box || !probe.value) return;
  const style = getComputedStyle(box);
  const room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  fits.value = probe.value.offsetWidth <= room;
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(measure);
  if (el.value) observer.observe(el.value);
  measure();
});
onBeforeUnmount(() => observer?.disconnect());

watch(() => [props.full, props.short], () => nextTick(measure));
</script>

<template>
  <span ref="el" class="fit">
    <span ref="probe" class="probe" aria-hidden="true">{{ full }}</span>
    {{ fits ? full : short }}
  </span>
</template>

<style scoped>
.fit {
  position: relative;
}

.probe {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}
</style>
