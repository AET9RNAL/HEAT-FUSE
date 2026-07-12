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
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    if (this.bindings.has(bk)) logger.warning(`Hotkey '${combo}' re-registered (overwriting).`);
    this.bindings.set(bk, callback);
    this.labels.set(bk, label || combo);
    this.combos.set(bk, combo);
    this.owners.set(bk, owner);
    this.mods.set(bk, mods);
    this.keys.set(bk, key);
    logger.debug(`Hotkey bound: '${combo}'`);
  }

  unregister(combo: string): boolean {
    const { mods, key } = HotkeyRegistry.parse(combo);
    const bk = bindingKey(mods, key);
    const existed = this.bindings.has(bk);
    this.deleteBinding(bk);
    return existed;
  }

  private deleteBinding(bk: string): void {
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
    this.deleteBinding(oldBk);
    this.bindings.set(newBk, callback);
    this.labels.set(newBk, label);
    this.combos.set(newBk, newCombo);
    this.owners.set(newBk, owner);
    this.mods.set(newBk, mods);
    this.keys.set(newBk, key);
    logger.info(`Hotkey rebound: '${oldRepr}' -> '${newCombo}'`);
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
      });
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  dispatch(mods: string[], key: string): boolean {
    const bk = bindingKey(mods, key);
    const cb = this.bindings.get(bk);
    if (!cb) return false;
    const combo = this.combos.get(bk) ?? key;
    const label = this.labels.get(bk) ?? combo;
    const owner = this.owners.get(bk) || "host";
    logger.info(`Hotkey triggered: '${combo}' -> ${label} [${owner}]`);
    try {
      cb();
    } catch (e) {
      logger.exception(`Hotkey '${key}' handler raised`, e);
    }
    return true;
  }
}

/** Per-plugin proxy that pre-fills `owner` on every register call. */
export class HotkeyRegistryView {
  constructor(
    private registry: HotkeyRegistry,
    private owner: string,
  ) {}

  register(combo: string, callback: () => void, label = ""): void {
    this.registry.register(combo, callback, label, this.owner);
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
}
