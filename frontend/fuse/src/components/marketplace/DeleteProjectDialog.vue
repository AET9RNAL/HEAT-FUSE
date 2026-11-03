<script setup lang="ts">
import { ref, computed, watch, onUnmounted, useId } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useCreatorStore } from '../../stores/creator'
import { useI18n } from '../../composables/useI18n'
import { Dynamics } from '../../composables/useMotion'
import { eventBus } from '../../events/eventBus'
import { errorText } from '../../utils/registry-api'
import eButton from '../inputs/eButton.vue'
import eInputField from '../inputs/eInputField.vue'

export interface DeleteTarget {
    id: string
    name: string
    slug: string
}

const props = defineProps<{ project: DeleteTarget | null }>()
const emit = defineEmits<{ close: [] }>()

const creator = useCreatorStore()
const { t } = useI18n()

const titleId = useId()
const bodyId = useId()

const typed = ref('')
const busy = ref(false)
const HOLD_MS = 2000

const matches = computed(() => !!props.project && typed.value.trim() === props.project.slug)
const holdLabels = computed(() => [1, 2, 3].map(n => t(`registry.deleteProject.hold${n}`)))

// The FTUE card motion: the surface opens from the centre, the title wipe reveals the text.
const OPEN = 'inset(0% 0% 0% 0%)'
const CLOSED = 'inset(0% 3% 0% 3%)'
const WIPE = { duration: 0.6, times: [0, 0.4, 0.5, 1], ease: Dynamics.snappy.ease, delay: 0.1 }
const REVEAL = { duration: 0, delay: 0.1 + WIPE.duration * WIPE.times[1] }

function close() {
    if (!busy.value) emit('close')
}

async function remove() {
    const p = props.project
    if (!p || !matches.value) return
    busy.value = true
    try {
        await creator.deleteDraft('project', p.id)
        await creator.loadProjects()
        eventBus.emit('notification', { message: t('registry.deleteProject.deleted', { name: p.name }), type: 'success' })
        emit('close')
    } catch (err) {
        eventBus.emit('notification', { title: t('registry.deleteProject.failed'), message: errorText(t, err), type: 'error' })
    } finally {
        busy.value = false
    }
}

function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
}

watch(() => props.project, (p) => {
    window.removeEventListener('keydown', onKey, true)
    if (!p) return
    typed.value = ''
    window.addEventListener('keydown', onKey, true)
}, { immediate: true })

onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
    <Teleport to="body">
        <AnimatePresence>
            <motion.div
                v-if="project"
                key="dp-dim"
                class="dp-dim"
                :initial="{ opacity: 0 }"
                :animate="{ opacity: 1 }"
                :exit="{ opacity: 0 }"
                :transition="Dynamics.default"
                @click="close"
            />
        </AnimatePresence>

        <AnimatePresence>
            <motion.div
                v-if="project"
                key="dp-card"
                class="dp-card"
                role="alertdialog"
                aria-modal="true"
                :aria-labelledby="titleId"
                :aria-describedby="bodyId"
                :initial="{ opacity: 0, clipPath: CLOSED }"
                :animate="{ opacity: 1, clipPath: OPEN }"
                :exit="{ opacity: 0, clipPath: CLOSED }"
                :transition="Dynamics.snappy"
            >
                <div class="dp-inner">
                    <header class="dp-sec dp-sec--head">
                        <div class="dp-head">
                            <motion.h2
                                :id="titleId"
                                class="dp-title"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :transition="REVEAL"
                            >{{ t('registry.deleteProject.title') }}</motion.h2>
                            <motion.span
                                class="dp-id"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :transition="REVEAL"
                            >PRJ {{ project.id }}</motion.span>
                            <motion.span
                                class="dp-wipe"
                                aria-hidden="true"
                                :initial="{ x: '-101%' }"
                                :animate="{ x: ['-101%', '0%', '0%', '101%'] }"
                                :transition="WIPE"
                            />
                        </div>
                    </header>

                    <div class="dp-sec dp-sec--main">
                        <p :id="bodyId" class="dp-body">{{ t('registry.deleteProject.body', { name: project.name }) }}</p>

                        <div class="dp-confirm">
                            <span class="dp-prompt">
                                {{ t('registry.deleteProject.prompt') }}
                                <span class="dp-slug">{{ project.slug }}</span>
                            </span>
                            <eInputField
                                v-model="typed"
                                :label="project.slug"
                                size="flex"
                                orientation="both"
                                autofocus
                                :disabled="busy"
                                :invalid="typed.length > 0 && !matches"
                            />
                        </div>
                    </div>

                    <footer class="dp-sec dp-sec--foot">
                        <eButton
                            size="half"
                            variant="tertiary"
                            :label="t('common.cancel')"
                            :disabled="busy"
                            @click="close"
                        />
                        <eButton
                            size="half"
                            tone="danger"
                            mode="hold"
                            :hold-ms="HOLD_MS"
                            hold-throbber
                            :hold-labels="holdLabels"
                            :label="t('registry.deleteProject.hold')"
                            :disabled="!matches"
                            :system-state="busy ? 'processing' : 'idle'"
                            @click="remove"
                        />
                    </footer>
                </div>

                <div class="dp-strip" aria-hidden="true">
                    <span class="dp-dots" />
                    <span class="dp-tag">RM-PR0J3CT</span>
                </div>
            </motion.div>
        </AnimatePresence>
    </Teleport>
</template>

<style scoped>
/* Under the Titlebar (9999), so the window buttons keep working. */
.dp-dim {
    position: fixed;
    inset: 0;
    z-index: 9990;
    background: var(--black-1-a);
}

/* Centred with translate, so motion keeps its own transform free. */
.dp-card {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 9995;
    translate: -50% -50%;
    box-sizing: border-box;
    width: min(467px, calc(100vw - 32px));
    background: var(--black-2-a);
    border: 1px solid var(--error-base);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
    overflow: hidden;
}

.dp-card::before {
    content: '';
    position: absolute;
    inset: 0;
    backdrop-filter: blur(16px);
    pointer-events: none;
}

/* Ends at the strip, so the section dividers run from the left edge to the strip. */
.dp-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    margin-right: 24px;
}

/* Three modules: a header band, the body and the action footer, split by full-width dividers. */
.dp-sec {
    box-sizing: border-box;
    padding: var(--space-3) var(--space-5);
}

.dp-sec + .dp-sec {
    border-top: 1px solid var(--base-600);
}

.dp-sec--head {
    background: var(--black-3-a);
}

.dp-sec--main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-4);
    padding-bottom: var(--space-4);
}

.dp-sec--foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.dp-head {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    overflow: hidden;
}

.dp-wipe {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--error-highlight);
    pointer-events: none;
}

.dp-title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    line-height: normal;
    color: var(--text-main);
    text-transform: uppercase;
    user-select: none;
    -webkit-user-select: none;
}

/* The FTUE step counter, turned into the ID of the project that goes. */
.dp-id {
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 3px var(--space-1);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: 16px;
    white-space: nowrap;
    color: var(--error-highlight);
    background: var(--error-color);
    border: 1px solid var(--error-base);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.dp-body {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    line-height: normal;
    color: var(--text-muted);
    user-select: none;
    -webkit-user-select: none;
}

.dp-confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.dp-prompt {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--base-200);
    user-select: none;
    -webkit-user-select: none;
}

.dp-slug {
    margin-left: var(--space-1);
    padding: 1px var(--space-1);
    font-size: var(--secondary-font-size-4);
    letter-spacing: 0;
    text-transform: none;
    color: var(--text-main);
    background: var(--black-3-a);
    user-select: text;
    -webkit-user-select: text;
}

/* The FTUE strip in the error colour. */
.dp-strip {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    width: 24px;
    background: var(--error-base);
}

.dp-dots {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 54px;
    background: conic-gradient(from 270deg at 2px 2px, var(--black-1) 25%, transparent 0) 6px 5px / 10px 10px;
}

.dp-tag {
    position: absolute;
    bottom: 17px;
    left: 50%;
    writing-mode: vertical-rl;
    transform: translateX(-50%) rotate(180deg);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    line-height: 10px;
    color: var(--black-1);
    user-select: none;
    -webkit-user-select: none;
}
</style>
