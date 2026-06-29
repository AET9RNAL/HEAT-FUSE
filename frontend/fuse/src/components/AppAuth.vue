<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import eSwitch from './eSwitch.vue'
import type { eSwitchOption } from './eSwitch.vue'
import Icons from './Icons.vue'
import eButton from './eButton.vue'
import AppSignInUp from './AppSignInUp.vue'
import AppOTP from './AppOTP.vue'
import AppForgotPassword from './AppForgotPassword.vue'
import { useI18n } from '../composables/useI18n'

const auth = useAuthStore()
const { t } = useI18n()

const switchOptions: eSwitchOption[] = [
    { icon: 'sign-in', value: 'login' },
    { icon: 'user',    value: 'signup' },
]

const showSwitch = computed(() => auth.screen === 'auth')
const showBack   = computed(() => auth.screen !== 'welcome')

function handleBack() {
    if (auth.screen === 'auth') {
        auth.setScreen('welcome')
    } else {
        auth.setScreen('auth')
    }
    auth.setError(null)
}

function handleModeChange(value: string) {
    auth.setState(value as 'login' | 'signup')
    auth.setError(null)
}

// SVG stroke
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
    <div class="auth-backdrop" @click.self="auth.screen === 'otp' ? auth.setScreen('auth') : auth.setScreen('main')">
        <motion.div
            class="auth-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.96 }"
            :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }"
        >
            <!-- glow stack -->
            <div class="glow-stage" aria-hidden="true">
                <div class="glow-ambient" />
                <motion.div
                    class="glow-orbit"
                    :animate="{ rotate: 360 }"
                    :transition="{ duration: 14, repeat: Infinity, ease: 'linear' }"
                >
                    <div class="glow-blob blob-primary" />
                </motion.div>
                <motion.div
                    class="glow-orbit"
                    :animate="{ rotate: -360 }"
                    :transition="{ duration: 9, repeat: Infinity, ease: 'linear' }"
                >
                    <div class="glow-blob blob-secondary" />
                </motion.div>
                <motion.div
                    class="glow-orbit"
                    :animate="{ rotate: 360 }"
                    :transition="{ duration: 5.5, repeat: Infinity, ease: 'linear' }"
                >
                    <div class="glow-blob blob-accent" />
                </motion.div>
            </div>

            <div ref="cardEl" class="auth-card">
                <div class="card-blur" />

                <div class="card-inner">
                    <!-- header: back + switch - hidden on welcome -->
                    <div v-if="showBack || showSwitch" class="card-header">
                        <button v-if="showBack" class="back-btn" @click="handleBack">
                            <Icons kind="arrow-left" size="normal" />
                        </button>
                        <div v-if="showBack" class="header-spacer" />
                        <eSwitch
                            v-if="showSwitch"
                            :options="switchOptions"
                            :modelValue="auth.state"
                            @update:modelValue="handleModeChange"
                        />
                    </div>

                    <!-- content -->
                    <div class="card-content">
                        <AnimatePresence mode="wait">
                            <!-- welcome -->
                            <motion.div
                                v-if="auth.screen === 'welcome'"
                                key="welcome"
                                class="welcome-content"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :exit="{ opacity: 0 }"
                                :transition="{ duration: 0.15 }"
                            >
                                <Icons class="welcome-logo" kind="app-logo-full" size="xlarge" />

                                <span class="perks-label">Log in to gain access to:</span>

                                <ul class="perks-list">
                                    <li class="perk-item">
                                        <Icons kind="discover" size="normal" color="var(--accent-200)" />
                                        <span>Plugin marketplace with community-made plugins</span>
                                    </li>
                                    <li class="perk-item">
                                        <Icons kind="cloud" size="normal" color="var(--accent-200)" />
                                        <span>Cloud sync to save preferences across devices</span>
                                    </li>
                                    <li class="perk-item">
                                        <Icons kind="download" size="normal" color="var(--accent-200)" />
                                        <span>Automatic updates for installed plugins</span>
                                    </li>
                                    <li class="perk-item">
                                        <Icons kind="discover" size="normal" color="var(--accent-200)" />
                                        <span>Early access to new overlays and features</span>
                                    </li>
                                </ul>

                                <eButton
                                    size="half"
                                    :label="t('appwelcome.getStarted')"
                                    @click="auth.setScreen('auth')"
                                />
                            </motion.div>

                            <!-- sign in / sign up -->
                            <motion.div
                                v-else-if="auth.screen === 'auth'"
                                key="signin"
                                :initial="{ opacity: 0, x: -10 }"
                                :animate="{ opacity: 1, x: 0 }"
                                :exit="{ opacity: 0, x: 10 }"
                                :transition="{ duration: 0.15 }"
                            >
                                <AppSignInUp />
                            </motion.div>

                            <!-- OTP -->
                            <motion.div
                                v-else-if="auth.screen === 'otp'"
                                key="otp"
                                :initial="{ opacity: 0, x: 10 }"
                                :animate="{ opacity: 1, x: 0 }"
                                :exit="{ opacity: 0, x: -10 }"
                                :transition="{ duration: 0.15 }"
                            >
                                <AppOTP />
                            </motion.div>

                            <!-- forgot password -->
                            <motion.div
                                v-else-if="auth.screen === 'forgot-password'"
                                key="forgot"
                                :initial="{ opacity: 0, x: 10 }"
                                :animate="{ opacity: 1, x: 0 }"
                                :exit="{ opacity: 0, x: -10 }"
                                :transition="{ duration: 0.15 }"
                            >
                                <AppForgotPassword />
                            </motion.div>
                        </AnimatePresence>
                    </div>
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
.auth-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    background: var(--black-1a);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

.auth-motion {
    position: relative;
    width: 320px;
    height: 420px;
}

/* Glow stack */
.glow-stage {
    position: absolute;
    inset: -140px;
    z-index: 0;
    pointer-events: none;
    isolation: isolate;
}

.glow-ambient {
    position: absolute;
    inset: 80px;
    border-radius: 50%;
    background: radial-gradient(
        ellipse at center,
        hsla(142, 60%, 12%, 0.55) 0%,
        transparent 70%
    );
    filter: blur(48px);
}

.glow-orbit {
    position: absolute;
    inset: 0;
    transform-origin: center center;
}

.glow-blob {
    position: absolute;
    border-radius: 50%;
}


.blob-primary {
    width: 220px;
    height: 220px;
    top: 50%;
    left: 50%;
    margin-top: -200px;
    margin-left: -110px;
    background: radial-gradient(
        circle,
        hsla(142, 100%, 78%, 0.28) 0%,
        hsla(142, 100%, 60%, 0.10) 45%,
        transparent 70%
    );
    filter: blur(38px);
}


.blob-secondary {
    width: 160px;
    height: 160px;
    top: 50%;
    left: 50%;
    margin-top: 60px;
    margin-left: 80px;
    background: radial-gradient(
        circle,
        hsla(80, 100%, 72%, 0.20) 0%,
        hsla(100, 100%, 65%, 0.07) 50%,
        transparent 70%
    );
    filter: blur(30px);
}


.blob-accent {
    width: 90px;
    height: 90px;
    top: 50%;
    left: 50%;
    margin-top: 110px;
    margin-left: -100px;
    background: radial-gradient(
        circle,
        hsla(142, 100%, 89%, 0.45) 0%,
        hsla(142, 100%, 78%, 0.15) 50%,
        transparent 70%
    );
    filter: blur(18px);
}

.auth-card {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    background: var(--black-1-a);
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
    height: 100%;
}

.card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    min-height: 40px;
}


.back-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    flex-shrink: 0;
}

.back-btn:hover {
    color: var(--text-main);
}

.header-spacer {
    flex: 1;
}

.card-content {
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
}

.welcome-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5) 0 var(--space-3);
}

.welcome-logo {
    width: 200px;
    height: auto;
}

.perks-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--text-muted);
    text-align: center;
    letter-spacing: 0.04em;
}

.perks-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.perk-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    line-height: 1.3;
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
</style>
