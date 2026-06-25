<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import eMaterialButton from './eMaterialButton.vue'
import Icons from './Icons.vue'
import { usePluginsStore } from '../stores/plugins'
import { eventBus } from '../events/eventBus'

interface DirtyState {
    plugin_id: string
    pendingConfig: Record<string, unknown>
    pendingHotkeys: Record<string, string>
}

const store = usePluginsStore()
const dirty = ref<DirtyState | null>(null)

function onDirty(payload: DirtyState) { dirty.value = { ...payload } }
function onSaved() { dirty.value = null }
function onReset() { dirty.value = null }

onMounted(() => {
    eventBus.on('plugin-config:dirty', onDirty)
    eventBus.on('plugin-config:saved', onSaved)
    eventBus.on('plugin-config:reset', onReset)
})
onUnmounted(() => {
    eventBus.off('plugin-config:dirty', onDirty)
    eventBus.off('plugin-config:saved', onSaved)
    eventBus.off('plugin-config:reset', onReset)
})

async function save() {
    if (!dirty.value) return
    const { plugin_id, pendingConfig, pendingHotkeys } = dirty.value
    const ops = [
        ...Object.entries(pendingConfig).map(([key, value]) => store.setPluginConfig(plugin_id, key, value)),
        ...Object.entries(pendingHotkeys).map(([action, combo]) => store.rebindHotkey(plugin_id, action, combo)),
    ]
    await Promise.all(ops)
    dirty.value = null
    eventBus.emit('plugin-config:saved', { plugin_id })
}

function reset() {
    const pid = dirty.value?.plugin_id
    dirty.value = null
    if (pid) eventBus.emit('plugin-config:reset', { plugin_id: pid })
}

// SVG polygon stroke — traces the 6-point clip-path
const CUT = 8
const modalEl = ref<HTMLElement | null>(null)
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
let _ro: ResizeObserver | null = null
onMounted(() => {
    if (!modalEl.value) return
    _ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    _ro.observe(modalEl.value)
})
onUnmounted(() => _ro?.disconnect())
</script>

<template>
    <AnimatePresence>
        <motion.div
            v-if="dirty"
            class="modal-anchor"
            :initial="{ opacity: 0, y: 32 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: 32 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="modalEl" class="simple-modal">
                <div class="modal-body">
                    <Icons kind="settings" size="normal" class="modal-icon" />
                    <span class="modal-label">You have unsaved changes</span>
                    <div class="modal-actions">
                        <eMaterialButton label="Reset" variant="tertiary" @click="reset" />
                        <eMaterialButton
                            label="Save Changes"
                            :fill="'var(--light-green)'"
                            :color="'var(--black-1)'"
                            @click="save"
                        />
                    </div>
                </div>
                <svg
                    v-if="svgPoints"
                    class="modal-stroke"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <polygon
                        :points="svgPoints"
                        fill="none"
                        stroke="#29302D"
                        stroke-width="0.4"
                        vector-effect="non-scaling-stroke"
                    />
                </svg>
            </div>
        </motion.div>
    </AnimatePresence>
</template>

<style scoped>
.modal-anchor {
    position: fixed;
    bottom: var(--space-4);
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 9998;
}

.simple-modal {
    pointer-events: auto;
    position: relative;
    background: var(--black-2-a);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
}

.simple-modal::before {
    content: '';
    position: absolute;
    inset: 0;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
    z-index: 0;
    pointer-events: none;
}

.modal-body {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    min-width: 360px;
}

.modal-icon {
    color: var(--text-muted);
    flex-shrink: 0;
}

.modal-label {
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.modal-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
}

.modal-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
}
</style>
