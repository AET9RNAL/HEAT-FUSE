import { ref } from 'vue'

const pending = ref<Record<string, number>>({})

export function requestSettingAttention(id: string) {
    pending.value = { ...pending.value, [id]: (pending.value[id] ?? 0) + 1 }
}

export function useSettingAttention() {
    function clear() {
        if (Object.keys(pending.value).length) pending.value = {}
    }
    return { pending, clear }
}
