<script setup lang="ts">
import { ref, computed } from 'vue'
import { motion } from 'motion-v'
import Icons, { type IconKind } from './Icons.vue'
import { Dynamics } from '../composables/useMotion'

const props = withDefaults(defineProps<{
  icon: IconKind
  selected?: boolean
}>(), {
  selected: false,
})

const emit = defineEmits<{ select: [] }>()

const isHovered = ref(false)
const showOverlay = computed(() => isHovered.value || props.selected)
</script>

<template>
  <li
    class="sidebar-option"
    @click="emit('select')"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <motion.div
      class="hover-glow"
      :animate="{ scale: showOverlay ? 1 : 0, opacity: showOverlay ? 1 : 0 }"
      :transition="Dynamics.circOut"
    >
      <div class="hover-overlay" />
      <svg
        class="hover-stroke"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="20,0 100,0 100,80 80,100 0,100 0,20"
          fill="none"
          stroke="#f2f2f2"
          stroke-width="0.2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </motion.div>

    <div class="content">
      <Icons :kind="icon" size="large" />
    </div>
  </li>
</template>

<style scoped>
.sidebar-option {
  list-style: none;
  position: relative;
  cursor: pointer;
  padding: var(--space-1);
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-drag: none;
}

/* Green glow drop-shadows trace the polygon alpha boundary */
.hover-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  filter:
    drop-shadow(0px 2px 5px rgba(197, 255, 218, 0.2))
    drop-shadow(0px 0px 1px #84ffb1)
    drop-shadow(0px 1px 1px rgba(197, 255, 218, 0.2));
}

/* Polygon fill: backdrop blur + tea-green gradient over dark base */
.hover-overlay {
  position: absolute;
  inset: 0;
  clip-path: polygon(
    20% 0%,
    100% 0%,
    100% 80%,
    80% 100%,
    0% 100%,
    0% 20%
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background:
    linear-gradient(
      180deg,
      rgba(197, 255, 218, 0.2) 0%,
      rgba(0, 0, 0, 0) 45.68%,
      rgba(197, 255, 218, 0.2) 100%
    ),
    rgba(11, 11, 11, 0.5);
}

.hover-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
