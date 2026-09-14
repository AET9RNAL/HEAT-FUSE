<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import eSetting, { type SettingStatus } from './eSetting.vue'
import eKeybind from './eKeybind.vue'
import StageSlider from '../overlay/inspector/controls/StageSlider.vue'
import type { SystemState } from './eButton.vue'
import type { eSwitchOption } from './eSwitch.vue'
import { useAppStore } from '../stores/app'
import { eventBus } from '../events/eventBus'
import { useI18n } from '../composables/useI18n'
import { useSettingAttention } from '../composables/useSettingAttention'

const store = useAppStore()
const { t } = useI18n()

interface FuseHotkey {
    action: string
    label: string
    description: string
    defaultCombo: string
}

const FUSE_HOTKEYS = computed<FuseHotkey[]>(() => [
    { action: 'Hot-Reload Plugins',    label: 'Hot-Reload Plugins',    description: t('appsettings.hotkeys.reloadDesc'),     defaultCombo: 'ctrl+r' },
    { action: 'Quit FUSE',             label: 'Quit FUSE',             description: t('appsettings.hotkeys.quitDesc'),       defaultCombo: 'ctrl+p' },
    { action: 'Toggle Calibrate/Lock', label: 'Toggle Calibrate/Lock', description: t('appsettings.hotkeys.calibrateDesc'),  defaultCombo: 'ctrl+l' },
    { action: 'Toggle Interactive',    label: 'Toggle Interactive',    description: t('appsettings.hotkeys.interactiveDesc'), defaultCombo: 'ctrl+i' },
])

const hotkeyOverrides = ref<Record<string, string>>({})

function getCombo(action: string): string {
    return hotkeyOverrides.value[action]
        ?? FUSE_HOTKEYS.value.find(h => h.action === action)?.defaultCombo
        ?? ''
}

function setCombo(action: string, combo: string) {
    hotkeyOverrides.value = { ...hotkeyOverrides.value, [action]: combo }
    window.pluginConfigAPI?.writeHotkeyOverride('host', action, combo)
}

onMounted(async () => {
    try {
        const hostConfig = await window.pluginConfigAPI?.readPlugin('host')
        const overrides = (hostConfig?.hotkey_overrides as Record<string, Record<string, string>> | undefined)?.host
        if (overrides) hotkeyOverrides.value = { ...overrides }
    } catch { /* no host config yet */ }
})

// Toggles Chrome DevTools on the FUSE stage and runtime sidecar's Node inspector
const overlayDevtoolsOpen = ref(false)
watch(overlayDevtoolsOpen, () => {
    window.ipcRenderer?.send('overlay:toggle-devtools')
    window.ipcRenderer?.send('runtime:toggle-devtools')
})

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

// oldDir === undefined only on the immediate mount run - don't nag about a
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

// Something elsewhere was blocked by a setting, replay animation
const attention = ref<Record<string, number>>({})
const { pending: pendingAttention, clear: clearAttention } = useSettingAttention()

watch(pendingAttention, (requests) => {
    const ids = Object.keys(requests)
    if (!ids.length) return
    const next = { ...attention.value }
    for (const id of ids) next[id] = (next[id] ?? 0) + 1
    attention.value = next
    clearAttention()
}, { immediate: true })

// Corner notch states for the core row
const gameDirStatus = computed<SettingStatus>(() => {
    if (!gameDirPath.value) return 'warning'          
    if (debuggerEnabled.value === null) return 'error'
    return 'success'
})

// Anything depending on the config being applied is blocked until it is
const gameConfigStatus = computed<SettingStatus>(() => {
    if (!gameDirPath.value) return 'warning'
    if (debuggerEnabled.value === null) return 'warning'
    return debuggerEnabled.value ? 'success' : 'error'
})

</script>

<template>
    <div class="app-settings">
        <div class="settings-stack">

            <!-- Core Functionality -->
            <section class="panel panel-core">
                <h2 class="panel-title">{{ t('appsettings.core.title') }}</h2>
                <div class="core-row">
                    <eSetting
                        class="core-item"
                        icon="platform"
                        :label="t('appsettings.core.platform')"
                        :description="t('appsettings.core.platformDesc')"
                        type="switch"
                        :options="platformOptions"
                        :value="store.gamePlatform"
                        @update:value="store.gamePlatform = $event as 'steam' | 'wgc'"
                    />
                    <eSetting
                        class="core-item"
                        icon="folder"
                        :label="t('appsettings.core.gameDir')"
                        :description="t('appsettings.core.gameDirDesc')"
                        type="dir"
                        :status="gameDirStatus"
                        :attention="attention.gameDir"
                        :value="gameDirPath"
                        @update:value="gameDirPath = $event as string"
                    />
                    <eSetting
                        class="core-item"
                        icon="settings"
                        :label="t('appsettings.core.gameConfig')"
                        :description="t('appsettings.core.gameConfigDesc')"
                        type="toggle"
                        :status="gameConfigStatus"
                        :attention="attention.gameConfig"
                        :value="debuggerEnabled === true"
                        :disabled="debuggerEnabled === null || !gameDirPath || debuggerBtnState !== 'idle'"
                        @update:value="handleDebuggerToggle"
                    />
                </div>
            </section>

            <!-- General | Quality of Life + Privacy -->
            <div class="columns">
                <section class="panel column">
                    <h2 class="panel-title">{{ t('appsettings.sections.general') }}</h2>
                    <div class="options">
                        <eSetting
                            icon="launch"
                            modelValue="secondary"
                            :label="t('appsettings.general.launchAtStartup')"
                            :value="store.autostart"
                            @update:value="store.autostart = $event as boolean"
                        />
                        <eSetting
                            icon="minimizeWindow"
                            modelValue="secondary"
                            :label="t('appsettings.general.closeMinimizes')"
                            :value="store.minimizeToTrayOnClose"
                            @update:value="store.minimizeToTrayOnClose = $event as boolean"
                        />
                        <eSetting
                            icon="minimized"
                            modelValue="secondary"
                            :label="t('appsettings.general.startMinimized')"
                            :value="store.minimizeToTray"
                            @update:value="store.minimizeToTray = $event as boolean"
                        />
                        <eSetting
                            icon="download"
                            modelValue="secondary"
                            :label="t('appsettings.general.checkUpdates')"
                            :value="store.checkUpdatesOnStartup"
                            @update:value="store.checkUpdatesOnStartup = $event as boolean"
                        />
                        <eSetting
                            icon="discord"
                            modelValue="secondary"
                            :label="t('appsettings.general.discordRpc')"
                            :value="store.discordRpc"
                            @update:value="store.discordRpc = $event as boolean"
                        />
                        <eSetting
                            icon="file"
                            modelValue="secondary"
                            :label="t('appsettings.general.fileAssoc')"
                            :value="store.fileAssoc"
                            @update:value="store.fileAssoc = $event as boolean"
                        />
                    </div>
                </section>

                <div class="column column-stack">
                    <section class="panel">
                        <h2 class="panel-title">{{ t('appsettings.sections.qol') }}</h2>
                        <div class="options">
                            <eSetting
                                icon="play"
                                modelValue="secondary"
                                :label="t('appsettings.qol.startWithGame')"
                                :value="store.startWithGame"
                                @update:value="store.startWithGame = $event as boolean"
                            />
                            <eSetting
                                icon="hide"
                                modelValue="secondary"
                                :label="t('appsettings.qol.hideOnFocusLoss')"
                                :value="store.hideOnFocusLoss"
                                @update:value="store.hideOnFocusLoss = $event as boolean"
                            />
                        </div>
                    </section>

                    <section class="panel">
                        <h2 class="panel-title">{{ t('appsettings.sections.privacy') }}</h2>
                        <div class="options">
                            <eSetting
                                icon="improvement"
                                modelValue="secondary"
                                :label="t('appsettings.privacy.analyticsConsent')"
                                :value="store.analyticsConsent"
                                @update:value="store.analyticsConsent = $event as boolean"
                            />
                            <eSetting
                                icon="bug"
                                modelValue="secondary"
                                :label="t('appsettings.privacy.diagnosticsConsent')"
                                :value="store.diagnosticsConsent"
                                @update:value="store.diagnosticsConsent = $event as boolean"
                            />
                        </div>
                    </section>
                </div>
            </div>

            <!-- Keybinds -->
            <section class="panel">
                <h2 class="panel-title">{{ t('appsettings.sections.keybinds') }}</h2>
                <div class="options">
                    <eKeybind
                        v-for="hk in FUSE_HOTKEYS"
                        :key="hk.action"
                        :label="hk.label"
                        :description="hk.description"
                        :model-value="getCombo(hk.action)"
                        :reset-value="hk.defaultCombo"
                        @update:model-value="setCombo(hk.action, $event)"
                    />
                </div>
            </section>

            <!-- Audio: master level for plugin sounds on the stage window; plugins set their own under it -->
            <section class="panel">
                <h2 class="panel-title">{{ t('appsettings.sections.audio') }}</h2>
                <div class="options">
                    <eSetting
                        icon="plugin"
                        modelValue="secondary"
                        :label="t('appsettings.audio.volume')"
                        :disabled="store.audioMuted"
                    >
                        <template #control>
                            <StageSlider
                                class="audio-volume"
                                :model-value="store.audioVolume"
                                :min="0"
                                :max="100"
                                :step="1"
                                unit="%"
                                :default="80"
                                @live="store.audioVolume = $event"
                                @commit="store.audioVolume = $event"
                            />
                        </template>
                    </eSetting>
                    <eSetting
                        icon="hide"
                        modelValue="secondary"
                        :label="t('appsettings.audio.muted')"
                        :value="store.audioMuted"
                        @update:value="store.audioMuted = $event as boolean"
                    />
                </div>
            </section>

            <!-- Debug -->
            <section class="panel">
                <h2 class="panel-title">{{ t('appsettings.debug.title') }}</h2>
                <div class="options">
                    <eSetting
                        icon="console"
                        modelValue="secondary"
                        :label="t('appsettings.debug.overlayDevtools')"
                        :value="overlayDevtoolsOpen"
                        @update:value="overlayDevtoolsOpen = $event as boolean"
                    />
                </div>
            </section>

        </div>

    </div>
</template>

<style scoped>
.audio-volume {
    width: 160px;
}

.app-settings {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-4);
    overflow-y: auto;
}

.settings-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: var(--space-3);
    box-sizing: border-box;
    background: var(--black-2-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.panel-core {
    padding-bottom: var(--space-5);
}

.panel-title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    line-height: 1;
    user-select: none;
    -webkit-user-select: none;
}

/* 8px gap either side of an 8px spacer in the design */
.core-row {
    display: flex;
    align-items: stretch;
    gap: 24px;
}

.core-item {
    flex: 1;
    min-width: 0;
}

.columns {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
}

.column {
    flex: 1;
    min-width: 0;
}

.column-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

</style>
