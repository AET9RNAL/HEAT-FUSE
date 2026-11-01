/**
 * Which loadout the player took into a battle, and what was on it. One source alone is not enough:
 * the postmatch result names the played loadout but has no layout, and the hangar has every layout
 * but knows only the selection. So the recorder reads the hangar at battle start, and the postmatch picks from it.
 * This is exact, because the game locks the loadout once a match is found. All loadouts are kept,
 * so a vehicle swap during the battle resolves the same way.
 * A loadout id is `agent.vehicle.slot` ("5.101.0"). Other players on the same vehicle and agent share it,
 * so it identifies a build only in the local player's hangar.
 * Nothing here guesses. A loadout without proof keeps its ids, `verified: false`, the reason, and no layout.
 */

/** A loadout's cosmetic ids, as the hangar reader publishes them. 0 is none. */
export interface HangarCustomization {
  talisman3dId: number;
  stylesPack3dId: number;
  item2dId: number;
}

/** One configured loadout, as the hangar reader publishes it. */
export interface HangarLoadout {
  id: string;
  vehicle: {
    id: number;
    modulesLayout: number[];
    equipmentLayout: number[];
    /** Null when the reader did not publish all three ids. */
    customization: HangarCustomization | null;
  };
  frontman: {
    id: number;
    perksLayout: number[];
    /** The agent's worn outfit ids. Empty means the default outfit. Null when not published. */
    customizationLayout: number[] | null;
  };
}

/** The hangar at the moment a battle started: every loadout, and the selection. */
export interface LoadoutSnapshot {
  taken_at: number;
  selected: string | null;
  loadouts: HangarLoadout[];
}

/** What the postmatch result says was played. */
export interface PlayedLoadout {
  loadoutId: string | null;
  vehicleId: number | null;
  frontmanId: number | null;
}

export interface LoadoutModule {
  id: number;
  name: string | null;
  group: number | null;
  /** The module group's type. It separates firepower from utility. */
  group_type: number | null;
}

export interface LoadoutEquipment {
  id: number;
  name: string | null;
  /** The catalog's slot type, e.g. "FirstEquipment". */
  slot: string | null;
  /** Where in the layout it sits. Empty slots are left out, so positions can skip. */
  position: number;
}

export interface LoadoutPerk {
  id: number;
  name: string | null;
  tier: number | null;
  group: number | null;
  skill_points: number | null;
  /** Where in the layout it sits. Empty slots are left out, so positions can skip. */
  position: number;
}

export interface LoadoutCosmetic {
  id: number;
  /** The catalog's entitlement code, e.g. "a20_m60a2_c11n_camo_jungle_shadow". */
  code: string | null;
}

export interface LoadoutCamo extends LoadoutCosmetic {
  /** Null when the vehicle's catalog does not list the id. */
  kind: "camouflage" | "paint" | null;
}

export interface LoadoutOutfit extends LoadoutCosmetic {
  /** The catalog's category. Every live outfit has 2, the "Style" prefab slot. */
  category: number | null;
}

/** Each vehicle field is null when nothing is equipped in it. */
export interface LoadoutCustomization {
  talisman: LoadoutCosmetic | null;
  /** The 2D item: a camouflage or a paint. */
  camo: LoadoutCamo | null;
  /** The 3D style pack. Live loadouts carry either this or a 2D item, never both. */
  style: LoadoutCosmetic | null;
  /** The agent's worn outfit items. Empty is the default outfit. */
  outfit: LoadoutOutfit[];
}

/** A played loadout, attributed to one battle. */
export interface MatchLoadout {
  loadout_id: string | null;
  vehicle_id: number | null;
  /** Technical name, e.g. "a20_m60a2". The tank art uses the same slug. */
  vehicle: string | null;
  frontman_id: number | null;
  /** Technical name, e.g. "reaper". */
  frontman: string | null;
  modules: LoadoutModule[];
  equipment: LoadoutEquipment[];
  perks: LoadoutPerk[];
  /** Null when not read, or when the loadout is not verified. */
  customization: LoadoutCustomization | null;
  /** True only when the postmatch and the battle-start hangar agree on every id. */
  verified: boolean;
  /** Why it is not verified. Null when it is. */
  problem: string | null;
}

/** The compact lookups attribution needs, cut from the heavy catalog. */
export interface LoadoutCatalog {
  vehicles: Map<number, string>;
  frontmen: Map<number, string>;
  /** Vehicle/agent id -> the entitlement code its XP is paid in. */
  vehicleXp: Map<number, string>;
  frontmanXp: Map<number, string>;
  /** Vehicle id -> its progression level, as the hangar had it when the battle started. */
  vehicleLevel: Map<number, number>;
  modules: Map<number, { name: string | null; group: number | null }>;
  groups: Map<number, number | null>;
  equipment: Map<number, { name: string | null; slot: string | null }>;
  perks: Map<number, { name: string | null; tier: number | null; group: number | null; skill_points: number | null }>;
  talismans: Map<number, string | null>;
  /** Per vehicle: its 2D items and 3D style packs, by id. */
  cosmetics: Map<number, { items2d: Map<number, Omit<LoadoutCamo, "id">>; styles: Map<number, string | null> }>;
  /** Per agent: outfit items by id. */
  outfits: Map<number, Map<number, Omit<LoadoutOutfit, "id">>>;
}

const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Null if any entry is not an id, because a layout with a hole is not a layout. */
function numbers(v: unknown): number[] | null {
  const out: number[] = [];
  for (const x of asArray(v)) {
    const n = asNumber(x);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** All three cosmetic ids, or null. A partial set cannot tell "none" from "not read". */
function customization(v: unknown): HangarCustomization | null {
  const c = asRecord(v);
  const talisman3dId = asNumber(c.talisman3dId);
  const stylesPack3dId = asNumber(c.stylesPack3dId);
  const item2dId = asNumber(c.item2dId);
  if (talisman3dId === null || stylesPack3dId === null || item2dId === null) return null;
  return { talisman3dId, stylesPack3dId, item2dId };
}

/** The battle-start record. Null until the hangar finishes loading, so a half-loaded inventory never passes for the real loadouts. */
export function snapshotLoadouts(hangar: unknown, now = Date.now() / 1000): LoadoutSnapshot | null {
  const h = asRecord(hangar);
  if (h.initialized !== 1) return null;

  const loadouts: HangarLoadout[] = [];
  for (const raw of asArray(h.loadouts)) {
    const lo = asRecord(raw);
    const vehicle = asRecord(lo.vehicle);
    const frontman = asRecord(lo.frontman);
    const id = asString(lo.id);
    const vehicleId = asNumber(vehicle.id);
    const frontmanId = asNumber(frontman.id);
    const modules = numbers(vehicle.modulesLayout);
    const equipment = numbers(vehicle.equipmentLayout);
    const perks = numbers(frontman.perksLayout);
    if (!id || vehicleId === null || frontmanId === null || !modules || !equipment || !perks) continue;
    // Missing is "not read", not the default outfit an empty list means.
    const outfit = Array.isArray(frontman.customizationLayout) ? numbers(frontman.customizationLayout) : null;
    loadouts.push({
      id,
      vehicle: {
        id: vehicleId,
        modulesLayout: modules,
        equipmentLayout: equipment,
        customization: customization(vehicle.customization),
      },
      frontman: { id: frontmanId, perksLayout: perks, customizationLayout: outfit },
    });
  }
  if (!loadouts.length) return null;
  return { taken_at: now, selected: asString(h.selectedLoadoutId), loadouts };
}

/** The played loadouts on the local player's postmatch row. */
export function playedLoadouts(me: Record<string, unknown> | null): PlayedLoadout[] {
  if (!me) return [];
  return asArray(me.loadouts).map((raw) => {
    const l = asRecord(raw);
    return {
      loadoutId: asString(l.loadoutId),
      vehicleId: asNumber(l.vehicleId),
      frontmanId: asNumber(l.frontmanId),
    };
  });
}

/** Cuts the heavy catalog down to the lookups attribution uses. */
export function compactCatalog(catalog: unknown): LoadoutCatalog | null {
  const c = asRecord(catalog);
  const vehicles = asArray(c.vehicles);
  if (!vehicles.length) return null;

  const out: LoadoutCatalog = {
    vehicles: new Map(),
    frontmen: new Map(),
    vehicleXp: new Map(),
    frontmanXp: new Map(),
    vehicleLevel: new Map(),
    modules: new Map(),
    groups: new Map(),
    equipment: new Map(),
    perks: new Map(),
    talismans: new Map(),
    cosmetics: new Map(),
    outfits: new Map(),
  };

  for (const raw of vehicles) {
    const v = asRecord(raw);
    const id = asNumber(v.id);
    if (id !== null) {
      out.vehicles.set(id, asString(v.technicalName) ?? "");
      const prog = asRecord(v.progression);
      const vxp = asString(prog.xpCode);
      if (vxp) out.vehicleXp.set(id, vxp);
      const vlevel = asNumber(prog.level);
      if (vlevel !== null) out.vehicleLevel.set(id, vlevel);
      const c2d = asRecord(v.customization2D);
      const items2d = new Map<number, Omit<LoadoutCamo, "id">>();
      for (const kind of ["camouflage", "paint"] as const) {
        for (const item of asArray(c2d[kind === "camouflage" ? "camouflages" : "paints"])) {
          const it = asRecord(item);
          const iid = asNumber(it.id);
          if (iid !== null) items2d.set(iid, { kind, code: asString(it.entitlementCode) });
        }
      }
      const styles = new Map<number, string | null>();
      for (const pack of asArray(asRecord(v.customization3D).stylesPacks)) {
        const p = asRecord(pack);
        const pid = asNumber(p.id);
        if (pid !== null) styles.set(pid, asString(p.entitlementCode));
      }
      out.cosmetics.set(id, { items2d, styles });
    }
    for (const g of asArray(v.moduleGroups)) {
      const group = asRecord(g);
      const gid = asNumber(group.id);
      if (gid !== null) out.groups.set(gid, asNumber(group.type));
    }
    for (const m of asArray(v.modules)) {
      const mod = asRecord(m);
      const mid = asNumber(mod.id);
      if (mid !== null) out.modules.set(mid, { name: asString(mod.name), group: asNumber(mod.groupId) });
    }
  }
  for (const raw of asArray(c.frontmen)) {
    const f = asRecord(raw);
    const id = asNumber(f.id);
    if (id === null) continue;
    out.frontmen.set(id, asString(f.technicalName) ?? "");
    const fxp = asString(asRecord(f.progression).xpCode);
    if (fxp) out.frontmanXp.set(id, fxp);
    const outfits = new Map<number, Omit<LoadoutOutfit, "id">>();
    for (const item of asArray(f.c11n)) {
      const it = asRecord(item);
      const iid = asNumber(it.id);
      // The entitlement code names the agent ("reaper_bushcraft"). The technical name does not.
      const code = asString(asRecord(asRecord(it.commerce).entitlement).code) ?? asString(it.technicalName);
      if (iid !== null) outfits.set(iid, { code, category: asNumber(it.categoryId) });
    }
    out.outfits.set(id, outfits);
  }
  for (const raw of asArray(c.equipment)) {
    const e = asRecord(raw);
    const id = asNumber(e.id);
    if (id !== null) out.equipment.set(id, { name: asString(e.technicalName), slot: asString(e.slot) });
  }
  for (const raw of asArray(c.perks)) {
    const p = asRecord(raw);
    const id = asNumber(p.id);
    if (id !== null) {
      out.perks.set(id, {
        name: asString(p.technicalName),
        tier: asNumber(p.tier),
        group: asNumber(p.group),
        skill_points: asNumber(p.skillPoints),
      });
    }
  }
  for (const raw of asArray(c.talismans)) {
    const t = asRecord(raw);
    const id = asNumber(t.id);
    // Every live talisman has a null technicalName, so the code names it.
    if (id !== null) out.talismans.set(id, asString(t.technicalName) ?? asString(t.entitlementCode));
  }
  return out;
}

/** The game marks an empty slot with 0. */
const filled = (id: number): boolean => id !== 0;

/** A positional layout's filled slots, each keeping the position it sits in. */
function slots<T>(layout: number[], part: (id: number, position: number) => T): T[] {
  const out: T[] = [];
  layout.forEach((id, position) => {
    if (filled(id)) out.push(part(id, position));
  });
  return out;
}

/** "5.101.0" -> agent 5, vehicle 101. Null for an id in any other shape. */
export function parseLoadoutId(id: string | null): { frontmanId: number; vehicleId: number; slot: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(id ?? "");
  if (!m) return null;
  return { frontmanId: Number(m[1]), vehicleId: Number(m[2]), slot: Number(m[3]) };
}

function unverified(played: PlayedLoadout, catalog: LoadoutCatalog | null, problem: string): MatchLoadout {
  return {
    loadout_id: played.loadoutId,
    vehicle_id: played.vehicleId,
    vehicle: played.vehicleId !== null ? (catalog?.vehicles.get(played.vehicleId) ?? null) || null : null,
    frontman_id: played.frontmanId,
    frontman: played.frontmanId !== null ? (catalog?.frontmen.get(played.frontmanId) ?? null) || null : null,
    modules: [],
    equipment: [],
    perks: [],
    customization: null,
    verified: false,
    problem,
  };
}

/** Resolves cosmetic ids from the catalog lists of the played vehicle and agent. Null unless the reader got both sides. */
function cosmetics(layout: HangarLoadout, catalog: LoadoutCatalog | null): LoadoutCustomization | null {
  // A snapshot from an older build has neither field.
  const c = layout.vehicle.customization ?? null;
  const worn = layout.frontman.customizationLayout ?? null;
  if (!c || !worn) return null;
  const own = catalog?.cosmetics.get(layout.vehicle.id);
  const wardrobe = catalog?.outfits.get(layout.frontman.id);
  const camo = filled(c.item2dId) ? own?.items2d.get(c.item2dId) : undefined;
  return {
    talisman: filled(c.talisman3dId) ? { id: c.talisman3dId, code: catalog?.talismans.get(c.talisman3dId) ?? null } : null,
    camo: filled(c.item2dId) ? { id: c.item2dId, kind: camo?.kind ?? null, code: camo?.code ?? null } : null,
    style: filled(c.stylesPack3dId) ? { id: c.stylesPack3dId, code: own?.styles.get(c.stylesPack3dId) ?? null } : null,
    outfit: worn.filter(filled).map((id) => {
      const item = wardrobe?.get(id);
      return { id, code: item?.code ?? null, category: item?.category ?? null };
    }),
  };
}

/**
 * Resolves the layout of one played loadout. Every id must agree three ways: the postmatch fields,
 * the encoding of the loadout id, and the hangar record. If one disagrees, the layout is withheld.
 */
function attributeOne(played: PlayedLoadout, snapshot: LoadoutSnapshot | null, catalog: LoadoutCatalog | null): MatchLoadout {
  if (!played.loadoutId) return unverified(played, catalog, "the result names no loadout id");
  if (played.vehicleId === null || played.frontmanId === null) {
    return unverified(played, catalog, "the result is missing the vehicle or agent id");
  }

  const encoded = parseLoadoutId(played.loadoutId);
  if (!encoded) return unverified(played, catalog, `unrecognised loadout id "${played.loadoutId}"`);
  if (encoded.vehicleId !== played.vehicleId || encoded.frontmanId !== played.frontmanId) {
    return unverified(
      played,
      catalog,
      `loadout id ${played.loadoutId} does not encode vehicle ${played.vehicleId} and agent ${played.frontmanId}`,
    );
  }

  if (!snapshot) return unverified(played, catalog, "no hangar was read when this battle started");

  const layout = snapshot.loadouts.find((l) => l.id === played.loadoutId);
  if (!layout) return unverified(played, catalog, `loadout ${played.loadoutId} was not in the hangar at battle start`);
  if (layout.vehicle.id !== played.vehicleId || layout.frontman.id !== played.frontmanId) {
    return unverified(
      played,
      catalog,
      `hangar loadout ${layout.id} is vehicle ${layout.vehicle.id} / agent ${layout.frontman.id}, ` +
        `the result says ${played.vehicleId} / ${played.frontmanId}`,
    );
  }

  const module = (id: number): LoadoutModule => {
    const m = catalog?.modules.get(id);
    const group = m?.group ?? null;
    return { id, name: m?.name ?? null, group, group_type: group !== null ? (catalog?.groups.get(group) ?? null) : null };
  };
  const equipment = (id: number, position: number): LoadoutEquipment => {
    const e = catalog?.equipment.get(id);
    return { id, name: e?.name ?? null, slot: e?.slot ?? null, position };
  };
  const perk = (id: number, position: number): LoadoutPerk => {
    const p = catalog?.perks.get(id);
    return {
      id,
      name: p?.name ?? null,
      tier: p?.tier ?? null,
      group: p?.group ?? null,
      skill_points: p?.skill_points ?? null,
      position,
    };
  };

  return {
    loadout_id: layout.id,
    vehicle_id: layout.vehicle.id,
    vehicle: catalog?.vehicles.get(layout.vehicle.id) || null,
    frontman_id: layout.frontman.id,
    frontman: catalog?.frontmen.get(layout.frontman.id) || null,
    // Modules are a set, not slots. An uninstalled module is absent.
    modules: layout.vehicle.modulesLayout.filter(filled).map(module),
    // Equipment and perks are slots, and 0 marks an empty one. No real part has id 0:
    // perks and equipment start at 1, modules at 210 in the live catalog.
    equipment: slots(layout.vehicle.equipmentLayout, equipment),
    perks: slots(layout.frontman.perksLayout, perk),
    customization: cosmetics(layout, catalog),
    verified: true,
    problem: null,
  };
}

export interface Attribution {
  loadouts: MatchLoadout[];
  /** Every reason something could not be proven, for the log. Empty when all is verified. */
  problems: string[];
}

/** Attributes a battle's played loadouts. `verified` rests on ids alone. Catalog names never change it. */
export function attributeLoadouts(
  played: PlayedLoadout[],
  snapshot: LoadoutSnapshot | null,
  catalog: LoadoutCatalog | null,
): Attribution {
  const problems: string[] = [];
  if (!played.length) {
    problems.push("the result lists no loadouts for this player");
    return { loadouts: [], problems };
  }

  const loadouts = played.map((p) => attributeOne(p, snapshot, catalog));
  for (const l of loadouts) if (l.problem) problems.push(l.problem);

  // The selection at battle start is the loadout the player entered with, so the played set must hold it.
  // The check covers the whole set, because the order of a multi-loadout result is not verified.
  // A missing selection means the hangar read came before the lock, so any loadout can have changed. All layouts are withheld.
  if (snapshot?.selected && !played.some((p) => p.loadoutId === snapshot.selected)) {
    const problem = `the hangar had ${snapshot.selected} selected, but the result does not list it`;
    problems.push(problem);
    for (const l of loadouts) {
      if (!l.verified) continue;
      l.verified = false;
      l.problem = problem;
      l.modules = [];
      l.equipment = [];
      l.perks = [];
      l.customization = null;
    }
  }

  return { loadouts, problems };
}
