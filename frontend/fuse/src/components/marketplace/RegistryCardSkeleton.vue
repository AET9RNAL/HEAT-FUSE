<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'

const props = withDefaults(defineProps<{
    /** The place in the list. It sets the pulse delay and the bar widths. */
    index?: number
}>(), { index: 0 })

const NAME_WIDTHS = ['34%', '26%', '40%']
const SUMMARY_WIDTHS = ['64%', '52%', '72%']

const nameWidth = computed(() => NAME_WIDTHS[props.index % NAME_WIDTHS.length])
const summaryWidth = computed(() => SUMMARY_WIDTHS[props.index % SUMMARY_WIDTHS.length])
</script>

<template>
    <motion.div
        class="sk-card"
        aria-hidden="true"
        :animate="{ opacity: [0.45, 1, 0.45] }"
        :transition="{ duration: 1.6, ease: 'easeInOut', repeat: Infinity, delay: index * 0.12 }"
    >
        <span class="bone sk-icon" />

        <div class="sk-body">
            <div class="sk-row sk-head">
                <span class="bone sk-name" :style="{ width: nameWidth }" />
                <span class="bone sk-badge" />
            </div>
            <div class="sk-row sk-summary-row">
                <span class="bone sk-summary" :style="{ width: summaryWidth }" />
            </div>
            <div class="sk-row sk-foot">
                <div class="sk-tags">
                    <span class="bone sk-tag" />
                    <span class="bone sk-tag sk-tag--wide" />
                </div>
                <span class="bone sk-button" />
            </div>
            <div class="sk-row sk-stats-row">
                <span class="bone sk-stats" />
            </div>
        </div>
    </motion.div>
</template>

<style scoped>
.sk-card {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--black-1-a);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
    pointer-events: none;
}

.bone {
    display: block;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.06);
    corner-shape: bevel;
    border-radius: 3px 0 3px 0;
}

.sk-icon {
    width: 56px;
    height: 56px;
    border-radius: 6px 0 6px 0;
}

.sk-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.sk-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.sk-head {
    height: 19px;
}

.sk-name {
    height: 12px;
}

.sk-badge {
    width: 36px;
    height: 14px;
}

.sk-summary-row {
    height: 15px;
}

.sk-summary {
    height: 8px;
}

.sk-foot {
    justify-content: space-between;
    height: 32px;
    margin-top: var(--space-1);
}

.sk-tags {
    display: flex;
    gap: var(--space-1);
}

.sk-tag {
    width: 44px;
    height: 14px;
}

.sk-tag--wide {
    width: 58px;
}

.sk-button {
    width: 140px;
    height: 32px;
}

.sk-stats-row {
    height: 15px;
}

.sk-stats {
    width: 96px;
    height: 8px;
}
</style>
