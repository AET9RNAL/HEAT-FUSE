<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import Icons from './Icons.vue'
import eProgress from './eProgress.vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

interface Props {
    progress: number  // 0–100
}

const props = defineProps<Props>()

const displayPct = computed(() => `${props.progress.toFixed(1)}%`)
const riveProgress = computed(() => Math.min(1, Math.max(0, props.progress / 100)))

const CUT = 8
const containerEl = ref<HTMLElement | null>(null)
const elW = ref(0)
const elH = ref(0)

const svgPoints = computed(() => {
    const w = elW.value
    const h = elH.value
    if (!w || !h) return ''
    const cx = (CUT / w) * 100
    const cy = (CUT / h) * 100
    return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

let ro: ResizeObserver | null = null
onMounted(() => {
    if (!containerEl.value) return
    ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    ro.observe(containerEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
    <div ref="containerEl" class="update-progress">
        <div class="info-row">
            <Icons kind="reload" size="small" class="spin-icon" />
            <span class="label">{{ t('components.updateProgress.updating') }}</span>
            <span class="pct">{{ displayPct }}</span>
        </div>
        <eProgress :progress="riveProgress" :width="176" :height="12" :fill="true" />
        <svg
            v-if="svgPoints"
            class="stroke-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <polygon
                :points="svgPoints"
                fill="none"
                stroke="#525252"
                stroke-width="0.4"
                vector-effect="non-scaling-stroke"
            />
        </svg>
    </div>
</template>

<style scoped>
.update-progress {
    -webkit-app-region: no-drag;
    position: relative;
    display: inline-flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    background-color: var(--black-1-a);
    clip-path: polygon(
        8px 0%,
        100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%,
        0% 8px
    );
    user-select: none;
}

.stroke-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
}

.info-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.spin-icon {
    animation: spin 1s linear infinite;
    flex-shrink: 0;
    opacity: 0.7;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

.label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--base-200);
    white-space: nowrap;
    line-height: 1;
}

.pct {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--accent-50);
    white-space: nowrap;
    line-height: 1;
    margin-left: auto;
    padding-left: var(--space-3);
}
</style>
