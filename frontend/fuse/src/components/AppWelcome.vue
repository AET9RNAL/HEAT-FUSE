<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import eButton from './eButton.vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'

const auth = useAuthStore()
const { t } = useI18n()

const CUT = 8
const cardEl = ref<HTMLElement | null>(null)
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

let ro: ResizeObserver | null = null
onMounted(() => {
    if (!cardEl.value) return
    ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    ro.observe(cardEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
    <div class="welcome-backdrop" @click.self="auth.setScreen('main')">
        <motion.div
            class="welcome-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.96 }"
            :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="cardEl" class="welcome-card">
                <div class="card-blur" />

                <div class="card-inner">
                    <Icons class="logo" kind="app-logo-full" size="xlarge" />
                    <!-- <span v-if="t('appwelcome.tagline')" class="tagline">{{ t('appwelcome.tagline') }}</span> -->
                    <eButton
                        size="half"
                        :label="t('appwelcome.getStarted')"
                        @click="auth.setScreen('auth')"
                    />
                </div>

                <svg
                    v-if="svgPoints"
                    class="card-stroke"
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
    </div>
</template>

<style scoped>
.welcome-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

.welcome-motion {
    width: 280px;
}

.welcome-card {
    position: relative;
    width: 100%;
    background: hsla(142, 10%, 4%, 0.92);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.card-blur {
    position: absolute;
    inset: 0;
    z-index: 0;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
    pointer-events: none;
}

.card-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-7) var(--space-5);
}

.tagline {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    text-align: center;
}

.card-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
}

.logo {
    width: 200px;
    height: auto;
}
</style>
