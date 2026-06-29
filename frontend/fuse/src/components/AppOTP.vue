<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'

const auth = useAuthStore()
const { t } = useI18n()

const DIGITS = 6
const digits = ref<string[]>(Array(DIGITS).fill(''))
const inputRefs = ref<HTMLInputElement[]>([])

const RESEND_COOLDOWN = 30
const resendTimer = ref(0)
let resendInterval: ReturnType<typeof setInterval> | null = null
let deliveryInterval: ReturnType<typeof setInterval> | null = null

const deliveryLabel = computed(() => {
    switch (auth.emailDeliveryStatus) {
        case 'sending':   return t('appauth.otpSending')
        case 'sent':      return t('appauth.otpSent')
        case 'delivered': return t('appauth.otpDelivered')
        case 'bounced':   return t('appauth.otpBounced')
        default: return ''
    }
})

const canResend = computed(() => resendTimer.value === 0 && !auth.loading)

function focusNext(index: number) {
    if (index < DIGITS - 1) inputRefs.value[index + 1]?.focus()
}

function focusPrev(index: number) {
    if (index > 0) inputRefs.value[index - 1]?.focus()
}

function handleKey(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !digits.value[index]) {
        focusPrev(index)
    }
}

function handleInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement
    const val = input.value.replace(/\D/g, '').slice(-1)
    digits.value[index] = val
    input.value = val
    if (val) focusNext(index)
    if (digits.value.every(d => d) && digits.value.join('').length === DIGITS) {
        submitOTP()
    }
}

async function handlePaste(event: ClipboardEvent) {
    event.preventDefault()
    const text = event.clipboardData?.getData('text') ?? ''
    const nums = text.replace(/\D/g, '').slice(0, DIGITS)
    for (let i = 0; i < DIGITS; i++) {
        digits.value[i] = nums[i] ?? ''
    }
    if (nums.length === DIGITS) {
        inputRefs.value[DIGITS - 1]?.focus()
        await submitOTP()
    } else {
        inputRefs.value[nums.length]?.focus()
    }
}

async function submitOTP() {
    const token = digits.value.join('')
    if (token.length !== DIGITS) return
    const result = await auth.verifyOTP(token)
    if (result.success) {
        const { data: { session } } = await (await import('../composables/supabase-client')).supabase.auth.getSession()
        if (session) auth.finalizeLogin(session)
    } else {
        digits.value = Array(DIGITS).fill('')
        inputRefs.value[0]?.focus()
    }
}

function startResendTimer() {
    resendTimer.value = RESEND_COOLDOWN
    resendInterval = setInterval(() => {
        resendTimer.value--
        if (resendTimer.value <= 0) {
            clearInterval(resendInterval!)
            resendInterval = null
        }
    }, 1000)
}

function startDeliveryPolling() {
    auth.resetEmailDeliveryStatus()
    auth.checkEmailDeliveryStatus()
    deliveryInterval = setInterval(() => {
        if (auth.emailDeliveryStatus === 'delivered' || auth.emailDeliveryStatus === 'bounced') {
            clearInterval(deliveryInterval!)
            deliveryInterval = null
            return
        }
        auth.checkEmailDeliveryStatus()
    }, 3000)
}

async function handleResend() {
    if (!canResend.value) return
    await auth.resendOTP()
    startResendTimer()
    startDeliveryPolling()
    digits.value = Array(DIGITS).fill('')
    inputRefs.value[0]?.focus()
}

onMounted(() => {
    startResendTimer()
    startDeliveryPolling()
    inputRefs.value[0]?.focus()
})

onUnmounted(() => {
    if (resendInterval) clearInterval(resendInterval)
    if (deliveryInterval) clearInterval(deliveryInterval)
})
</script>

<template>
    <div class="otp-form">
        <div class="otp-header">
            <span class="otp-title">{{ t('appauth.otpTitle') }}</span>
            <span class="otp-sub">{{ t('appauth.otpSubtext1') }}</span>
            <span class="otp-sub">{{ t('appauth.otpSubtext2') }}</span>
        </div>

        <div class="otp-inputs">
            <input
                v-for="i in DIGITS"
                :key="i"
                :ref="el => { if (el) inputRefs[i - 1] = el as HTMLInputElement }"
                class="otp-digit"
                type="text"
                inputmode="numeric"
                maxlength="1"
                autocomplete="one-time-code"
                :value="digits[i - 1]"
                @input="handleInput(i - 1, $event)"
                @keydown="handleKey(i - 1, $event)"
                @paste="handlePaste"
                @focus="($event.target as HTMLInputElement).select()"
            />
        </div>

        <div v-if="auth.error" class="error-inline">{{ auth.error }}</div>

        <span v-if="deliveryLabel" class="delivery-status">{{ deliveryLabel }}</span>

        <button
            class="resend-btn"
            :disabled="!canResend"
            @click="handleResend"
        >
            {{ canResend ? t('appauth.resendCode') : `${t('appauth.resendCode')} (${resendTimer}s)` }}
        </button>
    </div>
</template>

<style scoped>
.otp-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
}

.otp-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.otp-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.otp-sub {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.otp-inputs {
    display: flex;
    gap: var(--space-1);
    justify-content: center;
}

.otp-digit {
    width: 38px;
    height: 44px;
    background: var(--black-1-a);
    border: none;
    outline: none;
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-1);
    color: var(--text-main);
    text-align: center;
    clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
    caret-color: var(--accent-200);
    transition: background 0.12s;
}

.otp-digit:focus {
    background: var(--black-3-a);
}

.error-inline {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--error-highlight);
    padding: var(--space-1) var(--space-2);
    background: var(--error-color);
}

.delivery-status {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--text-muted);
    text-align: center;
}

.resend-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--accent-200);
    text-align: center;
    transition: opacity 0.15s;
}

.resend-btn:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
}
</style>
