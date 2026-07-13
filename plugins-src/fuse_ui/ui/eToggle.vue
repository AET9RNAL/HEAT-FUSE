<script setup lang="ts">
import { Rive, Layout, Fit, Alignment } from "@rive-app/canvas";
import { onMounted, onUnmounted, ref, watch } from 'vue'
// Asset imports return their served URL at runtime (loader handleModule),
// mirroring Vite's `?url`. No host helper or plugin-id needed.
import riveFile from './eToggle.riv'

interface Props {
    width?: number
    height?: number
    modelValue?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    width: 64,
    height: 32,
    modelValue: false
})

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
}>()

const riveCanvas = ref<HTMLCanvasElement | null>(null)
let riveInstance: Rive | null = null
let isOnProperty: any = null
let lastIsOnValue: boolean = false
let isRiveReady = false
let isSyncing = false  // Prevent feedback loops

// Sync prop value to Rive
function syncToRive(value: boolean) {
    if (!isOnProperty || isOnProperty.value === value) return
    isSyncing = true
    isOnProperty.value = value
    lastIsOnValue = value
    // Let Rive state machine settle before allowing polling to emit
    setTimeout(() => { isSyncing = false }, 100)
}

// Watch for external v-model changes
watch(() => props.modelValue, (newValue) => {
    if (isRiveReady) {
        syncToRive(newValue)
    }
})

// Poll ViewModel for changes (Rive doesn't have onChange callback for VM properties)
function startPolling() {
    const checkValue = () => {
        if (isOnProperty && !isSyncing) {
            const currentValue = isOnProperty.value
            if (currentValue !== lastIsOnValue) {
                lastIsOnValue = currentValue
                emit('update:modelValue', currentValue)
            }
        }
        if (riveInstance) requestAnimationFrame(checkValue)
    }
    requestAnimationFrame(checkValue)
}

onMounted(() => {
    if (riveCanvas.value) {
        riveInstance = new Rive({
            src: riveFile,
            artboard: "TOGGLEBOARD",
            canvas: riveCanvas.value,
            stateMachines: "toggleEngine",
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
                    if (isOnProperty) {
                        // Delay initial sync to let Rive state machine fully initialize
                        setTimeout(() => {
                            isOnProperty.value = props.modelValue
                            lastIsOnValue = props.modelValue
                            isRiveReady = true
                            startPolling()
                        }, 50)
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
    ></canvas>
</template>

<style scoped>
.rive-canvas {
    cursor: pointer;
    touch-action: none;
}
</style>
