import { inject } from "vue";

export const I18N = Symbol("minimapI18n");

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] !== undefined ? String(params[name]) : match));
}

/** Translation over the messages the plugin pushes. `state` holds `locale` and `messages`. */
export function createI18n(state) {
  return {
    get locale() {
      return state.locale;
    },
    t: (key, params) => interpolate(state.messages?.[key] ?? key, params),
  };
}

export function useI18n() {
  return inject(I18N, () => createI18n({ locale: "en", messages: {} }), true);
}
