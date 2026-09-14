<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { motion } from 'motion-v'
import Icons, { type IconKind } from './Icons.vue'
import eBadge from './eBadge.vue'
import eCounter from './eCounter.vue'
import eSocialLink from './eSocialLink.vue'
import { useI18n } from '../composables/useI18n'
import { Dynamics } from '../composables/useMotion'
import { useSuspension } from '../composables/useSuspension'
import { useAppStore } from '../stores/app'
import { useMarketplaceStore } from '../stores/marketplace'
import combinationMark from '../assets/CombinationMark.svg'
import welcomeAnimation from '../assets/animationWelcome.webm?url'
import packageJson from '../../package.json'

const { t } = useI18n()
const store = useAppStore()
const marketplace = useMarketplaceStore()
const { isSuspended } = useSuspension()

onMounted(() => void marketplace.fetchMarketplaceStats())

const videoEl = ref<HTMLVideoElement | null>(null)

// halt decode in tray
watch(isSuspended, (suspended) => {
    const video = videoEl.value
    if (!video) return
    if (suspended) video.pause()
    else void video.play().catch(() => { /* autoplay refused - static frame is fine */ })
})

const version = computed(() => `v${store.appVersion || packageJson.version}`)

interface SocialLink {
    kind: IconKind
    label: string
    url: string
}

const links: SocialLink[] = [
    { kind: 'gitHub',      label: 'appabout.linkGithub',  url: 'https://github.com/AET9RNAL/HEAT-FUSE' },
    { kind: 'buyMeACoffe', label: 'appabout.linkCoffee',  url: 'https://buymeacoffee.com/aeternal' },
    { kind: 'discord',     label: 'appabout.linkDiscord', url: 'https://discord.com/users/678198830767931431m' },
    { kind: 'bhance',      label: 'appabout.linkBehance', url: 'https://www.behance.net/maksymhnatiuk' },
]

// Counted at build time by scripts/source-stats.mjs
declare const __SOURCE_STATS__: { vueComponents: number; linesOfCode: number }

const PROJECT_START = Date.UTC(2026, 5, 28)
const DAY_MS = 86_400_000

const daysSinceCreation = computed(() =>
    Math.max(0, Math.floor((Date.now() - PROJECT_START) / DAY_MS))
)

function compact(value: number): string {
    if (value < 1000) return String(Math.round(value))
    if (value < 1_000_000) return `${(value / 1000).toFixed(1)}K`
    return `${(value / 1_000_000).toFixed(1)}M`
}

const stats = computed<{ value: number; label: string }[]>(() => [
    { value: __SOURCE_STATS__.vueComponents,                label: 'appabout.statComponents' },
    { value: __SOURCE_STATS__.linesOfCode,                  label: 'appabout.statLines' },
    { value: daysSinceCreation.value,                       label: 'appabout.statDays' },
    { value: marketplace.stats?.publishedProjects ?? 0,     label: 'appabout.statPlugins' },
    { value: marketplace.stats?.totalDownloads ?? 0,        label: 'appabout.statDownloads' },
])

const tools: IconKind[] = ['vue', 'motion', 'canvasUI', 'rive', 'ae']
const hoveredTool = ref<IconKind | null>(null)
</script>

<template>
  <div class="about ">
    <section class="panel page-surface ">
      <video
        ref="videoEl"
        class="media-video"
        :src="welcomeAnimation"
        muted
        autoplay
        loop
        playsinline
        preload="auto"
        disablepictureinpicture
      />

      <!-- Brand -->
      <div class="brand">
        <img class="logo" :src="combinationMark" alt="HEAT FUSE" />
        <div class="brand-meta">
          <div class="version">
            <span class="section-title">{{ t('appabout.launcherVersion') }}</span>
            <eBadge :label="version" color="var(--accent-200)" dot />
          </div>
          <button class="whats-new" type="button" @click="store.openReleaseNotes()">
            <span>{{ t('appabout.whatsNew') }}</span>
            <Icons kind="launcher" size="large" color="var(--text-main)" />
          </button>
        </div>
      </div>

      <!-- Disclaimer -->
      <div class="disclaimer surface">
        <Icons kind="warning" size="large" color="var(--text-muted)" />
        <p class="disclaimer-text">{{ t('appabout.disclaimer') }}</p>
      </div>

      <!-- Support & links -->
      <div class="section">
        <h2 class="section-title">{{ t('appabout.supportLinks') }}</h2>
        <nav class="links surface">
          <eSocialLink
            v-for="link in links"
            :key="link.kind"
            :kind="link.kind"
            :label="t(link.label)"
            :url="link.url"
          />
        </nav>
      </div>

      <!-- Statistics -->
      <div class="section">
        <h2 class="section-title">{{ t('appabout.statsTitle') }}</h2>
        <dl class="stats surface">
          <motion.div
            v-for="(stat, i) in stats"
            :key="stat.label"
            class="stat"
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ ...Dynamics.smooth, delay: i * 0.06 }"
          >
            <dd class="stat-label">{{ t(stat.label) }}</dd>
            <dt class="stat-value">
              <eCounter :value="stat.value" :format="compact" :delay="i * 0.06" />
            </dt>
          </motion.div>
        </dl>
      </div>

      <!-- Built with -->
      <div class="built-with">
        <span class="built-label">{{ t('appabout.builtWith') }}</span>
        <ul class="tools">
          <motion.li
            v-for="tool in tools"
            :key="tool"
            class="tool"
            :animate="{ y: hoveredTool === tool ? '-10px' : '0px' }"
            :transition="Dynamics.default"
            @mouseenter="hoveredTool = tool"
            @mouseleave="hoveredTool = null"
          >
            <Icons :kind="tool" size="xlarge" />
          </motion.li>
        </ul>
      </div>

      <p class="credits">{{ t('appabout.credits') }}</p>
    </section>
  </div>
</template>

<style scoped>
.about {
    user-select: none;
    -webkit-user-select: none;
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
    display: flex;
    justify-content: center;
}

.surface,
.page-surface {
    position: relative;
    background: var(--black-2-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 12px 0 12px 0;
}

.panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 760px;
    max-width: 800px;
    padding: 24px var(--space-4) 32px;
    box-sizing: border-box;
    overflow: hidden;
    background: #090b0a;
}

.media-video {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
}

.panel::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: var(--black-2-a);
    pointer-events: none;
}

.panel > *:not(.media-video) {
    position: relative;
    z-index: 1;
}

.brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
}

.logo {
    width: 100%;
    height: auto;
    aspect-ratio: 287 / 101;
    object-fit: contain;
}

.brand-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--space-4);
}

.version {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.micro-muted {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.whats-new {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-2);
    color: var(--text-main);
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color 0.15s;
}

.whats-new:hover { color: var(--accent-200); }

.disclaimer {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 8px);
}

.disclaimer-text {
    margin: 0;
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    line-height: 1.5;
    color: var(--text-muted);
}

.section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
}

.section-title {
    margin: 0;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-3);
    font-size: var(--main-font-size-3);
    line-height: 1;
    color: var(--text-muted);
}

.links {
    display: flex;
    gap: var(--space-2);
}

.stats {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin: 0;
}

.stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    padding: var(--space-3);
    min-width: 0;
}

.stat-value {
    font-family: var(--font-microcopy);
    font-weight: var(--font-weight-1);
    font-size: var(--secondary-font-size-1);
    line-height: 1;
    color: var(--accent-200);
}

.stat-label {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
}

.built-with {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.built-label {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-3);
    color: var(--text-main);
}

.tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
}

.tool {
    display: flex;
    width: 48px;
    height: 48px;
}

.credits {
    margin: 0;
    text-align: center;
    font-family: var(--font-primary);
    font-weight: var(--font-weight-2);
    font-size: var(--main-font-size-3);
    background: linear-gradient(90deg, #ffffff 0%, #8c8c8c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
</style>
