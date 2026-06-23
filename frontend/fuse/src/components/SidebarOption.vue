<script setup lang="ts">
import { ref, computed } from 'vue'
import { motion } from 'motion-v'
import Icons, { type IconKind } from './Icons.vue'

const props = withDefaults(defineProps<{
  icon: IconKind

  selected?: boolean
}>(), {
  selected: false,
})

const emit = defineEmits<{ select: [] }>()

const isHovered = ref(false)
const showBackground = computed(() => isHovered.value || props.selected)
const contentX = computed(() => (isHovered.value || props.selected) ? 5 : 0)
</script>

<template>
  <li
    class="sidebar-option"
    :class="{ selected }"
    @click="emit('select')"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <motion.div
      class="background"
      :initial="{ scaleX: 0 }"
      :animate="{ scaleX: showBackground ? 1 : 0 }"
      :transition="{ duration: 0.2 }"
    />
    <motion.div class="content" :animate="{ x: contentX }">
      <Icons :kind="icon" size="large" />
      
    </motion.div>
  </li>
</template>

<style scoped>
.sidebar-option {
  list-style: none;
  position: relative;
  cursor: pointer;
  padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
  user-select: none;
  -webkit-user-drag: none;
}

.background {
  position: absolute;
  inset: 0;
  background-color: var(--glass-surfaces-accented-600);
  border-radius: 4px;
  transform-origin: left;
}

.content {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
}

.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  user-select: none;
  -webkit-user-drag: none;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
}
</style>
