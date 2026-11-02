<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { renderMarkdown } from '../../composables/useMarkdown'

const props = withDefaults(defineProps<{ modelValue: string; max: number; rows?: number; placeholder?: string }>(), { rows: 8, placeholder: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()

const tab = ref<'write' | 'preview'>('write')
const html = computed(() => renderMarkdown(props.modelValue))
const area = ref<HTMLTextAreaElement | null>(null)

// ── Format hints: each one formats the selection with the Markdown or HTML that renderMarkdown allows ──

type Action =
    | { kind: 'wrap'; before: string; after: string }
    | { kind: 'code' }
    | { kind: 'color' }
    | { kind: 'prefix'; prefix: (line: number) => string; match: RegExp }

interface Tool { id: string; hint: () => string; key?: string; action: Action }

const TOOLS: Tool[] = [
    { id: 'bold', key: 'b', hint: () => `**${t('registry.md.bold')}**`, action: { kind: 'wrap', before: '**', after: '**' } },
    { id: 'italic', key: 'i', hint: () => `_${t('registry.md.italic')}_`, action: { kind: 'wrap', before: '_', after: '_' } },
    { id: 'code', key: 'e', hint: () => `\`${t('registry.md.code')}\``, action: { kind: 'code' } },
    { id: 'list', hint: () => `- ${t('registry.md.list')}`, action: { kind: 'prefix', prefix: () => '- ', match: /^[-*+] / } },
]

// The sanitizer keeps span and p with color, text-decoration and text-align styles. Tag names alone (u, s, center) are removed.
const HTML_TOOLS: Tool[] = [
    { id: 'color', hint: () => '<color>', action: { kind: 'color' } },
    { id: 'underline', hint: () => '<u>', action: { kind: 'wrap', before: '<span style="text-decoration: underline">', after: '</span>' } },
    { id: 'strike', hint: () => '<s>', action: { kind: 'wrap', before: '<span style="text-decoration: line-through">', after: '</span>' } },
    { id: 'center', hint: () => '<center>', action: { kind: 'wrap', before: '<p style="text-align: center">', after: '</p>' } },
]

const COLOR_OPEN = '<span style="color: #ffffff">'

function tip(tool: Tool) {
    const name = t(`registry.md.${tool.id}`)
    return tool.key ? `${name} (Ctrl+${tool.key.toUpperCase()})` : name
}

// execCommand keeps the native undo stack, so Ctrl+Z reverts a format. setRangeText is the fallback.
function replace(start: number, end: number, text: string, selStart: number, selEnd: number) {
    const el = area.value
    if (!el) return
    el.focus()
    el.setSelectionRange(start, end)
    if (!document.execCommand('insertText', false, text)) {
        el.setRangeText(text, start, end, 'end')
        emit('update:modelValue', el.value)
    }
    el.setSelectionRange(selStart, selEnd)
}

/** Wraps the selection. A second click on the same selection removes the markers. */
function wrap(before: string, after: string) {
    const el = area.value!
    const { selectionStart: s, selectionEnd: e, value } = el
    if (value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
        replace(s - before.length, e + after.length, value.slice(s, e), s - before.length, e - before.length)
        return
    }
    const inner = value.slice(s, e)
    replace(s, e, before + inner + after, s + before.length, s + before.length + inner.length)
}

/** Adds the prefix to every selected line, or removes it when every line has it. */
function prefixLines(prefix: (line: number) => string, match: RegExp) {
    const el = area.value!
    const { selectionStart: s, selectionEnd: e, value } = el
    const start = value.lastIndexOf('\n', s - 1) + 1
    const nextBreak = value.indexOf('\n', e)
    const end = nextBreak === -1 ? value.length : nextBreak
    const lines = value.slice(start, end).split('\n')
    const remove = lines.every(l => match.test(l))
    const out = lines.map((l, i) => remove ? l.replace(match, '') : prefix(i) + l.replace(match, '')).join('\n')
    replace(start, end, out, start, start + out.length)
}

function apply(tool: Tool) {
    const el = area.value
    if (!el) return
    const a = tool.action
    if (a.kind === 'wrap') return wrap(a.before, a.after)
    if (a.kind === 'prefix') return prefixLines(a.prefix, a.match)
    const { selectionStart: s, selectionEnd: e, value } = el
    const inner = value.slice(s, e)
    if (a.kind === 'color') {
        // The hex value is selected after the wrap, so the next keys type the color.
        const hex = s + COLOR_OPEN.indexOf('#')
        return replace(s, e, `${COLOR_OPEN}${inner}</span>`, hex, hex + 7)
    }
    // Code: several lines become a fenced block. One line stays inline code.
    return inner.includes('\n') ? wrap('```\n', '\n```') : wrap('`', '`')
}

function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
    const tool = TOOLS.find(x => x.key === event.key.toLowerCase())
    if (!tool) return
    event.preventDefault()
    apply(tool)
}
</script>

<template>
    <div class="md">
        <div class="md-tabs">
            <button :class="{ on: tab === 'write' }" @click="tab = 'write'">{{ t('registry.md.write') }}</button>
            <button :class="{ on: tab === 'preview' }" @click="tab = 'preview'">{{ t('registry.md.preview') }}</button>
            <span class="mp-label md-kind">Markdown</span>
        </div>
        <textarea
            v-if="tab === 'write'"
            ref="area"
            class="md-area mp-scroll"
            :rows="rows"
            :maxlength="max"
            :placeholder="placeholder"
            :value="modelValue"
            @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
            @keydown="onKeydown"
        />
        <div v-else class="md-preview mp-markdown mp-scroll" v-html="html" />
        <div class="md-foot mp-label">
            <span class="md-hints">
                <span v-for="(group, g) in [TOOLS, HTML_TOOLS]" :key="g">
                    <template v-for="(tool, i) in group" :key="tool.id">
                        <template v-if="i"> · </template>
                        <button
                            v-tip="tip(tool)"
                            type="button"
                            class="md-hint"
                            :disabled="tab !== 'write'"
                            @mousedown.prevent
                            @click="apply(tool)"
                        >{{ tool.hint() }}</button>
                    </template>
                </span>
            </span>
            <span :class="{ 'mp-label--error': modelValue.length >= max }">{{ modelValue.length }} / {{ max }}</span>
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.md {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--base-600);
    background: var(--black-1-a);
    corner-shape: bevel;
    border-radius: 0 0 8px 0;
}

.md:focus-within {
    border-color: var(--accent-200);
}

.md-tabs {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3) 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.md-tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 0 var(--space-1);
    cursor: pointer;
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    text-transform: uppercase;
    color: var(--text-muted);
}

.md-tabs button.on {
    color: var(--text-main);
    border-bottom-color: var(--accent-200);
}

.md-kind {
    margin-left: auto;
}

.md-area {
    flex: 1;
    min-height: 96px;
    padding: var(--space-3);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    color: var(--text-main);
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    line-height: 1.6;
}

.md-preview {
    flex: 1;
    min-height: 96px;
    padding: var(--space-3);
    overflow-y: auto;
}

.md-foot {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-3) var(--space-2);
}

/* The Markdown group and the HTML group. A narrow field wraps the second group to a new line. */
.md-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-4);
}

/* The hint text is the control: it keeps the label look and formats the selection on click. */
.md-hint {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    cursor: pointer;
}

.md-hint:hover {
    color: var(--text-main);
}

.md-hint:disabled {
    cursor: default;
    color: inherit;
}
</style>
