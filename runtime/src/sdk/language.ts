/**
 * The App's language, served by FUSE as the `language` service so a plugin can
 * pick its locale before its user chooses one. Needs the `language` permission;
 * without it `language` is undefined and `get()` rejects.
 *
 *     const lang = ctx.services.get<LanguageService>("language");
 *     const code = await lang?.get();  // or lang?.language, kept current
 */
export interface LanguageService {
  /** The App's language code, e.g. "en". */
  readonly language: string | undefined;
  get(): Promise<string>;
}
