<script setup lang="ts">
import { computed } from 'vue'
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

</script>

<template>
    <div class="update-progress">
        <div class="info-row">
            <Icons kind="reload" size="small" class="spin-icon" />
            <span class="label">{{ t('components.updateProgress.updating') }}</span>
            <span class="pct">{{ displayPct }}</span>
        </div>
        <eProgress :progress="riveProgress" :width="176" :height="12" :fill="true" />
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
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
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
