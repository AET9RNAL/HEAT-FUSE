<script setup lang="ts">
import Titlebar from './components/Titlebar.vue'
import AppMain from './components/AppMain.vue'
import { useAppStore } from './stores/app'
import { useSuspension } from './composables/useSuspension'
import { useFuseControl } from './composables/useFuseControl'
import { useFuseLogs } from './composables/useFuseLogs'
import { onMounted } from 'vue'
import packageJson from '../package.json'

const appStore = useAppStore()
useSuspension()
useFuseControl()
const { register: registerLogs } = useFuseLogs()

onMounted(() => {
    registerLogs()
    appStore.appVersion = packageJson.version
    appStore.fetchBackendVersion()
    const dir = appStore.gameDirPaths[appStore.gamePlatform]
    if (dir) appStore.scanGameDir(dir)
})
</script>

<template>
  <Titlebar v-once />
  <AppMain />
</template>
