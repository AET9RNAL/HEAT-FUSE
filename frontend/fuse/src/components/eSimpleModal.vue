<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import eMaterialButton from './eMaterialButton.vue'
import { eventBus } from '../events/eventBus'

interface Pending {
    label: string
    saveLabel: string
    cancelLabel: string
    onConfirm: () => Promise<void> | void
    onCancel?: () => void
}

const pending = ref<Pending | null>(null)
const saving  = ref(false)

function onShow(payload: { label: string; saveLabel?: string; cancelLabel?: string; onConfirm: () => Promise<void> | void; onCancel?: () => void }) {
    pending.value = {
        label:       payload.label,
        saveLabel:   payload.saveLabel  ?? 'Save',
        cancelLabel: payload.cancelLabel ?? 'Cancel',
        onConfirm:   payload.onConfirm,
        onCancel:    payload.onCancel,
    }
}
function onDismiss() { pending.value = null }

onMounted(() => {
    eventBus.on('modal:pending', onShow)
    eventBus.on('modal:dismiss', onDismiss)
})
onUnmounted(() => {
    eventBus.off('modal:pending', onShow)
    eventBus.off('modal:dismiss', onDismiss)
})

async function confirm() {
    if (!pending.value || saving.value) return
    saving.value = true
    try { await pending.value.onConfirm() }
    finally { saving.value = false }
    pending.value = null
}

function cancel() {
    pending.value?.onCancel?.()
    pending.value = null
}

</script>

<template>
    <AnimatePresence>
        <motion.div
            v-if="pending"
            class="modal-anchor"
            :initial="{ opacity: 0, y: 32 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: 32 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div class="simple-modal">
                <div class="modal-body">
                    <span class="modal-label">{{ pending.label }}</span>
                    <div class="modal-actions">
                        <eMaterialButton :label="pending.cancelLabel" variant="tertiary" @click="cancel" />
                        <eMaterialButton
                            :label="saving ? '...' : pending.saveLabel"
                            :fill="'var(--light-green)'"
                            :color="'var(--black-1)'"
                            :disabled="saving"
                            @click="confirm"
                        />
                    </div>
                </div>
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
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
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

</style>
