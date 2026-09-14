<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AnimatePresence, motion } from "motion-v";
import Icons, { type IconKind } from "../components/Icons.vue";
import StagePanel from "../overlay/components/StagePanel.vue";
import StageButton from "../overlay/inspector/controls/StageButton.vue";
import { Dynamics } from "../composables/useMotion";

interface ConsentScope {
  id: string;
  label: string;
  description: string;
  reason: string;
  icon?: string;
  state?: string;
}

interface ConsentRequest {
  requestId: string;
  mode?: "ask" | "review";
  plugin: { id: string; name: string; version: string; author: string };
  scopes: ConsentScope[];
}

const CLOSED = "inset(0% 50% 0% 50%)";
const OPEN = "inset(0% 0% 0% 0%)";

const STATE_BADGE: Record<string, { text: string; icon: IconKind }> = {
  granted: { text: "Allowed", icon: "checkmark" },
  denied: { text: "Denied", icon: "cross" },
  prompt: { text: "Not answered", icon: "warning" },
};

const request = ref<ConsentRequest | null>(null);
const sending = ref(false);
/** The answered request whose card is animating out. */
let leavingId: string | null = null;

let cardEl: HTMLElement | null = null;
const cardObserver = new ResizeObserver(() => reportCard());

// Electron lets clicks through everywhere but this box; a card animating out gets none.
function reportCard(): void {
  const r = request.value && cardEl ? cardEl.getBoundingClientRect() : null;
  window.consentAPI?.cardRect(r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null);
}

function setCard(ref: unknown): void {
  const el = ref instanceof HTMLElement ? ref : (ref as { $el?: unknown } | null)?.$el;
  const next = el instanceof HTMLElement ? el : null;
  if (next === cardEl) return;
  if (cardEl) cardObserver.unobserve(cardEl);
  cardEl = next;
  if (cardEl) cardObserver.observe(cardEl);
  reportCard();
}

/** The list grows with this many permissions, then scrolls. */
const MAX_VISIBLE_SCOPES = 2;

const scopesEl = ref<HTMLElement | null>(null);
const scopesMaxHeight = ref<string | undefined>(undefined);
const moreBelow = ref(false);
const scopesObserver = new ResizeObserver(() => fitScopes());

// Permissions differ in height, so the cap is wherever the last visible one ends.
function fitScopes(): void {
  const list = scopesEl.value;
  if (!list) return;
  const last = list.children[MAX_VISIBLE_SCOPES - 1] as HTMLElement | undefined;
  if (list.children.length <= MAX_VISIBLE_SCOPES || !last) {
    scopesMaxHeight.value = undefined;
  } else {
    const padBottom = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    scopesMaxHeight.value = `${last.offsetTop + last.offsetHeight + padBottom}px`;
  }
  requestAnimationFrame(updateMoreBelow);
}

function updateMoreBelow(): void {
  const list = scopesEl.value;
  moreBelow.value = !!list && list.scrollTop + list.clientHeight < list.scrollHeight - 1;
}

watch(
  scopesEl,
  (list) => {
    scopesObserver.disconnect();
    if (!list) return;
    scopesObserver.observe(list);
    for (const item of Array.from(list.children)) scopesObserver.observe(item);
    fitScopes();
  },
  { flush: "post" },
);

const author = computed(() => request.value?.plugin.author?.trim() ?? "");
const version = computed(() => request.value?.plugin.version?.trim() ?? "");
const reviewing = computed(() => request.value?.mode === "review");

function iconFor(scope: ConsentScope): IconKind {
  return (scope.icon as IconKind | undefined) || "permission";
}

async function decide(allow: boolean): Promise<void> {
  const req = request.value;
  if (!req || sending.value) return;
  sending.value = true;
  try {
    await window.consentAPI?.decide(req.requestId, Object.fromEntries(req.scopes.map((s) => [s.id, allow])));
    // The next request may already have replaced this one.
    if (request.value?.requestId === req.requestId) {
      leavingId = req.requestId;
      request.value = null;
      reportCard();
    }
  } catch (e) {
    console.error("[consent] decision not accepted", e);
  } finally {
    sending.value = false;
  }
}

// Electron hides the view on this, so wait until a frame without the card has been drawn.
function onCardGone(): void {
  const id = leavingId;
  leavingId = null;
  if (!id) return;
  requestAnimationFrame(() => requestAnimationFrame(() => window.consentAPI?.closed(id)));
}

onMounted(() => {
  window.consentAPI?.onRequest((next) => {
    request.value = next as ConsentRequest;
    reportCard();
  });
  // The view is resized when the stage window or displays change, which moves the centred card.
  window.addEventListener("resize", reportCard);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", reportCard);
  cardObserver.disconnect();
  scopesObserver.disconnect();
});
</script>

<template>
  <div class="consent-host">
    <AnimatePresence mode="wait" :on-exit-complete="onCardGone">
      <motion.div
        v-if="request"
        :key="request.requestId"
        :ref="setCard"
        class="consent"
        role="dialog"
        aria-modal="true"
        :aria-label="`${request.plugin.name} permissions`"
        :initial="{ clipPath: CLOSED }"
        :animate="{ clipPath: OPEN }"
        :exit="{ clipPath: CLOSED }"
        :transition="Dynamics.snappy"
      >
        <StagePanel class="consent-panel" :cut="8" blur>
          <header class="consent-brand">
            <span class="brand-seg brand-mark">
              <Icons kind="app-icon" size="normal" color="var(--text-main)" />
            </span>
            <span class="brand-seg brand-name">Permissions</span>
            <span class="brand-seg brand-mode">{{ reviewing ? "Change" : "Request" }}</span>
          </header>

          <section class="consent-plugin">
            <div class="plugin-name-row">
              <Icons kind="plugin" size="normal" color="var(--text-main)" />
              <span class="plugin-name">{{ request.plugin.name }}</span>
            </div>
            <div v-if="author || version" class="plugin-meta">
              <span v-if="author" class="meta-item">
                <Icons kind="user" size="small" color="var(--text-muted)" />
                <span>{{ author }}</span>
              </span>
              <span v-if="version" class="meta-item">
                <Icons kind="tags" size="small" color="var(--text-muted)" />
                <span class="meta-version">v{{ version }}</span>
              </span>
            </div>
            <p class="consent-lead">{{ reviewing ? "Change what this plugin can use." : "Wants permission to use:" }}</p>
          </section>

          <ul
            ref="scopesEl"
            class="consent-scopes"
            :class="{ 'more-below': moreBelow }"
            :style="{ maxHeight: scopesMaxHeight }"
            @scroll.passive="updateMoreBelow"
          >
            <li v-for="scope in request.scopes" :key="scope.id" class="consent-scope">
              <div class="scope-head">
                <Icons :kind="iconFor(scope)" size="small" color="var(--warning-color)" />
                <span class="scope-label">{{ scope.label }}</span>
                <span
                  v-if="reviewing && scope.state && STATE_BADGE[scope.state]"
                  class="scope-badge"
                  :class="scope.state"
                >
                  <Icons :kind="STATE_BADGE[scope.state].icon" size="small" color="currentColor" />
                  <span>{{ STATE_BADGE[scope.state].text }}</span>
                </span>
              </div>

              <p class="scope-description">{{ scope.description }}</p>

              <!-- The author's own claim, kept apart from what FUSE says the permission does. -->
              <div v-if="scope.reason" class="scope-claim">
                <span class="claim-by">
                  <Icons kind="user" size="small" color="var(--text-muted)" />
                  <span>Why {{ author || "the author" }} asks</span>
                </span>
                <p class="claim-text">{{ scope.reason }}</p>
              </div>
            </li>
          </ul>

          <footer class="consent-actions">
            <StageButton text="Deny" :disabled="sending" @click="decide(false)" />
            <StageButton text="Allow" variant="accent" :disabled="sending" @click="decide(true)" />
          </footer>
        </StagePanel>
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped>
.consent-host {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.consent {
  width: 360px;
  max-width: calc(100% - 32px);
  pointer-events: auto;
  color: var(--text-main);
  font-family: var(--font-primary);
}

.consent-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}


.consent-brand {
  display: flex;
  align-items: stretch;
  min-height: 32px;
  background: color-mix(in srgb, var(--text-main) 4%, transparent);
  border-bottom: 1px solid var(--base-600);
}

.brand-seg {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
}

.brand-seg + .brand-seg {
  border-left: 1px solid var(--base-600);
}

.brand-mark {
  justify-content: center;
  width: 32px;
  padding: 0;
}

.brand-name {
  flex: 1;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  letter-spacing: 0.02em;
  color: var(--text-main);
}

.brand-mode {
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
}


.consent-plugin {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-4) var(--space-3);
}

.plugin-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.plugin-name {
  min-width: 0;
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1.2;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
}

.meta-version {
  font-family: var(--font-microcopy);
}

.consent-lead {
  margin: var(--space-1) 0 0;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-muted);
}


.consent-scopes {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0 var(--space-4) var(--space-4);
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--black-3) transparent;
}

/* Fades out while there's more to scroll to. */
.consent-scopes.more-below {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), transparent);
}

.consent-scope {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--black-2-a);
  border: 1px solid var(--base-600);
  corner-shape: bevel;
  border-radius: 8px 0 8px 0;
}

.scope-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 20px;
}

.scope-label {
  flex: 1;
  min-width: 0;
  font-size: var(--main-font-size-3);
  font-weight: var(--font-weight-2);
  line-height: 1.2;
  color: var(--text-main);
}

.scope-badge {
  --badge: var(--warning-color);
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 20px;
  padding: 0 var(--space-2);
  box-sizing: border-box;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--badge);
  background: color-mix(in srgb, var(--badge) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--badge) 35%, transparent);
  corner-shape: bevel;
  border-radius: 5px 0 5px 0;
}

.scope-badge.granted { --badge: var(--accent-200); }
.scope-badge.denied { --badge: var(--error-highlight); }

.scope-description {
  margin: 0;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: 1.45;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.scope-claim {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--black-1-a);
  border-left: 2px solid var(--base-600);
}

.claim-by {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-muted);
}

.claim-text {
  margin: 0;
  font-size: var(--main-font-size-4);
  font-weight: var(--font-weight-3);
  line-height: 1.45;
  color: var(--base-100);
  overflow-wrap: anywhere;
}

.consent-actions {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--base-600);
}
</style>
