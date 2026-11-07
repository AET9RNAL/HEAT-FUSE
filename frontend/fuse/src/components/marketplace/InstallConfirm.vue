<script setup lang="ts">
import { computed } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useRegistryStore } from '../../stores/registry'
import { useI18n } from '../../composables/useI18n'
import { formatBytes } from '../../utils/registry-api'
import eButton from '../inputs/eButton.vue'
import Icons from '../ui/Icons.vue'

const registry = useRegistryStore()
const { t } = useI18n()

const plan = computed(() => registry.pending)
const deps = computed(() => plan.value?.downloads.filter(r => r.role === 'dependency') ?? [])
const totalBytes = computed(() => plan.value?.downloads.reduce((s, r) => s + (r.size_bytes ?? 0), 0) ?? 0)
const blocked = computed(() => (plan.value?.blockers.length ?? 0) > 0)
</script>

<template>
    <Teleport to="body">
        <AnimatePresence>
        <motion.div
            v-if="plan"
            key="install-confirm"
            class="ic-backdrop"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
            :transition="{ duration: 0.15 }"
            @mousedown.self="registry.cancelInstall()"
        >
            <motion.div
                class="ic-panel mp-panel"
                :initial="{ opacity: 0, scale: 0.96 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.96 }"
                :transition="{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }"
            >
                <div class="ic-header">
                    <!-- <span class="mp-label mp-label--accent">{{ t('registry.confirm.kicker') }}</span> -->
                    <span class="ic-title">{{ t('registry.confirm.title', { name: plan.requested.project_name ?? '' }) }}</span>
                    <button v-tip="t('common.close')" class="ic-close" @click="registry.cancelInstall()">
                        <Icons kind="cross" size="normal" />
                    </button>
                </div>

                <div class="ic-body">
                    <div v-if="blocked" class="ic-group">
                        <span class="mp-label mp-label--error">{{ t('registry.confirm.blocked') }}</span>
                        <div v-for="b in plan.blockers" :key="b.name + b.reason" class="ic-row ic-row--error">
                            <Icons kind="warning" size="normal" />
                            <span class="ic-name">{{ b.name }}</span>
                            <span class="ic-meta">{{ t(`registry.confirm.reason.${b.reason}`) }}</span>
                        </div>
                    </div>

                    <div class="ic-group">
                        <span class="mp-label">{{ t('registry.confirm.installs') }}</span>
                        <div class="ic-row">
                            <span class="ic-name">{{ plan.requested.project_name }}</span>
                            <span class="ic-version">{{ plan.requested.version }}</span>
                            <span class="ic-meta">{{ formatBytes(plan.requested.size_bytes) }}</span>
                        </div>
                    </div>

                    <div v-if="deps.length" class="ic-group">
                        <span class="mp-label">{{ t('registry.confirm.alsoInstalls') }}</span>
                        <div v-for="d in deps" :key="d.file_id ?? ''" class="ic-row">
                            <span class="ic-name">{{ d.project_name }}</span>
                            <span class="ic-version">{{ d.version }}</span>
                            <span class="ic-meta">{{ formatBytes(d.size_bytes) }}</span>
                        </div>
                    </div>

                    <div v-if="plan.kept.length" class="ic-group">
                        <span class="mp-label">{{ t('registry.confirm.kept') }}</span>
                        <div v-for="k in plan.kept" :key="k.file_id ?? ''" class="ic-row ic-row--muted">
                            <Icons kind="checkmark" size="normal" />
                            <span class="ic-name">{{ k.project_name }}</span>
                            <span class="ic-version">{{ k.version }}</span>
                        </div>
                    </div>

                    <div v-if="plan.optional.length" class="ic-group">
                        <span class="mp-label">{{ t('registry.confirm.worksWith') }}</span>
                        <span class="ic-meta">{{ plan.optional.map(o => o.project_name).join(' · ') }}</span>
                    </div>

                    <p v-if="plan.warnings.includes('game_version_unmarked') && registry.playerGameVersion" class="ic-warn">
                        {{ t('registry.confirm.gameWarning', { version: registry.playerGameVersion }) }}
                    </p>
                </div>

                <div class="ic-footer">
                    <span class="mp-label">{{ t('registry.confirm.total', { count: plan.downloads.length, size: formatBytes(totalBytes) }) }}</span>
                    <div class="ic-actions">
                        <eButton size="half" variant="secondary" :label="t('common.cancel')" @click="registry.cancelInstall()" />
                        <eButton size="half" :label="t('registry.confirm.install')" :disabled="blocked" @click="registry.confirmInstall()" />
                    </div>
                </div>
            </motion.div>
        </motion.div>
        </AnimatePresence>
    </Teleport>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.ic-backdrop {
    position: fixed;
    inset: 48px 0 0 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: rgba(0, 0, 0, 0.6);
}
.ic-panel {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    background: hsla(142, 10%, 4%, 0.95);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.ic-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ic-header .mp-label {
    grid-column: 1;
}

.ic-title {
    grid-column: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}
.ic-close {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
}
.ic-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
}

.ic-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.ic-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--text-main);
}
.ic-row--muted {
    color: var(--text-muted);
}

.ic-row--error {
    color: var(--error-highlight);
}

.ic-name {
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
}

.ic-version,
.ic-meta {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.ic-warn {
    margin: 0;
    font-family: var(--font-microcopy);
    font-size: 11px;
    color: var(--accent-600);
}

.ic-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ic-actions {
    display: flex;
    gap: var(--space-2);
}
</style>
