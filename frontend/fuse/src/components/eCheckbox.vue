<script setup lang="ts">
import { Rive, Layout, Fit, Alignment } from "@rive-app/canvas";
import riveFile from '../rive/eCheckbox.riv?url'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useSuspension } from '../composables/useSuspension'

const { isSuspended } = useSuspension()

interface Props {
    width?: number
    height?: number
    modelValue?: boolean
    isDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    width: 24,
    height: 24,
    modelValue: false,
    isDisabled: false
})

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
}>()

const riveCanvas = ref<HTMLCanvasElement | null>(null)
let riveInstance: Rive | null = null
let isOnProperty: any = null
let isDisabledProperty: any = null
let lastIsOnValue: boolean = false

// Watch for external v-model changes
watch(() => props.modelValue, (newValue) => {
    if (isOnProperty && isOnProperty.value !== newValue) {
        isOnProperty.value = newValue
    }
})

// Poll ViewModel for changes (Rive doesn't have onChange callback for VM properties)
function startPolling() {
    const checkValue = () => {
        if (isOnProperty) {
            const currentValue = isOnProperty.value
            if (currentValue !== lastIsOnValue) {
                if (props.isDisabled) {
                    // Revert the Rive-internal change
                    isOnProperty.value = lastIsOnValue
                } else {
                    lastIsOnValue = currentValue
                    emit('update:modelValue', currentValue)
                }
            }
        }
        if (riveInstance) {
            if (isSuspended.value) setTimeout(checkValue, 500)
            else requestAnimationFrame(checkValue)
        }
    }
    requestAnimationFrame(checkValue)
}

onMounted(() => {
    if (riveCanvas.value) {
        riveInstance = new Rive({
            src: riveFile,
            artboard: "CHECKBOARD",
            canvas: riveCanvas.value,
            stateMachines: "checkboxEngine",
            autoplay: true,
            autoBind: true,
            layout: new Layout({
                fit: Fit.Contain,
                alignment: Alignment.Center
            }),
            onLoad: () => {
                riveInstance?.resizeDrawingSurfaceToCanvas()

                // Access ViewModel's isOn property
                const vmi = (riveInstance as any)?.viewModelInstance
                if (vmi) {
                    isOnProperty = vmi.boolean("isOn")
                    isDisabledProperty = vmi.boolean("isDisabled")
                    if (isOnProperty) {
                        // Set initial value from prop
                        isOnProperty.value = props.modelValue
                        lastIsOnValue = props.modelValue
                        startPolling()
                    }
                    if (isDisabledProperty) {
                        isDisabledProperty.value = props.isDisabled
                    }
                }
            },
            onLoadError: () => {
                console.error("Failed to load: " + riveFile)
            },
        })
    }
})

onUnmounted(() => {
    riveInstance?.cleanup()
    riveInstance = null
})


</script>

<template>
    <canvas
        ref="riveCanvas"
        :width="props.width"
        :height="props.height"
        class="rive-canvas"
        :class="{ disabled: props.isDisabled }"
    ></canvas>
</template>

<style scoped>
.rive-canvas {
    cursor: pointer;
    touch-action: none;
}

.rive-canvas.disabled {
    cursor: not-allowed;
}
</style>