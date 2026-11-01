/**
 * The physical keyboard, served by FUSE as the `keyboard` service.
 *
 *     const kbd = ctx.services.get<KeyboardService>("keyboard");
 *     if (kbd?.isHeld("shift")) ...
 *
 * Held state arrives with the host tick (50 ms), so a shorter tap may not show.
 * Use `ctx.hotkeys.hold` to get every press and release.
 */
export interface KeyboardService {
  /**
   * True while the key is physically down. Key-downs that FUSE injects do not count.
   * Names: "a"-"z", "0"-"9", "f1"-"f24", "arrowup", "space", "enter", "tab",
   * "shift", "ctrl", "alt", "meta", and the other keys a keybind control accepts.
   */
  isHeld(key: string): boolean;
  press(key: string): void;
  release(key: string): void;
  tap(key: string): void;
}
