import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const ROOTS = [
    'frontend/fuse/src',
    'frontend/fuse/electron',
    'frontend/fuse/scripts',
    'backend',
    'plugins-src',
]

const CODE_EXTENSIONS = new Set(['.vue', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css'])

// build output, vendored deps and the runtime plugin cache are not authored code
const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'dist-electron', 'build', 'out', 'release',
    '.venv', 'venv', '__pycache__', '.git', 'data', 'coverage',
])

function walk(dir, onFile) {
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full, onFile)
        } else if (entry.isFile()) {
            onFile(full)
        }
    }
}

function countLines(file) {
    try {
        const text = fs.readFileSync(file, 'utf8')
        if (!text) return 0
        return text.split('\n').length
    } catch {
        return 0
    }
}

export function collectSourceStats() {
    let vueComponents = 0
    let linesOfCode = 0

    for (const root of ROOTS) {
        walk(path.join(REPO_ROOT, root), (file) => {
            const ext = path.extname(file)
            if (!CODE_EXTENSIONS.has(ext)) return
            if (ext === '.vue') vueComponents++
            linesOfCode += countLines(file)
        })
    }

    return { vueComponents, linesOfCode }
}
