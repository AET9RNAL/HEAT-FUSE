(function() {
  // Everything the battle_hud crosshair widgets bind to (COHTML_FRONTEND_MAP.md §8.9).
  var r = {};
  try {
    var _get = function(n) { try { var v = window[n]; return v && typeof v === 'object' ? v : null; } catch(e) { return null; } };
    var _copy = function(n, depth) {
      var v = _get(n);
      if (!v) return null;
      var o = __fuseDeep(v, depth || 4);
      if (o) delete o.isFree;
      return o;
    };
    var x = {};

    // Engine models, whole: the HUD reads them directly in its bindings.
    x.config        = _copy('crosshair_config');
    x.position      = _copy('crosshair_position');
    x.spread        = _copy('crosshair_spread');
    x.reloading     = _copy('crosshair_reloading');
    x.active_reload = _copy('active_reload');
    x.machine_gun   = _copy('machineGunModel');
    x.primary       = _copy('primaryAmmoLoader', 5);
    x.secondary     = _copy('secondaryAmmoLoader', 5);
    x.timer         = _copy('ammoLoaderTimer');
    var _zm = _get('crosshair_zoom');
    x.zooms = _zm ? __fuseDeep(__fuseArr(_zm.zooms), 3) : null;
    // Whole buff list: the crosshair ability details index into it by tag
    // (aps, SuppressiveFire, HuntersMark, rampage, AutoGrenadeTurret, JammerField).
    var _peb = _get('playerEffectBar');
    x.buffs = _peb ? __fuseDeep(__fuseArr(_peb.buffs), 4) : null;
    // Effective range at the aim point, from the fields the game colours its rangefinder with:
    // degradation step 0 is full effect, 1-10 fade toward the falloff colour. A missile inside its arming
    // distance and a machine gun beyond its effective distance are out of range.
    // stage: 0 nothing under the aim, 1 effective, 2 falloff, 3 out.
    var _cf = x.config || {}, _mg = x.machine_gun || {};
    var _dist = Number(_cf.distance) || 0;
    var _step = Number(_cf.degradationProgress) || 0;
    var _close = _dist > 0 && (Number(_cf.tooCloseDistance) || 0) > _dist;
    var _mgDist = Number(_mg.distance) || 0;
    var _mgOut = !!_mg.active && _mgDist > 0 && (Number(_mg.effectiveDistance) || 0) < _mgDist;
    x.range = {
      distance: _dist,
      step: _step,
      too_close: _close ? 1 : 0,
      mg_out: _mgOut ? 1 : 0,
      mg_effective: Number(_mg.effectiveDistance) || 0,
      stage: _close || _mgOut || _step >= 10 ? 3 : _dist <= 0 ? 0 : _step > 0 ? 2 : 1
    };
    var _dd = _get('dealtDamageActionModel');
    x.damage = _dd ? { appearance: _dd.appearance || '', isAutoAim: !!_dd.isAutoAim, isEnabled: !!_dd.isEnabled, radius: Number(_dd.radius) || 0 } : null;

    // Gates the widgets check before they draw.
    var _on = function(n) { var v = _get(n); return v && v.active ? 1 : 0; };
    x.view = {
      ammo:        _on('ammo_indicator_view_state'),
      smart_mines: _on('ammo_indicator_view_state_smart_mines'),
      shoot:       _on('shoot_indicator_view_state'),
      ray_aiming:  _on('rayAimingModel'),
      ability:     _on('ability_panel_view_state')
    };

    // FluidJet impact dots: one position + one model per id.
    var _hpe = _get('hitPointEntries'), _pts = [];
    if (_hpe && _hpe.ids) {
      var _ids = __fuseArr(_hpe.ids);
      for (var _hi = 0; _hi < _ids.length; _hi++) {
        var _id = _ids[_hi];
        _pts.push({ id: __fuseNum(_id), position: _copy('hitPointPosition' + _id, 3), model: _copy('hitPointModel' + _id, 3) });
      }
    }
    x.hit_points = _pts;

    // Which game elements draw now: aim, loaders, reload timer, reticle.
    var _first = function(root, tags) {
      if (!root) return null;
      for (var i = 0; i < tags.length; i++) if (root.querySelector(tags[i])) return tags[i];
      return null;
    };
    var _aimSw = document.querySelector('aim-switcher');
    var _loaders = {};
    var _alw = document.querySelector('ammo-loader-widget');
    var _lels = _alw ? _alw.querySelectorAll('[model]') : [];
    for (var _li = 0; _li < _lels.length; _li++) {
      var _lm = String(_lels[_li].getAttribute('model') || '');
      var _slot = _lm.indexOf('secondaryAmmoLoader') >= 0 ? 'secondary' : _lm.indexOf('primaryAmmoLoader') >= 0 ? 'primary' : null;
      if (_slot && !_loaders[_slot]) _loaders[_slot] = _lels[_li];
    }
    x.ui = {
      aim:              _aimSw && _aimSw.firstElementChild ? _aimSw.firstElementChild.tagName.toLowerCase() : null,
      primary_loader:   _loaders.primary ? _loaders.primary.tagName.toLowerCase() : null,
      secondary_loader: _loaders.secondary ? _loaders.secondary.tagName.toLowerCase() : null,
      reload_timer:     _first(document.querySelector('reload-timer-widget'), ['common-reload-timer', 'machine-gun-reload-timer',
                          'he-secondary-reload-timer', 'mim-missiles-reload-timer', 'reloading-pause']),
      reticle:          _first(document.querySelector('reticle-widget'), ['guided-missile-reticle', 'default-reticle'])
    };

    // JS presentation models carry a counter (DefaultLoaderAppearance3). Each widget names
    // its live ones in its bindings, so read the names there, not by walking window.
    var _cache = window.__fuseXhJs || (window.__fuseXhJs = { at: 0, scopes: null });
    var _stale = !_cache.scopes || Date.now() - _cache.at > 2000;
    if (!_stale) {
      for (var _sk in _cache.scopes) {
        for (var _bk in _cache.scopes[_sk]) if (!_get(_cache.scopes[_sk][_bk])) _stale = true;
      }
    }
    if (_stale) {
      var _re = /\{\{([A-Z][A-Za-z]*?)(\d+)[.}]/g;
      var _scan = function(el, out) {
        var h = '', m;
        if (!el) return out;
        try { h = el.innerHTML || ''; } catch(e) { return out; }
        _re.lastIndex = 0;
        while ((m = _re.exec(h))) out[m[1]] = m[1] + m[2];
        return out;
      };
      // Module-level models exist once per page.
      var _page = { CenteredContainerStateModel: 'CenteredContainerStateModel1', DisplayedDamageModel: 'DisplayedDamageModel1',
        NormalizedAimAppearance: 'NormalizedAimAppearance1', ViewInfoModel: 'ViewInfoModel1' };
      var _wtags = ['crosshair-aim-widget', 'reload-timer-widget', 'target-hit-indicator', 'kill-indicator', 'loader-switching-hint-widget'];
      for (var _wi = 0; _wi < _wtags.length; _wi++) _scan(document.querySelector(_wtags[_wi]), _page);
      // Both loader slots can use the same model family (two HeLoaderAppearance), so keep them apart.
      _cache.scopes = { page: _page, primary: _scan(_loaders.primary || null, {}), secondary: _scan(_loaders.secondary || null, {}) };
      _cache.at = Date.now();
    }
    var _jsOf = function(scope) {
      var o = {}, any = false;
      for (var b in scope) {
        var v = _copy(scope[b], 4);
        if (v) { o[b] = v; any = true; }
      }
      return any ? o : null;
    };
    x.js = _jsOf(_cache.scopes.page) || {};
    // Live instance names, for markup that binds to these models.
    x.js_names = _cache.scopes.page;
    x.loader_js = { primary: _jsOf(_cache.scopes.primary), secondary: _jsOf(_cache.scopes.secondary) };

    // The HUD drains dealtDamageActionModel in the same update (clearDamages), so a poll never
    // sees an entry. Copy each one on its way out; the game call itself runs unchanged.
    var _hits = window.__fuseXhHits || (window.__fuseXhHits = { list: [], last: -1 });
    if (_dd && typeof _dd.clearDamages === 'function' && !_dd.clearDamages.__fuseXh) {
      (function(model, orig) {
        var wrapped = function() {
          try {
            var acts = __fuseArr(model.damageActions);
            for (var i = 0; i < acts.length; i++) {
              var a = acts[i];
              if (!a || a.id == null) continue;
              var id = Number(a.id);
              if (id < _hits.last - 1000) _hits.last = -1;
              if (id <= _hits.last) continue;
              _hits.last = id;
              var rec = __fuseDeep(a, 3) || {};
              rec.t = Date.now();
              _hits.list.push(rec);
            }
            if (_hits.list.length > 32) _hits.list.splice(0, _hits.list.length - 32);
          } catch(e) {}
          return orig.apply(this, arguments);
        };
        wrapped.__fuseXh = 1;
        model.clearDamages = wrapped;
      })(_dd, _dd.clearDamages);
    }
    x.hits = _hits.list.slice();

    x.screen = [window.innerWidth || 0, window.innerHeight || 0];
    r.crosshair = x;
  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
