<script lang="ts">
export type IconSize = 'small' | 'normal' | 'large' | 'xlarge'
export type IconKind =
  | 'app-icon'
  | 'cross'
  | 'home'
  | 'settings'
  | 'plugins'
  | 'about'
  | 'missing'
  | 'discover'
  | 'minimize'
  | 'maximize'
  | 'app-logo-full'
</script>

<script setup lang="ts">
import { computed } from 'vue'

const svgModules = import.meta.glob('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true })

const props = withDefaults(defineProps<{
  kind?: IconKind
  size?: IconSize
  color?: string
  alt?: string
}>(), {
  kind: 'missing',
  size: 'normal',
  color: '',
})

const sizeMap: Record<IconSize, number> = {
  small:  12,
  normal: 16,
  large:  24,
  xlarge: 64,
}

const iconSize = computed(() => sizeMap[props.size])

const iconSrc = computed(() =>
  new URL(`../assets/icons/${props.kind}.svg`, import.meta.url).href
)

function sanitizeColor(color: string): string {
  return color.replace(/[^a-zA-Z0-9#(),.\s%\-]/g, '')
}

const svgContent = computed(() => {
  if (!props.color) return ''
  const key = `../assets/icons/${props.kind}.svg`
  let svg = svgModules[key] as string
  if (!svg) return ''
  const safeColor = sanitizeColor(props.color)
  svg = svg.replace(/stroke="(?!none)[^"]*"/g, `stroke="${safeColor}"`)
  svg = svg.replace(/fill="(?!none|white)[^"]*"/g, `fill="${safeColor}"`)
  svg = svg.replace(/width="[^"]*"/, `width="${iconSize.value}"`)
  svg = svg.replace(/height="[^"]*"/, `height="${iconSize.value}"`)
  return svg
})
</script>

<template>
  <span
    v-if="color && svgContent"
    class="icon"
    :style="{ width: iconSize + 'px', height: iconSize + 'px' }"
    v-html="svgContent"
  />
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
</style>
