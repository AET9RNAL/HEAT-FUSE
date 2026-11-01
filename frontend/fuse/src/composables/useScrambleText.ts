import { ref, watch, onUnmounted, type Ref } from 'vue'
import { animate } from 'motion-v'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#<>'
const DURATION_S = 0.35
// Unrevealed letters change glyph at most this often.
const GLYPH_MS = 40

function glyph(): string {
    return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
}

function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
}

/**
 * Follows `source`. While `enabled`, each new text reveals its letters in random order,
 * and random glyphs fill the letters not yet revealed.
 */
export function useScrambleText(source: Ref<string>, enabled: Ref<boolean>): Ref<string> {
    const text = ref(source.value)
    let anim: { stop: () => void } | null = null

    watch(source, (next) => {
        anim?.stop()
        anim = null
        if (!enabled.value) {
            text.value = next
            return
        }
        const chars = [...next]
        const order = shuffle(chars.flatMap((ch, i) => (ch.trim() ? [i] : [])))
        const revealed = new Set<number>()
        let last = 0
        anim = animate(0, 1, {
            duration: DURATION_S,
            ease: 'linear',
            onUpdate: (p: number) => {
                const count = Math.floor(p * order.length)
                const grew = count > revealed.size
                for (let k = revealed.size; k < count; k++) revealed.add(order[k])
                const now = performance.now()
                if (!grew && now - last < GLYPH_MS) return
                last = now
                text.value = chars.map((ch, i) => (!ch.trim() || revealed.has(i) ? ch : glyph())).join('')
            },
            onComplete: () => { text.value = next },
        })
    })

    onUnmounted(() => anim?.stop())
    return text
}
