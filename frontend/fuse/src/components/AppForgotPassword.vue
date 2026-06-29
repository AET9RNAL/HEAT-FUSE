<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import eInputField from './eInputField.vue'
import eButton from './eButton.vue'

const auth = useAuthStore()
const { t } = useI18n()

const sent = ref(false)

async function handleSend() {
    if (auth.loading) return
    const result = await auth.forgotPassword()
    if (result.success) sent.value = true
}
</script>

<template>
    <div class="forgot-form">
        <template v-if="!sent">
            <div class="forgot-header">
                <span class="forgot-title">{{ t('appauth.forgotPasswordTitle') }}</span>
                <span class="forgot-sub">{{ t('appauth.forgotPasswordSubtext') }}</span>
            </div>

            <eInputField
                :label="t('appauth.email')"
                type="email"
                orientation="default"
                :modelValue="auth.email"
                @update:modelValue="auth.setEmail($event)"
            />

            <div v-if="auth.error" class="error-inline">{{ auth.error }}</div>

            <eButton
                size="full"
                :label="t('appauth.forgotPasswordSend')"
                :disabled="auth.loading || !auth.email"
                @click="handleSend"
            />
        </template>

        <template v-else>
            <div class="forgot-header">
                <span class="forgot-title">{{ t('appauth.forgotPasswordSentTitle') }}</span>
                <span class="forgot-sub">{{ t('appauth.forgotPasswordSentSubtext') }}</span>
            </div>
        </template>
    </div>
</template>

<style scoped>
.forgot-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
}

.forgot-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.forgot-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.forgot-sub {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.error-inline {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--error-highlight);
    padding: var(--space-1) var(--space-2);
    background: var(--error-color);
}
</style>
