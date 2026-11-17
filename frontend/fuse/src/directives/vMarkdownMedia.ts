import type { Directive, DirectiveBinding } from 'vue'

type MediaEl = HTMLElement & { _mediaCleanup?: () => void }

function watch(el: MediaEl) {
    el._mediaCleanup?.()
    el._mediaCleanup = undefined
    const videos = [...el.querySelectorAll('video')]
    if (!videos.length) return

    const onScreen = new Set<Element>()
    const sync = (video: HTMLVideoElement) => {
        if (onScreen.has(video) && !document.hidden) video.play().catch(() => {})
        else video.pause()
    }
    const io = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) onScreen.add(entry.target)
            else onScreen.delete(entry.target)
            sync(entry.target as HTMLVideoElement)
        }
    })
    const onVisibility = () => videos.forEach(sync)

    videos.forEach(video => io.observe(video))
    document.addEventListener('visibilitychange', onVisibility)
    el._mediaCleanup = () => {
        io.disconnect()
        document.removeEventListener('visibilitychange', onVisibility)
    }
}

/** Plays Markdown clips only while they are on screen and the window shows, so the game keeps the GPU. The value is the v-html string. */
const vMarkdownMedia: Directive<MediaEl, string> = {
    mounted: el => watch(el),
    updated(el, binding: DirectiveBinding<string>) {
        if (binding.value !== binding.oldValue) watch(el)
    },
    unmounted(el) {
        el._mediaCleanup?.()
    },
}

export default vMarkdownMedia
