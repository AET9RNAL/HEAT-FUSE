<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AsciiSweep from '../canvas_ui/AsciiSweep.vue'
import { useI18n } from '../../composables/useI18n'
import { useSuspension } from '../../composables/useSuspension'

const { t } = useI18n()
const { isSuspended } = useSuspension()

interface CommunityCredit {
    name: string
    /** Locale keys. */
    roles: string[]
}

const community: CommunityCredit[] = [
    { name: 'Pigeon_Pie', roles: ['appabout.creditFeedback', 'appabout.creditRequests'] },
    { name: '_VEN0M',     roles: ['appabout.creditTesting', 'appabout.creditFeedback'] },
    { name: 'SINEWAVE',   roles: ['appabout.creditSpecial'] },
    { name: 'thiextar',  roles: ['appabout.creditFeedback', 'appabout.creditRequests'] },
    { name: 'The_Roman_Hammer',     roles: ['appabout.creditTesting', 'appabout.creditFeedback'] },
    { name: 'Tmc_338',     roles: ['appabout.creditFeedback'] },
    { name: 'xm8_jaeger',     roles: ['appabout.creditFeedback'] },
    { name: 'LigManBruh',     roles: ['appabout.creditTesting'] },
    { name: 'seabass',     roles: ['appabout.creditTesting'] },
    { name: 'Speed',     roles: ['appabout.creditFeedback', 'appabout.creditRequests'] },
    { name: 'montainary',     roles: ['appabout.creditFeedback'] },
    { name: 'OxCone',     roles: ['appabout.creditInspirations'] },
    { name: 'Sorrydough',     roles: ['appabout.creditFeedback'] },
    { name: 'Darkburrow',     roles: ['appabout.creditFeedback'] },
    { name: 'IntergalaktycznyCygan',     roles: ['appabout.creditTesting'] },
    { name: 'Felix852',     roles: ['appabout.creditFeedback'] },
    { name: 'Thomas A. Heinous',     roles: ['appabout.creditFeedback'] },
    { name: 'IAmEdWards',     roles: ['appabout.creditFeedback'] },
    { name: 'Forever',     roles: ['appabout.creditTesting'] },
    { name: 'Tact91',     roles: ['appabout.creditRequests'] },

    
].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))

function roleLabel(credit: CommunityCredit): string {
    return credit.roles.map((key) => t(key)).join(' | ')
}

const SPAN_MS = 5200

const SWEEP = Object.freeze({
    angle: 0,
    duration: 1.6,
    band: 0.28,
    softness: 0.45,
    turbulence: 0.5,
    trail: 0.75,
    progress: -1,
    scale: 2,
    spacing: 1,
    charset: 'ascii' as const,
    glyphs: Object.freeze([]) as unknown as number[],
    color: '#8FFFB8',
    tint: 0.75,
    glow: 6,
    aberration: 4,
    displace: 6,
    flicker: 0.35,
    density: 0.9,
    contrast: 1.2,
    brightness: 0,
    invert: 0,
    threshold: 0.1,
    fade: 0.75,
    blend: 'auto' as const,
    background: '#191a19',
    directional: true,
    onSweepStart: () => {},
})

const front = ref<0 | 1>(0)
const step = ref(0)
const loaded = ref<[number, number]>([0, 1])
const paused = ref(false)

const panels = computed(() => loaded.value.map((i) => community[i % community.length]))
const behind = computed<0 | 1>(() => (front.value === 0 ? 1 : 0))

let timer: ReturnType<typeof setInterval> | null = null

function queueNext(): void {
    const next = (step.value + 1) % community.length
    const slots: [number, number] = [...loaded.value]
    slots[behind.value] = next
    loaded.value = slots
}

async function goTo(target: number): Promise<void> {
    if (target === step.value) return
    const slot = behind.value
    if (loaded.value[slot] !== target) {
        const slots: [number, number] = [...loaded.value]
        slots[slot] = target
        loaded.value = slots
        await nextTick()
        await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    step.value = target
    front.value = slot
}

function advance(): void {
    if (paused.value || isSuspended.value) return
    void goTo((step.value + 1) % community.length)
}

onMounted(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timer = setInterval(advance, SPAN_MS)
})

onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
})
</script>

<template>
  <footer class="credits" @mouseenter="paused = true" @mouseleave="paused = false">
    <!-- <span class="label">{{ t('appabout.communityCredits') }}</span> -->
    <AsciiSweep class="sweep" v-bind="SWEEP" :index="front" :on-sweep-end="queueNext">
      <div class="credit">
        <span class="name">{{ panels[0].name }}</span>
        <span class="role">{{ roleLabel(panels[0]) }}</span>
      </div>

      <template #alternate>
        <div class="credit">
          <span class="name">{{ panels[1].name }}</span>
          <span class="role">{{ roleLabel(panels[1]) }}</span>
        </div>
      </template>
    </AsciiSweep>
  </footer>
</template>

<style scoped>
.credits {
    user-select: none;
    -webkit-user-select: none;
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    height: 32px;
    background: var(--black-2);
    /* border-bottom: 1px solid var(--base-600); */
    overflow: hidden;
}

.label {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 var(--space-3);
    background: var(--black-2);
    border-right: 1px solid var(--base-600);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.sweep {
    flex: 1;
    min-width: 0;
    height: 100%;
}

.sweep :deep(canvas > div),
.sweep > :deep(div) {
    overflow: hidden !important;
}

.credit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    height: 100%;
    min-width: 0;
    padding: 0 var(--space-3);
    box-sizing: border-box;
    white-space: nowrap;
}

.name {
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-);
    color: var(--text-main);
}

.role {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}
</style>
