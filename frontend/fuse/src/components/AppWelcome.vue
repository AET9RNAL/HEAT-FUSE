<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import { useSuspension } from '../composables/useSuspension'
import AppSignInUp from './AppSignInUp.vue'
import AppOTP from './AppOTP.vue'
import AppOnboarding from './AppOnboarding.vue'
import welcomeAnimation from '../assets/animationWelcome.webm?url'

const auth = useAuthStore()
const { isSuspended } = useSuspension()

const videoEl = ref<HTMLVideoElement | null>(null)

// halt decode in tray
watch(isSuspended, (suspended) => {
    const video = videoEl.value
    if (!video) return
    if (suspended) video.pause()
    else void video.play().catch(() => { /* autoplay refused - static frame is fine */ })
})

const activeKey = computed(() => auth.screen)

const prefersReducedMotion = ref(false)
let motionQuery: MediaQueryList | null = null
function syncMotionPreference(event: MediaQueryList | MediaQueryListEvent) {
    prefersReducedMotion.value = event.matches
}

onMounted(() => {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    syncMotionPreference(motionQuery)
    motionQuery.addEventListener('change', syncMotionPreference)
})
onUnmounted(() => motionQuery?.removeEventListener('change', syncMotionPreference))
</script>

<template>
    <div class="welcome-screen">
        <video
            ref="videoEl"
            class="media-video"
            :src="welcomeAnimation"
            muted
            autoplay
            :loop="!prefersReducedMotion"
            playsinline
            preload="auto"
            disablepictureinpicture
        />

        <div class="auth-panel">
            <AnimatePresence mode="wait">
                <motion.div
                    :key="activeKey"
                    class="panel-content"
                    :initial="{ opacity: 0, x: -12 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 12 }"
                    :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
                >
                    <AppOnboarding v-if="auth.screen === 'onboarding'" />
                    <AppOTP v-else-if="auth.screen === 'otp'" />
                    <AppSignInUp v-else />
                </motion.div>
            </AnimatePresence>
        </div>
    </div>
</template>

<style scoped>
.welcome-screen {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    overflow: hidden;
}

.auth-panel {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    height: 100%;
    width: max-content;
    max-width: 100%;
    padding: var(--space-5) 55px;
    box-sizing: border-box;
    overflow-y: auto;
}

.panel-content {
    display: flex;
    justify-content: center;
}

.media-video {
    user-select: none;
    -webkit-user-select: none;
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
}
</style>
