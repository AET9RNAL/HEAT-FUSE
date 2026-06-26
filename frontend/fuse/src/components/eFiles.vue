<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Icons from './Icons.vue'
import eMaterialButton from './eMaterialButton.vue'

interface FileEntry {
  name: string
  isDir: boolean
  size: number
  created: number
  modified: number
}

const EDITABLE_EXTS = new Set(['txt', 'cfg', 'ini', 'json', 'properties', 'conf', 'toml'])
const VIEWABLE_EXTS = new Set([...EDITABLE_EXTS, 'log', 'yml', 'yaml', 'xml', 'lua', 'py', 'md', 'js', 'ts'])

const rootPath = ref('')
const currentPath = ref('')
const entries = ref<FileEntry[]>([])
const openFilePath = ref('')
const savedContent = ref('')
const editContent = ref('')
const isEditMode = ref(false)
const loading = ref(false)
const loadError = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const isDirty = computed(() => openFilePath.value !== '' && editContent.value !== savedContent.value)
const inFileView = computed(() => openFilePath.value !== '')
const isAtRoot = computed(() => !inFileView.value && currentPath.value === rootPath.value)
const fileExt = computed(() => openFilePath.value.split('.').pop()?.toLowerCase() ?? '')
const canEdit = computed(() => EDITABLE_EXTS.has(fileExt.value))

const rootName = computed(() => {
  const parts = rootPath.value.split(/[\/\\]/)
  return parts[parts.length - 1] || 'root'
})

const breadcrumbs = computed(() => {
  const base = inFileView.value ? openFilePath.value : currentPath.value
  if (!rootPath.value || !base) return []
  const rel = base.slice(rootPath.value.length)
  return rel.split(/[\/\\]/).filter(Boolean)
})

function joinPath(base: string, name: string): string {
  return base.replace(/[\/\\]+$/, '') + '\\' + name
}

function getParent(p: string): string {
  const m = p.match(/^(.*)[\/\\][^\/\\]+$/)
  return m ? m[1] : p
}

async function loadRoot() {
  if (!window.fsAPI) { loadError.value = 'File browser unavailable'; return }
  loading.value = true
  loadError.value = ''
  try {
    const root = await window.fsAPI.getRoot()
    rootPath.value = root
    currentPath.value = root
    await loadDir(root)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function loadDir(dirPath: string) {
  loading.value = true
  loadError.value = ''
  try {
    const list = await window.fsAPI.listDir(dirPath)
    entries.value = list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function clickEntry(entry: FileEntry) {
  if (isDirty.value) return
  const fullPath = joinPath(currentPath.value, entry.name)
  if (entry.isDir) {
    currentPath.value = fullPath
    await loadDir(fullPath)
    return
  }
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  if (!VIEWABLE_EXTS.has(ext)) {
    loadError.value = 'Binary file — cannot preview'
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const content = await window.fsAPI.readFile(fullPath)
    openFilePath.value = fullPath
    savedContent.value = content
    editContent.value = content
    isEditMode.value = false
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function saveFile() {
  if (!isDirty.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    await window.fsAPI.writeFile(openFilePath.value, editContent.value)
    savedContent.value = editContent.value
    isEditMode.value = false
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function discardChanges() {
  editContent.value = savedContent.value
  isEditMode.value = false
}

function autoResizeTextarea() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

watch(editContent, () => nextTick(autoResizeTextarea))
watch(isEditMode, (val) => { if (val) nextTick(autoResizeTextarea) })

function goBack() {
  if (isDirty.value) return
  if (inFileView.value) {
    const parentDir = getParent(openFilePath.value)
    openFilePath.value = ''
    savedContent.value = ''
    editContent.value = ''
    isEditMode.value = false
    currentPath.value = parentDir
    loadDir(parentDir)
  } else {
    const parentDir = getParent(currentPath.value)
    if (parentDir && parentDir.length >= rootPath.value.length) {
      currentPath.value = parentDir
      loadDir(parentDir)
    }
  }
}

function navigateToRoot() {
  if (isDirty.value || (currentPath.value === rootPath.value && !inFileView.value)) return
  openFilePath.value = ''
  savedContent.value = ''
  editContent.value = ''
  isEditMode.value = false
  currentPath.value = rootPath.value
  loadDir(rootPath.value)
}

function navigateToBreadcrumb(segIndex: number) {
  if (isDirty.value) return
  if (inFileView.value && segIndex === breadcrumbs.value.length - 1) return
  const segments = breadcrumbs.value.slice(0, segIndex + 1)
  const target = rootPath.value + (segments.length ? '\\' + segments.join('\\') : '')
  if (!inFileView.value && target === currentPath.value) return
  openFilePath.value = ''
  savedContent.value = ''
  editContent.value = ''
  isEditMode.value = false
  currentPath.value = target
  loadDir(target)
}

// Syntax highlighting
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightJson(source: string): string {
  const out: string[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue }
        if (source[j] === '"') { j++; break }
        j++
      }
      const tok = escHtml(source.slice(i, j))
      let k = j
      while (k < source.length && ' \t\n\r'.includes(source[k])) k++
      if (source[k] === ':') {
        out.push(`<span class="hl-key">${tok}</span>`)
      } else {
        out.push(`<span class="hl-string">${tok}</span>`)
      }
      i = j
    } else if (source.startsWith('true', i) && !/\w/.test(source[i + 4] ?? '')) {
      out.push('<span class="hl-bool">true</span>'); i += 4
    } else if (source.startsWith('false', i) && !/\w/.test(source[i + 5] ?? '')) {
      out.push('<span class="hl-bool">false</span>'); i += 5
    } else if (source.startsWith('null', i) && !/\w/.test(source[i + 4] ?? '')) {
      out.push('<span class="hl-null">null</span>'); i += 4
    } else if ((ch === '-' && /\d/.test(source[i + 1] ?? '')) || /\d/.test(ch)) {
      let j = i
      if (source[j] === '-') j++
      while (j < source.length && /\d/.test(source[j])) j++
      if (source[j] === '.') { j++; while (j < source.length && /\d/.test(source[j])) j++ }
      if (source[j] === 'e' || source[j] === 'E') {
        j++
        if (source[j] === '+' || source[j] === '-') j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      out.push(`<span class="hl-num">${source.slice(i, j)}</span>`)
      i = j
    } else {
      out.push(escHtml(ch)); i++
    }
  }
  return out.join('')
}

function highlightCfg(source: string): string {
  return source.split('\n').map(line => {
    if (/^\s*[#;]/.test(line)) return `<span class="hl-comment">${escHtml(line)}</span>`
    const m = line.match(/^(\s*)([\w.:+\-]+)(\s*=\s*)(.*)$/)
    if (m) {
      return escHtml(m[1]) +
        `<span class="hl-key">${escHtml(m[2])}</span>` +
        escHtml(m[3]) +
        `<span class="hl-string">${escHtml(m[4])}</span>`
    }
    return escHtml(line)
  }).join('\n')
}

function getHighlighted(content: string, ext: string): string {
  if (ext === 'json') return highlightJson(content)
  if (['cfg', 'ini', 'properties', 'conf', 'toml'].includes(ext)) return highlightCfg(content)
  return escHtml(content)
}

// Formatting helpers
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: '2-digit', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// Polygon stroke
const CUT = 10
const containerEl = ref<HTMLElement | null>(null)
const elW = ref(0)
const elH = ref(0)
const svgPoints = computed(() => {
  const w = elW.value; const h = elH.value
  if (!w || !h) return ''
  const cx = (CUT / w) * 100; const cy = (CUT / h) * 100
  return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

let ro: ResizeObserver | null = null
onMounted(() => {
  loadRoot()
  if (!containerEl.value) return
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0]
    elW.value = box ? box.inlineSize : entry.contentRect.width
    elH.value = box ? box.blockSize  : entry.contentRect.height
  })
  ro.observe(containerEl.value)
})
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div class="e-files-glow">
    <div ref="containerEl" class="e-files" :class="{ 'is-dirty': isDirty }">

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="breadcrumbs" :class="{ 'nav-blocked': isDirty }">
          <span class="bc-seg bc-root" @click="navigateToRoot">{{ rootName }}</span>
          <template v-for="(seg, i) in breadcrumbs" :key="i">
            <span class="bc-sep">›</span>
            <span
              class="bc-seg"
              :class="{ 'bc-current': i === breadcrumbs.length - 1 }"
              @click="navigateToBreadcrumb(i)"
            >{{ seg }}</span>
          </template>
        </div>

        <div class="toolbar-right">
          <template v-if="inFileView && canEdit">
            <eMaterialButton
              v-if="!isEditMode"
              label="Edit"
              variant="tertiary"
              @click="isEditMode = true"
            />
            <eMaterialButton
              v-else
              label="Preview"
              variant="tertiary"
              @click="isEditMode = false"
            />
          </template>
          <eMaterialButton
            v-if="!inFileView"
            :icon="'reload'"
            variant="tertiary"
            :disabled="loading"
            @click="loadDir(currentPath)"
          />
          <eMaterialButton
            v-if="!isAtRoot || inFileView"
            :icon="'arrow-left'"
            variant="tertiary"
            :disabled="isDirty"
            @click="goBack"
          />
        </div>
      </div>

      <!-- Error -->
      <div v-if="loadError" class="load-error">{{ loadError }}</div>

      <!-- Content area -->
      <div class="content-area">

        <!-- Directory listing -->
        <template v-if="!inFileView">
          <div class="file-table">
            <div class="table-head">
              <span class="col-name">Name</span>
              <span class="col-size">Size</span>
              <span class="col-date">Modified</span>
            </div>
            <div v-if="loading" class="table-empty">Loading…</div>
            <div v-else-if="!loadError && entries.length === 0" class="table-empty">Directory is empty</div>
            <div
              v-for="entry in entries"
              :key="entry.name"
              class="table-row"
              :class="{ 'row-dir': entry.isDir }"
              @click="clickEntry(entry)"
            >
              <span class="col-name entry-name-cell">
                <Icons
                  :kind="entry.isDir ? 'folder' : 'file'"
                  size="small"
                  class="entry-icon"
                  :class="{ 'icon-dir': entry.isDir }"
                />
                <span class="entry-name">{{ entry.name }}</span>
              </span>
              <span class="col-size">{{ entry.isDir ? '—' : formatSize(entry.size) }}</span>
              <span class="col-date">{{ formatDate(entry.modified) }}</span>
            </div>
          </div>
        </template>

        <!-- File editor -->
        <template v-else>
          <div class="editor-area">
            <pre
              v-if="!isEditMode"
              class="editor-pre"
              v-html="getHighlighted(editContent, fileExt)"
            />
            <textarea
              v-else
              v-model="editContent"
              class="editor-textarea"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              autocomplete="off"
            />
          </div>
        </template>

      </div>

      <!-- Dirty bar -->
      <div v-if="isDirty" class="dirty-bar">
        <span class="dirty-label">Unsaved changes</span>
        <div class="dirty-actions">
          <eMaterialButton label="Discard" variant="tertiary" @click="discardChanges" />
          <eMaterialButton
            label="Save"
            :fill="'var(--light-green)'"
            :color="'var(--black-1)'"
            :disabled="loading"
            @click="saveFile"
          />
        </div>
      </div>

      <!-- Polygon stroke -->
      <svg
        v-if="svgPoints"
        class="polygon-stroke"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          :points="svgPoints"
          fill="none"
          stroke="#525252"
          stroke-width="0.4"
          vector-effect="non-scaling-stroke"
        />
      </svg>

    </div>
  </div>
</template>

<style scoped>
.e-files-glow {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.e-files {
  background-color: var(--black-1-a);
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  gap: var(--space-2);
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: var(--space-0);
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.breadcrumbs.nav-blocked {
  opacity: 0.4;
  pointer-events: none;
}

.bc-sep {
  color: var(--text-muted);
  font-size: var(--secondary-font-size-4);
  padding: 0 var(--space-0);
  user-select: none;
  -webkit-user-select: none;
}

.bc-seg {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: var(--space-0) var(--space-1);
  border-radius: var(--space-0);
  transition: color 0.1s;
}

.bc-root {
  color: var(--text-main);
  font-weight: var(--font-weight-2);
}

.bc-seg:hover:not(.bc-current) {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.bc-current {
  color: var(--text-main);
  cursor: default;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

/* Error */
.load-error {
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--accent-error, #f87171);
  flex-shrink: 0;
}

/* Content area */
.content-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* File table */
.file-table {
  display: flex;
  flex-direction: column;
}

.table-head {
  display: grid;
  grid-template-columns: 1fr 80px 140px;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  user-select: none;
  -webkit-user-select: none;
}

.table-head > span {
  font-family: var(--font-primary);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-2);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.table-empty {
  padding: var(--space-3) var(--space-2);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
}

.table-row {
  display: grid;
  grid-template-columns: 1fr 80px 140px;
  padding: var(--space-2) var(--space-2);
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.table-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.table-row:active {
  background: rgba(255, 255, 255, 0.06);
}

.col-name,
.col-size,
.col-date {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  overflow: hidden;
}

.col-size,
.col-date {
  color: var(--text-muted);
  font-size: var(--secondary-font-size-4);
}

.entry-name-cell {
  gap: var(--space-1);
}

.entry-icon {
  flex-shrink: 0;
  opacity: 0.5;
}

.entry-icon.icon-dir {
  opacity: 0.75;
}

.entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-dir .entry-name {
  color: var(--text-main);
}

/* Editor */
.editor-area {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.editor-pre {
  flex: 1;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.6;
  color: var(--text-muted);
  white-space: pre;
  overflow-x: auto;
  tab-size: 2;
  word-break: normal;
}

.editor-textarea {
  flex: 1;
  min-height: var(--space-8);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  line-height: 1.6;
  resize: none;
  width: 100%;
  box-sizing: border-box;
  tab-size: 2;
  white-space: pre;
  overflow-x: auto;
  caret-color: var(--accent-200, #86efac);
}

/* Syntax highlighting */
.editor-pre :deep(.hl-key)     { color: #9cdcfe; }
.editor-pre :deep(.hl-string)  { color: #ce9178; }
.editor-pre :deep(.hl-num)     { color: #b5cea8; }
.editor-pre :deep(.hl-bool)    { color: #569cd6; }
.editor-pre :deep(.hl-null)    { color: #569cd6; }
.editor-pre :deep(.hl-comment) { color: #6a9955; font-style: italic; }

/* Dirty bar */
.dirty-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.dirty-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
}

.dirty-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* Polygon stroke */
.polygon-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}
</style>
