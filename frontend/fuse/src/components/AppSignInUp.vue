<script setup lang="ts">
import { computed, ref } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useI18n } from '../composables/useI18n'
import eInputField from './eInputField.vue'
import eButton from './eButton.vue'
import eCheckbox from './eCheckbox.vue'
import ePassStrength from './ePassStrength.vue'
import eLegalModal from './eLegalModal.vue'
import Icons from './Icons.vue'
import combinationMark from '../assets/CombinationMark.svg'

const auth = useAuthStore()
const appStore = useAppStore()
const { t } = useI18n()

const PROVIDERS_ENABLED = false

const isStage1 = computed(() => auth.screen === 'welcome')
const isStage2 = computed(() => auth.screen === 'signin-password')
const isSignUp = computed(() => auth.screen === 'signup')
const isRecovery = computed(() => auth.screen === 'recovery')

const showsLogo = computed(() => !isRecovery.value)
const showsProviders = computed(() => isStage1.value || isSignUp.value)

const recoverySent = ref(false)

const activeLegal = ref<'tos' | 'privacy' | null>(null)
function openLegal(which: 'tos' | 'privacy') { activeLegal.value = which }
function closeLegal() { activeLegal.value = null }

function handleContinue() {
    if (!auth.email.trim()) {
        auth.setError(t('appauth.emailRequired'))
        return
    }
    auth.goToPasswordStage()
}

function goToSignUp() {
    auth.setPassword('')
    auth.setError(null)
    auth.setScreen('signup')
}

function goToRecovery() {
    recoverySent.value = false
    auth.setPassword('')
    auth.setError(null)
    auth.setScreen('recovery')
}

async function handleSignIn() {
    if (auth.loading) return
    await auth.signIn()
}

async function handleSignUp() {
    if (auth.loading || !auth.passwordMeetsPolicy) return
    await auth.signUp()
}

async function handleRecovery() {
    if (auth.loading || !auth.email.trim()) return
    const result = await auth.forgotPassword()
    if (result.success) recoverySent.value = true
}
</script>

<template>
    <div class="sign-column">
        <img v-if="showsLogo" class="combination-mark" :src="combinationMark" alt="HEAT FUSE" />

        <!-- Back out of stage 2 / recovery -->
        <button
            v-if="isStage2 || isRecovery"
            class="back-link"
            @click="auth.backToEmailStage()"
        >
            <Icons kind="arrow-left" size="small" />
            <span class="link-text">{{ isRecovery ? t('appauth.backToLogIn') : t('appauth.back') }}</span>
        </button>

        <div class="header">
            <div v-if="isStage1" class="header-row">
                <h1 class="title">{{ t('appauth.logIn') }}</h1>
                <button class="skip-link" @click="auth.skipLogin()">{{ t('appauth.skipForNow') }}</button>
            </div>
            <h1 v-else-if="isStage2" class="title centered">{{ t('appauth.welcomeToFuse') }}</h1>
            <h1 v-else-if="isSignUp" class="title centered">{{ t('appauth.createAccount') }}</h1>
            <template v-else-if="isRecovery">
                <h1 class="title centered">
                    {{ t('appauth.recoveryTitleLine1') }}<br>{{ t('appauth.recoveryTitleLine2') }}
                </h1>
                <p class="recovery-body">{{ t('appauth.recoveryBody') }}</p>
            </template>

            <div v-if="isStage1" class="account-prompt">
                <span>{{ t('appauth.noAccount') }}</span>
                <button class="inline-link" @click="goToSignUp">{{ t('appauth.createOne') }}</button>
            </div>
        </div>

        <div v-if="showsProviders" class="providers">
            <eButton
                size="full"
                :label="isSignUp ? t('appauth.signUpWithGoogle') : t('appauth.signInWithGoogle')"
                icon="google"
                :disabled="!PROVIDERS_ENABLED"
            />
            <eButton
                size="full"
                :label="isSignUp ? t('appauth.signUpWithWargaming') : t('appauth.signInWithWargaming')"
                icon="wgc"
                :disabled="!PROVIDERS_ENABLED"
            />
        </div>

        <div v-if="showsProviders" class="or-divider">
            <span class="rule" />
            <span class="or-label">{{ t('appauth.or') }}</span>
            <span class="rule" />
        </div>

        <div class="fields">
            <div class="field">
                <div class="field-labels">
                    <span class="micro">{{ t('appauth.emailLabel') }}</span>
                    <button
                        v-if="isStage2 || isRecovery"
                        class="micro micro-link"
                        @click="auth.backToEmailStage()"
                    >{{ t('appauth.edit') }}</button>
                </div>
                <eInputField
                    label=""
                    type="email"
                    orientation="default"
                    :locked="isStage2"
                    :autofocus="isStage1"
                    :modelValue="auth.email"
                    @update:modelValue="auth.setEmail($event)"
                    @keydown.enter="isStage1 ? handleContinue() : undefined"
                />
            </div>

            <div v-if="isStage2 || isSignUp" class="field">
                <div class="field-labels">
                    <span class="micro">{{ t('appauth.passwordLabel') }}</span>
                    <button
                        v-if="isStage2"
                        class="micro micro-link"
                        @click="goToRecovery"
                    >{{ t('appauth.forgot') }}</button>
                </div>
                <eInputField
                    label=""
                    type="password"
                    orientation="mirrored"
                    :autofocus="isStage2"
                    :modelValue="auth.password"
                    @update:modelValue="auth.setPassword($event)"
                    @keydown.enter="isSignUp ? handleSignUp() : handleSignIn()"
                />
                <ePassStrength
                    v-if="isSignUp"
                    :strength="auth.passwordStrength"
                    :invalid="auth.password.length > 0 && !auth.passwordMeetsPolicy"
                />
            </div>
        </div>

        <AnimatePresence>
            <motion.p
                v-if="auth.error"
                key="error"
                class="error-inline"
                :initial="{ opacity: 0, y: -4 }"
                :animate="{ opacity: 1, y: 0 }"
                :exit="{ opacity: 0 }"
                :transition="{ duration: 0.15 }"
            >{{ auth.error }}</motion.p>
            <motion.p
                v-else-if="isRecovery && recoverySent"
                key="sent"
                class="sent-inline"
                :initial="{ opacity: 0, y: -4 }"
                :animate="{ opacity: 1, y: 0 }"
                :exit="{ opacity: 0 }"
                :transition="{ duration: 0.15 }"
            >{{ t('appauth.forgotPasswordSentSubtext') }}</motion.p>
        </AnimatePresence>

        <eButton
            v-if="isStage1"
            size="full"
            variant="accent"
            :label="t('appauth.logIn')"
            :disabled="auth.loading"
            @click="handleContinue"
        />
        <eButton
            v-else-if="isStage2"
            size="full"
            variant="accent"
            :label="t('appauth.logIn')"
            :disabled="auth.loading || !auth.password"
            @click="handleSignIn"
        />
        <eButton
            v-else-if="isSignUp"
            size="full"
            variant="accent"
            :label="t('appauth.signUp')"
            :disabled="auth.loading || !auth.email.trim() || !auth.passwordMeetsPolicy"
            @click="handleSignUp"
        />
        <eButton
            v-else-if="isRecovery"
            size="full"
            variant="accent"
            :label="t('appauth.verifyEmail')"
            :disabled="auth.loading || !auth.email.trim()"
            @click="handleRecovery"
        />

        <div v-if="isSignUp" class="account-prompt centered">
            <span>{{ t('appauth.haveAccount') }}</span>
            <button class="inline-link" @click="auth.backToEmailStage()">{{ t('appauth.logInLink') }}</button>
        </div>

        <div v-if="isSignUp" class="telemetry">
            <div class="consent-row">
                <eCheckbox v-model="appStore.analyticsConsent" :width="12" :height="12" />
                <span class="consent-label">
                    Help improve <span class="brand-highlight">FUSE</span> for everyone
                </span>
            </div>
            <div class="consent-row">
                <eCheckbox v-model="appStore.diagnosticsConsent" :width="12" :height="12" />
                <span class="consent-label">{{ t('appauth.diagnosticsConsent') }}</span>
            </div>
        </div>

        <p v-if="!isRecovery" class="legal-disclaimer">
            <template v-if="isSignUp">Creating an account means you're okay with our<br></template>
            <span class="legal-link" @click="openLegal('tos')">{{ t('appauth.termsOfService') }}</span>
            and
            <span class="legal-link" @click="openLegal('privacy')">{{ t('appauth.privacyPolicy') }}</span>.
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
.sign-column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-5);
    width: 280px;
}

.combination-mark {
    user-select: none;
    -webkit-user-select: none;
    width: 100%;
    height: auto;
}

.back-link,
.skip-link,
.inline-link,
.micro-link {
    user-select: none;
    -webkit-user-select: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-microcopy);
    color: var(--text-main);
    transition: color 0.15s;
}

.back-link {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--secondary-font-size-4);
}

.link-text,
.skip-link,
.inline-link,
.micro-link {
    user-select: none;
    -webkit-user-select: none;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
}

.back-link:hover,
.skip-link:hover,
.inline-link:hover,
.micro-link:hover {
    color: var(--accent-200);
}

.header {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
}

.header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.title {
    user-select: none;
    -webkit-user-select: none;
    margin: 0;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-2);
    line-height: 1;
    color: var(--text-main);
}

.title.centered {
    width: 100%;
    text-align: center;
}

.skip-link {
    user-select: none;
    -webkit-user-select: none;
    font-size: var(--secondary-font-size-5);
}

.account-prompt {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-main);
}

.account-prompt.centered {
    width: 100%;
    justify-content: center;
    font-size: var(--secondary-font-size-5);
}

.account-prompt.centered .inline-link {
    font-size: var(--secondary-font-size-5);
}

.inline-link {
    user-select: none;
    -webkit-user-select: none;
    font-size: var(--secondary-font-size-4);
}

.recovery-body {
    user-select: none;
    -webkit-user-select: none;
    margin: 0;
    width: 100%;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    text-align: center;
    line-height: 1.3;
}

.providers {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.or-divider {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
}

.or-divider .rule {
    flex: 1 0 0;
    height: 1px;
    background: var(--base-600);
}

.or-label {
    user-select: none;
    -webkit-user-select: none;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--text-muted);
}

.fields {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
}

.field {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
}

.field-labels {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    width: 100%;
}

.micro {
    user-select: none;
    -webkit-user-select: none;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--text-main);
    line-height: 1;
}

.micro-link {
    user-select: none;
    -webkit-user-select: none;
    font-size: var(--secondary-font-size-5);
}

.error-inline,
.sent-inline {
    user-select: none;
    -webkit-user-select: none;
    margin: 0;
    width: 100%;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    line-height: 1.3;
    padding: var(--space-1) var(--space-2);
    box-sizing: border-box;
}

.error-inline {
    color: var(--error-highlight);
    background: var(--error-color);
}

.sent-inline {
    color: var(--accent-200);
    background: var(--success-muted);
}

.telemetry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
}

.consent-row {
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.consent-label {
    user-select: none;
    -webkit-user-select: none;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--text-main);
    line-height: 1.3;
}

.brand-highlight {
    color: var(--accent-200);
}

.legal-disclaimer {
    user-select: none;
    -webkit-user-select: none;
    margin: 0;
    width: 100%;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-5);
    color: var(--text-main);
    line-height: 1.5;
    text-align: center;
}

.legal-link {
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s;
}

.legal-link:hover {
    color: var(--accent-200);
}
</style>
