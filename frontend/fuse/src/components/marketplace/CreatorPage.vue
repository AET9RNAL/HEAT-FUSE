<script setup lang="ts">
import { computed } from 'vue'
import { useRegistryStore } from '../../stores/registry'
import { useI18n } from '../../composables/useI18n'
import { formatDate } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import RegistryCard from './RegistryCard.vue'
import HudFrame from './HudFrame.vue'
import HudReadout, { type ReadoutCell } from './HudReadout.vue'
import Icons from '../ui/Icons.vue'

const emit = defineEmits<{ back: [] }>()

const registry = useRegistryStore()
const { t } = useI18n()

const data = computed(() => registry.creator!)

const stats = computed<ReadoutCell[]>(() => [
    { label: t('registry.stat.projects'), value: String(data.value.profile.projects).padStart(2, '0') },
    { label: t('registry.stat.downloads'), value: data.value.profile.downloads.toLocaleString() },
    { label: t('registry.stat.joined'), value: formatDate(data.value.profile.created_at) },
])
</script>

<template>
    <div class="cp-root">
        <div class="mp-breadcrumb">
            <button class="mp-back" :aria-label="t('appdiscover.back')" @click="emit('back')"><Icons kind="arrow-left" size="normal" /></button>
            <button class="mp-crumb mp-crumb--link" @click="emit('back')">{{ t('appdiscover.browse') }}</button>
            <span class="mp-crumb">/</span>
            <span class="mp-crumb mp-crumb--current">{{ data.profile.username }}</span>
        </div>

        <div class="cp-top">
            <div class="mp-tagline">
                <span class="mp-tag-key">USR</span>
                <span class="cp-handle">@{{ (data.profile.username ?? '').toLowerCase() }}</span>
                <span class="mp-tag-fill" />
                <span class="mp-tag-key">{{ t('registry.creator.kicker') }}</span>
            </div>
            <HudFrame class="cp-header">
                <div class="cp-row">
                    <ProjectIcon :icon-key="data.profile.avatar_key" :name="data.profile.username ?? '?'" :size="72" />
                    <div class="cp-meta">
                        <h2 class="mp-title">{{ data.profile.username }}</h2>
                        <p v-if="data.profile.bio" class="mp-text">{{ data.profile.bio }}</p>
                    </div>
                    <HudReadout class="cp-stats" :cells="stats" />
                </div>
            </HudFrame>
        </div>

        <div class="cp-list mp-scroll">
            <div v-if="!data.projects.length" class="mp-empty">{{ t('registry.creator.empty') }}</div>
            <RegistryCard
                v-for="p in data.projects"
                :key="p.id"
                :project="p"
                @select="registry.openProject(p.id)"
            />
        </div>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.cp-root {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    height: 100%;
    min-height: 0;
}

.cp-top {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex-shrink: 0;
}

.cp-handle {
    color: var(--text-muted);
    text-transform: none;
}

.cp-header {
    padding: var(--space-4);
}

.cp-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
}

.cp-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.cp-stats {
    flex-shrink: 0;
}

.cp-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}
</style>
