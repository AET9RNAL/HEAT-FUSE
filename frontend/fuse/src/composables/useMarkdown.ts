import { Marked, type Token } from 'marked'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'img',
    'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'video',
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

// mp.css has a .md-cols-N class for each count up to this one.
const MAX_GRID_COLS = 6

const VIDEO_EXT = /\.(webm|mp4)$/i

// Set after the attribute filter, so an author cannot add controls or sound.
const VIDEO_FLAGS = ['autoplay', 'loop', 'muted', 'playsinline']

DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName !== 'VIDEO') return
    for (const flag of VIDEO_FLAGS) node.setAttribute(flag, '')
})

function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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

function isImage(tok: Token): boolean {
    if (tok.type === 'image') return true
    return tok.type === 'link' && tok.tokens?.length === 1 && tok.tokens[0].type === 'image'
}

/** Splits a paragraph of images into rows, one row per source line. Null when the paragraph holds anything else. */
function imageRows(tokens: Token[]): Token[][] | null {
    const rows: Token[][] = [[]]
    for (const tok of tokens) {
        if (isImage(tok)) {
            rows[rows.length - 1].push(tok)
        } else if (tok.type === 'br' || (tok.type === 'text' && !tok.raw.trim())) {
            if (tok.type === 'br' || tok.raw.includes('\n')) rows.push([])
        } else {
            return null
        }
    }
    return rows.filter(row => row.length)
}

const md = new Marked({
    renderer: {
        paragraph({ tokens }) {
            const rows = imageRows(tokens)
            if (!rows) return false
            const cols = Math.max(0, ...rows.map(row => row.length))
            if (cols < 2) return false
            const body = rows
                .map(row => `<span class="md-row">${row.map(cell => `<span class="md-cell">${this.parser.parseInline([cell])}</span>`).join('')}</span>`)
                .join('')
            return `<p class="md-grid md-cols-${Math.min(cols, MAX_GRID_COLS)}">${body}</p>\n`
        },
        image({ href, text }) {
            if (!VIDEO_EXT.test(href.split(/[?#]/)[0])) return false
            return `<video src="${escapeAttr(href)}" aria-label="${escapeAttr(text)}"></video>`
        },
    },
})

export function renderMarkdown(src: string): string {
    if (!src) return ''
    const html = md.parse(src, { async: false }) as string
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
