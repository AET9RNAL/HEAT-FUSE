<script setup lang="ts">
import { ref, computed } from 'vue'
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

</script>

<template>
    <div class="reset-backdrop">
        <motion.div
            class="reset-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div class="reset-card">
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
    box-sizing: border-box;
    background: hsla(142, 10%, 4%, 0.92);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.card-blur {
    position: absolute;
    inset: 0;
    z-index: 0;
    backdrop-filter: blur(35px);
    -webkit-backdrop-filter: blur(35px);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
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

</style>
