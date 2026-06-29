<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useMarketplaceStore } from '../stores/marketplace'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import { eventBus } from '../events/eventBus'
import MarketplaceCard from './MarketplaceCard.vue'
import MarketplaceProjectDetail from './MarketplaceProjectDetail.vue'
import MarketplaceMyPlugins from './MarketplaceMyPlugins.vue'
import eInputField from './eInputField.vue'
import eBadge from './eBadge.vue'

const store  = useMarketplaceStore()
const auth   = useAuthStore()
const { t }  = useI18n()

type Tab = 'browse' | 'mine'
const activeTab = ref<Tab>('browse')

function onNavigateDiscover({ projectId }: { projectId?: string }) {
    activeTab.value = 'browse'
    if (projectId) {
        const project = store.projects.find(p => p.id === projectId)
        if (project) store.selectProject(project)
    }
}

onMounted(async () => {
    await store.fetchTags()
    await store.fetchProjects()
    eventBus.on('navigate:discover', onNavigateDiscover)
})

onUnmounted(() => {
    eventBus.off('navigate:discover', onNavigateDiscover)
})

watch(activeTab, (tab) => {
    if (tab === 'mine') store.fetchMyProjects()
    else store.fetchProjects()
})

function toggleTagFilter(id: string) {
    const idx = store.filters.tagIds.indexOf(id)
    if (idx === -1) store.filters.tagIds.push(id)
    else store.filters.tagIds.splice(idx, 1)
}
</script>

<template>
    <div class="discover-root">
        <!-- Tab bar -->
        <div class="tab-bar">
            <button class="tab-btn" :class="{ active: activeTab === 'browse' }" @click="activeTab = 'browse'">
                {{ t('appdiscover.browse') }}
            </button>
            <button
                v-if="auth.isSignedIn()"
                class="tab-btn"
                :class="{ active: activeTab === 'mine' }"
                @click="activeTab = 'mine'"
            >
                {{ t('appdiscover.myPlugins') }}
            </button>
        </div>

        <!-- Browse tab -->
        <template v-if="activeTab === 'browse'">
            <AnimatePresence mode="wait">
                <motion.div
                    v-if="store.selectedProject"
                    key="detail"
                    :initial="{ opacity: 0, x: 24 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 24 }"
                    :transition="{ duration: 0.2 }"
                    class="panel-fill"
                >
                    <MarketplaceProjectDetail />
                </motion.div>

                <motion.div
                    v-else
                    key="grid"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    :exit="{ opacity: 0 }"
                    :transition="{ duration: 0.15 }"
                    class="browse-layout"
                >
                    <div class="toolbar">
                        <eInputField
                            :label="t('appdiscover.searchPlaceholder')"
                            v-model="store.filters.search"
                            size="full"
                        />
                        <div class="tag-filters">
                            <button
                                class="filter-btn"
                                :class="{ active: store.filters.tagIds.length === 0 }"
                                @click="store.clearFilters()"
                            >
                                <eBadge
                                    :label="t('appdiscover.allTags')"
                                    :color="store.filters.tagIds.length === 0 ? 'var(--accent-200)' : undefined"
                                />
                            </button>
                            <button
                                v-for="tag in store.tags"
                                :key="tag.id"
                                class="filter-btn"
                                :class="{ active: store.filters.tagIds.includes(tag.id) }"
                                @click="toggleTagFilter(tag.id)"
                            >
                                <eBadge
                                    :label="tag.label"
                                    :color="store.filters.tagIds.includes(tag.id) ? (tag.color ?? 'var(--accent-200)') : undefined"
                                />
                            </button>
                        </div>
                    </div>

                    <div v-if="store.loading" class="empty-state">{{ t('components.loading') }}</div>
                    <div v-else-if="store.filteredProjects.length === 0" class="empty-state">
                        {{ t('appdiscover.noResults') }}
                    </div>
                    <div v-else class="cards-grid">
                        <MarketplaceCard
                            v-for="project in store.filteredProjects"
                            :key="project.id"
                            :project="project"
                            @select="store.selectProject(project)"
                        />
                    </div>
                </motion.div>
            </AnimatePresence>
        </template>

        <!-- My Plugins tab -->
        <template v-else-if="activeTab === 'mine'">
            <MarketplaceMyPlugins />
        </template>
    </div>
</template>

<style scoped>
.discover-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.tab-bar {
    display: flex;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
}

.tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    padding: var(--space-2) var(--space-4);
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
}
.tab-btn.active {
    color: var(--text-main);
    border-bottom-color: var(--accent-200);
}

.panel-fill {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.browse-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.toolbar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    flex-shrink: 0;
}

.tag-filters {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
}

.filter-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    opacity: 0.45;
    transition: opacity 0.15s;
}
.filter-btn.active { opacity: 1; }

.cards-grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-2);
    background: rgba(255,255,255,0.02);
}

.empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}
</style>
