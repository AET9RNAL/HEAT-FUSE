<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../composables/useI18n'
import eMaterialButton from './eMaterialButton.vue'
import { useExtendedAuthStore } from '../stores/extendedauth'

const { t } = useI18n()

interface DeviceRecord {
    device_fingerprint: string
    device_name: string | null
    os: string | null
    ip_address: string | null
    is_active: boolean
    last_active_at: string | null
    created_at: string | null
}

const props = defineProps<{
    device: DeviceRecord
    loading?: boolean
}>()

const emit = defineEmits<{
    revoke: [fingerprint: string]
}>()

const exStore = useExtendedAuthStore()

const isCurrent = computed(() => props.device.device_fingerprint === exStore.deviceFingerprint)

const lastActiveFormatted = computed(() => {
    if (!props.device.last_active_at) return t('appaccount.unknown')
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(new Date(props.device.last_active_at))
})
</script>

<template>
    <div class="device-row" :class="{ current: isCurrent }">
        <div class="device-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="3" width="18" height="12" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
                <path d="M6 17h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M10 15v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
        </div>
        <div class="device-info">
            <div class="device-name-row">
                <span class="device-name">{{ device.device_name ?? t('appaccount.unknown') }}</span>
                <span v-if="isCurrent" class="current-badge">{{ t('appaccount.currentDevice') }}</span>
            </div>
            <span class="device-meta">{{ device.os ?? '' }}</span>
            <span class="device-last-active">{{ t('appaccount.lastActive') }}: {{ lastActiveFormatted }}</span>
        </div>
        <eMaterialButton
            v-if="!isCurrent"
            :label="t('appaccount.revoke')"
            variant="secondary"
            :disabled="loading"
            @click="emit('revoke', device.device_fingerprint)"
        />
    </div>
</template>

<style scoped>
.device-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--black-2-a);
    clip-path: polygon(4px 0%, 100% 0%, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0% 100%, 0% 4px);
}

.device-row.current {
    background: var(--black-3-a);
}

.device-icon {
    color: var(--text-muted);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
}

.device-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.device-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
}

.device-name {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.current-badge {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--accent-200);
    background: rgba(100, 255, 150, 0.08);
    padding: 1px var(--space-1);
    flex-shrink: 0;
}

.device-meta,
.device-last-active {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}
</style>
