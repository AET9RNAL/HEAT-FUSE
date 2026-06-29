<script setup lang="ts">
import { computed, ref } from 'vue'
import { AnimatePresence } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useI18n } from '../composables/useI18n'
import eInputField from './eInputField.vue'
import eButton from './eButton.vue'
import eCheckbox from './eCheckbox.vue'
import eLegalModal from './eLegalModal.vue'

const auth = useAuthStore()
const appStore = useAppStore()
const { t } = useI18n()

const isSignUp = computed(() => auth.state === 'signup')

const activeLegal = ref<'tos' | 'privacy' | null>(null)
function openLegal(which: 'tos' | 'privacy') { activeLegal.value = which }
function closeLegal() { activeLegal.value = null }

const passwordRules = computed(() => [
    { label: t('appauth.passwordMinLength'), met: auth.password.length >= 6 },
    { label: t('appauth.passwordUppercase'), met: /[A-Z]/.test(auth.password) },
    { label: t('appauth.passwordNumber'), met: /[0-9]/.test(auth.password) },
    { label: t('appauth.passwordSpecial'), met: /[^a-zA-Z0-9]/.test(auth.password) },
])

const passwordValid = computed(() => passwordRules.value.every(r => r.met))

async function handleSubmit() {
    if (auth.loading) return
    if (isSignUp.value) {
        await auth.signUp()
    } else {
        await auth.signIn()
    }
}
</script>

<template>
    <div class="sign-form">
        <div class="fields">
            <eInputField
                :label="t('appauth.email')"
                type="email"
                orientation="default"
                :modelValue="auth.email"
                @update:modelValue="auth.setEmail($event)"
            />
            <eInputField
                :label="t('appauth.password')"
                type="password"
                orientation="mirrored"
                :modelValue="auth.password"
                @update:modelValue="auth.setPassword($event)"
                @keydown.enter="handleSubmit"
            />
        </div>

        <div v-if="isSignUp && auth.password.length > 0" class="password-rules">
            <span class="rules-label">{{ t('appauth.passwordMustInclude') }}</span>
            <div v-for="rule in passwordRules" :key="rule.label" class="rule-row">
                <span class="rule-icon" :class="rule.met ? 'rule-met' : 'rule-unmet'">
                    {{ rule.met ? '✓' : '✗' }}
                </span>
                <span class="rule-text" :class="rule.met ? 'rule-met' : 'rule-unmet'">{{ rule.label }}</span>
            </div>
        </div>

        <button
            v-if="!isSignUp"
            class="forgot-btn"
            @click="auth.setScreen('forgot-password')"
        >
            {{ t('appauth.forgotPassword') }}
        </button>

        <template v-if="isSignUp">
            <div class="consent-row">
                <eCheckbox v-model="appStore.analyticsConsent" :width="16" :height="16" />
                <span class="consent-label">
                    Help improve <span class="brand-highlight">FUSE</span> for everyone
                </span>
            </div>
            <div class="consent-row">
                <eCheckbox v-model="appStore.diagnosticsConsent" :width="16" :height="16" />
                <span class="consent-label">Send anonymous diagnostic reports</span>
            </div>
        </template>

        <div v-if="auth.error" class="error-inline">{{ auth.error }}</div>

        <eButton
            size="full"
            :label="isSignUp ? t('appauth.signUp') : t('appauth.signIn')"
            :disabled="auth.loading || (isSignUp && auth.password.length > 0 && !passwordValid)"
            @click="handleSubmit"
        />

        <p class="legal-disclaimer">
            <template v-if="isSignUp">Creating an account means you're okay with FUSE's </template>
            <template v-else>By signing in you agree to FUSE's </template>
            <span class="legal-link" @click="openLegal('tos')">Terms of Service</span>
            and
            <span class="legal-link" @click="openLegal('privacy')">Privacy Policy</span>.
        </p>
    </div>

    <AnimatePresence>
        <eLegalModal
            v-if="activeLegal === 'tos'"
            key="tos"
            title="Terms of Service"
            subtitle="FUSE Cloud Service"
            @close="closeLegal"
        >
            <p class="intro">
                These Terms of Service govern your use of the FUSE cloud service (account creation,
                authentication, cross-device settings sync, and plugin marketplace). The FUSE client
                software itself is licensed separately under GPLv3 (see the Terms &amp; Conditions screen).
            </p>

            <h3 class="section-title">Eligibility</h3>
            <ul class="term-list">
                <li>You must be at least 13 years old (or the minimum age in your jurisdiction) to create an account.</li>
                <li>You are responsible for keeping your account credentials confidential and for all activity under your account.</li>
            </ul>

            <h3 class="section-title">Acceptable Use</h3>
            <ul class="term-list">
                <li>You may not use the service to distribute plugins or content that violate the FUSE GPLv3 license additional terms (no cheats, no runtime injection, no automation).</li>
                <li>You may not attempt to disrupt, overload, or reverse-engineer the cloud backend.</li>
                <li>You may not impersonate other users or misrepresent your affiliation with FUSE or Wargaming.</li>
            </ul>

            <h3 class="section-title">Service Availability</h3>
            <p class="term-intro">
                The cloud service is provided on a best-effort basis with no uptime guarantee. FUSE is
                a volunteer-run project and the service may be modified, suspended, or discontinued at
                any time. The FUSE client will continue to function offline without the cloud service.
            </p>

            <h3 class="section-title">Termination</h3>
            <ul class="term-list">
                <li>You may delete your account at any time from the Account screen.</li>
                <li>We may suspend or terminate accounts that violate these terms or the FUSE GPLv3 additional terms.</li>
            </ul>

            <h3 class="section-title">Disclaimer of Warranty</h3>
            <p class="outro">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT
                PERMITTED BY LAW, THE FUSE MAINTAINERS DISCLAIM ALL LIABILITY FOR DAMAGES ARISING FROM
                USE OF, OR INABILITY TO USE, THE SERVICE.
            </p>
        </eLegalModal>

        <eLegalModal
            v-else-if="activeLegal === 'privacy'"
            key="privacy"
            title="Privacy Policy"
            subtitle="How FUSE handles your data"
            @close="closeLegal"
        >
            <p class="intro">
                This policy describes what data the FUSE cloud service collects, why, and who it is
                shared with. The FUSE client only contacts these services when you sign in; offline
                usage does not transmit any personal data.
            </p>

            <h3 class="section-title">Data We Collect</h3>
            <ul class="term-list">
                <li><strong>Account data</strong> &mdash; your email address and a hashed password, stored by Supabase.</li>
                <li><strong>Device identifiers</strong> &mdash; a hashed fingerprint derived from your CPU model, hostname, and OS, plus your operating system version and local IP. Used to manage signed-in devices and enforce the per-account device limit.</li>
                <li><strong>Synced settings</strong> &mdash; the preferences you toggle in FUSE (language, autostart, tray behavior, game paths, etc.) are synced to your account so they follow you across devices.</li>
                <li><strong>Diagnostic data</strong> &mdash; if enabled, anonymized crash reports and error logs to help us fix bugs.</li>
                <li><strong>Product analytics</strong> &mdash; if enabled, aggregated usage events (which screens are opened, which plugins are toggled) to guide development.</li>
            </ul>

            <h3 class="section-title">Who Processes Your Data</h3>
            <ul class="term-list">
                <li><strong>Supabase</strong> (US) &mdash; authentication and cloud database for account and settings sync.</li>
                <li><strong>PostHog</strong> (US) &mdash; product analytics (only if you opt in).</li>
                <li><strong>BetterStack</strong> &mdash; error and warning logs (only if you opt in to diagnostics).</li>
                <li><strong>Sentry</strong> &mdash; crash reports (only if you opt in to diagnostics).</li>
                <li><strong>GitHub</strong> (US) &mdash; serves application updates.</li>
                <li><strong>Discord</strong> (US) &mdash; receives Rich Presence data only if you enable Discord integration. No PII is sent.</li>
            </ul>

            <h3 class="section-title">Your Rights</h3>
            <ul class="term-list">
                <li><strong>Access &amp; portability</strong> &mdash; you can view your account data on the Account screen.</li>
                <li><strong>Erasure</strong> &mdash; deleting your account permanently removes your profile, synced settings, and device list.</li>
                <li><strong>Consent withdrawal</strong> &mdash; analytics and diagnostics are opt-in and can be disabled at any time in Settings.</li>
                <li><strong>Contact</strong> &mdash; reach the FUSE maintainers via the project's GitHub repository for any data-related request.</li>
            </ul>

            <h3 class="section-title">International Transfers</h3>
            <p class="term-intro">
                Some of our processors are based in the United States. By using the cloud service you
                consent to your data being transferred and processed in the US under the safeguards
                published by each processor (Standard Contractual Clauses where applicable).
            </p>

            <h3 class="section-title">Retention</h3>
            <p class="outro">
                Account data is retained until you delete your account. Diagnostic logs are retained
                for up to 30 days. Analytics events are retained for up to 12 months.
            </p>
        </eLegalModal>
    </AnimatePresence>
</template>

<style scoped>
.sign-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
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
    padding: var(--space-2);
    background: var(--black-2-a);
}

.rules-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-5);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
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

.forgot-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    text-align: left;
    transition: color 0.15s;
}

.forgot-btn:hover {
    color: var(--text-main);
}

.error-inline {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--error-highlight);
    padding: var(--space-1) var(--space-2);
    background: var(--error-color);
}

.legal-disclaimer {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    line-height: 1.4;
    text-align: center;
}

.legal-link {
    color: var(--accent-200);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: rgba(100, 255, 150, 0.4);
    text-underline-offset: 2px;
    transition: color 0.15s, text-decoration-color 0.15s;
}

.legal-link:hover {
    color: var(--light-green);
    text-decoration-color: var(--light-green);
}

.consent-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.consent-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    line-height: 1.3;
    user-select: none;
    -webkit-user-select: none;
}

.brand-highlight {
    color: var(--accent-200);
    font-weight: var(--font-weight-1);
}
</style>
