<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useExtendedAuthStore } from '../stores/extendedauth'
import { useAppStore } from '../stores/app'
import { useI18n } from '../composables/useI18n'
import { supabase } from '../composables/supabase-client'
import eDevice from './eDevice.vue'
import eButton from './eButton.vue'
import eInputField from './eInputField.vue'
import eCheckbox from './eCheckbox.vue'
import { eventBus } from '../events/eventBus'

const auth = useAuthStore()
const exStore = useExtendedAuthStore()
const appStore = useAppStore()
const { t } = useI18n()

const usernameInput = ref(appStore.username ?? '')

const isUsernameDirty = computed(() =>
    usernameInput.value.trim() !== (appStore.username ?? '')
)

watch(isUsernameDirty, (dirty) => {
    if (dirty) {
        eventBus.emit('modal:pending', {
            label: t('appaccount.usernameUnsaved'),
            saveLabel: t('appaccount.usernameSave'),
            cancelLabel: t('common.cancel'),
            onConfirm: async () => {
                const result = await appStore.saveUsername(usernameInput.value)
                if (!result.success) {
                    eventBus.emit('notification', { message: result.error ?? 'Failed to save username' })
                    throw new Error(result.error)
                }
            },
            onCancel: () => { usernameInput.value = appStore.username ?? '' },
        })
    } else {
        eventBus.emit('modal:dismiss')
    }
})

onUnmounted(() => {
    if (isUsernameDirty.value) eventBus.emit('modal:dismiss')
})

const revokingFingerprint = ref<string | null>(null)
const copiedEmail = ref(false)
const confirmingDelete = ref(false)
const deletingAccount = ref(false)

const createdFormatted = ref('')

onMounted(async () => {
    await exStore.fetchAllDevices()
    if (exStore.userCreatedAt) {
        createdFormatted.value = new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }).format(new Date(exStore.userCreatedAt))
    }
    fetchApiKeys()
})

async function handleRevoke(fingerprint: string) {
    revokingFingerprint.value = fingerprint
    const result = await exStore.revokeDevice(fingerprint)
    if (!result.success) {
        eventBus.emit('notification', {
            title: 'Error',
            message: result.error ?? 'Failed to remove device',
        })
    }
    revokingFingerprint.value = null
}

async function handleChangePassword() {
    const result = await auth.changePassword()
    if (result.success) {
        eventBus.emit('notification', {
            title: t('appaccount.changePassword'),
            message: 'Reset link sent to your email.',
        })
    }
}

async function handleSignOutAll() {
    await auth.signOutAllSessions()
}

async function handleDeleteAccount() {
    deletingAccount.value = true
    const result = await auth.deleteAccount()
    if (!result.success) {
        eventBus.emit('notification', {
            title: 'Error',
            message: result.error ?? 'Failed to delete account',
        })
        confirmingDelete.value = false
    }
    deletingAccount.value = false
}

function copyEmail() {
    if (!exStore.userEmail) return
    navigator.clipboard.writeText(exStore.userEmail).then(() => {
        copiedEmail.value = true
        setTimeout(() => { copiedEmail.value = false }, 2000)
    })
}

// API key management

interface ApiKey {
    id: string
    key_prefix: string
    label: string
    created_at: string
    last_used_at: string | null
    is_active: boolean
}

const apiKeys = ref<ApiKey[]>([])
const loadingKeys = ref(false)
const mintingKey = ref(false)
const newKeyLabel = ref('')
const newlyMintedKey = ref<string | null>(null)
const copiedKey = ref(false)

async function fetchApiKeys() {
    loadingKeys.value = true
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase
            .from('api_keys')
            .select('id, key_prefix, label, created_at, last_used_at, is_active')
            .eq('requested_by', user.id)
            .order('created_at', { ascending: false })
        if (error) throw error
        apiKeys.value = (data ?? []) as ApiKey[]
    } catch {
        // RLS may block if not admin/founder — silently ignore
        apiKeys.value = []
    } finally {
        loadingKeys.value = false
    }
}

async function handleMintKey() {
    const label = newKeyLabel.value.trim()
    if (!label) return
    mintingKey.value = true
    try {
        const { data, error } = await supabase.functions.invoke('api-v1-mint', {
            method: 'POST',
            body: { label },
        })
        if (error) {
            eventBus.emit('notification', {
                title: 'Error',
                message: (error as Error).message ?? 'Failed to create API key',
            })
            return
        }
        newlyMintedKey.value = (data as { api_key: string }).api_key
        newKeyLabel.value = ''
        await fetchApiKeys()
    } finally {
        mintingKey.value = false
    }
}

async function handleRevokeKey(id: string) {
    const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id)
    if (error) {
        eventBus.emit('notification', {
            title: 'Error',
            message: 'Failed to revoke key',
        })
        return
    }
    apiKeys.value = apiKeys.value.filter(k => k.id !== id)
}

function copyNewKey() {
    if (!newlyMintedKey.value) return
    navigator.clipboard.writeText(newlyMintedKey.value).then(() => {
        copiedKey.value = true
        setTimeout(() => { copiedKey.value = false }, 2000)
    })
}

function dismissNewKey() {
    newlyMintedKey.value = null
    copiedKey.value = false
}
</script>

<template>
    <div class="account-settings">
        <!-- Profile card -->
        <section class="settings-card">
            <div class="card-header">
                <span class="card-title">{{ t('appaccount.profileInfo') }}</span>
                <span class="card-desc">{{ t('appaccount.profileInfoDesc') }}</span>
            </div>

            <div class="card-row">
                <span class="row-label">{{ t('appaccount.emailAddress') }}</span>
                <div class="row-value-row">
                    <span class="row-value">{{ exStore.userEmail ?? '—' }}</span>
                    <button class="copy-btn" @click="copyEmail">
                        {{ copiedEmail ? t('appaccount.copied') : t('appaccount.copy') }}
                    </button>
                </div>
            </div>

            <div class="card-row">
                <span class="row-label">{{ t('appaccount.creationDate') }}</span>
                <span class="row-value">{{ createdFormatted || '—' }}</span>
            </div>

            <div class="card-row username-row">
                <span class="row-label">{{ t('appaccount.username') }}</span>
                <eInputField
                    :label="appStore.username ?? t('appaccount.usernamePlaceholder')"
                    v-model="usernameInput"
                    size="half"
                />
            </div>
        </section>

        <!-- API access card -->
        <section class="settings-card">
            <div class="card-header">
                <span class="card-title">{{ t('appaccount.apiAccess') }}</span>
                <span class="card-desc">{{ t('appaccount.apiAccessDesc') }}</span>
            </div>

            <!-- Opt-in toggle -->
            <div class="card-row">
                <div class="action-text">
                    <span class="action-label">{{ t('appaccount.apiAccessOptIn') }}</span>
                    <span class="action-desc">{{ t('appaccount.apiAccessOptInDesc') }}</span>
                </div>
                <eCheckbox v-model="appStore.allowApiAccess" :width="18" :height="18" />
            </div>

            <!-- Newly minted key reveal -->
            <div v-if="newlyMintedKey" class="key-reveal">
                <span class="key-reveal-title">{{ t('appaccount.apiKeyCreated') }}</span>
                <span class="key-reveal-desc">{{ t('appaccount.apiKeyCreatedDesc') }}</span>
                <div class="key-reveal-value">
                    <code>{{ newlyMintedKey }}</code>
                    <button class="copy-btn" @click="copyNewKey">
                        {{ copiedKey ? t('appaccount.copied') : t('appaccount.copy') }}
                    </button>
                </div>
                <eButton
                    size="half"
                    :label="t('common.ok')"
                    @click="dismissNewKey"
                />
            </div>

            <!-- Mint new key -->
            <div class="card-row" v-if="!newlyMintedKey">
                <span class="row-label">{{ t('appaccount.apiKeyLabel') }}</span>
                <div class="key-mint-row">
                    <eInputField
                        :label="t('appaccount.apiKeyLabelPlaceholder')"
                        v-model="newKeyLabel"
                        size="half"
                    />
                    <eButton
                        size="half"
                        :label="t('appaccount.apiKeyMint')"
                        :systemState="mintingKey ? 'processing' : 'idle'"
                        :disabled="!newKeyLabel.trim() || mintingKey"
                        @click="handleMintKey"
                    />
                </div>
            </div>

            <!-- Existing keys list -->
            <div v-if="loadingKeys" class="devices-empty">
                <span>{{ t('components.loading') }}</span>
            </div>
            <div v-else-if="apiKeys.length > 0" class="keys-list">
                <div v-for="key in apiKeys" :key="key.id" class="key-row">
                    <div class="key-info">
                        <span class="key-prefix">{{ key.key_prefix }}…</span>
                        <span class="key-label">{{ key.label }}</span>
                    </div>
                    <span class="key-date">{{ new Date(key.created_at).toLocaleDateString() }}</span>
                    <eButton
                        size="slim"
                        icon="delete"
                        :disabled="mintingKey"
                        @click="handleRevokeKey(key.id)"
                    />
                </div>
            </div>
        </section>

        <!-- Device management card -->
        <section class="settings-card">
            <div class="card-header">
                <span class="card-title">{{ t('appaccount.deviceManagement') }}</span>
                <span class="card-desc">{{ t('appaccount.deviceManagementDesc') }}</span>
            </div>

            <div v-if="exStore.isFetchingDevices" class="devices-empty">
                <span>{{ t('components.loading') }}</span>
            </div>
            <div v-else class="devices-list">
                <eDevice
                    v-for="device in exStore.allDevices"
                    :key="device.device_fingerprint"
                    :device="device"
                    :loading="revokingFingerprint === device.device_fingerprint"
                    @revoke="handleRevoke"
                />
                <div v-if="exStore.allDevices.length === 0" class="devices-empty">
                    <span>No devices found.</span>
                </div>
            </div>
        </section>

        <!-- Auth / security card -->
        <section class="settings-card">
            <div class="card-header">
                <span class="card-title">{{ t('appaccount.authSecurity') }}</span>
                <span class="card-desc">{{ t('appaccount.authSecurityDesc') }}</span>
            </div>

            <div class="card-actions">
                <div class="action-row">
                    <span class="action-label">{{ t('appaccount.changePassword') }}</span>
                    <eButton
                        size="slim"
                        icon="password"
                        :disabled="auth.loading"
                        @click="handleChangePassword"
                    />
                </div>

                <div class="action-row">
                    <div class="action-text">
                        <span class="action-label">{{ t('appaccount.signOutAllHeader') }}</span>
                        <span class="action-desc">{{ t('appaccount.signOutAllDesc') }}</span>
                    </div>
                    <eButton
                        size="slim"
                        icon="sign-out"
                        :disabled="auth.loading"
                        @click="handleSignOutAll"
                    />
                </div>
            </div>
        </section>
        <!-- Danger zone card -->
        <section class="settings-card danger-card">
            <div class="card-header">
                <span class="card-title danger-title">{{ t('appaccount.dangerZone') }}</span>
                <span class="card-desc">{{ t('appaccount.dangerZoneDesc') }}</span>
            </div>

            <div class="card-actions">
                <div class="action-row">
                    <div class="action-text">
                        <span class="action-label">{{ t('appaccount.deleteAccount') }}</span>
                        <span class="action-desc">{{ t('appaccount.deleteAccountDesc') }}</span>
                    </div>
                    <eButton
                        v-if="!confirmingDelete"
                        size="slim"
                        icon="delete"
                        :disabled="auth.loading"
                        @click="confirmingDelete = true"
                    />
                </div>

                <div v-if="confirmingDelete" class="delete-confirm">
                    <div class="confirm-text">
                        <span class="confirm-title">{{ t('appaccount.deleteAccountConfirmTitle') }}</span>
                        <span class="confirm-desc">{{ t('appaccount.deleteAccountConfirmDesc') }}</span>
                    </div>
                    <div class="confirm-actions">
                        <eButton
                            size="half"
                            :label="t('appaccount.deleteAccountCancel')"
                            :disabled="deletingAccount"
                            @click="confirmingDelete = false"
                        />
                        <eButton
                            size="half"
                            :label="t('appaccount.deleteAccountConfirm')"
                            :systemState="deletingAccount ? 'processing' : 'idle'"
                            @click="handleDeleteAccount"
                        />
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.account-settings {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    width: 100%;
    box-sizing: border-box;
}

.settings-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--black-1-a);
    clip-path: polygon(
        8px 0%, 100% 0%,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        0% 100%, 0% 8px
    );
}

.card-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.card-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-3);
    font-weight: var(--font-weight-2);
    color: var(--text-main);
}

.card-desc {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.card-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.card-row:last-child {
    border-bottom: none;
}

.row-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    flex-shrink: 0;
}

.row-value-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.row-value {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    word-break: break-all;
}

.copy-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-5);
    color: var(--accent-200);
    transition: opacity 0.15s;
    flex-shrink: 0;
}

.copy-btn:hover { opacity: 0.7; }

.devices-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
}

.devices-empty {
    padding: var(--space-4);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    text-align: center;
}

.card-actions {
    display: flex;
    flex-direction: column;
}

.action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.action-row:last-child {
    border-bottom: none;
}

.action-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
}

.action-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.action-desc {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.danger-card {
    border: 1px solid rgba(220, 60, 60, 0.2);
}

.danger-title {
    color: #c94040;
}

.delete-confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: rgba(180, 40, 40, 0.08);
    border-top: 1px solid rgba(220, 60, 60, 0.15);
}

.confirm-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
}

.confirm-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: #c94040;
}

.confirm-desc {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.confirm-actions {
    display: flex;
    gap: var(--space-2);
}

.key-reveal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: rgba(132, 255, 177, 0.06);
    border-top: 1px solid rgba(132, 255, 177, 0.15);
}

.key-reveal-title {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    font-weight: var(--font-weight-2);
    color: var(--accent-200);
}

.key-reveal-desc {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.key-reveal-value {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.key-reveal-value code {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.06);
    padding: var(--space-1) var(--space-2);
    border-radius: 2px;
    word-break: break-all;
    flex: 1;
}

.key-mint-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.keys-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
}

.key-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.key-row:last-child {
    border-bottom: none;
}

.key-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
}

.key-prefix {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}

.key-label {
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.key-date {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>
