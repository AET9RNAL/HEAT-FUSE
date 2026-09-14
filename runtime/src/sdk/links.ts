export interface PluginLinks {
  /**
   * Open an https page in the user's browser. Honoured once per user action in
   * this plugin's overlay, inspector or config panel; false otherwise.
   */
  open(url: string): Promise<boolean>;
  /**
   * `fuse://plugin/<plugin_id>/...` links opened on this PC. Any website can open
   * one, so check what it carries (for sign-in, a `state` you generated).
   */
  onCallback(cb: (url: string) => void): void;
}
