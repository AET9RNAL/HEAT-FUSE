<script setup lang="ts">
import eGameCanvas from './eGameCanvas.vue'

</script>

<template>
    <div class="e-game-changes">
        <eGameCanvas />
    </div>
</template>

<style scoped>
.e-game-changes {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 360px;
    width: 100%;
}
</style>
