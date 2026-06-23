import { computed } from 'vue'
import { useAppStore, type AppLanguage } from '../stores/app'
import type { TranslationSchema } from '../locales/schema'

import en from '../locales/en.json'

const locales: Record<AppLanguage, TranslationSchema> = {
    en: en as unknown as TranslationSchema,
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
    let current: unknown = obj
    for (const key of path.split('.')) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined
        current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' ? current : undefined
}

function interpolate(
    template: string,
    params: Record<string, string | number>,
    resolveCommon?: (key: string) => string | undefined,
): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        if (params[key] !== undefined) return String(params[key])
        const common = resolveCommon?.(key)
        if (common !== undefined) return common
        return match
    })
}

export function useI18n() {
    const appStore = useAppStore()
    const locale = computed(() => appStore.appLanguage)

    function resolveCommon(key: string): string | undefined {
        const current = locales[locale.value]
        const fallback = locales.en
        return getNestedValue(current as unknown as Record<string, unknown>, `common.${key}`)
            ?? getNestedValue(fallback as unknown as Record<string, unknown>, `common.${key}`)
    }

    function t(key: string, params?: Record<string, string | number>): string {
        const current = locales[locale.value]
        const fallback = locales.en

        let value = getNestedValue(current as unknown as Record<string, unknown>, key)
        if (value === undefined) {
            value = getNestedValue(fallback as unknown as Record<string, unknown>, key)
        }
        if (value === undefined) {
            console.warn(`[i18n] Missing translation key: ${key}`)
            return key
        }

        return interpolate(value, params ?? {}, resolveCommon)
    }

    return { locale, t }
}

export default useI18n
