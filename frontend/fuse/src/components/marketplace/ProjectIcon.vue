<script setup lang="ts">
import { computed } from 'vue'
import { cdnUrl } from '../../utils/registry-api'

const props = withDefaults(defineProps<{
    iconKey?: string | null
    /** A local preview (data URL) wins over the CDN key. */
    preview?: string | null
    name: string
    size?: number
}>(), { iconKey: null, preview: null, size: 48 })

const src = computed(() => props.preview || cdnUrl(props.iconKey))
const letter = computed(() => props.name.trim()[0]?.toUpperCase() ?? '?')
</script>

<template>
    <div class="p-icon" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` }">
        <img v-if="src" :src="src" alt="" draggable="false" />
        <span v-else>{{ letter }}</span>
    </div>
</template>

<style scoped>
.p-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    font-family: var(--font-microcopy);
    color: var(--accent-200);
    user-select: none;
    -webkit-user-select: none;
}
img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
