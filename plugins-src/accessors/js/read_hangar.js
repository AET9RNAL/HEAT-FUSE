// Hangar reader. Runs on meta/index.html. Requires common.js (helpers +
// __fuseFindContext) and postmatch.js (__fusePmNormalize) composed before it.
//
// Emits:
//   hangar_ready   - 1 once AccountStore inventory is initialized, else 0
//   hangar         - structured snapshot: currencies, entitlements, every
//                    configured loadout (modules/equipment/perks/customization
//                    layouts), vehicle & agent ownership + XP progression,
//                    equipment catalog
//   pm_result      - full normalized postmatch tree when the hangar's
//                    PostbattleStore still holds results (battle_app may be
//                    gone by then). Gated by __FUSE_WANT_PM like the battle
//                    reader; defaults to included when run standalone.
//   cur_*          - flat currency conveniences
//   hangar_loadout - selected loadout id (e.g. "3.3.0")
//
// When composed with `var __FUSE_HANGAR_FULL = 1;` it additionally emits
// `catalog`: per-vehicle module lists, perk catalog, talismans and
// customization items joined with ownership. That pull is heavy - it is meant
// for the on-demand fetchSnapshot("catalog") path, not the poll cadence.
(function () {
  var r = {};
  try {
    var num = __fuseNum, arr = __fuseArr, deep = __fuseDeep;
    var wantPm = typeof __FUSE_WANT_PM === "undefined" ? true : !!__FUSE_WANT_PM;
    var wantFull = typeof __FUSE_HANGAR_FULL !== "undefined" && !!__FUSE_HANGAR_FULL;

    var ctx =
      __fuseFindContext() ||
      __fuseFindContext(function (v) {
        return v.PostbattleStore;
      });
    if (!ctx || !ctx.AccountStore) {
      r.hangar_ready = 0;
      return JSON.stringify(r);
    }

    var inv = ctx.AccountStore.inventory;
    var invv = inv && inv.data && inv.data.value;
    var initialized = !!(invv && invv.inventoryInitialized);
    r.hangar_ready = initialized ? 1 : 0;

    // Entitlements are a dictionary {code: {amount, expiresAt?}}. `owned`
    // follows hasEntitlement (amount > 0); `entitled` follows isPerkLearned
    // (key present at all). Keep both - they are different predicates.
    var ent = {};
    var entFull = {};
    var ents = invv && invv.entitlements;
    if (ents && typeof ents === "object") {
      for (var code in ents) {
        var e = ents[code];
        var amt = e && typeof e === "object" ? e.amount : e;
        ent[code] = amt != null ? num(amt) : null;
        if (wantFull) entFull[code] = deep(e, 3);
      }
    }
    var ownedOf = function (code) {
      return code != null && ent[code] != null && Number(ent[code]) > 0 ? 1 : 0;
    };
    var entitledOf = function (code) {
      return code != null && Object.prototype.hasOwnProperty.call(ent, code) ? 1 : 0;
    };

    // Display level = completed level-up thresholds + 1 (the raw level
    // entitlement amount is the completed count, NOT the level). At cap the
    // vehicle UI shows overflow XP as current=goal with isCup; agent UI shows
    // 1/1 - expose raw prev/next thresholds so consumers can pick.
    var calcProg = function (prog) {
      if (!prog) return null;
      var xpCode = prog.experienceEntitlement && prog.experienceEntitlement.code;
      var lvCode = prog.levelEntitlement && prog.levelEntitlement.code;
      var spCode = prog.skillPointsEntitlement && prog.skillPointsEntitlement.code;
      var xp = xpCode != null && ent[xpCode] != null ? Number(ent[xpCode]) : 0;
      var lvAmt = lvCode != null && ent[lvCode] != null ? Number(ent[lvCode]) : 0;
      var levels = arr(prog.levels)
        .map(function (l) {
          return Number(num(l && l.experiencePoints)) || 0;
        })
        .sort(function (a, b) {
          return a - b;
        });
      var reached = 0,
        prev = 0,
        next = null;
      for (var i = 0; i < levels.length; i++) {
        if (xp >= levels[i]) {
          reached++;
          prev = levels[i];
        } else {
          next = levels[i];
          break;
        }
      }
      // levels[] may or may not contain the baseline level-1 entry
      // (experiencePoints 0). If it does, `reached` already counts level 1;
      // otherwise the first threshold is for level 2 and baseline adds one.
      var base = levels.length && levels[0] > 0 ? 1 : 0;
      var isCup = next === null && levels.length > 0;
      var current = xp - prev;
      var goal = isCup ? current : next - prev;
      var out = {
        // The entitlement this progression counts XP in: postmatch rewards are
        // keyed by code, so this is what names a battle's XP for this vehicle/agent.
        xpCode: xpCode != null ? String(xpCode) : null,
        xp: xp,
        levelAmount: lvAmt,
        level: reached + base,
        maxLevel: levels.length + base,
        current: current,
        goal: goal,
        isCup: isCup ? 1 : 0,
        prevThreshold: prev,
        nextThreshold: next,
      };
      if (spCode != null) out.skillPoints = ent[spCode] != null ? num(ent[spCode]) : 0;
      return out;
    };

    // Loadouts: inventory.data.value.loadouts is the source; customLoadouts is
    // a copy of it. Keep the whole normalized record per loadout.
    var rawLoadouts = arr(invv && invv.loadouts);
    var loadouts = [];
    for (var li = 0; li < rawLoadouts.length; li++) {
      var lo = rawLoadouts[li];
      if (!lo) continue;
      var veh = lo.vehicle || {};
      var lay = veh.layout || {};
      var cus = veh.customization || {};
      var fm = lo.frontman || {};
      loadouts.push({
        id: lo.id != null ? String(lo.id) : null,
        vehicle: {
          id: veh.id != null ? num(veh.id) : null,
          modulesLayout: arr(lay.modulesLayout).map(num),
          equipmentLayout: arr(lay.equipmentLayout).map(num),
          customization: {
            talisman3dId: cus.talisman3dId != null ? num(cus.talisman3dId) : null,
            stylesPack3dId: cus.stylesPack3dId != null ? num(cus.stylesPack3dId) : null,
            item2dId: cus.item2dId != null ? num(cus.item2dId) : null,
          },
        },
        frontman: {
          id: fm.id != null ? num(fm.id) : null,
          perksLayout: arr(fm.perksLayout).map(num),
          customizationLayout: arr(fm.customizationLayout).map(num),
        },
      });
    }

    var selectedId =
      ctx.AccountStore.loadout && ctx.AccountStore.loadout.id != null ? String(ctx.AccountStore.loadout.id) : null;

    var hangar = {
      initialized: initialized ? 1 : 0,
      currencies: deep(invv && invv.currencies, 3),
      currenciesDetails: deep(invv && invv.currenciesDetails, 4),
      entitlements: ent,
      selectedLoadoutId: selectedId,
      loadouts: loadouts,
      vehicles: [],
      frontmen: [],
      equipment: [],
    };

    var sp = typeof specStorage !== "undefined" ? specStorage : null;
    if (sp) {
      var valls = sp.vehicles && sp.vehicles.all ? arr(sp.vehicles.all) : [];
      for (var vi = 0; vi < valls.length; vi++) {
        var spec = valls[vi] && valls[vi].specification;
        if (!spec) continue;
        var vc = spec.commerce && spec.commerce.entitlement && spec.commerce.entitlement.code;
        var vrow = {
          id: spec.id != null ? num(spec.id) : null,
          technicalName: spec.technicalName || null,
          vehicleName: spec.vehicleName || null,
          callSign: spec.callSign || null,
          role: spec.role || null,
          isHidden: spec.isHidden ? 1 : 0,
          defaultFrontmanId: spec.defaultFrontmanId != null ? num(spec.defaultFrontmanId) : null,
          frontmen: arr(spec.frontmen).map(num),
          entitlementCode: vc != null ? vc : null,
          owned: ownedOf(vc),
          entitled: entitledOf(vc),
          progression: calcProg(spec.progression),
        };
        if (wantFull) {
          var groups = arr(spec.modulesGroups);
          var groupOf = {};
          for (var gi = 0; gi < groups.length; gi++) {
            var gmods = arr(groups[gi] && groups[gi].modules);
            for (var gm = 0; gm < gmods.length; gm++) groupOf[num(gmods[gm])] = num(groups[gi].id);
          }
          vrow.moduleGroups = groups.map(function (g) {
            return { id: num(g && g.id), type: g && g.type != null ? g.type : null, title: g && g.title ? g.title : null, modules: arr(g && g.modules).map(num) };
          });
          vrow.modules = arr(spec.modules).map(function (mo) {
            var g = (mo && mo.general) || {};
            var mc = g.commerce && g.commerce.entitlement && g.commerce.entitlement.code;
            return {
              id: mo && mo.id != null ? num(mo.id) : null,
              name: g.name || null,
              groupId: mo && mo.id != null ? groupOf[num(mo.id)] != null ? groupOf[num(mo.id)] : null : null,
              flags: g.flags != null ? num(g.flags) : 0,
              isDefault: (num(g.flags) & 1) !== 0 ? 1 : 0,
              isBuildForming: (num(g.flags) & 2) !== 0 ? 1 : 0,
              entitlementCode: mc != null ? mc : null,
              owned: ownedOf(mc),
              entitled: entitledOf(mc),
            };
          });
          var c2 = spec.customization2D || {};
          var c3 = spec.customization3D || {};
          var c2d = function (list) {
            return arr(list).map(function (it) {
              var cc = it && it.commerce && it.commerce.entitlement && it.commerce.entitlement.code;
              return {
                id: it && it.id != null ? num(it.id) : null,
                entitlementCode: cc != null ? cc : null,
                owned: ownedOf(cc),
                entitled: entitledOf(cc),
              };
            });
          };
          vrow.customization2D = { camouflages: c2d(c2.camouflages), paints: c2d(c2.paints) };
          vrow.customization3D = { stylesPacks: c2d(c3.stylesPacks) };
        }
        hangar.vehicles.push(vrow);
      }

      var falls = sp.frontmen && sp.frontmen.all ? arr(sp.frontmen.all) : [];
      for (var fi = 0; fi < falls.length; fi++) {
        var fs = falls[fi];
        if (!fs) continue;
        var fc = fs.commerce && fs.commerce.entitlement && fs.commerce.entitlement.code;
        var frow = {
          id: fs.id != null ? num(fs.id) : null,
          technicalName: fs.technicalName || null,
          name: fs.name || null,
          lastName: fs.lastName || null,
          role: fs.role || null,
          perks: arr(fs.perks).map(num),
          entitlementCode: fc != null ? fc : null,
          owned: ownedOf(fc),
          entitled: entitledOf(fc),
          progression: calcProg(fs.progression),
        };
        if (wantFull) frow.c11n = deep(fs.elements && fs.elements.c11n, 6);
        hangar.frontmen.push(frow);
      }

      hangar.equipment = arr(sp.equipments && sp.equipments.all).map(function (eq) {
        return {
          id: eq && eq.id != null ? num(eq.id) : null,
          technicalName: (eq && eq.technicalName) || null,
          slot: (eq && eq.slot) || null,
        };
      });

      if (wantFull) {
        var perkList = sp.perks && sp.perks.perks ? arr(sp.perks.perks) : [];
        var talismans = sp.vehicleSharedC11n && sp.vehicleSharedC11n.talismans ? arr(sp.vehicleSharedC11n.talismans) : [];
        r.catalog = {
          perks: perkList.map(function (p) {
            var pc = p && p.commerce && p.commerce.entitlement && p.commerce.entitlement.code;
            return {
              id: p && p.id != null ? num(p.id) : null,
              technicalName: (p && p.technicalName) || null,
              title: (p && p.title) || null,
              tier: p && p.tier != null ? num(p.tier) : null,
              group: p && p.group != null ? num(p.group) : null,
              skillPoints: p && p.skillPoints != null ? num(p.skillPoints) : null,
              entitlementCode: pc != null ? pc : null,
              owned: ownedOf(pc),
              entitled: entitledOf(pc),
            };
          }),
          talismans: talismans.map(function (ta) {
            var tc = ta && ta.commerce && ta.commerce.entitlement && ta.commerce.entitlement.code;
            return {
              id: ta && ta.id != null ? num(ta.id) : null,
              technicalName: (ta && ta.technicalName) || null,
              entitlementCode: tc != null ? tc : null,
              owned: ownedOf(tc),
              entitled: entitledOf(tc),
            };
          }),
          entitlementDetails: entFull,
        };
      }
    }

    r.hangar = hangar;
    r.hangar_loadout = selectedId;

    // The queue the player is set to. UserStore holds the current pick (the
    // platoon store holds its own, which is not it), and the catalogue turns
    // the 64-bit id into the art slug the mode is named by: versus_ai,
    // quick_match, plant_and_defuse, 20v20_conquest, ftue, custom_game...
    // This is what tells a Versus AI battle from a quick match that happened
    // to fill with bots; the roster can only ever guess at it.
    try {
      var personality = ctx.UserStore && ctx.UserStore.internalPersonality;
      var picked = personality && personality.internalValue && personality.internalValue.playMode;
      if (picked != null) {
        r.play_mode = String(num(picked));
        var modeInfo = ctx.PlayModesStore && ctx.PlayModesStore.internalPlayModeInfo;
        var modes = modeInfo && modeInfo.internalValue && arr(modeInfo.internalValue.all);
        for (var pmi = 0; modes && pmi < modes.length; pmi++) {
          var mode = modes[pmi];
          if (!mode || mode.playMode == null || String(num(mode.playMode)) !== r.play_mode) continue;
          var art = String(mode.icon || mode.bgImg || "").match(/([^/]+?)(?:_bg)?\.png$/i);
          if (art) r.play_mode_slug = art[1];
          break;
        }
      }
    } catch (e) {}
    var cur = hangar.currencies || {};
    for (var ck in cur) r["cur_" + ck] = cur[ck];

    // Postmatch survives the death of battle_app inside PostbattleStore.
    try {
      var pbs = ctx.PostbattleStore;
      if (pbs && pbs.results) {
        var pmr = __fusePmNormalize(pbs.results, pbs.topPlayers, typeof tacticalInfoModel !== "undefined" ? tacticalInfoModel : null);
        if (pmr) {
          r.pm_available = 1;
          r.pm_fingerprint = String(pmr.battleId) + ":" + String(pmr.finishedAt);
          if (wantPm) r.pm_result = pmr;
        }
      }
    } catch (e) {
      r.pm_err = e.message;
    }
  } catch (e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
