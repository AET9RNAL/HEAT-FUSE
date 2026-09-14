/** "ctrl+shift+f5" -> "Ctrl+Shift+F5", for shortcut hints in running text. */
export function formatCombo(combo: string): string {
    return combo
        .split('+')
        .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join('+')
}
