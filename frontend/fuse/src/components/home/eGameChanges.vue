<script setup lang="ts">
import { computed, ref } from 'vue'
import eSetting, { type SettingStatus } from '../ui/eSetting.vue'
import eButton, { type SystemState } from '../inputs/eButton.vue'
import { useAppStore } from '../../stores/app'
import { usePluginsStore, type PluginRecord } from '../../stores/plugins'
import { useGameChanges } from '../../composables/useGameChanges'
import { useI18n } from '../../composables/useI18n'
import { eventBus } from '../../events/eventBus'
import { overrideView, type OverrideTone, type OverrideView } from '../../utils/overrideState'

// Plugins with presets, and what the ledger of Electron main says FUSE holds in the game files.

const { t } = useI18n()
const appStore = useAppStore()
const pluginsStore = usePluginsStore()
const { held, heldAny } = useGameChanges()

interface OverrideRow {
    plugin: PluginRecord
    view: OverrideView
}

const NOTCH: Record<OverrideTone, SettingStatus> = { ok: 'success', wait: 'warning', bad: 'error', muted: 'none' }

const rows = computed<OverrideRow[]>(() => pluginsStore.plugins
    .filter(p => p.overrides)
    .map(p => ({ plugin: p, view: overrideView(p.overrides!, appStore.gameRunning) })))

function rowText(row: OverrideRow): string {
    const short = t(`components.plugin.overrides.short.${row.view.kind}`)
    return row.view.presetName ? `${row.view.presetName} · ${short}` : short
}

function openPlugin(pluginId: string) {
    eventBus.emit('plugin-config:open', { plugin_id: pluginId, tab: 'overrides' })
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

const heldLines = computed<string[]>(() => {
    const h = held.value
    if (!h) return []
    const lines: string[] = []
    if (h.pack) lines.push(t('apphome.gameChanges.pack', { presets: h.pack.presets.join(', ') || baseName(h.pack.file) }))
    for (const f of h.files) {
        const where = f.entry ? `${baseName(f.file)} (${baseName(f.entry)})` : baseName(f.file)
        lines.push(t('apphome.gameChanges.edits', { count: f.edits, file: where }))
    }
    if (h.waiting) lines.push(t('apphome.gameChanges.waiting'))
    if (h.error) lines.push(h.error)
    if (!lines.length) lines.push(t('apphome.gameChanges.nothingHeld'))
    return lines
})

const canRemoveAll = computed(() => heldAny.value || rows.value.some(r => r.view.presetId !== null))
const removeState = ref<SystemState>('idle')

async function removeAll() {
    if (removeState.value !== 'idle') return
    removeState.value = 'processing'
    let result: { ok: boolean; error?: string }
    try {
        result = await pluginsStore.removeAllOverrides()
    } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    removeState.value = result.ok ? 'success' : 'error'
    eventBus.emit('notification', result.ok
        ? {
            title: t('apphome.gameChanges.removedTitle'),
            message: t(appStore.gameRunning ? 'apphome.gameChanges.removedWaitMessage' : 'apphome.gameChanges.removedMessage'),
            type: 'success',
        }
        : { title: t('apphome.gameChanges.removeFailedTitle'), message: result.error ?? '', type: 'error' })
    setTimeout(() => { removeState.value = 'idle' }, 2000)
}
</script>

<template>
    <div class="e-game-changes">
        <div class="head">
            <h2 class="title">{{ t('apphome.gameChanges.title') }}</h2>
            <p class="desc">{{ t('apphome.gameChanges.desc') }}</p>
        </div>
        <div class="rows">
            <eSetting
                v-for="row in rows"
                :key="row.plugin.plugin_id"
                icon="plugin"
                :label="row.plugin.name"
                :description="rowText(row)"
                :status="NOTCH[row.view.tone]"
                @update:value="openPlugin(row.plugin.plugin_id)"
            >
                <template #control>
                    <eButton
                        size="half"
                        variant="primary"
                        :label="t('apphome.gameChanges.change')"
                        @click="openPlugin(row.plugin.plugin_id)"
                    />
                </template>
            </eSetting>
        </div>
        <div class="held-lines">
            <span v-for="(line, i) in heldLines" :key="i" class="held-line">{{ line }}</span>
        </div>
        <eSetting
            icon="delete"
            :label="t('apphome.gameChanges.removeAll')"
            :description="t('apphome.gameChanges.removeAllDesc')"
            :disabled="!canRemoveAll"
        >
            <template #control>
                <eButton
                    size="half"
                    mode="confirm"
                    tone="danger"
                    variant="secondary"
                    :label="t('apphome.gameChanges.remove')"
                    :system-state="removeState"
                    :disabled="!canRemoveAll"
                    @click="removeAll"
                />
            </template>
        </eSetting>
    </div>
</template>

<style scoped>
.e-game-changes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    background-color: var(--black-1-a);
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 10px 0 10px 0;
}

.head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.title {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-2);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    line-height: 1;
    user-select: none;
    -webkit-user-select: none;
}

.desc {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    line-height: 1.35;
    user-select: none;
    -webkit-user-select: none;
}

.rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.held-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--space-4);
}

.held-line {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    color: var(--text-muted);
    line-height: 1.35;
    overflow-wrap: anywhere;
    user-select: none;
    -webkit-user-select: none;
}
</style>
