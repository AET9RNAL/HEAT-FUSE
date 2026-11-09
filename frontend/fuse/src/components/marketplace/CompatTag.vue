<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import { compareVersions, type PluginType } from '../../utils/registry-api'
import Icons, { type IconKind } from '../ui/Icons.vue'

const TYPE_ICONS: Record<PluginType, IconKind> = {
    runtime: 'pluginRuntime',
    override: 'pluginOverride',
    hybrid: 'pluginHybrid',
}

const props = withDefaults(defineProps<{
    /** Game versions */
    game?: string[]
    /** Lowest FUSE version the file runs on */
    fuse?: string | null
    /** Runtime, override or hybrid. Null hides the type item. */
    pluginType?: PluginType | null
}>(), { game: () => [], fuse: null, pluginType: null })

const { t } = useI18n()

const sorted = computed(() => [...props.game].sort(compareVersions))

// One version shows as is. More show as the range from the oldest to the newest.
const gameText = computed(() => {
    const l = sorted.value
    if (!l.length) return '—'
    return l.length === 1 ? l[0] : `${l[0]}–${l[l.length - 1]}`
})

const gameTip = computed(() => sorted.value.length
    ? t('registry.compat.gameTip', { list: sorted.value.join(', ') })
    : t('registry.compat.gameNone'))
const fuseTip = computed(() => props.fuse
    ? t('registry.compat.fuseTip', { version: props.fuse })
    : t('registry.compat.fuseNone'))
</script>

<template>
    <span class="ct">
        <span v-tip="gameTip" class="ct-item">
            <span class="ct-mark"><Icons kind="heatLogo" size="small" /></span>
            <span class="ct-ver">{{ gameText }}</span>
        </span>
        <span class="ct-notch" aria-hidden="true" />
        <span v-tip="fuseTip" class="ct-item">
            <span class="ct-mark"><Icons kind="app-icon" size="small" /></span>
            <span class="ct-ver">{{ fuse ? `≥ ${fuse}` : '—' }}</span>
        </span>
        <template v-if="pluginType">
            <span class="ct-notch" aria-hidden="true" />
            <span v-tip="t(`registry.compat.typeTip.${pluginType}`)" class="ct-item">
                <span class="ct-mark"><Icons :kind="TYPE_ICONS[pluginType]" size="small" /></span>
                <span class="ct-ver">{{ t(`registry.compat.type.${pluginType}`) }}</span>
            </span>
        </template>
    </span>
</template>

<style scoped>
.ct {
    display: inline-flex;
    align-items: stretch;
    flex-shrink: 0;
    user-select: none;
    -webkit-user-select: none;
}

.ct-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-1) 0;
    border-bottom: 1px solid var(--base-600);
}

.ct-item + .ct-notch + .ct-item {
    padding-left: var(--space-2);
}

.ct-item:last-child {
    padding-right: 0;
}

.ct-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 5px 0 5px 0;
}

.ct-ver {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.ct-notch {
    width: 10px;
    flex-shrink: 0;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 5.5L5 1.5L10 5.5' stroke='%23525252' fill='none'/%3E%3C/svg%3E") 0 100% / 10px 6px no-repeat;
}
</style>
