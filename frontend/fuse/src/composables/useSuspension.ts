import { ref } from 'vue'

const isSuspended = ref(false)
let initialized = false

export function useSuspension() {
    if (!initialized && window.appAPI) {
        window.appAPI.onSuspended(() => { isSuspended.value = true })
        window.appAPI.onResumed(() => { isSuspended.value = false })
        initialized = true
    }
    return { isSuspended }
}
