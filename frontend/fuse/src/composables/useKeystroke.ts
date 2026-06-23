import { ref, readonly, toValue, watch, onMounted, onUnmounted, type Ref, type MaybeRef } from 'vue'

interface UseKeystrokeOptions {
  target: Ref<HTMLElement | null>
  key: string | string[]
  onStroke?: (event: KeyboardEvent) => void
  active?: MaybeRef<boolean>
  /** 'press' fires callback on single keydown; 'hold' tracks held state via isPressed */
  mode?: 'press' | 'hold'
}

export function useKeystroke(options: UseKeystrokeOptions) {
  const { target, key, onStroke, active = true, mode = 'press' } = options
  const isHovering = ref(false)
  const isPressed = ref(false)

  const keys = Array.isArray(key) ? key : [key]

  function onMouseEnter() { isHovering.value = true }
  function onMouseLeave() { isHovering.value = false }

  function onKeyDown(event: KeyboardEvent) {
    if (!keys.includes(event.key)) return

    if (mode === 'hold') {
      isPressed.value = true
    }

    if (mode === 'press') {
      if (!toValue(active)) return
      if (!isHovering.value) return
      onStroke?.(event)
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!keys.includes(event.key)) return
    isPressed.value = false
  }

  function onWindowBlur() {
    isPressed.value = false
  }

  let currentEl: HTMLElement | null = null

  function attachMouse(el: HTMLElement | null) {
    if (currentEl) {
      currentEl.removeEventListener('mouseenter', onMouseEnter)
      currentEl.removeEventListener('mouseleave', onMouseLeave)
      isHovering.value = false
    }
    currentEl = el
    if (el) {
      el.addEventListener('mouseenter', onMouseEnter)
      el.addEventListener('mouseleave', onMouseLeave)
    }
  }

  watch(target, (el) => attachMouse(el), { immediate: true })

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onWindowBlur)
    attachMouse(null)
  })

  return {
    isHovering: readonly(isHovering),
    isPressed: readonly(isPressed),
  }
}
