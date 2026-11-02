<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRegistryStore } from '../../stores/registry'
import { useI18n } from '../../composables/useI18n'
import { GAME_VERSION_RE, compareVersions } from '../../utils/registry-api'
import Icons from '../ui/Icons.vue'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const registry = useRegistryStore()
const { t } = useI18n()

const adding = ref(false)
const draft = ref('')
const draftValid = computed(() => GAME_VERSION_RE.test(draft.value.trim()))

onMounted(() => { if (!registry.gameVersions.length) void registry.fetchGameVersions() })

// The installed game version first, then the catalog, then any custom value already picked.
const chips = computed(() => {
    const set = new Set<string>()
    if (registry.playerGameVersion && GAME_VERSION_RE.test(registry.playerGameVersion)) set.add(registry.playerGameVersion)
    for (const v of registry.gameVersions.slice(0, 6)) set.add(v)
    for (const v of props.modelValue) set.add(v)
    return [...set].sort((a, b) => compareVersions(b, a))
})

function toggle(v: string) {
    emit('update:modelValue', props.modelValue.includes(v)
        ? props.modelValue.filter(x => x !== v)
        : [...props.modelValue, v].sort((a, b) => compareVersions(a, b)))
}

function add() {
    const v = draft.value.trim()
    if (!GAME_VERSION_RE.test(v)) return
    if (!props.modelValue.includes(v)) toggle(v)
    draft.value = ''
    adding.value = false
}
</script>

<template>
    <div class="gv">
        <div class="gv-chips">
            <button
                v-for="v in chips"
                :key="v"
                class="gv-chip"
                :class="{ on: modelValue.includes(v) }"
                :title="v === registry.playerGameVersion ? t('registry.gameVersions.yours') : undefined"
                @click="toggle(v)"
            >
                <Icons v-if="modelValue.includes(v)" kind="checkmark" size="small" color="var(--black-1)" />
                {{ v }}
            </button>
            <template v-if="adding">
                <input
                    v-model="draft"
                    class="gv-input"
                    :class="{ bad: draft && !draftValid }"
                    placeholder="1.2.3"
                    maxlength="14"
                    autofocus
                    @keydown.enter="add"
                    @keydown.escape="adding = false"
                    @blur="draft ? add() : (adding = false)"
                />
            </template>
            <button v-else class="gv-chip gv-add" @click="adding = true">+ {{ t('registry.gameVersions.add') }}</button>
        </div>
        <span class="mp-label">{{ t('registry.gameVersions.hint') }}</span>
    </div>
</template>

<style scoped src="./mp.css"></style>
<style scoped>
.gv {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.gv-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
}

.gv-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 64px;
    justify-content: center;
    padding: 4px 10px;
    background: var(--black-1-a);
    border: 1px solid var(--base-600);
    color: var(--text-muted);
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    cursor: pointer;
}

.gv-chip:hover {
    border-color: var(--base-200);
    color: var(--text-main);
}

.gv-chip.on {
    background: var(--accent-200);
    border-color: var(--accent-200);
    color: var(--black-1);
}

.gv-add {
    border-style: dashed;
    border-color: var(--accent-200);
    color: var(--accent-200);
    text-transform: uppercase;
}

.gv-input {
    width: 96px;
    padding: 4px 8px;
    background: var(--black-1-a);
    border: 1px solid var(--accent-200);
    color: var(--text-main);
    font-family: var(--font-microcopy);
    font-size: var(--main-font-size-4);
    outline: none;
}

.gv-input.bad {
    border-color: var(--error-highlight);
}
</style>
