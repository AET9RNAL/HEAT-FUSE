<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { motion } from 'motion-v'
import Icons, { type IconKind, type IconSize } from './Icons.vue'
import eToggle from './eToggle.vue'
import eCheckbox from './eCheckbox.vue'
import eSwitch, { type eSwitchOption } from './eSwitch.vue'
import eDirSelector from './eDirSelector.vue'

export type SettingVariant = 'primary' | 'secondary'
export type SettingControl = 'toggle' | 'checkbox' | 'switch' | 'dir'

/**
 * Corner notch state.
 *  success - the setting is applied and valid
 *  warning - the input is absent
 *  error   - the input could not be set, or something depending on it is blocked
 *  none    - no notch
 */
export type SettingStatus = 'none' | 'success' | 'warning' | 'error'

const props = withDefaults(defineProps<{
    icon: IconKind
    iconColor?: string
    iconSize?: IconSize
    label: string
    description?: string
    modelValue?: SettingVariant
    type?: SettingControl
    value?: boolean | string
    options?: eSwitchOption[]
    placeholder?: string
    disabled?: boolean
    status?: SettingStatus
    /** Bump to replay the notch ripple - draws the eye when this setting blocked something. */
    attention?: number
}>(), {
    iconColor: '',
    iconSize: 'large',
    description: '',
    modelValue: 'primary',
    type: 'toggle',
    value: false,
    options: () => [],
    placeholder: undefined,
    disabled: false,
    status: 'none',
    attention: 0,
})

const emit = defineEmits<{ 'update:value': [value: boolean | string] }>()

const isSecondary = computed(() => props.modelValue === 'secondary')

// Secondary rows only ever expose a checkbox
const control = computed<SettingControl>(() => isSecondary.value ? 'checkbox' : props.type)

const textValue = computed(() => typeof props.value === 'string' ? props.value : '')

const hovered = ref(false)
const controlEl = ref<HTMLElement | null>(null)

// Remounting on each bump restarts the ripple; cleared when it finishes so a
// repeat of the same signal still replays.
const RIPPLE_MS = 1300
const RIPPLE = { duration: 0.42, ease: 'easeOut' as const, repeat: 2 }
const rippleKey = ref(0)
let rippleTimer: ReturnType<typeof setTimeout> | null = null

// immediate: the parent drains pending requests during its own setup, so the
// bumped value can already be here as the initial prop - a change-only watch
// would never see it.
watch(() => props.attention, (next, prev) => {
    if (!next || next === prev || props.status === 'none') return
    rippleKey.value = next
    if (rippleTimer) clearTimeout(rippleTimer)
    rippleTimer = setTimeout(() => { rippleKey.value = 0; rippleTimer = null }, RIPPLE_MS)
}, { immediate: true })

// The whole row is the hit target - a click anywhere drives the control
function onRowClick(event: MouseEvent) {
    if (props.disabled) return
    if (controlEl.value?.contains(event.target as Node)) return

    if (control.value === 'toggle' || control.value === 'checkbox') {
        emit('update:value', !props.value)
        return
    }
    // switch / dir own their click handling, so hand the event down
    const target = controlEl.value?.firstElementChild as HTMLElement | undefined
    target?.click()
}

const CUT = 6
onUnmounted(() => {
    if (rippleTimer) clearTimeout(rippleTimer)
})
</script>

<template>
    <div
        class="e-setting"
        :class="[
            isSecondary ? 'secondary' : 'primary',
            { hovered, disabled },
        ]"
        v-tip="isSecondary && description ? description : undefined"
        @mouseenter="hovered = !disabled"
        @mouseleave="hovered = false"
        @click="onRowClick"
    >
        <!-- Fill and chamfer live here so the stroke overlay isn't clipped by them -->
        <div class="setting-surface" />

        <div class="setting">
            <Icons :kind="icon" :size="iconSize" :color="iconColor" />
            <div class="setting-body">
                <span class="setting-label">{{ label }}</span>
                <span v-if="!isSecondary && description" class="setting-description">{{ description }}</span>
            </div>
        </div>

        <div ref="controlEl" class="setting-control" :class="`is-${control}`">
            <slot name="control">
                <eToggle
                    v-if="control === 'toggle'"
                    :model-value="!!value"
                    :width="48"
                    :height="24"
                    @update:model-value="emit('update:value', $event)"
                />
                <eCheckbox
                    v-else-if="control === 'checkbox'"
                    :model-value="!!value"
                    :width="24"
                    :height="24"
                    @update:model-value="emit('update:value', $event)"
                />
                <eSwitch
                    v-else-if="control === 'switch'"
                    :options="options"
                    :model-value="textValue"
                    @update:model-value="emit('update:value', $event)"
                />
                <eDirSelector
                    v-else-if="control === 'dir'"
                    :model-value="textValue"
                    :placeholder="placeholder"
                    @update:model-value="emit('update:value', $event)"
                />
                </slot>
        </div>


        <!-- Own 1:1 viewBox: the outline svg is stretched non-uniformly, which
             would squash the glow vertically -->
        <svg
            v-if="status !== 'none'"
            class="setting-corner-mark"
            :class="`status-${status}`"
            :width="CUT"
            :height="CUT"
            :viewBox="`0 0 ${CUT} ${CUT}`"
            xmlns="http://www.w3.org/2000/svg"
        >
            <polyline
                :points="`${CUT},0 0,0 0,${CUT}`"
                fill="none"
                stroke="var(--setting-corner)"
                stroke-width="0.8"
            />
        </svg>

        <!-- Transient attention ripple, keyed so each bump replays it -->
        <motion.svg
            v-if="rippleKey && status !== 'none'"
            :key="rippleKey"
            class="setting-corner-mark setting-corner-ripple"
            :class="`status-${status}`"
            :width="CUT"
            :height="CUT"
            :viewBox="`0 0 ${CUT} ${CUT}`"
            xmlns="http://www.w3.org/2000/svg"
            :initial="{ scale: 1, opacity: 0.9 }"
            :animate="{ scale: 3.2, opacity: 0 }"
            :transition="RIPPLE"
        >
            <polyline
                :points="`${CUT},0 0,0 0,${CUT}`"
                fill="none"
                stroke="var(--setting-corner)"
                stroke-width="1"
            />
        </motion.svg>
    </div>
</template>

<style scoped>
.e-setting {
    --setting-stroke: var(--base-600);
    --setting-corner: var(--accent-200);

    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-4);
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
}

/* No background transition: the hover glow is a drop-shadow of the alpha
   silhouette, so the fill has to be solid on the same frame the glow appears -
   fading it in makes the glow trace the glyphs first. */
.setting-surface {
    position: absolute;
    inset: 0;
    z-index: 0;
    box-sizing: border-box;
    background: var(--black-2);
    border: 1px solid var(--setting-stroke);
    corner-shape: bevel;
    border-radius: 6px 0 6px 0;
}

.e-setting.primary   { min-height: 64px; }
.e-setting.secondary { min-height: 40px; }

/* Secondary rows are flat until hovered */
.e-setting.secondary {
    --setting-stroke: transparent;
}

.e-setting.secondary .setting-surface {
    background: transparent;
}

.e-setting.secondary.hovered .setting-surface {
    background: var(--black-2);
}

/* Hover is carried by the SVG outline, which traces the chamfer exactly */
.e-setting.hovered {
    --setting-stroke: var(--tea-green);
}

.e-setting.disabled {
    opacity: 0.4;
    pointer-events: none;
    cursor: not-allowed;
}

/* Content sits above the absolutely-positioned surface */
/* basis auto, not 0: the label and description size themselves off their own
   content, so a narrow row shrinks the control instead of starving the text. */
.setting {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: var(--space-3);
}

.setting-control {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
}

/* eDirSelector is width:100%, so cap the wrapper or it swallows the row.
   The lopsided shrink factor makes this give up width long before the label
   does; it stops at min-width, which still fits an ellipsised path. */
.setting-control.is-dir {
    flex: 0 999 200px;
    min-width: 96px;
}

.setting-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-1);
    min-width: 0;
}

.setting-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-muted);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.setting-description {
    font-family: var(--font-microcopy);
    font-size: var(--secondary-font-size-4);
    font-weight: var(--font-weight-3);
    color: var(--text-muted);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}


/* Glow tracks whatever colour the marker is; scoped to the polyline so the
   main outline stays crisp. */
.setting-corner-mark.status-success { --setting-corner: var(--success-color); }
.setting-corner-mark.status-warning { --setting-corner: var(--warning-color); }
.setting-corner-mark.status-error   { --setting-corner: var(--error-base); }

.setting-corner-mark {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
    filter:
        drop-shadow(0px 0px 1.5px var(--setting-corner))
        drop-shadow(0 0 4px var(--setting-corner));
}
</style>
