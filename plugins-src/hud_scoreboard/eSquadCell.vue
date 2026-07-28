<script setup lang="ts">
import { computed } from "vue";
import "fuse_ui/ui/tokens.css";

const props = defineProps<{ squad: number }>();

const PALETTE = ["#a3fcb7", "#f95252", "#f9ee52", "#52f95a", "#52f9ee", "#5255f9", "#c752f9"];
const color = computed(() => PALETTE[(Math.max(1, props.squad) - 1) % PALETTE.length]);
</script>

<template>
  <div class="esquad" :style="{ '--squad-color': color }">
    <div class="esquad-fill">
      <span class="esquad-num">{{ squad }}</span>
    </div>
  </div>
</template>

<style scoped>
.esquad {
  container-type: size;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--squad-color);
  padding: 2px;
}
.esquad-fill {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--squad-color);
}
.esquad-num {
  font-family: var(--font-primary);
  font-size: clamp(12px, 62cqh, 16px);
  font-weight: var(--font-weight-1);
  line-height: 1;
  color: var(--black-1);
}
</style>
