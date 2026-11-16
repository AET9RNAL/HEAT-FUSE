<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { animate, motion } from 'motion-v'
import eGamePresets from './eGamePresets.vue'
import { usePluginsStore } from '../../stores/plugins'
import { useGamePresets } from '../../composables/useGamePresets'
import { Dynamics } from '../../composables/useMotion'

const pluginsStore = usePluginsStore()
const { open, picking, slowPick, pickError, close, pick } = useGamePresets()

const plugin = computed(() => {
    const id = open.value?.id
    return id ? pluginsStore.plugins.find(p => p.plugin_id === id && p.overrides) ?? null : null
})
watch(plugin, p => { if (!p) close() })

const REVEAL_FROM = 0.97
const REVEAL_DELAY = 0.2
const surfaceEl = ref<HTMLElement | null>(null)
let revealAnim: { stop: () => void } | null = null
let reveal = REVEAL_FROM

function tweenReveal(from: number, to: number, transition: typeof Dynamics.snappy | typeof Dynamics.default, delay = 0) {
    const el = surfaceEl.value
    if (!el) return
    revealAnim?.stop()
    const set = (v: number) => {
        reveal = v
        el.style.setProperty('--gc-reveal', String(v))
    }
    set(from)
    revealAnim = animate(from, to, { ...transition, delay, onUpdate: set })
}

onMounted(() => tweenReveal(REVEAL_FROM, 1, Dynamics.snappy, REVEAL_DELAY))
onBeforeUnmount(() => tweenReveal(reveal, REVEAL_FROM, Dynamics.default))
onUnmounted(() => revealAnim?.stop())

function onBackdrop(e: MouseEvent) {
    if (surfaceEl.value && !surfaceEl.value.contains(e.target as Node)) close()
}

function pickPreset(preset: string | null) {
    if (plugin.value) void pick(plugin.value.plugin_id, preset)
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
    <motion.div
        class="backdrop"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="Dynamics.default"
        @mousedown="onBackdrop"
    >
        <motion.div
            v-if="plugin"
            class="window"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="Dynamics.smooth"
        >
            <div ref="surfaceEl" class="surface">
                <div class="blur" />
                <motion.div
                    class="content"
                    :initial="{ x: '-2%' }"
                    :animate="{ x: '0%' }"
                    :transition="Dynamics.smooth"
                >
                    <eGamePresets
                        :plugin="plugin"
                        :picking="picking?.id === plugin.plugin_id ? picking.preset : undefined"
                        :slow-pick="slowPick"
                        :pick-error="pickError"
                        @back="close"
                        @pick="pickPreset"
                    />
                </motion.div>
            </div>
        </motion.div>
    </motion.div>
</template>

<style scoped>
.backdrop {
    position: absolute;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: hsla(0, 0%, 0%, 0.5);
}

.window {
    position: relative;
    width: 100%;
    max-width: 1120px;
    height: 100%;
    max-height: 680px;
}

.surface {
    position: relative;
    width: calc(100% * var(--gc-reveal, 1));
    height: 100%;
    margin-inline: auto;
}

.blur {
    position: absolute;
    inset: 0;
    backdrop-filter: blur(35px);
    corner-shape: bevel;
    border-radius: 10px 0 10px 0;
    pointer-events: none;
}

.content {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
}
</style>
