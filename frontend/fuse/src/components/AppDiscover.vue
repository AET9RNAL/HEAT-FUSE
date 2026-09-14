<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useMarketplaceStore, type MarketplaceSort } from '../stores/marketplace'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import { eventBus } from '../events/eventBus'
import MarketplaceCard from './MarketplaceCard.vue'
import MarketplaceProjectDetail from './MarketplaceProjectDetail.vue'
import MarketplaceMyPlugins from './MarketplaceMyPlugins.vue'
import eInputField from './eInputField.vue'
import eListSelector from './eListSelector.vue'
import eTabBrowser, { type BrowserTab } from './eTabBrowser.vue'
import eTagFilter from './eTagFilter.vue'

const store  = useMarketplaceStore()
const auth   = useAuthStore()
const { t }  = useI18n()

type Tab = 'browse' | 'mine'
const activeTab = ref<Tab>('browse')

const tabs = computed<BrowserTab[]>(() => {
    const list: BrowserTab[] = [{ value: 'browse', label: t('appdiscover.browse') }]
    if (auth.isSignedIn()) list.push({ value: 'mine', label: t('appdiscover.myPlugins') })
    return list
})

function onNavigateDiscover({ projectId }: { projectId?: string }) {
    activeTab.value = 'browse'
    if (projectId) {
        const project = store.projects.find(p => p.id === projectId)
        if (project) store.selectProject(project)
    }
}

async function reconcileInstalls() {
    try {
        if (!window.pluginsAPI) return
        const scanned = await window.pluginsAPI.scan()
        store.reconcileInstallStates(scanned)
    } catch { /* scan unavailable (e.g. web build) - leave states as-is */ }
}

onMounted(async () => {
    await store.fetchTags()
    await store.fetchProjects()
    await reconcileInstalls()
    eventBus.on('navigate:discover', onNavigateDiscover)
})

onUnmounted(() => {
    eventBus.off('navigate:discover', onNavigateDiscover)
})

watch(activeTab, async (tab) => {
    if (tab === 'mine') store.fetchMyProjects()
    else { await store.fetchProjects(); await reconcileInstalls() }
})

// Ordering only - tag filtering lives in the tags menu
const SORT_VALUES: MarketplaceSort[] = ['views', 'downloads', 'updated', 'name']
const sortLabels = computed(() => SORT_VALUES.map(v => t(`appdiscover.sort.${v}`)))

</script>

<template>
    <div class="discover-root">
        <eTabBrowser
            :tabs="tabs"
            :model-value="activeTab"
            @update:model-value="activeTab = $event as Tab"
        />

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
                            size="flex"
                            orientation="both"
                        />
                        <div class="actions">
                            <eTagFilter
                                :tags="store.tags"
                                :all-label="t('appdiscover.allTags')"
                                v-model="store.filters.tagIds"
                            />
                            <eListSelector
                                :label="t('appdiscover.sorting')"
                                :options="sortLabels"
                                :values="SORT_VALUES"
                                :model-value="store.filters.sort"
                                @update:model-value="store.filters.sort = $event as MarketplaceSort"
                            />
                        </div>
                    </div>

                    <!-- Stroke is a sibling of the scroller: inside it, the
                         clip-path and scroll offset would both eat it -->
                    <div class="plugin-list-wrap">
                        <div class="plugin-list">
                            <div v-if="store.loading" class="empty-state">{{ t('components.loading') }}</div>
                            <div v-else-if="store.filteredProjects.length === 0" class="empty-state">
                                {{ t('appdiscover.noResults') }}
                            </div>
                            <template v-else>
                                <MarketplaceCard
                                    v-for="project in store.filteredProjects"
                                    :key="project.id"
                                    :project="project"
                                    @select="store.selectProject(project)"
                                />
                            </template>
                        </div>
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
    gap: var(--space-5);
    height: 100%;
    width: 100%;
    padding: var(--space-4);
    box-sizing: border-box;
    overflow: hidden;
}

.panel-fill {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.browse-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    flex-shrink: 0;
}

.actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding-left: var(--space-5);
    flex-shrink: 0;
}

.plugin-list-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
}

.plugin-list {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: rgba(255, 255, 255, 0.02);
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 10px 0 10px 0;
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
