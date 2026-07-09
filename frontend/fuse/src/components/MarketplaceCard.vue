<script setup lang="ts">
import type { MarketplaceProject } from '../stores/marketplace'
import { useMarketplaceStore } from '../stores/marketplace'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import eButton from './eButton.vue'
import eBadge from './eBadge.vue'
import Icons from './Icons.vue'

const props = defineProps<{ project: MarketplaceProject }>()
const emit = defineEmits<{ select: [project: MarketplaceProject] }>()

const store = useMarketplaceStore()
const auth  = useAuthStore()
const { t } = useI18n()

function iconUrl(project: MarketplaceProject): string | null {
    return project.icon_key ? store.buildPublicUrl(project.icon_key) : null
}

const installState = (project: MarketplaceProject) => store.projectInstallState(project)

function installLabel(project: MarketplaceProject) {
    switch (installState(project)) {
        case 'downloading': return t('appdiscover.installing')
        case 'installed':   return t('appdiscover.installed')
        case 'update':      return t('appdiscover.update')
        default:            return t('appdiscover.install')
    }
}

function handleInstall(e: MouseEvent) {
    e.stopPropagation()
    if (!auth.isSignedIn()) { auth.setScreen('welcome'); return }
    const v = props.project.latest_version
    if (!v) return
    if (installState(props.project) === 'update') store.switchToVersion(v)
    else store.installVersion(v)
}
</script>

<template>
    <div class="mp-card" @click="emit('select', project)">
        <div class="card-icon-wrap">
            <img v-if="iconUrl(project)" :src="iconUrl(project)!" class="card-icon" :alt="project.name" />
            <div v-else class="card-icon-placeholder">{{ project.name[0]?.toUpperCase() }}</div>
        </div>

        <div class="card-body">
            <div class="card-header-row">
                <span class="card-name">{{ project.name }}</span>
                <eBadge
                    v-if="project.latest_version"
                    :label="project.latest_version.version_number"
                    :color="project.latest_version.version_type === 'alpha' ? '#fde68a'
                          : project.latest_version.version_type === 'beta'  ? '#7dd3fc'
                          : '#84ffb1'"
                />
                <span v-if="project.creator_username" class="card-creator">by {{ project.creator_username }}</span>
            </div>
            <p class="card-summary">{{ project.summary }}</p>

            <div class="card-footer">
                <div class="tag-list">
                    <eBadge
                        v-for="tag in project.tags.slice(0, 3)"
                        :key="tag.id"
                        :label="tag.label"
                        :color="tag.color ?? undefined"
                    />
                </div>

                <eButton
                    v-if="project.latest_version"
                    size="half"
                    :label="installLabel(project)"
                    :systemState="installState(project) === 'downloading' ? 'processing'
                                : installState(project) === 'error'       ? 'error'
                                : 'idle'"
                    :disabled="installState(project) === 'installed'"
                    @click="handleInstall"
                />
            </div>

            <div class="card-stats">
                <Icons kind="views" class="stat-icon" />
                <span class="stat">{{ project.view_count.toLocaleString() }}</span>
                <span class="stat-sep">·</span>
                <Icons kind="download" class="stat-icon" />
                <span class="stat">{{ project.total_download_count.toLocaleString() }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mp-card {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--black-1-a);
    cursor: pointer;
    transition: background 0.15s;
    clip-path: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);
}

.mp-card:hover { background: rgba(255,255,255,0.04); }

.card-icon-wrap {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
}

.card-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
}

.card-icon-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.06);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-1);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
}

.card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.card-header-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.card-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}


.card-summary {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.card-creator {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--text-muted);
    opacity: 0.55;
    white-space: nowrap;
    flex-shrink: 0;
}

.card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-1);
}

.tag-list {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
}

.card-stats {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
}

.stat-icon {
    opacity: 0.45;
    flex-shrink: 0;
}

.stat {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    opacity: 0.55;
}

.stat-sep {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    opacity: 0.3;
}

</style>
