<script setup lang="ts">
import { computed, watch } from 'vue'
import { useMarketplaceStore } from '../stores/marketplace'
import { useI18n } from '../composables/useI18n'
import { renderMarkdown } from '../composables/useMarkdown'
import MarketplaceVersionRow from './MarketplaceVersionRow.vue'
import eBadge from './eBadge.vue'

const store = useMarketplaceStore()
const { t } = useI18n()

const project = computed(() => store.selectedProject)
const iconUrl = computed(() => project.value?.icon_key ? store.buildPublicUrl(project.value.icon_key) : null)
const descHtml = computed(() => renderMarkdown(project.value?.description ?? ''))

watch(() => store.selectedProject?.id, (id) => {
    if (id) store.recordView(id)
}, { immediate: true })
</script>

<template>
    <div v-if="project" class="detail-panel">
        <!-- Header -->
        <div class="detail-header">
            <button class="back-btn" @click="store.selectProject(null)">← {{ t('appdiscover.back') }}</button>

            <div class="detail-identity">
                <div class="detail-icon-wrap">
                    <img v-if="iconUrl" :src="iconUrl" class="detail-icon" :alt="project.name" />
                    <div v-else class="detail-icon-placeholder">{{ project.name[0]?.toUpperCase() }}</div>
                </div>
                <div class="detail-meta">
                    <h2 class="detail-name">{{ project.name }}</h2>
                    <p class="detail-summary">{{ project.summary }}</p>
                    <div class="tag-list">
                        <eBadge
                            v-for="tag in project.tags"
                            :key="tag.id"
                            :label="tag.label"
                            :color="tag.color ?? undefined"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Description -->
        <section v-if="project.description" class="detail-section">
            <div class="markdown-body" v-html="descHtml" />
        </section>

        <!-- Versions -->
        <section class="detail-section">
            <h3 class="section-title">{{ t('appdiscover.versions') }}</h3>
            <div v-if="store.loadingVersions" class="empty-state">{{ t('components.loading') }}</div>
            <div v-else-if="store.versions.length === 0" class="empty-state">{{ t('appdiscover.noVersions') }}</div>
            <div v-else class="versions-list">
                <MarketplaceVersionRow
                    v-for="ver in store.versions"
                    :key="ver.id"
                    :version="ver"
                />
            </div>
        </section>
    </div>
</template>

<style scoped>
.detail-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    overflow-y: auto;
    height: 100%;
    box-sizing: border-box;
}

.back-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--accent-200);
    padding: 0;
    margin-bottom: var(--space-2);
    align-self: flex-start;
}
.back-btn:hover { opacity: 0.7; }

.detail-header {
    display: flex;
    flex-direction: column;
}

.detail-identity {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
}

.detail-icon-wrap {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
}

.detail-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    clip-path: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
}

.detail-icon-placeholder {
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
    clip-path: polygon(6px 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0% 100%, 0% 6px);
}

.detail-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.detail-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-1);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    margin: 0;
}

.detail-summary {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    margin: 0;
}

.tag-list { display: flex; gap: var(--space-1); flex-wrap: wrap; }

.detail-section {
    background: var(--black-1-a);
    clip-path: polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px);
}

.section-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

.versions-list { display: flex; flex-direction: column; }

.empty-state {
    padding: var(--space-4);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    text-align: center;
}

/* Markdown rendered content */
.markdown-body {
    padding: var(--space-4);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    line-height: 1.6;
}
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) {
    color: var(--text-main);
    font-weight: var(--font-weight-2);
    margin: var(--space-3) 0 var(--space-1);
}
.markdown-body :deep(p) { margin: var(--space-1) 0; color: var(--text-muted); }
.markdown-body :deep(code) {
    font-family: var(--font-microcopy);
    background: rgba(255,255,255,0.06);
    padding: 1px 4px;
    font-size: var(--main-font-size-5);
}
.markdown-body :deep(pre) {
    background: rgba(255,255,255,0.04);
    padding: var(--space-3);
    overflow-x: auto;
}
.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(a) { color: var(--accent-200); }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: var(--space-4); color: var(--text-muted); }
.markdown-body :deep(blockquote) {
    border-left: 2px solid rgba(255,255,255,0.15);
    padding-left: var(--space-3);
    color: var(--text-muted);
    margin: var(--space-2) 0;
}
</style>
