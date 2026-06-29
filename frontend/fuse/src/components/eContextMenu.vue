<script setup lang="ts">
import { ref, computed, toRef, watch, onUnmounted, nextTick, type MaybeRef } from 'vue'
import Icons from './Icons.vue'
import type { IconKind, IconSize } from './Icons.vue'
import { useKeystroke } from '../composables/useKeystroke'

export interface MenuOption {
    label: string
    icon: IconKind
    iconColor?: string
    iconSize?: IconSize
    action: () => void
    /** When true, this option is shown in compact mode during keystroke hold */
    shortcut?: boolean
}

export type MenuPlacement = 'bottom' | 'right'

interface Props {
    options: MenuOption[]
    /** Where the menu opens relative to the trigger */
    placement?: MenuPlacement
    triggerIcon?: IconKind
    triggerIconSize?: IconSize
    keystrokeTarget?: HTMLElement | null
    keystrokeKey?: string | string[]
    /** 'press' fires shortcut action once; 'hold' tracks held state for shortcut icon */
    keystrokeMode?: 'press' | 'hold'
    /** Whether the keystroke listener is active */
    keystrokeActive?: MaybeRef<boolean>
}

const props = withDefaults(defineProps<Props>(), {
    placement: 'bottom',
    triggerIcon: 'more',
    triggerIconSize: 'small',
    keystrokeTarget: null,
    keystrokeKey: undefined,
    keystrokeMode: 'hold',
    keystrokeActive: true,
})

const show = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuPos = ref({ top: 0, left: undefined as number | undefined, right: undefined as number | undefined })

const shortcutOptions = computed(() => props.options.filter(o => o.shortcut))

// Use the provided keystroke target, or fall back to own container
const keystrokeEnabled = !!props.keystrokeKey

const { isHovering, isPressed } = keystrokeEnabled
    ? useKeystroke({
        target: toRef(props, 'keystrokeTarget') as any,
        key: props.keystrokeKey!,
        mode: props.keystrokeMode,
        active: props.keystrokeActive,
        onStroke: props.keystrokeMode === 'press'
            ? () => { shortcutOptions.value[0]?.action() }
            : undefined,
    })
    : { isHovering: ref(false), isPressed: ref(false) }

const CUT = 8
const menuEl = ref<HTMLElement | null>(null)
const menuW = ref(0)
const menuH = ref(0)
let ro: ResizeObserver | null = null

watch(menuEl, (el) => {
    ro?.disconnect()
    ro = null
    menuW.value = 0
    menuH.value = 0
    if (!el) return
    ro = new ResizeObserver(([entry]) => {
        const box = entry.borderBoxSize?.[0]
        menuW.value = box ? box.inlineSize : entry.contentRect.width
        menuH.value = box ? box.blockSize  : entry.contentRect.height
    })
    ro.observe(el)
})
function updateMenuPos() {
    if (!show.value || !triggerRef.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0

    if (props.placement === 'bottom') {
        const w = menuEl.value?.offsetWidth ?? 0
        menuPos.value = {
            top: rect.bottom + scrollY,
            left: rect.right - w + scrollX,
            right: undefined,
        }
    } else {
        const h = menuEl.value?.offsetHeight ?? 0
        menuPos.value = {
            top: rect.top + rect.height / 2 - h / 2 + scrollY,
            left: rect.right + scrollX,
            right: undefined,
        }
    }
}

watch(show, async (val) => {
    if (val) {
        await nextTick()
        requestAnimationFrame(updateMenuPos)
    }
})

watch([menuW, menuH], () => {
    if (show.value) updateMenuPos()
})

function onLayoutChange() {
    if (show.value) updateMenuPos()
}
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

let leaveTimer: ReturnType<typeof setTimeout> | null = null

function onMenuEnter() {
    if (leaveTimer) {
        clearTimeout(leaveTimer)
        leaveTimer = null
    }
}

function onMenuLeave() {
    leaveTimer = setTimeout(() => {
        show.value = false
        leaveTimer = null
    }, 50)
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
    if (leaveTimer) clearTimeout(leaveTimer)
})

const menuSvgPoints = computed(() => {
    const w = menuW.value
    const h = menuH.value
    if (!w || !h) return ''
    const cx = (CUT / w) * 100
    const cy = (CUT / h) * 100
    return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`
})

function close() {
    show.value = false
}

function executeOption(option: MenuOption) {
    show.value = false
    option.action()
}

defineExpose({ close, isHovering, isPressed })
</script>

<template>
    <div ref="targetRef" class="more-menu-container" @click.stop @mouseenter="onMenuEnter" @mouseleave="onMenuLeave">
        <!-- Shortcut mode: show shortcut icons when key held + hovering -->
        <template v-if="keystrokeEnabled && isPressed && isHovering && shortcutOptions.length">
            <span
                v-for="(opt, i) in shortcutOptions"
                :key="i"
                class="shortcut-btn"
                @click.stop="executeOption(opt)"
            >
                <Icons
                    :kind="opt.icon"
                    :size="opt.iconSize ?? 'small'"
                    :color="opt.iconColor ?? ''"
                />
            </span>
        </template>
        <!-- Normal more menu -->
        <template v-else>
            <span class="more-btn" ref="triggerRef" @click.stop="show = !show">
                <Icons :kind="triggerIcon" :size="triggerIconSize"/>
            </span>
        </template>
    </div>
    <Teleport to="body">
        <div v-if="show" ref="menuEl" class="more-menu" :class="'placement-' + placement" :style="{ top: menuPos.top + 'px', left: menuPos.left !== undefined ? menuPos.left + 'px' : 'auto', right: menuPos.right !== undefined ? menuPos.right + 'px' : 'auto' }" @click.stop @mouseenter="onMenuEnter" @mouseleave="onMenuLeave">
            <span
                v-for="(option, i) in options"
                :key="i"
                class="menu-item"
                @click="executeOption(option)"
            >
                <Icons :kind="option.icon" :size="option.iconSize ?? 'small'" :color="option.iconColor ?? ''"/>
                <span class="menu-item-label">{{ option.label }}</span>
            </span>
            <svg
                v-if="menuSvgPoints"
                class="menu-polygon-stroke"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <polygon
                    :points="menuSvgPoints"
                    fill="none"
                    stroke="#525252"
                    stroke-width="0.4"
                    vector-effect="non-scaling-stroke"
                />
            </svg>
        </div>
    </Teleport>
</template>

<style scoped>
.more-menu-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.more-btn {
    cursor: pointer;
    display: flex;
    align-items: center;
    opacity: 0.6;
    transition: opacity 0.15s;
    padding: 8px;
    margin: -8px;
}

.more-btn:hover {
    opacity: 1;
}

.shortcut-btn {
    cursor: pointer;
    display: flex;
    align-items: center;
    opacity: 0.6;
    transition: opacity 0.15s;
}

.shortcut-btn:hover {
    opacity: 1;
}

.more-menu {
    position: absolute;
    z-index: 1000;
    min-width: 80px;
    padding: var(--space-1);
    background-color: var(--black-1-a);
    clip-path: polygon(
        8px 0%,
        100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%,
        0% 8px
    );
}

.menu-polygon-stroke {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
}

/* Placement: bottom (default) */
.placement-bottom::before {
    content: '';
    position: absolute;
    bottom: 100%;
    right: 0;
    width: 50%;
    height: 18px;
}

/* Placement: right */
.placement-right::before {
    content: '';
    position: absolute;
    right: 100%;
    top: 0;
    width: 18px;
    height: 100%;
}

.menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-secondary);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-main);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    clip-path: polygon(
        4px 0%, 100% 0%,
        100% calc(100% - 4px), calc(100% - 4px) 100%,
        0% 100%, 0% 4px
    );
}

.menu-item:hover {
    background-color: var(--black-3);
}

.menu-item-label {
    pointer-events: none;
}
</style>
