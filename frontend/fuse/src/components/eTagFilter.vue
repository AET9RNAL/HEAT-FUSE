<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import Icons from './Icons.vue'
import type { MarketplaceTag } from '../stores/marketplace'

const props = defineProps<{
    tags: MarketplaceTag[]
    /** Selected tag ids */
    modelValue: string[]
    allLabel: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const show = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuPos = ref({ top: 0, left: 0 })


// Anchored under the trigger, right edges aligned
function updateMenuPos() {
    if (!show.value || !triggerRef.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0
    const w = menuEl.value?.offsetWidth ?? 0
    menuPos.value = { top: rect.bottom + scrollY + 4, left: rect.right - w + scrollX }
}

watch(show, async (val) => {
    if (val) {
        await nextTick()
        requestAnimationFrame(updateMenuPos)
    }
})

// The menu is anchored to the trigger, so a size change has to re-anchor it.
let ro: ResizeObserver | null = null
watch(menuEl, (el) => {
    ro?.disconnect()
    ro = null
    if (!el) return
    ro = new ResizeObserver(() => { if (show.value) updateMenuPos() })
    ro.observe(el)
})

function onLayoutChange() { if (show.value) updateMenuPos() }
window.addEventListener('scroll', onLayoutChange, true)
window.addEventListener('resize', onLayoutChange)

function onDocumentClick(e: MouseEvent) {
    const target = e.target as Node
    if (triggerRef.value?.contains(target)) return
    if (menuEl.value?.contains(target)) return
    show.value = false
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') show.value = false
}

watch(show, (val) => {
    if (val) {
        document.addEventListener('mousedown', onDocumentClick)
        document.addEventListener('keydown', onKeyDown)
    } else {
        document.removeEventListener('mousedown', onDocumentClick)
        document.removeEventListener('keydown', onKeyDown)
    }
})

onUnmounted(() => {
    ro?.disconnect()
    document.removeEventListener('mousedown', onDocumentClick)
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('scroll', onLayoutChange, true)
    window.removeEventListener('resize', onLayoutChange)
})

// The menu stays open across toggles - filtering is a multi-select
function toggleTag(id: string) {
    const next = props.modelValue.includes(id)
        ? props.modelValue.filter(t => t !== id)
        : [...props.modelValue, id]
    emit('update:modelValue', next)
}

const hasFilters = computed(() => props.modelValue.length > 0)
</script>

<template>
    <div class="tag-filter">
        <span
            ref="triggerRef"
            class="tag-trigger"
            :class="{ open: show, filtering: hasFilters }"
            @click.stop="show = !show"
        >
            <Icons kind="tags" size="normal" />
            <span v-if="hasFilters" class="tag-count">{{ modelValue.length }}</span>
        </span>
    </div>

    <Teleport to="body">
        <div
            v-if="show"
            ref="menuEl"
            class="tag-menu"
            :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
            @click.stop
        >
            <span
                class="tag-item"
                :class="{ active: !hasFilters }"
                @click="emit('update:modelValue', [])"
            >
                <span class="tag-dot all" />
                <span class="tag-label">{{ allLabel }}</span>
            </span>
            <span
                v-for="tag in tags"
                :key="tag.id"
                class="tag-item"
                :class="{ active: modelValue.includes(tag.id) }"
                @click="toggleTag(tag.id)"
            >
                <span class="tag-dot" :style="{ background: tag.color ?? 'var(--accent-200)' }" />
                <span class="tag-label">{{ tag.label }}</span>
            </span>
        </div>
    </Teleport>
</template>

<style scoped>
.tag-filter {
    position: relative;
    display: flex;
    align-items: center;
}

.tag-trigger {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s;
    padding: var(--space-1);
    margin: calc(var(--space-1) * -1);
}

.tag-trigger:hover,
.tag-trigger.open,
.tag-trigger.filtering { opacity: 1; }

.tag-count {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--accent-200);
    line-height: 1;
}

.tag-menu {
    position: absolute;
    z-index: 1000;
    min-width: 160px;
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1);
    background-color: var(--black-1-a);
    backdrop-filter: blur(17.5px);
    box-sizing: border-box;
    border: 1px solid var(--base-600);
    corner-shape: bevel;
    border-radius: 8px 0 8px 0;
}


.tag-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    corner-shape: bevel;
    border-radius: 4px 0 4px 0;
}

.tag-item:hover { background-color: var(--black-3); }
.tag-item.active { color: var(--text-main); }

/* Diamond marker matching the badge dot; dim until the tag is selected */
.tag-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    rotate: 45deg;
    opacity: 0.25;
    transition: opacity 0.15s;
}

.tag-dot.all { background: var(--text-muted); }
.tag-item.active .tag-dot { opacity: 1; }

.tag-label { pointer-events: none; }
</style>
