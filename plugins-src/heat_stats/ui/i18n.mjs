import { inject } from "vue";

export const I18N = Symbol("heatStatsI18n");

// Intl wants the ISO code the App spells "ua".
const INTL_LOCALES = { ua: "uk" };
const DASH = "—";

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}

const formatters = new Map();

/** An `Intl` constructor costs far more than a format call, and counters format every frame. */
function intlFor(Ctor, locale, options) {
  const key = `${Ctor.name}|${locale}|${options ? JSON.stringify(options) : ""}`;
  let formatter = formatters.get(key);
  if (!formatter) formatters.set(key, (formatter = new Ctor(locale, options)));
  return formatter;
}

/** Translation and number formatting over the messages the plugin pushes. `state` holds `locale` and `messages`. */
export function createI18n(state) {
  const intl = () => INTL_LOCALES[state.locale] ?? state.locale ?? "en";
  const n = (value, options) => {
    const num = Number(value);
    if (value === null || value === undefined || !Number.isFinite(num)) return DASH;
    return intlFor(Intl.NumberFormat, intl(), options).format(num);
  };
  return {
    get locale() {
      return state.locale;
    },
    t: (key, params) => interpolate(state.messages?.[key] ?? key, params),
    n,
    fixed: (value, digits) => n(value, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    /** `value` is 0-100, as the API reports rates. */
    percent: (value, minDigits, maxDigits = minDigits) =>
      n(Number(value) / 100, { style: "percent", minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits }),
    compact: (value) =>
      Math.abs(Number(value)) >= 1000
        ? `${n(Number(value) / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
        : n(value, { maximumFractionDigits: 0 }),
    date: (value, options) => intlFor(Intl.DateTimeFormat, intl(), options).format(value),
    /** Intl plural category for `count`: "one", "few", "many", "other"... */
    plural: (count) => intlFor(Intl.PluralRules, intl()).select(Number(count)),
  };
}

export function useI18n() {
  return inject(I18N, () => createI18n({ locale: "en", messages: {} }), true);
}
