<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import eCheckbox from './eCheckbox.vue'
import eSwitch from './eSwitch.vue'
import eDirSelector from './eDirSelector.vue'
import eButton from './eButton.vue'
import type { SystemState } from './eButton.vue'
import type { eSwitchOption } from './eSwitch.vue'
import { useAppStore } from '../stores/app'
import { eventBus } from '../events/eventBus'
import { useI18n } from '../composables/useI18n'

const store = useAppStore()
const { t } = useI18n()

interface FuseHotkey {
    action: string
    label: string
    defaultCombo: string
}

const FUSE_HOTKEYS: FuseHotkey[] = [
    { action: 'Hot-Reload Plugins',    label: 'Hot-Reload Plugins',    defaultCombo: 'ctrl+r' },
    { action: 'Quit FUSE',             label: 'Quit FUSE',             defaultCombo: 'ctrl+p' },
    { action: 'Toggle Calibrate/Lock', label: 'Toggle Calibrate/Lock', defaultCombo: 'ctrl+l' },
]

const hotkeyOverrides = ref<Record<string, string>>({})
const capturingAction = ref<string | null>(null)
let captureListener: ((e: KeyboardEvent) => void) | null = null

function getCombo(action: string): string {
    return hotkeyOverrides.value[action] ?? FUSE_HOTKEYS.find(h => h.action === action)?.defaultCombo ?? ''
}

function startCapture(action: string) {
    if (capturingAction.value) cancelCapture()
    capturingAction.value = action

    captureListener = (e: KeyboardEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
        if (e.key === 'Escape') { cancelCapture(); return }

        // Reject non-Latin keys (e.g. Cyrillic layouts
        if (/[^\x00-\x7F]/.test(e.key)) {
            cancelCapture()
            eventBus.emit('notification', {
                title: t('appsettings.keybindings.latinOnlyTitle'),
                message: t('appsettings.keybindings.latinOnly'),
                type: 'error',
            })
            return
        }

        const mods: string[] = []
        if (e.ctrlKey)  mods.push('ctrl')
        if (e.altKey)   mods.push('alt')
        if (e.shiftKey) mods.push('shift')
        const combo = [...mods, e.key.toLowerCase()].join('+')

        hotkeyOverrides.value = { ...hotkeyOverrides.value, [action]: combo }
        capturingAction.value = null
        document.removeEventListener('keydown', captureListener!, true)
        captureListener = null

        window.pluginConfigAPI?.writeHotkeyOverride('host', action, combo)
    }

    document.addEventListener('keydown', captureListener, true)
}

function cancelCapture() {
    if (captureListener) {
        document.removeEventListener('keydown', captureListener, true)
        captureListener = null
    }
    capturingAction.value = null
}

onMounted(async () => {
    try {
        const hostConfig = await window.pluginConfigAPI?.readPlugin('host')
        const overrides = (hostConfig?.hotkey_overrides as Record<string, Record<string, string>> | undefined)?.host
        if (overrides) hotkeyOverrides.value = { ...overrides }
    } catch { /* no host config yet */ }
})

onUnmounted(() => cancelCapture())

const platformOptions: eSwitchOption[] = [
  { icon: 'steam', value: 'steam' },
  { icon: 'wgc',   value: 'wgc' },
]

const gameDirPath = computed({
  get: () => store.gameDirPaths[store.gamePlatform] ?? '',
  set: (val) => store.setGameDirPath(store.gamePlatform, val),
})

const debuggerEnabled = ref<boolean | null>(null)
const debuggerBtnState = ref<SystemState>('idle')

async function refreshDebuggerState(dir: string, notifyOnInvalid = false) {
  if (!dir) { debuggerEnabled.value = null; return }
  const result = await store.checkDebugger(dir)
  if (result.success) {
    debuggerEnabled.value = result.enabled ?? false
  } else {
    debuggerEnabled.value = null
    if (notifyOnInvalid) {
      eventBus.emit('notification', {
        title: t('appsettings.notifications.invalidPathTitle'),
        message: t('appsettings.notifications.invalidPathMessage'),
        type: 'warning',
      })
    }
  }
}

// oldDir === undefined only on the immediate mount run — don't nag about a
// previously-saved path; only notify when the user actively picks a bad folder.
watch(gameDirPath, (dir, oldDir) => {
  store.scanGameDir(dir)
  refreshDebuggerState(dir, oldDir !== undefined)
}, { immediate: true })

async function handleDebuggerToggle() {
  const dir = gameDirPath.value
  if (!dir || debuggerBtnState.value !== 'idle') return
  debuggerBtnState.value = 'processing'
  const result = debuggerEnabled.value
    ? await store.disableDebugger(dir)
    : await store.enableDebugger(dir)
  if (result.success) {
    debuggerEnabled.value = !debuggerEnabled.value
    debuggerBtnState.value = 'success'
    eventBus.emit('notification', {
      title: t('appsettings.notifications.gameConfigChangedTitle'),
      message: t('appsettings.notifications.gameConfigChangedMessage'),
      type: 'success',
    })
  } else {
    debuggerBtnState.value = 'error'
  }
  setTimeout(() => { debuggerBtnState.value = 'idle' }, 2000)
}

const CUT = 10
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
</script>

<template>
  <div class="app-settings">
    <div class="settings-glow">
      <div ref="panelEl" class="settings-panel">

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.gameInstallation.title') }}</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.gameInstallation.platform') }}</span>
              <eSwitch :options="platformOptions" v-model="store.gamePlatform" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.gameInstallation.gameDirectory') }}</span>
              <div class="dir-wrapper">
                <eDirSelector v-model="gameDirPath" />
              </div>
            </div>

          </div>
        </div>

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.masterSwitch.title') }}</h2>
          <div class="section-body">
            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.masterSwitch.enableFuse') }}</span>
              <eButton
                :label="debuggerEnabled ? t('appsettings.masterSwitch.disable') : t('appsettings.masterSwitch.enable')"
                size="half"
                :systemState="debuggerBtnState"
                :disabled="debuggerEnabled === null || !gameDirPath"
                @click="handleDebuggerToggle"
              />
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.general.title') }}</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.launchAtStartup') }}</span>
              <eCheckbox v-model="store.autostart" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.startMinimized') }}</span>
              <eCheckbox v-model="store.minimizeToTray" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.closeMinimizes') }}</span>
              <eCheckbox v-model="store.minimizeToTrayOnClose" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.checkUpdates') }}</span>
              <eCheckbox v-model="store.checkUpdatesOnStartup" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.discordRpc') }}</span>
              <eCheckbox v-model="store.discordRpc" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.general.fileAssoc') }}</span>
              <eCheckbox v-model="store.fileAssoc" :width="18" :height="18" />
            </div>

          </div>
        </div>

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.qol.title') }}</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.qol.startWithGame') }}</span>
              <eCheckbox v-model="store.startWithGame" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.qol.hideOnFocusLoss') }}</span>
              <eCheckbox v-model="store.hideOnFocusLoss" :width="18" :height="18" />
            </div>

          </div>
        </div>

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.keybindings.title') }}</h2>
          <div class="section-body">
            <div class="kb-table">
              <div class="kb-header">
                <span>{{ t('appsettings.keybindings.columnAction') }}</span>
                <span>{{ t('appsettings.keybindings.columnBinding') }}</span>
              </div>
              <div
                v-for="hk in FUSE_HOTKEYS"
                :key="hk.action"
                class="kb-row"
              >
                <span class="kb-label">{{ hk.label }}</span>
                <span class="kb-combo" :class="{ capturing: capturingAction === hk.action }">
                  {{ capturingAction === hk.action ? '— press keys —' : getCombo(hk.action) }}
                </span>
                <eButton
                  :label="t('appsettings.keybindings.rebind')"
                  size="half"
                  :systemState="capturingAction === hk.action ? 'processing' : 'idle'"
                  @click="startCapture(hk.action)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-header">{{ t('appsettings.privacy.title') }}</h2>
          <div class="section-body">

            <div class="setting-row">
              <span class="setting-label">
                {{ t('appsettings.privacy.analyticsConsent').split('FUSE')[0] }}<span class="brand-highlight">FUSE</span>{{ t('appsettings.privacy.analyticsConsent').split('FUSE')[1] }}
              </span>
              <eCheckbox v-model="store.analyticsConsent" :width="18" :height="18" />
            </div>

            <div class="setting-row">
              <span class="setting-label">{{ t('appsettings.privacy.diagnosticsConsent') }}</span>
              <eCheckbox v-model="store.diagnosticsConsent" :width="18" :height="18" />
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
            stroke="#525252"
            stroke-width="0.4"
            vector-effect="non-scaling-stroke"
          />
        </svg>

      </div>
    </div>
  </div>
</template>

<style scoped>
.app-settings {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
  overflow-y: auto;
}

.settings-glow {
  /* filter:
    drop-shadow(0px 2px 5px rgba(197, 255, 218, 0.2))
    drop-shadow(0px 0px 1px #84ffb1)
    drop-shadow(0px 1px 1px rgba(197, 255, 218, 0.2)); */
}

.settings-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-2);
  /* background: var(--black-2-alpha, rgba(25, 25, 25, 0.5)); */
  clip-path: polygon(
    10px 0%,
    100% 0%,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0% 100%,
    0% 10px
  );
}

.panel-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
  z-index: 2;
}

.section-header {
  font-family: var(--font-primary);
  font-size: var(--main-font-size-2, 20px);
  font-weight: var(--font-weight-2);
  color: var(--text-main, #f2f2f2);
  padding-top: var(--space-2);
  margin: 0;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-width: 0;
}

.setting-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4, 12px);
  font-weight: var(--font-weight-3);
  color: var(--text-main, #f2f2f2);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.brand-highlight {
  color: var(--accent-200);
  font-weight: var(--font-weight-1);
}

.dir-wrapper {
  width: 240px;
  flex-shrink: 0;
}

.kb-table {
  display: flex;
  flex-direction: column;
}

.kb-header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-4);
  padding: 0 0 var(--space-2);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--light-green);
  user-select: none;
  -webkit-user-select: none;
}

.kb-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.kb-label {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  font-weight: var(--font-weight-3);
  color: var(--text-main);
  user-select: none;
  -webkit-user-select: none;
}

.kb-combo {
  font-family: var(--font-microcopy);
  font-size: var(--secondary-font-size-4);
  color: var(--text-muted);
  min-width: 64px;
  text-align: right;
  user-select: none;
  -webkit-user-select: none;
}

.kb-combo.capturing {
  color: var(--text-muted);
  font-style: italic;
}
</style>
