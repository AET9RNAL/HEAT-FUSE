<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icons from './Icons.vue'
import { AnimatePresence, motion } from 'motion-v'
import { Dynamics } from '../composables/useMotion'

interface Props {
    label?: string
    options?: string[]
    values?: string[]
    modelValue?: string
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    options: () => [],
    values: undefined,
    modelValue: ''
})

const resolvedValues = computed(() => props.values ?? props.options)

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const isHovered = ref(false)
const isEntering = ref(false)
const scrollerRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLElement | null>(null)
const trackEl = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})
const scrollTop = ref(0)

const CUT = 6
const elW = ref(0)
const elH = ref(0)
const svgPoints = computed(() => {
    const w = elW.value
    const h = elH.value
    if (!w || !h) return ''
    const cx = (CUT / w) * 100
    const cy = (CUT / h) * 100
    return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})
let _ro: ResizeObserver | null = null
onMounted(() => {
    if (!trackEl.value) return
    _ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        elW.value = box ? box.inlineSize : entry.contentRect.width
        elH.value = box ? box.blockSize  : entry.contentRect.height
    })
    _ro.observe(trackEl.value)
})

const selectedIndex = computed(() => {
    const idx = resolvedValues.value.indexOf(props.modelValue)
    return idx >= 0 ? idx : 0
})

const selectedLabel = computed(() => {
    return props.options[selectedIndex.value] ?? ''
})

// Virtual circular scroll
const itemHeight = 24
const visibleItems = 7
const containerHeight = itemHeight * visibleItems
const paddingItems = 3
const renderBuffer = 4
const renderWindow = visibleItems + 2 * paddingItems + 2 * renderBuffer

// High cycle count — only ~21 items are ever rendered regardless,
// so the only cost is a larger scrollable height number
const virtualCycles = computed(() => {
    const n = props.options.length
    if (n === 0) return 0
    return Math.max(101, Math.ceil(renderWindow / n) + 4)
})

const virtualItemCount = computed(() => virtualCycles.value * props.options.length)
const virtualCenterStart = computed(() => Math.floor(virtualCycles.value / 2) * props.options.length)
const totalContentHeight = computed(() => 2 * paddingItems * itemHeight + virtualItemCount.value * itemHeight)

const centerSelectedIndex = computed(() => {
    return virtualCenterStart.value + selectedIndex.value
})

// Only render items within the visible window
const renderedItems = computed(() => {
    const n = props.options.length
    if (n === 0) return []

    const scrollCenter = scrollTop.value + containerHeight / 2
    const centerItem = Math.floor(scrollCenter / itemHeight)
    const halfWindow = Math.ceil(renderWindow / 2)

    const start = Math.max(0, centerItem - halfWindow)
    const end = Math.min(virtualItemCount.value - 1, centerItem + halfWindow)

    const items: { label: string; originalIndex: number; virtualIndex: number; top: number; proximity: number }[] = []
    for (let i = start; i <= end; i++) {
        const originalIdx = ((i % n) + n) % n
        const itemTop = paddingItems * itemHeight + i * itemHeight
        const itemCenter = itemTop + itemHeight / 2
        const distance = Math.abs(itemCenter - scrollCenter) / itemHeight
        const proximity = Math.min(3, distance)

        items.push({
            label: props.options[originalIdx],
            originalIndex: originalIdx,
            virtualIndex: i,
            top: itemTop,
            proximity
        })
    }
    return items
})

function positionDropdown() {
    const btn = buttonRef.value
    if (!btn) return

    const rect = btn.getBoundingClientRect()
    const dropdownHeight = containerHeight
    const top = rect.top + rect.height / 2 - dropdownHeight / 2

    dropdownStyle.value = {
        position: 'fixed',
        top: `${top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: '100',
    }
}

function scrollToSelected() {
    const scroller = scrollerRef.value
    if (!scroller) return
    const top = centerSelectedIndex.value * itemHeight
    scroller.scrollTo({ top, behavior: 'instant' })
    scrollTop.value = top
}

// --- Interaction ---
// Quick click: toggles open, then click an option to select
// Press-hold-drag: opens on mousedown, selects on mouseup over an option
let openedAt = 0

function onMouseDown(e: MouseEvent) {
    e.preventDefault()

    if (isOpen.value) {
        // Already open — close
        isOpen.value = false
        return
    }

    // Pre-set scroll position so initial render shows correct items
    scrollTop.value = centerSelectedIndex.value * itemHeight

    isOpen.value = true
    isEntering.value = true
    openedAt = Date.now()

    nextTick(() => {
        positionDropdown()
        scrollToSelected()
        // Next frame: remove entering state to trigger staggered fade-in
        requestAnimationFrame(() => {
            isEntering.value = false
        })
    })

    window.addEventListener('mouseup', onMouseUp, { once: true })
}

function onMouseUp(e: MouseEvent) {
    if (!isOpen.value) return

    const elapsed = Date.now() - openedAt

    // Quick click (< 250ms): keep list open for browse-and-click
    if (elapsed < 250) return

    // Held long enough — select if over an option, otherwise just close
    selectFromEvent(e)
    isOpen.value = false
}

function onOptionClick(e: MouseEvent) {
    // When list is open in browse mode (quick-click opened it)
    selectFromEvent(e)
    isOpen.value = false
}

function selectFromEvent(e: MouseEvent) {
    const target = e.target as HTMLElement
    const optionEl = target.closest('[data-original-index]') as HTMLElement | null

    if (optionEl && optionEl.dataset.originalIndex !== undefined) {
        const originalIndex = parseInt(optionEl.dataset.originalIndex, 10)
        const value = resolvedValues.value[originalIndex]
        if (value !== undefined) {
            emit('update:modelValue', value)
        }
    }
}

// Close when clicking outside while in browse mode
function onDocumentMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.list-selector-root') && !target.closest('.list-selector-dropdown')) {
        isOpen.value = false
        document.removeEventListener('mousedown', onDocumentMouseDown)
    }
}

watch(isOpen, (open) => {
    if (open) {
        // Delay to avoid catching the opening click itself
        setTimeout(() => {
            document.addEventListener('mousedown', onDocumentMouseDown)
        }, 10)
    } else {
        document.removeEventListener('mousedown', onDocumentMouseDown)
    }
})

function onScroll() {
    const scroller = scrollerRef.value
    if (!scroller) return
    scrollTop.value = scroller.scrollTop
}

// One scroll tick = one option
function onWheel(e: WheelEvent) {
    e.preventDefault()
    const scroller = scrollerRef.value
    if (!scroller) return

    const direction = e.deltaY > 0 ? 1 : -1
    const currentSnap = Math.round(scroller.scrollTop / itemHeight)
    const targetSnap = currentSnap + direction

    scroller.scrollTo({
        top: targetSnap * itemHeight,
        behavior: 'smooth'
    })
}

onBeforeUnmount(() => {
    window.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('mousedown', onDocumentMouseDown)
    _ro?.disconnect()
})
</script>

<template>
    <div class="list-selector-root">
        <div ref="trackEl" class="list-selector-track">
            <!-- Label side -->
            <div class="list-selector-label">
                <span class="list-selector-label-text">{{ label }}</span>
            </div>
            <!-- Selector button -->
            <div
                ref="buttonRef"
                class="list-selector-button shadows-hover-accented-inner-glass"
                :class="{ open: isOpen }"
                @mousedown="onMouseDown"
                @mouseenter="isHovered = true"
                @mouseleave="isHovered = false"
            >
                <motion.div
                    class="list-selector-button-rest"
                    :animate="{ opacity: isHovered || isOpen ? 1 : 0 }"
                    :transition="Dynamics.quick"
                />
                <span class="list-selector-value" :class="{ hidden: isOpen }">{{ selectedLabel }}</span>
                <div class="list-selector-icon">
                    <AnimatePresence>
                        <motion.div v-if="!isOpen" key="list"
                            class="list-selector-icon-item"
                            :initial="{ opacity: 0, y: -5 }"
                            :animate="{ opacity: 1, y: 0 }"
                            :exit="{ opacity: 0, y: -5 }"
                            :transition="{ duration: 0.3, ease: [1, 0, 0.42, 1] }">
                            <Icons kind="list" size="small" />
                        </motion.div>
                        <motion.div v-else key="arrow"
                            class="list-selector-icon-item"
                            :initial="{ opacity: 0, y: 5 }"
                            :animate="{ opacity: 1, y: 0 }"
                            :exit="{ opacity: 0, y: 5 }"
                            :transition="{ duration: 0.3, ease: [1, 0, 0.42, 1] }">
                            <Icons kind="arrow-left" size="small" />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <!-- Polygon stroke -->
            <svg
                v-if="svgPoints"
                class="track-stroke"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <polygon
                    :points="svgPoints"
                    fill="none"
                    stroke="#525252"
                    stroke-width="0.4"
                    vector-effect="non-scaling-stroke"
                />
            </svg>
        </div>

        <!-- Dropdown teleported to body to escape overflow: clip -->
        <Teleport to="body">
            <div v-if="isOpen" class="list-selector-dropdown" :class="{ entering: isEntering }" :style="dropdownStyle">
                <div
                    ref="scrollerRef"
                    class="list-selector-scroller"
                    @scroll="onScroll"
                    @wheel.prevent="onWheel"
                >
                    <div class="list-selector-options" :style="{ height: totalContentHeight + 'px' }">
                        <div
                            v-for="item in renderedItems"
                            :key="item.virtualIndex"
                            class="list-selector-option"
                            :data-original-index="item.originalIndex"
                            :style="{ top: item.top + 'px', '--proximity': item.proximity }"
                            @click="onOptionClick"
                        >
                            {{ item.label }}
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.list-selector-root {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.list-selector-track {
    position: relative;
    display: flex;
    align-items: center;
    width: 245px;
    height: 24px;
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
    background: var(--black-1-a);
    clip-path: polygon(
        6px 0%, 100% 0%,
        100% calc(100% - 6px),
        calc(100% - 6px) 100%,
        0% 100%, 0% 6px
    );
}

.list-selector-label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    overflow: hidden;
    min-width: 0;
}

.list-selector-label-text {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    text-align: center;
    line-height: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-selector-button {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    cursor: pointer;
    overflow: hidden;
    min-width: 0;
    background: var(--black-1);
}

.list-selector-button-rest {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.05);
    pointer-events: none;
}

.list-selector-value {
    position: relative;
    flex: 1;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    text-align: center;
    line-height: normal;
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-selector-value.hidden {
    opacity: 0;
}

.list-selector-icon {
    position: absolute;
    right: var(--space-3);
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.list-selector-icon-item {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
}

.track-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
}

</style>

<style>
/* Unscoped: dropdown is teleported to body */
.list-selector-dropdown {
    overflow: visible;
    pointer-events: none;
}

.list-selector-scroller {
    height: calc(7 * 24px);
    width: 100%;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    scrollbar-width: none;
    pointer-events: auto;
    mask: linear-gradient(
        transparent,
        #fff 2rem calc(100% - 2rem),
        transparent
    ) 0 0 / 100% 100% no-repeat;
    -webkit-mask: linear-gradient(
        transparent,
        #fff 2rem calc(100% - 2rem),
        transparent
    ) 0 0 / 100% 100% no-repeat;
}

.list-selector-scroller::-webkit-scrollbar {
    display: none;
}

.list-selector-options {
    position: relative;
}

.list-selector-option {
    --proximity: 3;
    position: absolute;
    left: 0;
    right: 0;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    cursor: pointer;
    scroll-snap-align: center;
    user-select: none;
    background: transparent;
    transform: translate3d(0, 0, 0);
    text-transform: capitalize;

    /* Proximity-driven: 0 = center (full visible), 3 = edge (invisible) */
    opacity: calc(1 - var(--proximity) * 0.25);
    filter: blur(calc(max(0, var(--proximity) - 1) * 1.5px));
    transition:
        opacity 0.2s calc(var(--proximity) * 0.08s) ease-out,
        filter 0.2s calc(var(--proximity) * 0.08s) ease-out;
}

/* Entering state: all options start invisible */
.entering .list-selector-option {
    opacity: 0 !important;
    filter: blur(4px) !important;
    transition: none;
}
</style>
