<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import eInputField from './eInputField.vue'
import eButton from './eButton.vue'

const auth = useAuthStore()
const { t } = useI18n()

const newPassword = ref('')
const confirmPassword = ref('')

const passwordRules = computed(() => [
    { label: t('appauth.passwordMinLength'), met: newPassword.value.length >= 6 },
    { label: t('appauth.passwordUppercase'), met: /[A-Z]/.test(newPassword.value) },
    { label: t('appauth.passwordNumber'), met: /[0-9]/.test(newPassword.value) },
    { label: t('appauth.passwordSpecial'), met: /[^a-zA-Z0-9]/.test(newPassword.value) },
])

const passwordValid = computed(() => passwordRules.value.every(r => r.met))
const passwordsMatch = computed(() => newPassword.value === confirmPassword.value)
const canSubmit = computed(() => passwordValid.value && passwordsMatch.value && !auth.loading)

async function handleSubmit() {
    if (!canSubmit.value) return
    await auth.updatePassword(newPassword.value)
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
    <div class="reset-backdrop">
        <motion.div
            class="reset-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="cardEl" class="reset-card">
                <div class="card-blur" />

                <div class="card-inner">
                    <div class="card-header">
                        <span class="card-title">{{ t('resetPassword.title') }}</span>
                        <span class="card-sub">{{ t('resetPassword.subtitle') }}</span>
                    </div>

                    <div class="card-content">
                        <div class="fields">
                            <eInputField
                                :label="t('resetPassword.newPassword')"
                                type="password"
                                orientation="default"
                                v-model="newPassword"
                            />
                            <eInputField
                                :label="t('resetPassword.confirmPassword')"
                                type="password"
                                orientation="mirrored"
                                v-model="confirmPassword"
                            />
                        </div>

                        <div v-if="newPassword.length > 0" class="password-rules">
                            <div v-for="rule in passwordRules" :key="rule.label" class="rule-row">
                                <span class="rule-icon" :class="rule.met ? 'rule-met' : 'rule-unmet'">
                                    {{ rule.met ? '✓' : '✗' }}
                                </span>
                                <span class="rule-text" :class="rule.met ? 'rule-met' : 'rule-unmet'">{{ rule.label }}</span>
                            </div>
                        </div>

                        <span
                            v-if="confirmPassword.length > 0 && !passwordsMatch"
                            class="mismatch-label"
                        >
                            {{ t('resetPassword.passwordMismatch') }}
                        </span>

                        <div v-if="auth.error" class="error-inline">{{ auth.error }}</div>

                        <div class="card-actions">
                            <eButton
                                size="half"
                                :label="t('resetPassword.cancel')"
                                @click="auth.setScreen('main')"
                            />
                            <eButton
                                size="half"
                                :label="t('resetPassword.submit')"
                                :disabled="!canSubmit"
                                @click="handleSubmit"
                            />
                        </div>
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
.reset-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.reset-motion {
    width: 320px;
}

.reset-card {
    position: relative;
    width: 100%;
    background: hsla(142, 10%, 4%, 0.92);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
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
}

.card-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.card-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.card-sub {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.card-content {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.password-rules {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.rule-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
}

.rule-icon {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    font-weight: var(--font-weight-1);
    width: 12px;
    text-align: center;
    flex-shrink: 0;
}

.rule-text {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
}

.rule-met { color: var(--accent-200); }
.rule-unmet { color: var(--text-muted); }

.mismatch-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--error-highlight);
}

.error-inline {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--error-highlight);
    padding: var(--space-1) var(--space-2);
    background: var(--error-color);
}

.card-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
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
