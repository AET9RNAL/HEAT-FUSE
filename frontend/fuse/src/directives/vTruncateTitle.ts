import type { Directive } from 'vue'
import { hideTip, scheduleTip } from './vTip'

type TruncateEl = HTMLElement & { _truncateCleanup?: () => void }

// Full text in the app tooltip, only when the element is actually clipped.
const vTruncateTitle: Directive<TruncateEl> = {
  mounted(el) {
    const enter = () => {
      if (el.scrollWidth > el.clientWidth) scheduleTip(el, el.textContent?.trim() ?? '')
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', hideTip)
    el.addEventListener('pointerdown', hideTip)
    el._truncateCleanup = () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', hideTip)
      el.removeEventListener('pointerdown', hideTip)
    }
  },
  unmounted(el) {
    el._truncateCleanup?.()
    hideTip()
  },
}

export default vTruncateTitle
