import { marked } from 'marked'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'a', 'img',
    'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'target', 'rel']

export function renderMarkdown(src: string): string {
    if (!src) return ''
    const html = marked.parse(src, { async: false }) as string
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
