<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useRegistryStore } from '../../stores/registry'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import type { SortKey } from '../../utils/registry-api'
import RegistryCard from '../marketplace/RegistryCard.vue'
import ProjectPage from '../marketplace/ProjectPage.vue'
import CreatorPage from '../marketplace/CreatorPage.vue'
import MyPlugins from '../marketplace/MyPlugins.vue'
import eInputField from '../inputs/eInputField.vue'
import eListSelector from '../inputs/eListSelector.vue'
import eButton from '../inputs/eButton.vue'
import eTabBrowser, { type BrowserTab } from '../inputs/eTabBrowser.vue'
import eTagFilter from '../marketplace/eTagFilter.vue'

const registry = useRegistryStore()
const auth = useAuthStore()
const { t } = useI18n()

type Tab = 'browse' | 'mine'
const activeTab = ref<Tab>('browse')

const tabs = computed<BrowserTab[]>(() => {
    const list: BrowserTab[] = [{ value: 'browse', label: t('appdiscover.browse') }]
    if (auth.isSignedIn()) list.push({ value: 'mine', label: t('appdiscover.myPlugins') })
    return list
})

// The plugin page and the creator page sit on top of the grid, so Back keeps the scroll and filters.
const view = computed(() => registry.selected ? 'project' : registry.creator ? 'creator' : 'grid')

async function openCreator(username: string) {
    registry.closeProject()
    await registry.openCreator(username)
}

function back() {
    if (registry.selected) registry.closeProject()
    else registry.closeCreator()
}

onMounted(async () => {
    await Promise.all([registry.fetchTags(), registry.search(), registry.refreshInstalled()])
})

watch(activeTab, (tab) => {
    if (tab === 'browse') void registry.refreshInstalled()
})

const SORT_VALUES: SortKey[] = ['downloads', 'views', 'updated', 'name']
const sortLabels = computed(() => SORT_VALUES.map(v => t(`appdiscover.sort.${v}`)))
</script>

<template>
    <div class="discover-root">
        <eTabBrowser
            v-ftue="'discover-tabs'"
            :tabs="tabs"
            :model-value="activeTab"
            @update:model-value="activeTab = $event as Tab"
        />

        <template v-if="activeTab === 'browse'">
            <AnimatePresence mode="wait">
                <motion.div
                    v-if="view === 'project'"
                    key="project"
                    :initial="{ opacity: 0, x: 24 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 24 }"
                    :transition="{ duration: 0.2 }"
                    class="panel-fill"
                >
                    <ProjectPage @back="back" @creator="openCreator" />
                </motion.div>

                <motion.div
                    v-else-if="view === 'creator'"
                    key="creator"
                    :initial="{ opacity: 0, x: 24 }"
                    :animate="{ opacity: 1, x: 0 }"
                    :exit="{ opacity: 0, x: 24 }"
                    :transition="{ duration: 0.2 }"
                    class="panel-fill"
                >
                    <CreatorPage @back="back" />
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
                    <div v-ftue="'discover-tools'" class="toolbar">
                        <eInputField
                            :label="t('appdiscover.searchPlaceholder')"
                            v-model="registry.filters.search"
                            size="flex"
                            orientation="both"
                        />
                        <div class="actions">
                            <eTagFilter :tags="registry.tags" :all-label="t('appdiscover.allTags')" v-model="registry.filters.tagIds" />
                            <eListSelector
                                :label="t('appdiscover.sorting')"
                                :options="sortLabels"
                                :values="SORT_VALUES"
                                :model-value="registry.filters.sort"
                                @update:model-value="registry.filters.sort = $event as SortKey"
                            />
                        </div>
                    </div>

                    <div class="plugin-list-wrap">
                        <div class="plugin-list">
                            <div v-if="registry.loading && !registry.projects.length" class="empty-state">{{ t('components.loading') }}</div>
                            <div v-else-if="!registry.projects.length" class="empty-state">{{ t('appdiscover.noResults') }}</div>
                            <template v-else>
                                <RegistryCard
                                    v-for="project in registry.projects"
                                    :key="project.id"
                                    :project="project"
                                    @select="registry.openProject(project.id)"
                                    @creator="openCreator"
                                />
                                <div v-if="registry.hasMore" class="more">
                                    <eButton
                                        size="half"
                                        variant="secondary"
                                        :label="t('registry.loadMore', { shown: registry.projects.length, total: registry.total })"
                                        :system-state="registry.loading ? 'processing' : 'idle'"
                                        @click="registry.search(true)"
                                    />
                                </div>
                            </template>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </template>

        <template v-else-if="activeTab === 'mine'">
            <MyPlugins @view-in-discover="(id: string) => { activeTab = 'browse'; registry.openProject(id) }" />
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

/* The App scrollbar, the same as AppTab. */
.plugin-list::-webkit-scrollbar {
    width: 6px;
}

.plugin-list::-webkit-scrollbar-track {
    background: transparent;
}

.plugin-list::-webkit-scrollbar-thumb {
    background-color: hsla(0, 0%, 100%, 0.15);
    border-radius: 4px;
    border-left: 4px solid transparent;
    background-clip: padding-box;
}

.plugin-list::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.25);
}

.more {
    display: flex;
    justify-content: center;
    padding: var(--space-2) 0;
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
