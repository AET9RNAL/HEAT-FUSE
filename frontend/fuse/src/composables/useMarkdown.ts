import { marked } from 'marked'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'img',
    'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'target', 'rel', 'style']

const ALLOWED_CSS_PROPS = new Set([
    'color',
    'background-color',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-decoration-color',
    'text-decoration-line',
    'text-align',
])

const UNSAFE_CSS_VALUE = /expression|javascript|url\(|-moz-binding|@import|behavior/i

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return

    const safe: string[] = []
    for (const decl of (data.attrValue || '').split(';')) {
        const colon = decl.indexOf(':')
        if (colon === -1) continue

        const prop = decl.slice(0, colon).trim().toLowerCase()
        const value = decl.slice(colon + 1).trim()

        if (!ALLOWED_CSS_PROPS.has(prop)) continue
        if (UNSAFE_CSS_VALUE.test(value)) continue

        safe.push(`${prop}: ${value}`)
    }

    if (safe.length === 0) {
        data.keepAttr = false
    } else {
        data.attrValue = safe.join('; ')
    }
})

export function renderMarkdown(src: string): string {
    if (!src) return ''
    const html = marked.parse(src, { async: false }) as string
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
