<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import eSetting, { type SettingStatus } from './eSetting.vue'
import eButton from './eButton.vue'
import Icons from './Icons.vue'
import type { eSwitchOption } from './eSwitch.vue'

const store = useAppStore()
const auth = useAuthStore()
const { t } = useI18n()

const STAGES = 3
const SUCCESS_DWELL_MS = 1600

const stage = ref(1)

const platformOptions: eSwitchOption[] = [
    { icon: 'steam', value: 'steam' },
    { icon: 'wgc', value: 'wgc' },
]

const gameDirPath = computed({
    get: () => store.gameDirPaths[store.gamePlatform] ?? '',
    set: (val: string) => store.setGameDirPath(store.gamePlatform, val),
})

// null = no path, or a path the debugger check couldn't read.
const debuggerEnabled = ref<boolean | null>(null)
const applying = ref(false)
const applyFailed = ref(false)

const gameDirStatus = computed<SettingStatus>(() => {
    if (!gameDirPath.value) return 'warning'
    if (debuggerEnabled.value === null) return 'error'
    return 'success'
})

const configStatus = computed<SettingStatus>(() => {
    if (applyFailed.value) return 'error'
    if (debuggerEnabled.value) return 'success'
    return 'warning'
})

const canAdvance = computed(() => {
    if (stage.value === 1) return true
    return !!gameDirPath.value && debuggerEnabled.value !== null
})

// Only a signed-in user has nowhere to go back to - they arrived here past auth.
const canGoBack = computed(() => stage.value > 1 || !auth.isSignedIn())

const titleKey = computed(() => {
    if (stage.value === 1) return 'apponboarding.titleStage1'
    if (stage.value === 3 && !applying.value && !applyFailed.value) return 'apponboarding.titleStage3'
    return 'apponboarding.titleStage2'
})

async function pickGameDir(value: boolean | string) {
    if (typeof value !== 'string') return
    gameDirPath.value = value
    applyFailed.value = false
    await store.scanGameDir(value)
    const result = await store.checkDebugger(value)
    debuggerEnabled.value = result.success ? (result.enabled ?? false) : null
}

function setPlatform(value: boolean | string) {
    if (typeof value !== 'string') return
    store.gamePlatform = value as 'steam' | 'wgc'
    // The path is per-platform, so switching invalidates what was checked.
    debuggerEnabled.value = null
    applyFailed.value = false
}

let finishTimer: ReturnType<typeof setTimeout> | null = null

// same action as in AppSettings
async function applyConfiguration() {
    applying.value = true
    applyFailed.value = false
    const result = debuggerEnabled.value
        ? { success: true }
        : await store.enableDebugger(gameDirPath.value)
    applying.value = false

    if (!result.success) {
        applyFailed.value = true
        return
    }
    debuggerEnabled.value = true
    store.onboardingComplete = true
    finishTimer = setTimeout(() => auth.setScreen('main'), SUCCESS_DWELL_MS)
}

async function next() {
    if (stage.value === 1) {
        stage.value = 2
        return
    }
    if (!canAdvance.value) return
    stage.value = 3
    await applyConfiguration()
}

function goBack() {
    if (stage.value > 1) {
        stage.value -= 1
        applyFailed.value = false
        return
    }
    auth.setScreen('welcome')
}

onUnmounted(() => { if (finishTimer) clearTimeout(finishTimer) })
</script>

<template>
    <div class="onboarding-column">
        <div class="stages">
            <span
                v-for="n in STAGES"
                :key="n"
                class="stage-segment"
                :class="{ filled: n <= stage }"
            />
        </div>

        <div class="header">
            <h1 class="title">{{ t(titleKey) }}</h1>
            <p v-if="stage !== 3" class="subtitle">{{ t('apponboarding.subtitle') }}</p>

            <AnimatePresence mode="wait">
                <motion.div
                    v-if="stage === 1"
                    key="platform"
                    class="stage-body"
                    :initial="{ opacity: 0, x: -8 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 8 }"
                    :transition="{ duration: 0.15 }"
                >
                    <eSetting
                        icon="platform"
                        :label="t('apponboarding.platformTitle')"
                        :description="t('apponboarding.platformDescription')"
                        type="switch"
                        :options="platformOptions"
                        :value="store.gamePlatform"
                        @update:value="setPlatform"
                    />
                </motion.div>

                <motion.div
                    v-else-if="stage === 2"
                    key="path"
                    class="stage-body"
                    :initial="{ opacity: 0, x: -8 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 8 }"
                    :transition="{ duration: 0.15 }"
                >
                    <eSetting
                        icon="folder"
                        :label="t('apponboarding.pathTitle')"
                        :description="t('apponboarding.pathDescription')"
                        type="dir"
                        :status="gameDirStatus"
                        :value="gameDirPath"
                        :placeholder="t('apponboarding.pathPlaceholder')"
                        @update:value="pickGameDir"
                    />
                    <p v-if="gameDirPath && debuggerEnabled === null" class="stage-error">
                        {{ t('apponboarding.pathInvalid') }}
                    </p>
                </motion.div>

                <motion.div
                    v-else-if="applying"
                    key="applying"
                    class="stage-body"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    :transition="{ duration: 0.15 }"
                >
                    <eSetting
                        icon="settings"
                        :label="t('apponboarding.configTitle')"
                        :description="t('apponboarding.configDescription')"
                        type="toggle"
                        :status="configStatus"
                        :value="debuggerEnabled === true"
                        disabled
                    />
                    <p class="subtitle">{{ t('apponboarding.applying') }}</p>
                </motion.div>

                <motion.div
                    v-else-if="applyFailed"
                    key="failed"
                    class="stage-body"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    :transition="{ duration: 0.15 }"
                >
                    <eSetting
                        icon="settings"
                        :label="t('apponboarding.configTitle')"
                        :description="t('apponboarding.configDescription')"
                        type="toggle"
                        :status="configStatus"
                        :value="false"
                        disabled
                    />
                    <p class="stage-error">{{ t('apponboarding.applyFailed') }}</p>
                </motion.div>

                <motion.div
                    v-else
                    key="done"
                    class="stage-body done"
                    :initial="{ opacity: 0, scale: 0.96 }"
                    :animate="{ opacity: 1, scale: 1 }"
                    :transition="{ duration: 0.2 }"
                >
                    <Icons kind="checkmark" size="large" color="var(--text-main)" />
                    <p class="subtitle">{{ t('apponboarding.success') }}</p>
                </motion.div>
            </AnimatePresence>
        </div>

        <div v-if="stage !== 3" class="actions">
            <eButton
                size="half"
                :label="t('apponboarding.goBack')"
                :disabled="!canGoBack"
                @click="goBack"
            />
            <eButton
                size="half"
                variant="accent"
                :label="t('apponboarding.next')"
                :disabled="!canAdvance"
                @click="next"
            />
        </div>

        <div v-else-if="applyFailed" class="actions">
            <eButton
                size="half"
                :label="t('apponboarding.goBack')"
                @click="stage = 2"
            />
            <eButton
                size="half"
                variant="accent"
                :label="t('apponboarding.retry')"
                @click="applyConfiguration"
            />
        </div>
    </div>
</template>

<style scoped>
.onboarding-column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-5);
    width: 400px;
}

.stages {
    display: flex;
    gap: var(--space-1);
    width: 100%;
    height: 4px;
}

.stage-segment {
    flex: 1 0 0;
    height: 2px;
    align-self: center;
    background: var(--base-600);
    transition: background 0.25s ease;
}

.stage-segment.filled {
    background: var(--accent-200);
}

.header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
}

.title {
    margin: 0;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-2);
    line-height: 1;
    color: var(--text-main);
    text-align: center;
}

.subtitle {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-main);
    text-align: center;
}

.stage-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
}

.stage-body.done {
    align-items: center;
    gap: 10px;
}

.stage-error {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--error-highlight);
    text-align: center;
}

.actions {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
}
</style>
