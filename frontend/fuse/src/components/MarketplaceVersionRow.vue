<script setup lang="ts">
import type { MarketplaceVersion } from '../stores/marketplace'
import { useMarketplaceStore } from '../stores/marketplace'
import { useAuthStore } from '../stores/auth'
import { useI18n } from '../composables/useI18n'
import eButton from './eButton.vue'
import eBadge from './eBadge.vue'

const props = defineProps<{ version: MarketplaceVersion }>()

const store = useMarketplaceStore()
const auth  = useAuthStore()
const { t } = useI18n()

const installState = () => store.installing[props.version.id] ?? 'idle'

function formatDate(iso: string) {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso))
}

function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>

<template>
    <div class="version-row">
        <div class="ver-left">
            <span class="ver-number">{{ version.version_number }}</span>
            <eBadge
                :label="t(`appdiscover.versionType.${version.version_type}`)"
                :color="version.version_type === 'alpha' ? '#fde68a'
                      : version.version_type === 'beta'  ? '#7dd3fc'
                      : '#84ffb1'"
            />
        </div>

        <div class="ver-compat">
            <template v-if="version.compatible_game_versions.length">
                <span class="compat-label">{{ t('appdiscover.gameVersions') }}:</span>
                <span class="compat-values">{{ version.compatible_game_versions.join(', ') }}</span>
            </template>
        </div>

        <div class="ver-meta">
            <span class="meta-item">{{ formatDate(version.created_at) }}</span>
            <span v-if="version.file_size" class="meta-item">{{ formatSize(version.file_size) }}</span>
            <span class="meta-item">{{ version.download_count }} {{ t('appdiscover.downloads') }}</span>
        </div>

        <template v-if="version.asset_key">
            <eButton
                v-if="auth.isSignedIn()"
                size="half"
                :label="installState() === 'downloading' ? t('appdiscover.installing')
                       : installState() === 'done'        ? t('appdiscover.installed')
                       : t('appdiscover.install')"
                :systemState="installState() === 'downloading' ? 'processing'
                            : installState() === 'error'       ? 'error'
                            : 'idle'"
                :disabled="installState() === 'done'"
                @click="store.installVersion(version)"
            />
            <span v-else class="sign-in-required">{{ t('appdiscover.signInToInstall') }}</span>
        </template>
        <span v-else class="no-file">—</span>
    </div>
</template>

<style scoped>
.version-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.version-row:last-child { border-bottom: none; }

.ver-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 140px;
}

.ver-number {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-main);
}


.ver-compat {
    flex: 1;
    display: flex;
    gap: var(--space-1);
    font-family: var(--font-primary);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    overflow: hidden;
}
.compat-label { flex-shrink: 0; }
.compat-values { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ver-meta {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
}

.meta-item {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
}

.no-file {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    width: 140px;
    text-align: center;
}

.sign-in-required {
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    color: var(--text-muted);
    opacity: 0.6;
    width: 140px;
    text-align: center;
}
</style>
