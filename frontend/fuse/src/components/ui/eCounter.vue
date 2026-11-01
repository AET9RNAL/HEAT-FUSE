<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { animate, useReducedMotion } from 'motion-v'

const props = withDefaults(defineProps<{
    value: number
    format?: (n: number) => string
    duration?: number
    delay?: number
}>(), {
    duration: 1.4,
    delay: 0,
})

const reduced = useReducedMotion()
const displayed = ref(0)
let controls: { stop: () => void } | null = null

watch(() => props.value, (to) => {
    controls?.stop()
    if (reduced.value) {
        displayed.value = to
        return
    }
    controls = animate(displayed.value, to, {
        duration: props.duration,
        delay: props.delay,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (v: number) => { displayed.value = v },
    })
}, { immediate: true })

onUnmounted(() => controls?.stop())

const text = computed(() =>
    props.format ? props.format(displayed.value) : String(Math.round(displayed.value))
)
</script>

<template>
    <span class="e-counter">{{ text }}</span>
</template>

<style scoped>
.e-counter {
    /* keeps the digits from reflowing the row while they tick */
    font-variant-numeric: tabular-nums;
}
</style>
