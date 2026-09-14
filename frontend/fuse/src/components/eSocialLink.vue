<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { animate, motion, useReducedMotion } from 'motion-v'
import Icons, { type IconKind } from './Icons.vue'
import { Dynamics } from '../composables/useMotion'

const props = defineProps<{
    kind: IconKind
    label: string
    url: string
}>()

const reduced = useReducedMotion()
// 0 = no fill, 1 = fully wiped
const wipe = ref(0)
let controls: { stop: () => void } | null = null

function tween(to: number) {
    controls?.stop()
    if (reduced.value) {
        wipe.value = to
        return
    }
    controls = animate(wipe.value, to, {
        ...Dynamics.snappy,
        onUpdate: (v: number) => { wipe.value = v },
    })
}

onUnmounted(() => controls?.stop())

const pressed = ref(false)
const lift = computed(() => (pressed.value ? '-5px' : '0px'))
</script>

<template>
    <motion.a
        class="link"
        :href="props.url"
        target="_blank"
        rel="noreferrer"
        :animate="{ y: lift }"
        :transition="Dynamics.quick"
        @mouseenter="tween(1)"
        @mouseleave="tween(0); pressed = false"
        @mousedown="pressed = true"
        @mouseup="pressed = false"
    >
        <span class="layer">
            <Icons :kind="props.kind" size="large" color="var(--text-main)" />
            <span class="label">{{ props.label }}</span>
        </span>

        <!-- same content in the hover colours, revealed by the wipe acting like alpha matte -->
        <span class="layer fill" :style="{ '--wipe': wipe }" aria-hidden="true">
            <Icons :kind="props.kind" size="large" color="var(--black-1)" />
            <span class="label label-on-fill">{{ props.label }}</span>
        </span>
    </motion.a>
</template>

<style scoped>
.link {
    position: relative;
    flex: 1 0 0;
    min-width: 0;
    display: block;
    text-decoration: none;
}

.layer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2);
}

.fill {
    --wipe-lean: 15%;
    position: absolute;
    inset: 0;
    background: var(--light-green);
    clip-path: polygon(
        -50% 0%,
        calc(var(--wipe) * (100% + var(--wipe-lean))) 0%,
        calc(var(--wipe) * (100% + var(--wipe-lean)) - var(--wipe-lean)) 100%,
        -50% 100%
    );
    pointer-events: none;
}

.label {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-main);
    text-align: center;
}

.label-on-fill {
    color: var(--black-1);
}
</style>
