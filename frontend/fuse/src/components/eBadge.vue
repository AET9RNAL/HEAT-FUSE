<script setup lang="ts">
withDefaults(defineProps<{
    label: string
    color?: string
    dot?: boolean
}>(), {
    dot: false,
})
</script>

<template>
    <span
        class="e-badge"
        :style="color ? ({ '--badge-color': color } as any) : {}"
    >
        <span class="e-badge-fill">
            <i v-if="dot" class="e-badge-dot" />
            {{ label }}
        </span>
    </span>
</template>

<style scoped>
/* Outer layer = border (colored background, full clip-path) */
.e-badge {
    display: inline-flex;
    flex-shrink: 0;
    clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
    background: color-mix(in srgb, var(--badge-color, rgba(255,255,255,0.18)) 35%, transparent);
    padding: 1px;
    user-select: none;
    -webkit-user-select: none;
}

/* Inner layer = fill (dark bg, same chamfer minus 1px on each corner) */
.e-badge-fill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--badge-color, var(--text-muted));
    background: color-mix(in srgb, var(--badge-color, transparent) 8%, rgba(12,12,12,0.85));
    padding: 1px 6px 1px 4px;
    clip-path: polygon(3px 0%, 100% 0%, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0% 100%, 0% 3px);
    white-space: nowrap;
}

.e-badge-dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    transform: rotate(45deg);
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
}
</style>
