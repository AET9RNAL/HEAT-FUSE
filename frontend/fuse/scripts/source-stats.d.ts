export interface SourceStats {
    vueComponents: number
    linesOfCode: number
}

export declare function collectSourceStats(): SourceStats
