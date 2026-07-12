import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { logger } from "../log.js";

// Fire key events immediately (no inter-action delay).
keyboard.config.autoDelayMs = 0;

const KEY_BY_CHAR = Key as unknown as Record<string, number>;
function nutKeyFor(char: string): number | null {
  const k = KEY_BY_CHAR[char.toUpperCase()];
  return typeof k === "number" ? k : null;
}

export type MouseCallback = (x: number, y: number, button: number, pressed: boolean) => void;

interface InputCallbacks {
  onKey: (mods: Set<string>, key: string | null, pressed: boolean) => void;
  onMouse: MouseCallback;
}

const UK = UiohookKey as unknown as Record<string, number>;
const MODIFIER_CODES = new Set<number>(
  [UK.Ctrl, UK.CtrlRight, UK.Shift, UK.ShiftRight, UK.Alt, UK.AltRight, UK.Meta, UK.MetaRight].filter(
    (v): v is number => typeof v === "number",
  ),
);

const CHAR_BY_KEYCODE = new Map<number, string>();
for (let c = 65; c <= 90; c++) {
  const code = UK[String.fromCharCode(c)];
  if (typeof code === "number") CHAR_BY_KEYCODE.set(code, String.fromCharCode(c).toLowerCase());
}
for (let d = 0; d <= 9; d++) {
  const code = UK[String(d)] ?? UK[`Digit${d}`];
  if (typeof code === "number") CHAR_BY_KEYCODE.set(code, String(d));
}
// Named keys: UiohookKey member -> DOM `e.key.toLowerCase()` equivalent, so a
// bind captured on the frontend (e.g. "arrowright", "f5", "home") dispatches.
const NAMED_KEYS: Record<string, string> = {
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
  Delete: "delete",
  Enter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  Space: "space",
};
for (let f = 1; f <= 24; f++) NAMED_KEYS[`F${f}`] = `f${f}`;
for (const [enumName, domName] of Object.entries(NAMED_KEYS)) {
  const code = UK[enumName];
  if (typeof code === "number") CHAR_BY_KEYCODE.set(code, domName);
}

/** Resolve a uiohook `keycode` to a lowercase char, or null. */
function resolveChar(keycode: number): string | null {
  return CHAR_BY_KEYCODE.get(keycode) ?? null;
}

function modsFromEvent(e: UiohookKeyboardEvent): Set<string> {
  const s = new Set<string>();
  if (e.ctrlKey) s.add("ctrl");
  if (e.shiftKey) s.add("shift");
  if (e.altKey) s.add("alt");
  return s;
}

export class KeyboardInput {
  private held = new Set<string>();

  markPressed(char: string): void {
    this.held.add(char);
  }
  markReleased(char: string): void {
    this.held.delete(char);
  }
  isHeld(char: string): boolean {
    return this.held.has(char);
  }
  releaseAll(): void {
    this.held.clear();
  }

  // --- simulation (nut-js, fire-and-forget) ------------------------------
  press(char: string): void {
    const k = nutKeyFor(char);
    if (k == null) return;
    void keyboard.pressKey(k).catch((e) => logger.warning(`key press '${char}' failed: ${String(e)}`));
  }
  release(char: string): void {
    const k = nutKeyFor(char);
    if (k == null) return;
    void keyboard.releaseKey(k).catch((e) => logger.warning(`key release '${char}' failed: ${String(e)}`));
  }
  tap(char: string): void {
    const k = nutKeyFor(char);
    if (k == null) return;
    void keyboard
      .pressKey(k)
      .then(() => keyboard.releaseKey(k))
      .catch((e) => logger.warning(`key tap '${char}' failed: ${String(e)}`));
  }
}

export class HotkeyInput {
  readonly keyboard = new KeyboardInput();
  private cb: InputCallbacks;
  private heldKeycodes = new Set<number>();
  private started = false;

  constructor(cb: InputCallbacks) {
    this.cb = cb;
  }

  start(): void {
    if (this.started) return;
    try {
      uIOhook.on("keydown", (e) => this.onKeyDown(e));
      uIOhook.on("keyup", (e) => this.onKeyUp(e));
      uIOhook.on("mousedown", (e) => this.cb.onMouse(e.x, e.y, Number(e.button ?? 0), true));
      uIOhook.on("mouseup", (e) => this.cb.onMouse(e.x, e.y, Number(e.button ?? 0), false));
      uIOhook.start();
      this.started = true;
    } catch (e) {
      logger.exception("uiohook unavailable - hotkeys disabled", e);
    }
  }

  stop(): void {
    if (!this.started) return;
    try {
      uIOhook.stop();
    } catch {
      /* ignore */
    }
    this.started = false;
  }

  private onKeyDown(e: UiohookKeyboardEvent): void {
    const mods = modsFromEvent(e);
    if (MODIFIER_CODES.has(e.keycode)) {
      this.cb.onKey(mods, null, true);
      return;
    }
    if (this.heldKeycodes.has(e.keycode)) return; // suppress auto-repeat
    const char = resolveChar(e.keycode);
    if (char == null) return; // non-latin / non-actionable
    this.heldKeycodes.add(e.keycode);
    this.keyboard.markPressed(char);
    this.cb.onKey(mods, char, true);
  }

  private onKeyUp(e: UiohookKeyboardEvent): void {
    const mods = modsFromEvent(e);
    if (MODIFIER_CODES.has(e.keycode)) {
      this.cb.onKey(mods, null, false);
      return;
    }
    this.heldKeycodes.delete(e.keycode);
    const char = resolveChar(e.keycode);
    if (char != null) {
      this.keyboard.markReleased(char);
      this.cb.onKey(mods, char, false);
    }
  }
}
