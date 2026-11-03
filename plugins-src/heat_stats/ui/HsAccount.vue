<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import { Dynamics } from "fuse_ui/ui/dynamics.mjs";
import Icons from "fuse_ui/ui/Icons.vue";
import eButton from "fuse_ui/ui/eButton.vue";
import eInputField from "fuse_ui/ui/eInputField.vue";
import eSwitch from "fuse_ui/ui/eSwitch.vue";
import eAccountPitch from "./eAccountPitch.vue";
import eIdentityHero from "./eIdentityHero.vue";
import eLegalModal from "./eLegalModal.vue";
import eOtpCode from "./eOtpCode.vue";
import ePassStrength from "./ePassStrength.vue";
import eSyncPanel from "./eSyncPanel.vue";
import type { SyncCounts, SyncProgressView } from "./eSyncPanel.vue";
import eTopAgents from "./eTopAgents.vue";
import eTopMaps from "./eTopMaps.vue";
import eTopVehicles from "./eTopVehicles.vue";
import { useAssets } from "./assets.mjs";
import { useI18n } from "./i18n.mjs";

const props = defineProps<{
  account: Record<string, unknown> | null;
  overview: object | null;
}>();

const emit = defineEmits<{ action: [name: string, payload?: unknown] }>();

const { t, n, date } = useI18n();

/**
 * FUSE sign-ins work here only for accounts that were already using HEAT Stats
 * on FUSE by this day. It is not a standing link between the two: anyone who
 * signed up for FUSE afterwards still needs an account here.
 */
const CARRYOVER_BEFORE = new Date(2026, 8, 16, 12);

const carryover = computed(() =>
  t("account.fuseCarryover", {
    date: date(CARRYOVER_BEFORE, { year: "numeric", month: "long", day: "numeric" }),
  }),
);
const assets = useAssets();

const view = computed(() => props.account ?? {});
const state = computed(() => String(view.value.state ?? "signedOut"));
const busy = computed(() => Boolean(view.value.busy));
const serverError = computed(() => (typeof view.value.error === "string" ? view.value.error : ""));
const accountEmail = computed(() => (typeof view.value.email === "string" ? view.value.email : ""));
const counts = computed(() => (view.value.counts ?? null) as SyncCounts | null);
const cloud = computed(() => Number(view.value.cloud ?? 0));
const profile = computed(() => view.value.profile as Record<string, unknown> | null);
const syncState = computed(() => (view.value.sync ?? null) as SyncProgressView | null);

interface Ranked {
  key: string;
  name: string;
  battles: number;
  kd: number;
  damage: number;
  winRate: number;
}

const stats = computed(() => (props.overview ?? {}) as Record<string, unknown>);

function ranked(field: string): Ranked[] | null {
  const list = stats.value[field];
  return Array.isArray(list) ? (list as Ranked[]) : null;
}

const vehicles = computed(() => ranked("vehicles"));
const agents = computed(() => ranked("agents"));
const maps = computed(() => ranked("maps"));

const totals = computed(() => {
  const o = stats.value;
  if (!Object.keys(o).length) return null;
  return { battles: Number(o.battles ?? 0), winRate: Number(o.winRate ?? 0), kd: Number(o.kd ?? 0) };
});

const heroVehicle = computed(() => vehicles.value?.[0]?.key ?? null);

const showSignIn = ref(false);

const settingsOpen = ref(false);

const signInOpen = computed(
  () =>
    showSignIn.value ||
    state.value === "awaitingCode" ||
    state.value === "awaitingReset" ||
    state.value === "recovering",
);

const screen = ref("welcome");
const email = ref("");
const password = ref("");
const code = ref("");
const newPassword = ref("");
const username = ref("");
/** Once they type a name, the profile stops overwriting the field. */
const usernameTouched = ref(false);
const resetCode = ref("");
const recoverySent = ref(false);
const localError = ref("");
const activeLegal = ref("");

const error = computed(() => localError.value || serverError.value);

/** Sup own minimum */
const MIN_PASSWORD = 6;

/** The service emails codes of this length; it is a project-wide setting. */
const CODE_DIGITS = 8;

function scorePassword(value: string): number {
  if (!value) return 0;
  let score = Math.min(value.length / 16, 0.5);
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 0.2;
  if (/\d/.test(value)) score += 0.15;
  if (/[^A-Za-z0-9]/.test(value)) score += 0.15;
  return Math.min(score, 1);
}

function meetsPolicy(value: string): boolean {
  return value.length >= MIN_PASSWORD;
}

const signUpStrength = computed(() => scorePassword(password.value));
const signUpInvalid = computed(() => password.value.length > 0 && !meetsPolicy(password.value));
const resetStrength = computed(() => scorePassword(newPassword.value));
const resetInvalid = computed(() => newPassword.value.length > 0 && !meetsPolicy(newPassword.value));

const usernameValid = computed(() => /^[a-zA-Z0-9_]{3,24}$/.test(username.value.trim()));
const apiAccess = computed(() => Boolean(profile.value?.allow_api_access));
const storedUsername = computed(() => {
  const name = profile.value?.username;
  return typeof name === "string" && name ? name : null;
});

watch(state, (next, prev) => {
  if (next === prev) return;
  password.value = "";
  newPassword.value = "";
  if (next === "signedOut") screen.value = "welcome";
  if (next !== "awaitingCode") code.value = "";
  if (next !== "awaitingReset") resetCode.value = "";
  showSignIn.value = false;
});

// A wrong code leaves the boxes filled, so clear them for the next try.
watch(serverError, (message) => {
  if (message && state.value === "awaitingReset") resetCode.value = "";
  if (message && state.value === "awaitingCode") code.value = "";
});

watch(
  profile,
  (next) => {
    if (next && typeof next.username === "string" && !usernameTouched.value) username.value = next.username;
  },
  { immediate: true },
);

function act(name: string, payload?: unknown): void {
  localError.value = "";
  emit("action", name, payload);
}

function clearErrors(): void {
  localError.value = "";
  if (serverError.value) emit("action", "dismissError");
}

function go(next: string): void {
  clearErrors();
  screen.value = next;
  recoverySent.value = false;
}

function openSignIn(next: string): void {
  go(next);
  showSignIn.value = true;
}

function closeSignIn(): void {
  clearErrors();
  showSignIn.value = false;
}

function handleContinue(): void {
  if (!email.value.trim()) {
    localError.value = t("account.emailRequired");
    return;
  }
  go("password");
}

function handleSignIn(): void {
  if (busy.value || !password.value) return;
  act("signIn", { email: email.value.trim(), password: password.value });
}

function handleSignUp(): void {
  if (busy.value || !email.value.trim() || !meetsPolicy(password.value)) return;
  act("signUp", { email: email.value.trim(), password: password.value });
}

function handleRecover(): void {
  if (busy.value || !email.value.trim()) return;
  recoverySent.value = true;
  resetCode.value = "";
  act("recover", { email: email.value.trim() });
}

function handleConfirmRecovery(): void {
  if (busy.value || resetCode.value.length !== CODE_DIGITS) return;
  act("confirmRecovery", { code: resetCode.value });
}

function handleSetPassword(): void {
  if (busy.value || !meetsPolicy(newPassword.value)) return;
  act("setPassword", { password: newPassword.value });
}

function handleConfirm(): void {
  if (busy.value || !code.value.trim()) return;
  act("confirmEmail", { code: code.value.trim() });
}

function handleUsername(): void {
  if (busy.value || !usernameValid.value) return;
  act("setUsername", { username: username.value.trim() });
}

function onUsername(value: string): void {
  usernameTouched.value = true;
  username.value = value;
}
</script>

<template>
  <div class="account">
    <div v-if="state !== 'signedIn'" class="page">
      <eIdentityHero guest :username="null" :email="null" :totals="totals" :vehicle-key="heroVehicle" />

      <eAccountPitch
        :recorded="totals?.battles ?? 0"
        :pending="counts?.pending ?? 0"
        :busy="busy"
        @sign-up="openSignIn('signup')"
        @log-in="openSignIn('welcome')"
      />

      <div class="tops">
        <eTopVehicles :vehicles="vehicles" />
        <eTopAgents :agents="agents" />
        <eTopMaps :maps="maps" />
      </div>
    </div>

    <!-- ── Signing in happens over the profile───── -->
    <AnimatePresence>
      <motion.div
        v-if="signInOpen"
        key="signin"
        class="signin"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="Dynamics.quick"
      >
        <div class="signin-scrim" @click="closeSignIn" />

        <motion.div
          class="signin-card"
          :initial="{ opacity: 0, y: 12 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: 8 }"
          :transition="Dynamics.smooth"
        >
          <div class="signin-surface" />
          <div class="watermark" :style="{ backgroundImage: `url('${assets.logo()}')` }" />

          <button type="button" class="signin-close" :aria-label="t('window.close')" @click="closeSignIn">
            <Icons kind="cross" size="normal" />
          </button>

          <!-- ── Signed out: welcome / password / sign up / recovery ──── -->
          <div v-if="state === 'signedOut' || state === 'local'" class="column">
          <div class="brand-mark">
            <img class="brand-logo" :src="assets.logo()" :alt="t('brand')" />
            <span class="brand-name">{{ t("brand") }}</span>
          </div>

          <button v-if="screen !== 'welcome'" type="button" class="back-link" @click="go('welcome')">
            <Icons kind="arrow-left" size="small" />
            <span class="link-text">{{ screen === "recovery" ? t("account.backToLogIn") : t("account.back") }}</span>
          </button>

          <div class="header">
            <div v-if="screen === 'welcome'" class="header-row">
              <h1 class="title">{{ t("account.logIn") }}</h1>
              <button type="button" class="skip-link" @click="act('useLocal'); closeSignIn()">
                {{ t("account.skipForNow") }}
              </button>
            </div>
            <h1 v-else-if="screen === 'password'" class="title centered">{{ t("account.welcomeTitle") }}</h1>
            <h1 v-else-if="screen === 'signup'" class="title centered">{{ t("account.createAccount") }}</h1>
            <template v-else>
              <h1 class="title centered">{{ t("account.recoveryTitle") }}</h1>
              <p class="body-text">{{ t("account.recoveryBody") }}</p>
            </template>

            <div v-if="screen === 'welcome'" class="prompt">
              <span>{{ t("account.noAccount") }}</span>
              <button type="button" class="inline-link" @click="go('signup')">{{ t("account.createOne") }}</button>
            </div>
          </div>

          <div v-if="screen === 'welcome' || screen === 'signup'" class="carryover">
            <span class="carryover-seal" aria-hidden="true"><i class="wedge flip" /><i class="wedge" /></span>
            <span class="carryover-text">{{ carryover }}</span>
          </div>

          <template v-if="screen === 'welcome' || screen === 'signup'">
            <eButton
              icon="discord"
              :text="t('account.continueWithDiscord')"
              :disabled="busy"
              @click="act('signInWithDiscord')"
            />
            <div class="or-divider">
              <span class="rule" />
              <span class="or-label">{{ t("account.or") }}</span>
              <span class="rule" />
            </div>
          </template>

          <div class="fields">
            <div class="field">
              <div class="field-labels">
                <span class="micro">{{ t("account.emailLabel") }}</span>
                <button
                  v-if="screen === 'password' || screen === 'recovery'"
                  type="button"
                  class="micro micro-link"
                  @click="go('welcome')"
                >
                  {{ t("account.edit") }}
                </button>
              </div>
              <eInputField
                label=""
                type="email"
                orientation="default"
                :disabled="screen === 'password'"
                :model-value="email"
                @update:model-value="email = $event"
                @keydown.enter="screen === 'welcome' ? handleContinue() : undefined"
              />
            </div>

            <div v-if="screen === 'password' || screen === 'signup'" class="field">
              <div class="field-labels">
                <span class="micro">{{ t("account.passwordLabel") }}</span>
                <button v-if="screen === 'password'" type="button" class="micro micro-link" @click="go('recovery')">
                  {{ t("account.forgot") }}
                </button>
              </div>
              <eInputField
                label=""
                type="password"
                orientation="mirrored"
                :model-value="password"
                @update:model-value="password = $event"
                @keydown.enter="screen === 'signup' ? handleSignUp() : handleSignIn()"
              />
              <ePassStrength v-if="screen === 'signup'" :strength="signUpStrength" :invalid="signUpInvalid" />
              <span v-if="screen === 'signup'" class="hint">{{ t("account.passwordPolicy") }}</span>
            </div>
          </div>

          <AnimatePresence>
            <motion.p
              v-if="error"
              key="error"
              class="notice error"
              :initial="{ opacity: 0, y: -4 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0 }"
              :transition="{ duration: 0.15 }"
            >
              {{ error }}
            </motion.p>
            <motion.p
              v-else-if="screen === 'recovery' && recoverySent"
              key="sent"
              class="notice sent"
              :initial="{ opacity: 0, y: -4 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0 }"
              :transition="{ duration: 0.15 }"
            >
              {{ t("account.recoverySent") }}
            </motion.p>
          </AnimatePresence>

          <eButton
            v-if="screen === 'welcome'"
            variant="accent"
            :text="t('account.logIn')"
            :disabled="busy"
            @click="handleContinue"
          />
          <eButton
            v-else-if="screen === 'password'"
            variant="accent"
            :text="t('account.logIn')"
            :disabled="busy || !password"
            @click="handleSignIn"
          />
          <eButton
            v-else-if="screen === 'signup'"
            variant="accent"
            :text="t('account.signUp')"
            :disabled="busy || !email.trim() || !meetsPolicy(password)"
            @click="handleSignUp"
          />
          <eButton
            v-else
            variant="accent"
            :text="t('account.sendCode')"
            :disabled="busy || !email.trim()"
            @click="handleRecover"
          />

          <div v-if="screen === 'signup'" class="prompt centered">
            <span>{{ t("account.haveAccount") }}</span>
            <button type="button" class="inline-link" @click="go('welcome')">{{ t("account.logInLink") }}</button>
          </div>

          <p v-if="screen !== 'recovery'" class="legal">
            {{ screen === "signup" ? t("account.legalPrefix") : t("account.legalRead") }}
            <span class="legal-link" @click="activeLegal = 'tos'">{{ t("account.terms") }}</span>
            <span>&amp;</span>
            <span class="legal-link" @click="activeLegal = 'privacy'">{{ t("account.privacy") }}</span>
          </p>
        </div>

        <!-- ── Signed up, waiting on the emailed code ─────────────────────── -->
        <div v-else-if="state === 'awaitingCode'" class="column">
          <div class="header">
            <h1 class="title centered">{{ t("account.confirmTitle") }}</h1>
            <p class="body-text">{{ t("account.confirmBody", { email: accountEmail }) }}</p>
          </div>

          <div class="fields">
            <div class="field">
              <span class="micro">{{ t("account.codeLabel") }}</span>
              <eInputField
                label=""
                orientation="default"
                :model-value="code"
                @update:model-value="code = $event"
                @keydown.enter="handleConfirm"
              />
            </div>
          </div>

          <p v-if="error" class="notice error">{{ error }}</p>

          <eButton variant="accent" :text="t('account.confirm')" :disabled="busy || !code.trim()" @click="handleConfirm" />
          <eButton variant="ghost" :text="t('account.resend')" :disabled="busy" @click="act('resendCode')" />
        </div>

        <!-- ── Asked for a reset, waiting on the emailed code ─────────────── -->
        <div v-else-if="state === 'awaitingReset'" class="column">
          <button type="button" class="back-link" @click="act('cancelRecovery')">
            <Icons kind="arrow-left" size="small" />
            <span class="link-text">{{ t("account.backToLogIn") }}</span>
          </button>

          <div class="header">
            <h1 class="title centered">{{ t("account.resetCodeTitle") }}</h1>
            <p class="body-text">{{ t("account.resetCodeBody", { email: accountEmail }) }}</p>
          </div>

          <eOtpCode
            :model-value="resetCode"
            :length="CODE_DIGITS"
            :disabled="busy"
            @update:model-value="resetCode = $event"
            @complete="handleConfirmRecovery"
          />

          <p v-if="error" class="notice error">{{ error }}</p>

          <eButton
            variant="accent"
            :text="t('account.confirm')"
            :disabled="busy || resetCode.length !== CODE_DIGITS"
            @click="handleConfirmRecovery"
          />
          <eButton variant="ghost" :text="t('account.resend')" :disabled="busy" @click="act('resendRecovery')" />
        </div>

        <!-- ── The code checked out: set the new password ─────────────────── -->
        <div v-else-if="state === 'recovering'" class="column">
          <div class="header">
            <h1 class="title centered">{{ t("account.resetTitle") }}</h1>
            <p class="body-text">{{ t("account.resetBody", { email: accountEmail }) }}</p>
          </div>

          <div class="fields">
            <div class="field">
              <span class="micro">{{ t("account.newPasswordLabel") }}</span>
              <eInputField
                label=""
                type="password"
                orientation="mirrored"
                :model-value="newPassword"
                @update:model-value="newPassword = $event"
                @keydown.enter="handleSetPassword"
              />
              <ePassStrength :strength="resetStrength" :invalid="resetInvalid" />
              <span class="hint">{{ t("account.passwordPolicy") }}</span>
            </div>
          </div>

          <p v-if="error" class="notice error">{{ error }}</p>

          <eButton
            variant="accent"
            :text="t('account.savePassword')"
            :disabled="busy || !meetsPolicy(newPassword)"
            @click="handleSetPassword"
          />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    <!-- ── Signed in ──────────────────────────────────────────────────── -->
    <div v-if="state === 'signedIn'" class="page">
      <eIdentityHero
        :username="storedUsername"
        :email="accountEmail"
        :totals="totals"
        :vehicle-key="heroVehicle"
      />

      <eSyncPanel :cloud="cloud" :counts="counts" :sync="syncState" :busy="busy" @retry="act('retryRejected')" />

      <!-- What you play, then what the account does. -->
      <div class="tops">
        <eTopVehicles :vehicles="vehicles" />
        <eTopAgents :agents="agents" />
        <eTopMaps :maps="maps" />
      </div>

      <!-- Settings are visited rarely; the page opens on what you played. -->
      <section class="module" :class="{ collapsed: !settingsOpen }">
        <div class="module-surface" />

        <button
          type="button"
          class="module-head"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <div class="module-head-surface" />
          <h3 class="module-title">{{ t("account.settingsTitle") }}</h3>
          <motion.span
            class="chevron"
            :initial="false"
            :animate="{ rotate: settingsOpen ? 180 : 0 }"
            :transition="Dynamics.quick"
          >
            <Icons kind="chevron-down" size="normal" color="var(--text-muted)" />
          </motion.span>
        </button>

        <div v-show="settingsOpen" class="rows">
          <div class="setting">
            <div class="setting-copy">
              <span class="setting-label">{{ t("account.usernameLabel") }}</span>
              <span class="hint">{{ t("account.usernameHint") }}</span>
            </div>
            <div class="setting-control compact">
              <eInputField
                label=""
                orientation="default"
                :model-value="username"
                @update:model-value="onUsername($event)"
                @keydown.enter="handleUsername"
              />
              <eButton :text="t('account.save')" :disabled="busy || !usernameValid" @click="handleUsername" />
            </div>
          </div>

          <div class="setting">
            <div class="setting-copy">
              <span class="setting-label">{{ t("account.apiAccess") }}</span>
              <span class="hint">{{ t("account.apiAccessHint") }}</span>
            </div>
            <div class="setting-control">
              <eSwitch
                :model-value="apiAccess"
                :disabled="busy"
                @update:model-value="act('setApiAccess', { allow: $event })"
              />
            </div>
          </div>

          <div class="setting">
            <div class="setting-copy">
              <span class="setting-label">{{ t("account.signOut") }}</span>
              <span class="hint">{{ t("account.signOutHint") }}</span>
            </div>
            <div class="setting-control">
              <eButton icon="sign-out" :text="t('account.signOut')" :disabled="busy" @click="act('signOut')" />
            </div>
          </div>

          <div class="setting danger">
            <div class="setting-copy">
              <span class="setting-label danger-label">{{ t("account.deleteAccount") }}</span>
              <span class="hint">{{ t("account.deleteHint") }}</span>
            </div>
            <div class="setting-control">
              <eButton
                variant="danger"
                icon="delete"
                :text="t('account.deleteAccount')"
                :confirm="t('account.deleteConfirm')"
                :disabled="busy"
                @click="act('deleteAccount')"
              />
            </div>
          </div>
        </div>
      </section>

      <p v-if="error" class="notice error">{{ error }}</p>
    </div>

    <AnimatePresence>
      <eLegalModal
        v-if="activeLegal === 'tos'"
        key="tos"
        title="Terms of Service"
        subtitle="HEAT Stats"
        @close="activeLegal = ''"
      >
        <p class="intro">
          These terms cover the HEAT Stats service: your account, the battles this plugin uploads, and the
          public API that can read them. The FUSE client itself is licensed separately under GPLv3.
        </p>

        <h3 class="section-title">Eligibility</h3>
        <ul class="term-list">
          <li>You must be at least 13 years old (or the minimum age where you live) to create an account.</li>
          <li>You are responsible for your credentials and for everything done with your account.</li>
        </ul>

        <h3 class="section-title">Your Battles</h3>
        <ul class="term-list">
          <li>Battles upload once and cannot be changed or removed afterwards. This is what keeps the stats honest.</li>
          <li>A battle already recorded under any account is refused for every other account.</li>
          <li>Every uploaded value is checked against what the game can actually produce. Edited data is refused.</li>
          <li>Repeated attempts to submit forged battles will end the account.</li>
        </ul>

        <h3 class="section-title">Service Availability</h3>
        <p class="term-intro">
          HEAT Stats is provided on a best-effort basis with no uptime guarantee. It may be changed,
          suspended, or discontinued at any time. The plugin keeps recording to this PC either way.
        </p>

        <h3 class="section-title">Termination</h3>
        <ul class="term-list">
          <li>You can delete your account at any time from this screen.</li>
          <li>We may suspend accounts that break these terms.</li>
        </ul>

        <h3 class="section-title">Disclaimer of Warranty</h3>
        <p class="outro">
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY
          LAW, THE MAINTAINERS DISCLAIM ALL LIABILITY FOR DAMAGES ARISING FROM USE OF, OR INABILITY TO USE,
          THE SERVICE.
        </p>
      </eLegalModal>

      <eLegalModal
        v-else-if="activeLegal === 'privacy'"
        key="privacy"
        title="Privacy Policy"
        subtitle="What HEAT Stats stores"
        @close="activeLegal = ''"
      >
        <p class="intro">
          This describes what the HEAT Stats service stores and why. Without an account the plugin sends
          nothing at all - battles stay on this PC.
        </p>

        <h3 class="section-title">What We Store</h3>
        <ul class="term-list">
          <li><strong>Account</strong> &mdash; your email address and a hashed password, or your Discord account if you sign in with it.</li>
          <li><strong>Battle summaries</strong> &mdash; the result, map, mode, vehicle, agent and your scores for each battle you upload.</li>
          <li><strong>Battle timelines</strong> &mdash; the per-second samples behind the match dynamics graphs, kept for 180 days and then deleted automatically.</li>
          <li><strong>Plugin settings</strong> &mdash; language, player name and window preferences, so they follow your account to another PC.</li>
          <li><strong>Username</strong> &mdash; only if you set one.</li>
        </ul>

        <h3 class="section-title">What We Do Not Store</h3>
        <p class="term-intro">
          No analytics, no crash reports, no device fingerprints, and no data at all while you are signed
          out. The plugin has no telemetry.
        </p>

        <h3 class="section-title">Who Can See It</h3>
        <ul class="term-list">
          <li>Your battles are private to your account unless you turn on public API access.</li>
          <li><strong>Supabase</strong> (US) &mdash; hosts the database and handles sign-in.</li>
          <li><strong>Discord</strong> (US) &mdash; only if you choose to sign in with Discord.</li>
        </ul>

        <h3 class="section-title">Your Rights</h3>
        <ul class="term-list">
          <li><strong>Erasure</strong> &mdash; deleting your account removes your profile and every battle uploaded to it.</li>
          <li><strong>Withdrawal</strong> &mdash; public API access is off by default and can be turned off again at any time.</li>
        </ul>

        <h3 class="section-title">Retention</h3>
        <p class="outro">
          Account data and battle summaries are kept until you delete your account. Battle timelines are
          deleted automatically after 180 days.
        </p>
      </eLegalModal>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.account {
  position: relative;
  display: flex;
  width: 100%;
  padding: var(--space-4);
  box-sizing: border-box;
}

.signin {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  box-sizing: border-box;
}

.signin-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
}

/* max-width keeps a wide child inside the window instead of centring it out of view. */
.signin-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  max-height: 100%;
  padding: var(--space-5) var(--space-5) var(--space-4);
  box-sizing: border-box;
  background: var(--black-2-a);
  overflow-y: auto;
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
}

.signin-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 12px 0 12px 0;
  pointer-events: none;
}

.watermark {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  background-size: 48px auto;
  opacity: 0.03;
  pointer-events: none;
}

.signin-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: flex;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.15s;
}

.signin-close:hover {
  opacity: 1;
}

.column {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
  width: 280px;
  max-width: 100%;
  min-width: 0;
}

.page {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
}

.tops {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  align-items: stretch;
  gap: var(--space-3);
  width: 100%;
}

.module {
  position: relative;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-3) var(--space-3);
  box-sizing: border-box;
  background: var(--black-2-a);
}

.module-surface {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  background: var(--black-1-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
  pointer-events: none;
}

.module.collapsed {
  padding-bottom: 0;
}

.module.collapsed .module-head {
  margin-bottom: 0;
}

.module.collapsed .module-head-surface {
  border-bottom: 1px solid var(--base-600);
  border-radius: 6px 0 6px 0;
}

.module-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  height: 46px;
  margin-bottom: var(--space-3);
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.chevron {
  position: relative;
  display: flex;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.module-head:hover .chevron {
  opacity: 1;
}

.module-head-surface {
  position: absolute;
  top: 0;
  left: calc(-1 * var(--space-3));
  right: calc(-1 * var(--space-3));
  height: 100%;
  box-sizing: border-box;
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  border-bottom: none;
  corner-shape: bevel;
  border-radius: 6px 0 0 0;
  pointer-events: none;
}

.module-title {
  position: relative;
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
  text-transform: uppercase;
  white-space: nowrap;
}

.rows {
  position: relative;
  display: flex;
  flex-direction: column;
}

.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--base-600);
}

.setting:last-child {
  border-bottom: none;
}

.setting-copy {
  flex: 1 1 auto;
  min-width: 0;
  /* Full width, a hint should still read as a line rather than cross the page. */
  max-width: 620px;
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
}

.setting-label {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: normal;
  color: var(--text-main);
}

.setting-control {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-width: 0;
}

/* FUSE UI buttons fill their column on the stage; in a row they take their own width. */
.setting-control :deep(.stage-button) {
  width: auto;
  min-width: 140px;
}

.setting-control.compact :deep(.stage-button) {
  min-width: 72px;
}

.setting.danger {
  margin-top: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--error-base);
}

.danger-label {
  color: var(--error-highlight);
}

.setting-control :deep(.input-wrap) {
  width: 220px;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
}

/* The mark is 24x12; 32px wide sets it beside the name at heading weight. */
.brand-logo {
  width: 32px;
  height: auto;
}

.brand-name {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  color: var(--text-main);
}

.back-link,
.skip-link,
.inline-link,
.micro-link {
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-microcopy);
  color: var(--text-main);
  cursor: pointer;
  transition: color 0.15s;
}

.back-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--secondary-font-size-4);
}

.link-text,
.skip-link,
.inline-link,
.micro-link {
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
  margin: 0;
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2);
  font-weight: var(--font-weight-2);
  line-height: 1;
  color: var(--text-main);
}

.title.centered {
  width: 100%;
  text-align: center;
}

.skip-link {
  font-size: var(--secondary-font-size-5);
}

.body-text {
  margin: 0;
  width: 100%;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.3;
  color: var(--text-muted);
  text-align: center;
}

.prompt {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-main);
}

.carryover {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--black-3-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 6px 0 6px 0;
}

.carryover-seal {
  flex: none;
  display: flex;
  align-items: center;
  height: 8px;
}

.carryover-seal .wedge {
  width: 8px;
  height: 8px;
  background: var(--accent-200);
  clip-path: polygon(0 100%, 50% 100%, 100% 50%, 50% 50%, 50% 0, 0 50%);
}

.carryover-seal .wedge.flip {
  transform: rotate(180deg);
}

.carryover-text {
  min-width: 0;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.35;
  color: var(--text-muted);
}

.prompt.centered {
  width: 100%;
  justify-content: center;
  font-size: var(--secondary-font-size-5);
}

.inline-link {
  font-size: inherit;
}

.or-divider {
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
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  color: var(--text-muted);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}

.field-labels {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.micro {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1;
  color: var(--text-main);
}

.micro-link {
  font-size: var(--secondary-font-size-5);
}

.hint {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.3;
  color: var(--text-muted);
}

.notice {
  margin: 0;
  width: 100%;
  padding: var(--space-1) var(--space-2);
  box-sizing: border-box;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.3;
}

.notice.error {
  background: var(--error-color);
  color: var(--error-highlight);
}

.notice.sent {
  background: var(--success-muted);
  color: var(--accent-200);
}






.legal {
  margin: 0;
  width: 100%;
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-5);
  line-height: 1.5;
  color: var(--text-main);
  text-align: center;
}

.legal-link {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.legal-link:hover {
  color: var(--accent-200);
}
</style>
