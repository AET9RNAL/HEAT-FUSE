declare module "vue3-sfc-loader" {
  export interface SfcLoaderOptions {
    moduleCache?: Record<string, unknown>;
    getFile: (url: string) => Promise<{ getContentData: (asBinary: boolean) => Promise<string | Uint8Array> } | string>;
    addStyle: (styleText: string, id?: string) => void;
    [key: string]: unknown;
  }
  export function loadModule(path: string, options: SfcLoaderOptions): Promise<Record<string, unknown>>;
}
