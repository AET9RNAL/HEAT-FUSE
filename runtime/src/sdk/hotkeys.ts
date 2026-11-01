/**
 * Hotkey registry.
 *
 * Maps (modifier-set, key) => callback. Here we canonicalize to a `"mod+mod|key"`
 * string. Matching is performed by the host from inside the global keyboard
 * hook; plugins never construct listeners.
 */
import { logger } from "../log.js";

export interface BindingInfo {
  mods: string[];
  key: string;
  combo: string;
  label: string;
  owner: string;
  /** A `hold` binding: it reports press and release. */
  hold: boolean;
}

/** Callbacks for a combo that matters while it stays down. */
export interface HoldHandlers {
  onDown(): void;
  /** Runs when any key of the combo goes up, or when the binding goes away while down. */
  onUp(): void;
}

/**
 * A plugin's hotkeys. Combos another plugin or the host already bound aren't taken over.
 * The user can rebind a hotkey in the App or the inspector, and the host keeps that combo:
 * `listBindings()` gives the combos bound now, and `onChange` tells you when one moves.
 */
export interface PluginHotkeys {
  /** `combo` is the default. A combo the user saved for this label (or for the manifest action of `combo`) replaces it. */
  register(combo: string, callback: () => void, label?: string): void;
  /** Bind a combo that reports press and release. A bare modifier ("shift") is a valid combo. */
  hold(combo: string, handlers: HoldHandlers, label?: string): void;
  unregister(combo: string): boolean;
  reregister(oldMods: string[], oldKey: string, newCombo: string): boolean;
  listBindings(owner?: string): BindingInfo[];
  /** Runs after one of this plugin's bindings is added, moved (a user rebind) or removed. */
  onChange(callback: () => void): void;
}

type ParsedCombo = { mods: string[]; key: string };

function bindingKey(mods: string[], key: string): string {
  return `${[...mods].sort().join("+")}|${key}`;
}

export class HotkeyRegistry {
  private bindings = new Map<string, () => void>();
  private labels = new Map<string, string>();
  private combos = new Map<string, string>();
  private owners = new Map<string, string>();
  private mods = new Map<string, string[]>();
  private keys = new Map<string, string>();
  /** Release callbacks; only `hold` bindings have one. */
  private ups = new Map<string, () => void>();
  /** Hold bindings that are down now. */
  private down = new Set<string>();
  /** Runs with the owner after one of its bindings is added, moved or removed. */
  onChange: ((owner: string) => void) | null = null;
  private listeners = new Set<(owner: string) => void>();

  /** Another listener for the same changes as `onChange`. */
  subscribe(listener: (owner: string) => void): void {
    this.listeners.add(listener);
  }

  static parse(combo: string): ParsedCombo {
    const parts = combo
      .split("+")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) throw new Error(`empty hotkey combo: '${combo}'`);
    const key = parts[parts.length - 1]!;
    const mods = parts.slice(0, -1);
    return { mods, key };
  }

  register(combo: string, callback: () => void, label = "", owner = ""): void {
    this.add(combo, callback, undefined, label, owner);
  }

  hold(combo: string, handlers: HoldHandlers, label = "", owner = ""): void {
    this.add(combo, () => handlers.onDown(), () => handlers.onUp(), label, owner);
  }

  private add(combo: string, onDown: () => void, onUp: (() => void) | undefined, label: string, owner: string): void {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    if (this.bindings.has(bk)) {
      logger.warning(`Hotkey '${combo}' re-registered (overwriting).`);
      this.deleteBinding(bk);
    }
    this.bindings.set(bk, onDown);
    this.labels.set(bk, label || combo);
    this.combos.set(bk, combo);
    this.owners.set(bk, owner);
    this.mods.set(bk, mods);
    this.keys.set(bk, key);
    if (onUp) this.ups.set(bk, onUp);
    logger.debug(`Hotkey bound: '${combo}'${onUp ? " (hold)" : ""}`);
    this.changed(owner);
  }

  unregister(combo: string): boolean {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    const owner = this.owners.get(bk);
    this.deleteBinding(bk);
    if (owner === undefined) return false;
    this.changed(owner);
    return true;
  }

  private changed(owner: string): void {
    for (const fn of [this.onChange, ...this.listeners]) {
      try {
        fn?.(owner);
      } catch (e) {
        logger.exception("Hotkey change listener raised", e);
      }
    }
  }

  /** Owner of the binding for `combo` ("" for unowned), or undefined when nothing is bound. */
  ownerOf(combo: string): string | undefined {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    return this.bindings.has(bk) ? (this.owners.get(bk) ?? "") : undefined;
  }

  /** Drop every binding one owner registered, e.g. when a plugin's process stops. */
  unregisterOwner(owner: string): void {
    let any = false;
    for (const [bk, o] of [...this.owners]) {
      if (o !== owner) continue;
      this.deleteBinding(bk);
      any = true;
    }
    if (any) this.changed(owner);
  }

  private deleteBinding(bk: string): void {
    this.endHold(bk);
    this.ups.delete(bk);
    this.bindings.delete(bk);
    this.labels.delete(bk);
    this.combos.delete(bk);
    this.owners.delete(bk);
    this.mods.delete(bk);
    this.keys.delete(bk);
  }

  /** Move an existing binding to a new combo. Returns false on conflict/absent. */
  reregister(oldMods: string[], oldKey: string, newCombo: string): boolean {
    const oldBk = bindingKey(oldMods, oldKey);
    const callback = this.bindings.get(oldBk);
    if (!callback) return false;
    const { mods, key } = HotkeyRegistry.parse(newCombo);
    const newBk = bindingKey(mods, key);
    if (this.bindings.has(newBk) && newBk !== oldBk) {
      logger.warning(`Rebind conflict: '${newCombo}' already bound.`);
      return false;
    }
    const label = this.labels.get(oldBk) ?? newCombo;
    const owner = this.owners.get(oldBk) ?? "";
    const oldRepr = this.combos.get(oldBk) ?? oldBk;
    const up = this.ups.get(oldBk);
    this.deleteBinding(oldBk);
    this.bindings.set(newBk, callback);
    this.labels.set(newBk, label);
    this.combos.set(newBk, newCombo);
    this.owners.set(newBk, owner);
    this.mods.set(newBk, mods);
    this.keys.set(newBk, key);
    if (up) this.ups.set(newBk, up);
    logger.info(`Hotkey rebound: '${oldRepr}' -> '${newCombo}'`);
    this.changed(owner);
    return true;
  }

  listBindings(owner?: string): BindingInfo[] {
    const result: BindingInfo[] = [];
    for (const bk of this.bindings.keys()) {
      const bindingOwner = this.owners.get(bk) ?? "";
      if (owner !== undefined && bindingOwner !== owner) continue;
      result.push({
        mods: this.mods.get(bk) ?? [],
        key: this.keys.get(bk) ?? "",
        combo: this.combos.get(bk) ?? "",
        label: this.labels.get(bk) ?? "",
        owner: bindingOwner,
        hold: this.ups.has(bk),
      });
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  /** A key went down. Returns false when nothing is bound to it. */
  dispatch(mods: string[], key: string): boolean {
    const bk = bindingKey(mods, key);
    const cb = this.bindings.get(bk);
    if (!cb) return false;
    if (this.ups.has(bk)) {
      if (this.down.has(bk)) return true;
      this.down.add(bk);
      this.run(bk, cb, "down");
    } else {
      this.run(bk, cb, "triggered");
    }
    return true;
  }

  /** A key went up: every held combo that uses it ends. */
  release(key: string): void {
    for (const bk of [...this.down]) {
      if (this.keys.get(bk) === key || this.mods.get(bk)?.includes(key)) this.endHold(bk);
    }
  }

  /** End every held combo, e.g. when the keyboard hook stops or the game loses focus. */
  releaseAll(): void {
    for (const bk of [...this.down]) this.endHold(bk);
  }

  private endHold(bk: string): void {
    if (!this.down.delete(bk)) return;
    const up = this.ups.get(bk);
    if (up) this.run(bk, up, "up");
  }

  private run(bk: string, cb: () => void, phase: "triggered" | "down" | "up"): void {
    const combo = this.combos.get(bk) ?? bk;
    const label = this.labels.get(bk) ?? combo;
    const owner = this.owners.get(bk) || "host";
    // A hold fires on every press and release, so it logs at debug.
    const line = `Hotkey ${phase}: '${combo}' -> ${label} [${owner}]`;
    if (phase === "triggered") logger.info(line);
    else logger.debug(line);
    try {
      cb();
    } catch (e) {
      logger.exception(`Hotkey '${combo}' handler raised`, e);
    }
  }
}

/** Per-plugin proxy that pre-fills `owner` on every register call. */
export class HotkeyRegistryView implements PluginHotkeys {
  constructor(
    private registry: HotkeyRegistry,
    private owner: string,
  ) {}

  register(combo: string, callback: () => void, label = ""): void {
    this.registry.register(combo, callback, label, this.owner);
  }

  hold(combo: string, handlers: HoldHandlers, label = ""): void {
    this.registry.hold(combo, handlers, label, this.owner);
  }

  unregister(combo: string): boolean {
    return this.registry.unregister(combo);
  }

  reregister(oldMods: string[], oldKey: string, newCombo: string): boolean {
    return this.registry.reregister(oldMods, oldKey, newCombo);
  }

  listBindings(owner?: string): BindingInfo[] {
    return this.registry.listBindings(owner !== undefined ? owner : this.owner);
  }

  onChange(callback: () => void): void {
    this.registry.subscribe((owner) => {
      if (owner === this.owner) callback();
    });
  }
}
