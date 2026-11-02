<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../composables/useI18n'
import type { Status, FileState } from '../../utils/registry-api'

const props = defineProps<{ status: Status; listed?: boolean; state?: FileState }>()
const { t } = useI18n()

// A file the Worker has not checked yet, or that failed the check, shows that first.
const key = computed(() => {
    if (props.state === 'invalid') return 'invalid'
    if (props.state && props.state !== 'ready') return 'checking'
    if (props.status === 'approved') return props.listed === false ? 'hidden' : 'live'
    if (props.status === 'pending_review') return 'review'
    if (props.status === 'rejected') return 'changes'
    return props.status
})

const tone = computed(() => ({
    live: 'mp-chip--live', review: 'mp-chip--review', checking: 'mp-chip--review',
    changes: 'mp-chip--error', invalid: 'mp-chip--error',
} as Record<string, string>)[key.value] ?? '')
</script>

<template>
    <span class="mp-chip" :class="tone">◆ {{ t(`registry.status.${key}`) }}</span>
</template>

<style scoped src="./mp.css"></style>
