import { readonly, ref } from 'vue'
import type { AppLanguage } from '../stores/app'
import type { TranslationSchema } from '../locales/schema'

import en from '../locales/en.json'
import fr from '../locales/fr.json'
import ru from '../locales/ru.json'
import ua from '../locales/ua.json'

// A key missing from a catalog falls back to English.
const locales: Record<AppLanguage, TranslationSchema> = {
    en: en as unknown as TranslationSchema,
    fr: fr as unknown as TranslationSchema,
    ru: ru as unknown as TranslationSchema,
    ua: ua as unknown as TranslationSchema,
}

// No store import: the overlay stage has no Pinia, and the app store loads the Supabase client.
const locale = ref<AppLanguage>('en')

/** The App syncs this from its store. Other surfaces stay on English. */
export function setI18nLocale(language: AppLanguage): void {
    locale.value = language
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

    return { locale: readonly(locale), t }
}

export default useI18n
