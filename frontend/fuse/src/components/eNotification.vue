<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

export type NotificationType = 'success' | 'warning' | 'error'

interface Props {
    title?: string
    message: string
    duration?: number
    type?: NotificationType
}

const props = withDefaults(defineProps<Props>(), {
    title: undefined,
    duration: 5000,
    type: 'success',
})

const resolvedTitle = computed(() => props.title ?? t('components.notification.defaultTitle'))

const ACCENT_BY_TYPE: Record<NotificationType, string> = {
    success: 'var(--light-green, #84FFB1)',
    warning: 'var(--canary-yellow, #FDE047)',
    error:   'var(--error-highlight, #FF6B6B)',
}
const accentColor = computed(() => ACCENT_BY_TYPE[props.type])

const emit = defineEmits<{ close: [] }>()

const TICK = 50
const progress = ref(1)
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer() {
    if (timer) { clearInterval(timer); timer = null }
}

function startTimer() {
    stopTimer()
    const steps = props.duration / TICK
    let elapsed = (1 - progress.value) * steps
    timer = setInterval(() => {
        elapsed++
        progress.value = 1 - elapsed / steps
        if (elapsed >= steps) {
            stopTimer()
            emit('close')
        }
    }, TICK)
}

// Message is truncated to one line by default; clicking the body expands it to
// full height
const expanded = ref(false)
function toggleExpand() {
    expanded.value = !expanded.value
    if (expanded.value) stopTimer()
    else startTimer()
}

onMounted(() => { startTimer() })

onUnmounted(() => { stopTimer() })

// SVG polygon stroke - traces the 6-point clip-path
</script>

<template>
    <div class="notification-glow">
        <div class="notification">
            <svg class="timer-bar" viewBox="0 0 100 2" preserveAspectRatio="none">
                <line
                    x1="0" y1="1"
                    :x2="progress * 100" y2="1"
                    :stroke="accentColor"
                    stroke-width="2"
                />
            </svg>

            <div class="notification-body" :class="{ expanded }" @click="toggleExpand">
                <div class="notification-text">
                    <span class="notification-title" :style="{ color: accentColor }">{{ resolvedTitle }}</span>
                    <span class="notification-message" :class="{ expanded }">{{ message }}</span>
                </div>
                <motion.button
                    v-tip="t('components.notification.dismiss')"
                    class="close-btn"
                    :whileTap="{ scale: 0.88 }"
                    @click.stop="emit('close')"
                >
                    <Icons kind="cross" size="small" />
                </motion.button>
            </div>

        </div>
    </div>
</template>

<style scoped>
.notification-glow {
    width: 320px;
    /* filter:
        drop-shadow(0 1px 0.8px #C5FFDA)
        drop-shadow(0 0 3.1px #84FFB1)
        drop-shadow(0 0 1px #84FFB1)
        drop-shadow(0 2px 5px rgba(197, 255, 218, 0.20)); */
}

.notification {
    position: relative;
    background: var(--black-1-a);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}

.notification::before {
    content: '';
    position: absolute;
    inset: 0;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
    z-index: 0;
    pointer-events: none;
}

.timer-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 2px;
    display: block;
    flex-shrink: 0;
}

.notification-body {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    padding-top: calc(var(--space-3) + 2px);
    cursor: pointer;
}

/* When expanded, top-align so the wrapped message flows downward. */
.notification-body.expanded {
    align-items: flex-start;
}

.notification-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
}

.notification-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--light-green, #84FFB1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    -webkit-user-select: none;
}

.notification-message {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    -webkit-user-select: none;
}

.notification-message.expanded {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
}

.close-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
}

.close-btn:hover {
    color: var(--text-main);
}

</style>
