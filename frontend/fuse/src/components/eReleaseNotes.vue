<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import eButton from './eButton.vue'
import { renderMarkdown } from '../composables/useMarkdown'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

interface Props {
    version: string
    notes: string
    releaseDate?: string
    url?: string
    loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    releaseDate: '',
    url: '',
    loading: false,
})

const emit = defineEmits<{ close: [] }>()

const body = computed(() => renderMarkdown(props.notes))

type SectionKind = 'improvements' | 'fixed' | 'default'

interface Section {
    label: string
    kind: SectionKind
    html: string
}

interface VersionBlock {
    title: string
    sections: Section[]
}

const KIND_PATTERNS: Array<[RegExp, SectionKind]> = [
    [/improve|feature|added|new/i, 'improvements'],
    [/fix|bug/i,                   'fixed'],
]

const VERSION_IN_TEXT = /\d+\.\d+(\.\d+)?/

function labelKind(label: string): SectionKind {
    return KIND_PATTERNS.find(([re]) => re.test(label))?.[1] ?? 'default'
}

function isHeading(el: Element): boolean {
    return /^H[1-5]$/.test(el.tagName)
}

function isBoldLine(el: Element): boolean {
    if (el.tagName !== 'P') return false
    const text = (el.textContent ?? '').trim()
    const strong = el.querySelector('strong')
    return !!strong && !!text && (strong.textContent ?? '').trim() === text && text.length <= 48
}

const versionBlocks = computed<VersionBlock[]>(() => {
    if (!body.value) return []
    // Already sanitized by renderMarkdown() - this only regroups nodes.
    const doc = new DOMParser().parseFromString(body.value, 'text/html')

    const blocks: VersionBlock[] = []
    let block: VersionBlock = { title: '', sections: [] }
    let section: Section = { label: '', kind: 'default', html: '' }

    const flushSection = () => {
        if (section.label || section.html.trim()) block.sections.push(section)
        section = { label: '', kind: 'default', html: '' }
    }
    const flushBlock = () => {
        flushSection()
        if (block.title || block.sections.length) blocks.push(block)
        block = { title: '', sections: [] }
    }

    for (const node of Array.from(doc.body.children)) {
        const text = (node.textContent ?? '').trim()

        if (isHeading(node) && VERSION_IN_TEXT.test(text)) {
            flushBlock()
            block.title = text
        } else if (isHeading(node) || isBoldLine(node)) {
            flushSection()
            section = { label: text, kind: labelKind(text), html: '' }
        } else {
            section.html += node.outerHTML
        }
    }
    flushBlock()
    return blocks
})

const formattedDate = computed(() => {
    if (!props.releaseDate) return ''
    const date = new Date(props.releaseDate)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
})

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

function close() { emit('close') }
</script>

<template>
    <Teleport to="body">
    <div class="notes-backdrop" @mousedown.self="close">
        <motion.div
            class="notes-motion"
            :initial="{ opacity: 0, scale: 0.96 }"
            :animate="{ opacity: 1, scale: 1 }"
            :exit="{ opacity: 0, scale: 0.96 }"
            :transition="{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }"
        >
            <div ref="panelEl" class="notes-panel">
                <div class="panel-blur" />
                <div class="panel-inner">
                    <div class="panel-header">
                        <!-- <Icons kind="app-logo-full" size="xlarge" class="panel-logo" /> -->
                        <div class="panel-title-group">
                            <span class="panel-name">{{ t('components.releaseNotes.title') }}</span>
                            <span class="panel-sub">{{ t('components.releaseNotes.version', { version }) }}</span>
                        </div>
                        <button class="close-btn" @click="close">
                            <Icons kind="cross" size="normal" />
                        </button>
                    </div>

                    <div class="panel-body">
                        <span v-if="formattedDate" class="release-date">{{ formattedDate }}</span>
                        <span v-if="loading" class="state-text">{{ t('components.releaseNotes.loading') }}</span>
                        <span v-else-if="!notes" class="state-text">{{ t('components.releaseNotes.empty') }}</span>
                        <!-- sanitized by renderMarkdown() -->
                        <template v-else>
                            <div
                                v-for="(block, bi) in versionBlocks"
                                :key="bi"
                                class="version-block"
                            >
                                <span v-if="block.title" class="version-title">{{ block.title }}</span>
                                <div
                                    v-for="(section, si) in block.sections"
                                    :key="si"
                                    class="md-section"
                                >
                                    <span
                                        v-if="section.label"
                                        class="section-chip"
                                        :class="section.kind"
                                    >{{ section.label }}</span>
                                    <div class="md-body" v-html="section.html" />
                                </div>
                            </div>
                        </template>
                    </div>

                    <div class="panel-footer">
                        <a
                            v-if="url"
                            class="external-link"
                            :href="url"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ t('components.releaseNotes.viewOnline') }}
                            <Icons kind="content" size="small" />
                        </a>
                        <eButton
                            size="half"
                            :label="t('components.releaseNotes.close')"
                            @click="close"
                        />
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
    </Teleport>
</template>

<style scoped>
.notes-backdrop {
    position: fixed;
    top: 48px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: rgba(0, 0, 0, 0.6);
}

.notes-motion {
    position: relative;
    width: 100%;
    max-width: 640px;
    height: 100%;
    max-height: 680px;
}

.notes-panel {
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
    width: 100px;
    height: auto;
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

.close-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    flex-shrink: 0;
}

.close-btn:hover {
    color: var(--text-main);
}

.panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    scrollbar-width: thin;
    scrollbar-color: var(--black-3) transparent;
    user-select: text;
    -webkit-user-select: text;
}

.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }
.panel-body::-webkit-scrollbar-thumb {
    background: var(--black-3);
    border-radius: 3px;
}

.release-date {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    letter-spacing: 0.05em;
    user-select: none;
    -webkit-user-select: none;
}

.state-text {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
}

.panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.external-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.15s;
}

.external-link:hover { color: var(--text-main); }

/* One box per version, sections stacked inside it */

.version-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    background: var(--black-2-a);
    padding: var(--space-4);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
}

.version-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-1);
    color: var(--text-main);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    user-select: none;
    -webkit-user-select: none;
}

.md-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
}

.md-section .md-body { width: 100%; }

.section-chip {
    flex-shrink: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: 1.4;
    padding: 2px var(--space-2);
    background: var(--light-green);
    color: var(--black-1);
    clip-path: polygon(
        4px 0%, 100% 0%,
        100% calc(100% - 4px),
        calc(100% - 4px) 100%,
        0% 100%, 0% 4px
    );
    user-select: none;
    -webkit-user-select: none;
}

.section-chip.improvements {
    background: #3597C5;
    color: var(--black-1);
}

/* Rendered markdown */

.md-body {
    display: flex;
    flex-direction: column;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    line-height: 1.6;
    word-break: break-word;
}

.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4),
.md-body :deep(h5) {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-1);
    color: var(--text-main);
    letter-spacing: 0.03em;
    margin: var(--space-3) 0 var(--space-2) 0;
}

.md-body :deep(*:first-child) { margin-top: 0; }
.md-body :deep(*:last-child)  { margin-bottom: 0; }

.md-body :deep(p) { margin: 0 0 var(--space-2) 0; }

.md-body :deep(ul),
.md-body :deep(ol) {
    margin: 0 0 var(--space-2) 0;
    padding-left: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.md-body :deep(ul) { list-style: disc; }
.md-body :deep(ol) { list-style: decimal; }
.md-body :deep(li ul) { margin-top: var(--space-1); list-style: circle; }

.md-body :deep(strong) {
    font-weight: var(--font-weight-1);
    color: var(--text-main);
}

.md-body :deep(a) {
    color: var(--accent-50);
    text-decoration: none;
}

.md-body :deep(a:hover) { text-decoration: underline; }

.md-body :deep(code) {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    background: var(--black-1-a);
    padding: 0 var(--space-1);
}

.md-body :deep(pre) {
    background: var(--black-1-a);
    padding: var(--space-2) var(--space-3);
    overflow-x: auto;
    margin: 0 0 var(--space-2) 0;
}

.md-body :deep(pre code) { background: none; padding: 0; }

.md-body :deep(blockquote) {
    margin: 0 0 var(--space-2) 0;
    padding-left: var(--space-3);
    border-left: 2px solid var(--black-3);
    color: var(--text-muted);
}

.md-body :deep(hr) {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.05);
    margin: var(--space-3) 0;
}

.md-body :deep(img) { max-width: 100%; height: auto; }

.md-body :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 var(--space-2) 0;
}

.md-body :deep(th),
.md-body :deep(td) {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
</style>
