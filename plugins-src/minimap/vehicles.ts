export type VehicleClass = "defender" | "assault" | "marksman";

export const ROSTER: { slug: string; name: string; role: VehicleClass }[] = [
  { slug: "a02_m1e1_120", name: "M1E1", role: "defender" },
  { slug: "gb01_challenger", name: "FV4030 X", role: "defender" },
  { slug: "a01_chrysler_xm1_volcano", name: "XM1V", role: "defender" },
  { slug: "a03_m60a3", name: "M60A3E2", role: "defender" },
  { slug: "r02_t_72a", name: "T-72SH", role: "defender" },
  { slug: "a17_m1150_abv", name: "M1150 ABV", role: "defender" },
  { slug: "a13_chrysler_xm1_ares_90", name: "XM1 90", role: "assault" },
  { slug: "a12_alvt", name: "ALVT", role: "assault" },
  { slug: "r08_object_287", name: "Obj. 287", role: "assault" },
  { slug: "r01_t_62a", name: "T-62AV", role: "assault" },
  { slug: "a07_hstv_l", name: "HSTV-L", role: "assault" },
  { slug: "a05_m551a1_sheridan", name: "M551A1", role: "assault" },
  { slug: "a14_m60a1", name: "M60A1", role: "assault" },
  { slug: "a20_m60a2", name: "M60A2", role: "assault" },
  { slug: "g01_leopard_1_a6_120", name: "Leo 1A6A1", role: "marksman" },
  { slug: "f05_amx_10_rc", name: "AMX10 RC", role: "marksman" },
  { slug: "g06_leopard2fk_atgm", name: "Leo 2FK", role: "marksman" },
  { slug: "g11_leopard2k_st", name: "LEO 2KST", role: "marksman" },
  { slug: "a08_m3_bradley", name: "M3E1", role: "marksman" },
  { slug: "g07_marder1a3", name: "Marder 1A3", role: "marksman" },
];

/** Group order in the editor. "other" holds a vehicle seen in a match that is not in the roster. */
export const CLASS_ORDER = ["defender", "assault", "marksman", "other"];

// Game names (`<slug>.specs.specification.vehicleName`) of the vehicles that have no class yet.
const OTHER_NAMES: Record<string, string> = {
  a10_m1_railgun: "M1R",
  a11_agds: "AGDS",
  ch01_ptz89_chun_li: "PTZ89C",
  g05_leopard_1_a1: "Leo 1A1B",
  r05_t_64b: "T-64BVM",
  r06_object_279: "Obj. 279A",
  r10_bat_4m_eneysp: "BAT-4M",
  r13_t_62m: "T-62MS",
};

export function prettyVehicle(slug: string): string {
  const s = slug.replace(/^[a-z]{1,3}\d{1,3}_/i, "").replace(/_/g, " ").trim();
  return s ? s.toUpperCase() : slug;
}

export interface RosterVehicle {
  slug: string;
  name: string;
  role: string;
  /** False for a vehicle without a render in assets/tanks. */
  art: boolean;
}

/** The whole roster by class, then any other vehicle seen in a match. */
export function roster(seen: string[], art: (slug: string) => boolean): RosterVehicle[] {
  const known = new Set(ROSTER.map((v) => v.slug));
  const extra = [...new Set(seen.filter((s) => s && !known.has(s)))].map((slug) => ({
    slug,
    name: OTHER_NAMES[slug] ?? prettyVehicle(slug),
    role: "other",
  }));
  return [...ROSTER, ...extra]
    .map((v) => ({ ...v, art: art(v.slug) }))
    .sort((a, b) => CLASS_ORDER.indexOf(a.role) - CLASS_ORDER.indexOf(b.role));
}
