<script setup lang="ts">
import { Rive, Layout, Fit, Alignment } from "@rive-app/canvas";
import riveFile from '../rive/eProgress.riv?url'
import { onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
    progress?: number
    width?: number
    height?: number
    fill?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    progress: 0,
    width: 88,
    height: 16,
    fill: false,
})

const riveCanvas = ref<HTMLCanvasElement | null>(null)
let riveInstance: Rive | null = null
let progressProperty: any = null

function syncProgress(value: number) {
    if (!progressProperty) return
    progressProperty.value = Math.min(1, Math.max(0, value))
}

watch(() => props.progress, syncProgress)

onMounted(() => {
    if (!riveCanvas.value) return
    riveInstance = new Rive({
        src: riveFile,
        artboard: "PROGRESSBOARD",
        canvas: riveCanvas.value,
        stateMachines: "progressEngine",
        autoplay: true,
        autoBind: true,
        layout: new Layout({
            fit: props.fill ? Fit.Fill : Fit.Contain,
            alignment: Alignment.Center,
        }),
        onLoad: () => {
            riveInstance?.resizeDrawingSurfaceToCanvas()
            const vmi = (riveInstance as any)?.viewModelInstance
            if (vmi) {
                progressProperty = vmi.number("progress")
                if (progressProperty) syncProgress(props.progress)
            }
        },
        onLoadError: () => {
            console.error("Failed to load: " + riveFile)
        },
    })
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
    display: block;
}
</style>
