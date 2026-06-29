<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import eButton from './eButton.vue'
import Icons from './Icons.vue'
import { useAppStore } from '../stores/app'

const appStore = useAppStore()
const emit = defineEmits<{ close: [] }>()

const CUT = 8
const panelEl = ref<HTMLElement | null>(null)
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
    if (!panelEl.value) return
    ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    ro.observe(panelEl.value)
})
onUnmounted(() => ro?.disconnect())

function accept() {
    appStore.licenseAccepted = true
    emit('close')
}

function reject() {
    appStore.licenseAccepted = false
    window.close()
}
</script>

<template>
    <div class="license-backdrop">
        <motion.div
            class="license-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="panelEl" class="license-panel">
                <div class="panel-blur" />
                <div class="panel-scale">
                    <div class="panel-inner">
                        <div class="panel-header">
                            <Icons kind="app-logo-full" size="xlarge" class="panel-logo" />
                            <div class="panel-title-group">
                                <span class="panel-name">Terms &amp; Conditions</span>
                                <span class="panel-sub">GPL v3 + Additional Terms</span>
                            </div>
                        </div>

                        <div class="panel-body">
                            <p class="intro">
                                FUSE is licensed under the GNU General Public License v3 with the following
                                additional terms and conditions. By using, modifying, or distributing FUSE,
                                you agree to these terms.
                            </p>

                            <h3 class="section-title">Permitted Use</h3>
                            <ul class="term-list">
                                <li><strong>Run</strong> FUSE alongside WoT:HEAT to display real-time HUD overlays using game information accessible to the user during normal gameplay.</li>
                                <li><strong>Develop, distribute, and share plugins</strong> (<code>.fuse</code> archives) that build overlays, UI reskins, or visual enhancements consistent with the above.</li>
                                <li><strong>Modify the FUSE source code</strong> for personal or community use, provided all modifications remain under GPLv3 and the source is disclosed.</li>
                                <li><strong>Redistribute</strong> verbatim or modified copies of FUSE under the terms of GPLv3.</li>
                            </ul>

                            <h3 class="section-title">Restrictions</h3>
                            <ul class="term-list">
                                <li><strong>No cheating.</strong> You may not use FUSE, or any derivative thereof, or any separate package of the codebase to read, expose, or exploit game client information that would not normally be available to the user during legitimate gameplay in a way that provides an unfair advantage over other players.</li>
                                <li><strong>No runtime injection or modification.</strong> You may not use FUSE to inject code into, patch, hook, or otherwise alter the game's native runtime memory, processes, or binaries. Interaction with the game's Coherent Gameface frontend via the CDP is permitted for two purposes: (1) reading game values already visible to the user during legitimate gameplay, and (2) injecting CSS stylesheets or style overrides for cosmetic UI reskinning.</li>
                                <li><strong>No automation or botting.</strong> You may not use FUSE to automate gameplay actions in a manner that replaces human input for competitive advantage, including but not limited to auto-aim, auto-fire, or scripted decision-making.</li>
                                <li><strong>No circumvention.</strong> You may not use FUSE to bypass, disable, or interfere with any anti-cheat, integrity, or detection mechanism employed by the game or its operators.</li>
                                <li><strong>No commercial exploitation of prohibited features.</strong> You may not sell, license, or otherwise monetize any modification that violates the restrictions above.</li>
                            </ul>

                            <h3 class="section-title">Prohibitions</h3>
                            <p class="term-intro">The following are strictly prohibited and constitute a material breach of this license:</p>
                            <ol class="term-list numbered">
                                <li><strong>Reverse-engineering</strong> the game client to extract information not exposed through legitimate gameplay interfaces.</li>
                                <li><strong>Distributing</strong> modified versions of FUSE that enable any of the restricted activities described above.</li>
                                <li><strong>Bundling</strong> FUSE with, or advertising it alongside, tools whose primary purpose is cheating, hacking, or exploiting the game.</li>
                                <li><strong>Misrepresenting</strong> FUSE as affiliated with, endorsed by, or approved by Wargaming or World of Tanks: HEAT.</li>
                                <li><strong>Removing or altering</strong> the anti-abuse notices, license headers, or attribution present in the FUSE source code or documentation.</li>
                            </ol>

                            <h3 class="section-title">Enforcement</h3>
                            <p class="outro">
                                Violations of these terms automatically terminate your rights under GPLv3
                                with respect to FUSE, including all patent grants and downstream licensing
                                privileges. The copyright holders reserve the right to pursue legal remedies
                                against violators.
                            </p>
                        </div>

                        <div class="panel-footer">
                            <eButton size="half" label="Reject" icon="cross" @click="reject" />
                            <eButton size="half" label="Accept" icon="checkmark" @click="accept" />
                        </div>
                    </div>
                </div>
                <svg
                    v-if="svgPoints"
                    class="panel-stroke"
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
.license-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: rgba(0, 0, 0, 0.6);
}

.license-motion {
    position: relative;
    width: 100%;
    max-width: 560px;
    height: 100%;
    max-height: 640px;
}

.license-panel {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 4%, 0.92);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.panel-blur {
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

.panel-scale {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.panel-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.panel-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
}

.panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.panel-logo {
    flex-shrink: 0;
}

.panel-title-group {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
}

.panel-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    -webkit-user-select: none;
}

.panel-sub {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    user-select: none;
    -webkit-user-select: none;
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    scrollbar-width: thin;
    scrollbar-color: var(--black-3) transparent;
    user-select: text;
    -webkit-user-select: text;
}

.panel-body::-webkit-scrollbar {
    width: 6px;
}
.panel-body::-webkit-scrollbar-track {
    background: transparent;
}
.panel-body::-webkit-scrollbar-thumb {
    background: var(--black-3);
    border-radius: 3px;
}

.intro {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.6;
    margin: 0 0 var(--space-3) 0;
}

.outro {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.6;
    margin: 0;
}

.section-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-1);
    color: var(--light-green);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: var(--space-4) 0 var(--space-2) 0;
    padding-top: var(--space-3);
    border-top: 1px solid rgba(255,255,255,0.05);
}
.section-title:first-of-type {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
}

.term-intro {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0 0 var(--space-2) 0;
}

.term-list {
    margin: 0;
    padding-left: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.term-list li {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.5;
}

.term-list.numbered {
    list-style: decimal;
}

.term-list:not(.numbered) {
    list-style: disc;
}

.term-list strong {
    font-weight: var(--font-weight-1);
    color: var(--text-main);
}

.term-list code {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--accent-200);
    background: rgba(255,255,255,0.06);
    padding: 0 4px;
    border-radius: 2px;
}

.panel-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}
</style>
