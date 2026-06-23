import type { Directive } from 'vue'

const vTruncateTitle: Directive = {
  mounted(el: HTMLElement) {
    el.addEventListener('mouseenter', () => {
      if (el.scrollWidth > el.clientWidth) {
        el.title = el.textContent?.trim() ?? ''
      } else {
        el.removeAttribute('title')
      }
    })
  }
}

export default vTruncateTitle
