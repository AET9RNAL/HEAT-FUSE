<script setup lang="ts">
import { computed } from "vue";
import OverlayWrapper from "./OverlayWrapper.vue";
import { overlays } from "../overlayClient";

const list = computed(() => [...overlays.values()]);
</script>

<template>
  <div class="stage">
    <OverlayWrapper v-for="d in list" :key="d.overlayId" :descriptor="d" />
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: transparent;
}
</style>
