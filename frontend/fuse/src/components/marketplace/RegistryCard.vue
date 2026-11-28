<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { useRegistryStore } from '../../stores/registry'
import { useI18n } from '../../composables/useI18n'
import { CHANNEL_COLORS, fileType, type RegistryProject, type RegistryTag, type Channel, type PluginType } from '../../utils/registry-api'
import ProjectIcon from './ProjectIcon.vue'
import CompatTag from './CompatTag.vue'
import NewCorner from './NewCorner.vue'
import eButton from '../inputs/eButton.vue'
import eBadge from '../ui/eBadge.vue'
import Icons from '../ui/Icons.vue'

const props = withDefaults(defineProps<{
    project: Pick<RegistryProject, 'id' | 'name' | 'summary' | 'icon_key' | 'plugin_id' | 'views' | 'downloads' | 'latest_file'> & {
        owner?: RegistryProject['owner']
        published_at?: string | null
        tags: RegistryTag[]
        game_compatible?: boolean
    }
    /** The wizard preview: no clicks, a local icon, and the version from the form. */
    preview?: boolean
    previewIcon?: string | null
    previewVersion?: string | null
    previewChannel?: Channel | null
    previewGame?: string[]
    previewFuse?: string | null
    previewType?: PluginType | null
}>(), {
    preview: false, previewIcon: null, previewVersion: null, previewChannel: null, previewGame: () => [], previewFuse: null,
    previewType: null,
})

const emit = defineEmits<{ select: []; creator: [username: string] }>()

const registry = useRegistryStore()
const { t } = useI18n()

const version = computed(() => props.preview ? props.previewVersion : props.project.latest_file?.version ?? null)
const channel = computed<Channel>(() => (props.preview ? props.previewChannel : props.project.latest_file?.channel) ?? 'release')
const state = computed(() => props.preview ? 'idle' : registry.projectState(props.project as RegistryProject))
const busy = computed(() => registry.planning === props.project.latest_file?.id || state.value === 'downloading')

const compatGame = computed(() => props.preview ? props.previewGame : props.project.latest_file?.game_versions ?? [])
const compatFuse = computed(() => props.preview ? props.previewFuse : props.project.latest_file?.min_fuse_version ?? null)
const compatType = computed(() => props.preview ? props.previewType : fileType(props.project.latest_file))
const hasCompat = computed(() => compatGame.value.length > 0 || !!compatFuse.value || !!compatType.value)

// `published_at` is the first approval, so a new version of an old plugin does not count.
const NEW_MS = 14 * 24 * 60 * 60 * 1000
const CORNER = 48
const CORNER_PX = `${CORNER}px`

const isNew = computed(() => {
    const at = props.project.published_at
    return !props.preview && !!at && Date.now() - Date.parse(at) < NEW_MS
})

const label = computed(() => ({
    downloading: t('registry.install.downloading'),
    installed: t('registry.install.installed'),
    update: t('registry.install.update'),
    replace: t('registry.install.replace'),
    error: t('registry.install.retry'),
    idle: t('registry.install.install'),
}[state.value]))

function onInstall(e: MouseEvent) {
    e.stopPropagation()
    const id = props.project.latest_file?.id
    if (!props.preview && id) void registry.requestInstall(id)
}

function onCreator(e: MouseEvent) {
    e.stopPropagation()
    const name = props.project.owner?.username
    if (!props.preview && name) emit('creator', name)
}
</script>

<template>
    <motion.div
        class="mp-card"
        :class="{ 'mp-card--preview': preview, 'mp-card--new': isNew }"
        :whileHover="preview ? {} : { backgroundColor: 'rgba(255, 255, 255, 0.04)' }"
        :transition="{ duration: 0.15 }"
        @click="!preview && emit('select')"
    >
        <ProjectIcon :icon-key="project.icon_key" :preview="previewIcon" :name="project.name || '?'" :size="56" />

        <div class="card-body">
            <div class="card-head">
                <span class="card-name">{{ project.name || t('registry.card.untitled') }}</span>
                <eBadge v-if="version" :label="version" :color="CHANNEL_COLORS[channel]" />
                <button v-if="project.owner?.username" class="card-creator" @click="onCreator">
                    {{ t('registry.card.by', { name: project.owner.username }) }}
                </button>
            </div>
            <p class="card-summary">{{ project.summary || t('registry.card.noSummary') }}</p>

            <div class="card-foot">
                <div class="card-tags">
                    <eBadge v-for="tag in project.tags.slice(0, 3)" :key="tag.id" :label="tag.label" :color="tag.color ?? undefined" />
                    <span
                        v-if="!preview && project.game_compatible === false && registry.playerGameVersion"
                        v-tip="t('registry.card.notMarkedTip')"
                        class="card-unmarked"
                    >{{ t('registry.card.notMarked', { version: registry.playerGameVersion }) }}</span>
                </div>
                <eButton
                    v-if="preview || project.latest_file"
                    size="half"
                    :label="label"
                    :system-state="busy ? 'processing' : state === 'error' ? 'error' : 'idle'"
                    :disabled="state === 'installed'"
                    @click="onInstall"
                />
            </div>

            <div class="card-stats">
                <Icons kind="views" class="stat-icon" />
                <span class="stat">{{ preview ? '—' : project.views.toLocaleString() }}</span>
                <span class="stat-sep">·</span>
                <Icons kind="download" class="stat-icon" />
                <span class="stat">{{ preview ? '—' : project.downloads.toLocaleString() }}</span>
                <CompatTag v-if="hasCompat" class="card-compat" :game="compatGame" :fuse="compatFuse" :plugin-type="compatType" />
            </div>
        </div>

        <NewCorner v-if="isNew" :label="t('registry.card.new')" :size="CORNER" />
    </motion.div>
</template>

<style scoped>
.mp-card {
    position: relative;
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--black-1-a);
    cursor: pointer;
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}

.mp-card--preview {
    cursor: default;
    pointer-events: none;
}

.card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.card-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

/* The corner covers the right end of the top row. */
.mp-card--new .card-head {
    padding-right: calc(v-bind(CORNER_PX) - var(--space-3) - var(--space-4) + var(--space-1));
}

.card-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
}
.card-creator {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    color: var(--text-muted);
    opacity: 0.6;
    white-space: nowrap;
}

.card-creator:hover {
    opacity: 1;
    text-decoration: underline;
}

.card-summary {
    margin: 0;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
}

.card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-1);
}

.card-tags {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
}

.card-unmarked {
    font-family: var(--font-microcopy);
    font-size: 10px;
    text-transform: uppercase;
    color: var(--accent-600);
    opacity: 0.8;
}

.card-stats {
    display: flex;
    align-items: center;
    gap: var(--space-1);
}

.stat-icon {
    opacity: 0.45;
    flex-shrink: 0;
}

.stat,
.stat-sep {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    opacity: 0.55;
    user-select: none;
}

.stat-sep {
    opacity: 0.3;
}

.card-compat {
    margin-left: auto;
}
</style>
