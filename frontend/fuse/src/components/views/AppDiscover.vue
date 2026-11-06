<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { useRegistryStore } from '../../stores/registry'
import { useAuthStore } from '../../stores/auth'
import { useI18n } from '../../composables/useI18n'
import { Dynamics } from '../../composables/useMotion'
import type { SortKey } from '../../utils/registry-api'
import RegistryCard from '../marketplace/RegistryCard.vue'
import RegistryCardSkeleton from '../marketplace/RegistryCardSkeleton.vue'
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

// Hidden: the grid keeps its layout, so the list keeps its scroll position.
const gridAnimate = computed(() => view.value === 'grid'
    ? { opacity: 1, visibility: 'visible' as const }
    : { opacity: 0, transitionEnd: { visibility: 'hidden' as const } })

async function openCreator(username: string) {
    registry.closeProject()
    await registry.openCreator(username)
}

function back() {
    if (registry.selected) registry.closeProject()
    else registry.closeCreator()
}

const SKELETON_CARDS = 6
const STAGGER_CARDS = 8
const STAGGER_S = 0.035

const entered = ref(false)
let enterTimer: ReturnType<typeof setTimeout> | null = null

const showSkeleton = computed(() => !entered.value || (registry.loading && !registry.projects.length))

function cardTransition(i: number) {
    return { ...Dynamics.circOut, delay: i < STAGGER_CARDS ? i * STAGGER_S : 0 }
}

onMounted(async () => {
    enterTimer = setTimeout(() => { entered.value = true }, Dynamics.snappy.duration * 1000)
    await Promise.all([registry.fetchTags(), registry.search(), registry.refreshInstalled()])
})

onUnmounted(() => { if (enterTimer) clearTimeout(enterTimer) })

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

        <div v-if="activeTab === 'browse'" class="browse-stack">
            <motion.div
                class="browse-layout"
                :inert="view !== 'grid'"
                :initial="{ opacity: 0 }"
                :animate="gridAnimate"
                :transition="{ duration: 0.15 }"
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
                        <AnimatePresence mode="wait">
                            <motion.div
                                v-if="showSkeleton"
                                key="skeleton"
                                class="list-state list-state--skeleton"
                                :exit="{ opacity: 0 }"
                                :transition="{ duration: 0.1 }"
                            >
                                <RegistryCardSkeleton v-for="n in SKELETON_CARDS" :key="n" :index="n - 1" />
                            </motion.div>

                            <motion.div
                                v-else-if="!registry.projects.length"
                                key="empty"
                                class="list-state"
                                :initial="{ opacity: 0 }"
                                :animate="{ opacity: 1 }"
                                :exit="{ opacity: 0 }"
                                :transition="Dynamics.quick"
                            >
                                <div class="empty-state">{{ t('appdiscover.noResults') }}</div>
                            </motion.div>

                            <motion.div
                                v-else
                                key="list"
                                class="list-state"
                                :exit="{ opacity: 0 }"
                                :transition="{ duration: 0.1 }"
                            >
                                <motion.div
                                    v-for="(project, i) in registry.projects"
                                    :key="project.id"
                                    :initial="{ opacity: 0, y: 8 }"
                                    :animate="{ opacity: 1, y: 0 }"
                                    :transition="cardTransition(i)"
                                >
                                    <RegistryCard
                                        :project="project"
                                        @select="registry.openProject(project.id)"
                                        @creator="openCreator"
                                    />
                                </motion.div>
                                <div v-if="registry.hasMore" class="more">
                                    <eButton
                                        size="half"
                                        variant="secondary"
                                        :label="t('registry.loadMore', { shown: registry.projects.length, total: registry.total })"
                                        :system-state="registry.loading ? 'processing' : 'idle'"
                                        @click="registry.search(true)"
                                    />
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

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
            </AnimatePresence>
        </div>

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
.browse-stack {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.panel-fill {
    position: absolute;
    inset: 0;
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

.list-state {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

/* The skeleton fills the list box and clips, so it never shows a scrollbar. */
.list-state--skeleton {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
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
