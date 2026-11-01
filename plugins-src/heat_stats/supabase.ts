import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FuseContext } from "@fuse/plugin-sdk";

const PROJECT_URL = "https://fwavoqtrzobbvwivavav.supabase.co";

const PUBLISHABLE_KEY = "sb_publishable_aFGX4LyK8wisMG_b0dcjRA_mAjUpubR";

const SESSION_KEY = "hs.auth.session";

/** The session holds a refresh token, so it goes in the secret store and not in plain config. */
function secretStorage(ctx: FuseContext) {
  return {
    async getItem(key: string): Promise<string | null> {
      return (await ctx.secrets.get(key)) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await ctx.secrets.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      await ctx.secrets.delete(key);
    },
  };
}

/** One client for each plugin process. The session restores itself from the secret store. */
export function createHeatStatsClient(ctx: FuseContext): SupabaseClient {
  return createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      storage: secretStorage(ctx),
      storageKey: SESSION_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

export { PROJECT_URL, SESSION_KEY };
