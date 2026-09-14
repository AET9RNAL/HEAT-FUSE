/**
 * Plugin permissions. A plugin lists what it needs in `manifest.json`, each with
 * a reason the user sees:
 *
 *     "permissions": { "network": { "reason": "Loads your match history." } }
 *
 * Normal scopes are granted when declared, dangerous ones are answered on the
 * stage, and anything undeclared is denied.
 */
export type PermissionState = "granted" | "denied" | "prompt" | "undeclared";

export interface PluginPermissions {
  has(scope: string): boolean;
  state(scope: string): PermissionState;
  /**
   * Ask again for a declared scope. Honoured only right after a user action in
   * this plugin's overlay, inspector or config panel, and once per session after a deny.
   */
  request(scope: string): Promise<"granted" | "denied">;
}
