<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import type { Channel } from '../../utils/registry-api'

defineProps<{ channel: Channel }>()
const { t } = useI18n()
</script>

<template>
    <span class="mp-chip" :class="{ 'mp-chip--live': channel === 'release', 'mp-chip--info': channel === 'beta', 'mp-chip--review': channel === 'alpha' }">
        {{ t(`registry.channel.${channel}`) }}
    </span>
</template>

<style scoped src="./mp.css"></style>
