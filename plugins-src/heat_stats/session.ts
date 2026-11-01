/** Shapes shared by recording and submitting. */

export type Num = number | null;

/**
 * One reading, taken each second
 * hp health, en energy, bo boost, pi ping, fp fps, al/es ally/enemy score,
 * ki kills, de deaths, as assists, da damage, co/dn confirms/denies,
 * sc score, ms match state. A `d` prefix is the change since the last sample.
 */
export interface Sample {
  t: number; hp: Num; en: Num; bo: Num; pi: Num; fp: Num;
  al: Num; es: Num; ki: Num; de: Num; as: Num; da: Num; co: Num; dn: Num; sc: Num;
  ms: string | null;
  dki: number; dde: number; das: number; dda: number; dal: number; des: number; dco: number; ddn: number; dsc: number;
}

export type Phase = "idle" | "waiting" | "recording" | "summarizing" | "finalizing";

/** Session column -> postmatch player field. */
export const PM_STAT_MAP: Record<string, string> = {
  p_shell_hits_damage: "shellHitsDamage",
  p_crit_ammo_damage: "critAmmoDamage",
  p_crit_fuel_damage: "critFuelDamage",
  p_crit_engine_damage: "critEngineDamage",
  p_ability_damage_done: "abilityDamageDone",
  p_ability_damage_taken: "abilityDamageTaken",
  p_blocked_damage: "blockedDamage",
  p_ramming_damage: "rammingDamage",
  p_heal: "heal",
  p_damage_taken: "damageTaken",
  p_captured_base: "capturedBase",
  p_uncaptured_base: "uncapturedBase",
  p_capture_points: "capturePoints",
  p_hits_done: "hitsDone",
  p_hits_taken: "hitsTaken",
  p_shoot_done: "shootDone",
  p_crit_hits_done: "criticalHitsDone",
  p_crit_hits_taken: "criticalHitsTaken",
  p_noncrit_hits_done: "nonCriticalHitsDone",
  p_noncrit_hits_taken: "nonCriticalHitsTaken",
  p_noncrit_shoot_done: "nonCriticalShootDone",
  p_rp_crit_fuel_damage: "rolePointsCritFuelDamage",
};

/** A battle whose postmatch panel was captured, ready to upload. */
export interface FinishedBattle {
  session: Record<string, unknown>;
  samples: Sample[];
  startedAt: number;
  peakPing: number;
  roster: { ally: unknown[]; enemy: unknown[] } | null;
}
