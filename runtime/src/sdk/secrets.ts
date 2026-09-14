/**
 * Values only this plugin can read, encrypted with the OS account key, e.g.
 * sign-in tokens. Needs the `secrets` permission. Keys: 1-128 letters, digits,
 * `.`, `_` or `-`; values: strings up to 16 KB; up to 100 keys.
 */
export interface PluginSecrets {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
}
