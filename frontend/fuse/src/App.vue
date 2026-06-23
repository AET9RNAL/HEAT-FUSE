<script setup lang="ts">
import Titlebar from './components/Titlebar.vue'
import AppMain from './components/AppMain.vue'
import { useAppStore } from './stores/app'
import { useSuspension } from './composables/useSuspension'
import { onMounted } from 'vue'
import packageJson from '../package.json'

const appStore = useAppStore()
useSuspension()

onMounted(() => {
    appStore.appVersion = packageJson.version
})
</script>

<template>
  <Titlebar v-once />
  <AppMain />
</template>
