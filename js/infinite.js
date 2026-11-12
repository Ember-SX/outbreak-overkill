/*
 * Infinite Mode (v0.10, reworked in v0.12 and v0.13). Extends OO.Game.prototype, like boss.js and tactical.js.
 *
 * Chosen on the main menu (Mode: Infinite). The run doesn't end at 15:00 (CONFIG.RUN_LENGTH):
 * it goes into overtime and keeps going until the team is overrun. There is no evac and no way
 * to call one. In overtime (m = minutes past 15:00):
 *
 *   - enemy HP grows linearly (1 + hpLin * m, no compounding: weapons stay viable), damage on a
 *     hybrid curve (linear x gentle compound); speed creeps up; the director packs the screen
 *     tighter and mixes in Brutes; stampedes (always the same fixed size) come more often, with
 *     crossfire pairs later on; Stalker hunts, skinner rings and the Hare Trigger keep coming back;
 *   - necrosis: every source of healing weakens, down to a floor;
 *   - the per-hit ceiling still holds: no single hit kills a healthy operative.
 *
 * Leveling never stops. Before 15:00 the XP curve is Standard's; in overtime it climbs steeply
 * and steadily (polynomial, from the level you reach 15:00 with, or 60; CONFIG.INFINITE).
 * Apex mutations (OO.APEX) only appear in overtime: on every overtime level-up, and in place of
 * normal cards once an operative's weapons and gear are all maxed ("max rank"). Before 15:00 max
 * rank gets herb / credits cards, as in Standard. The heavy mutations have hard stack caps, and
 * damage stacking (Berserker, Adrenal, Overclock) has diminishing returns; the light, stateless
 * ones (a credit multiplier, a one-off XP, heal or credit drop) never run out, so there is
 * always a card to take.
 *
 * Host-authoritative in co-op: the host runs all of this; the client mirrors apex stacks and the
 * overtime flag from the snapshot.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const G = OO.Game.prototype;
  const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);

  // ================================================================ overtime scaling
  /** Minutes past 15:00 (0 outside Infinite Mode). */
  G.overtimeMinutes = function (time = this.time) {
    if (!this.infinite) return 0;
    return Math.max(0, (time - OO.CONFIG.RUN_LENGTH) / 60);
  };
  /** Hybrid growth: a linear part times a gentle compound part (1 at m = 0). */
  const hybrid = (m, lin, rate) => (1 + lin * m) * Math.pow(1 + rate, m);
  /**
   * Enemy HP in overtime: purely linear-additive (v0.13), 1 + hpLin * m (bosses: x bossHpScale on
   * the rate). No compounding, so weapons stay viable at 30-40+ minutes; late pressure comes from
   * crowding and stampedes instead.
   */
  G.overtimeHp = function (d) {
    const m = this.overtimeMinutes();
    if (!m || (d && d.crate)) return 1;
    const I = OO.CONFIG.INFINITE, k = d && d.boss ? I.bossHpScale : 1;
    return 1 + I.hpLin * k * m;
  };
  G.overtimeDmg = function (time) {
    const m = this.overtimeMinutes(time);
    if (!m) return 1;
    const I = OO.CONFIG.INFINITE;
    return hybrid(m, I.dmgLin, I.dmgPerMin);
  };
  G.overtimeSpeed = function () {
    const I = OO.CONFIG.INFINITE;
    return 1 + Math.min(I.maxSpeed, I.speedPerMin * this.overtimeMinutes());
  };
  /** Necrosis: healing effectiveness in overtime (1 otherwise). */
  G.healMul = function () {
    const m = this.overtimeMinutes();
    if (!m) return 1;
    const I = OO.CONFIG.INFINITE;
    return Math.max(I.minHeal, 1 - I.necrosisPerMin * m);
  };

  /**
   * A Shambler's current HP *without* the overtime multiplier. Horde-scaled damage (drum blasts,
   * Sentry rounds, Necrotic Pulse, Volatile Blood) uses this, so in overtime the horde slowly
   * outgrows it instead of every build becoming immortal.
   */
  G.hordeHp = function () {
    const sh = OO.ENEMIES.shambler;
    return sh.hp * this.enemyHpMul(sh, this.strain.level) / this.overtimeHp(sh);
  };

  G.enterOvertime = function () {
    this.overtime = true;
    this.mark = { credits: this.credits, kills: this.kills };
    this.otLevel = this.team.level;   // the overtime XP climb starts from here (game.xpToNext)
    this.banner('Overtime. Nobody is coming. Hold out as long as you can', 'boss');
    OO.Audio.play('boss');
    this.shakeAll(8);
    this.emit(['ot']);
    if (this.progress) this.progress.unlock('no_return');
  };

  // ================================================================ Apex mutations
  /** True when nothing in the normal upgrade pool is left for this operative. */
  G.atMaxRank = function (p) {
    const C = OO.CONFIG;
    if (p.weapons.some((w) => w.level < w.maxLevel)) return false;
    if (p.passiveOrder.some((id) => p.passives[id] < OO.PASSIVES[id].max)) return false;
    if (p.weapons.length < C.MAX_WEAPONS && Object.keys(OO.WEAPONS).some((id) => !OO.WEAPONS[id].evolved && !this.getWeapon(p, id))) return false;
    if (p.passiveOrder.length < C.MAX_PASSIVES && Object.keys(OO.PASSIVES).some((id) => !p.passives[id])) return false;
    return true;
  };

  /**
   * Infinite Mode level-up cards: normal upgrades while there are any, topped up with Apex
   * mutations when fewer than n remain (max rank), and at least INFINITE.apexInOvertime of them
   * on every overtime level-up.
   */
  G.mixApex = function (p, picked, n) {
    // No Apex mutations before 15:00: until overtime, max rank gets the usual herb / credits cards.
    if (!this.overtime) return picked.length ? picked : [{ kind: 'herb' }, { kind: 'credits' }];
    const want = Math.max(n - picked.length, this.overtime ? OO.CONFIG.INFINITE.apexInOvertime : 0);
    if (want <= 0) return picked;
    const apex = this.rollApex(p, want);
    const keep = picked.slice(0, Math.max(0, n - apex.length));
    if (!picked.length && !this.maxRankShown && p.local) {
      this.maxRankShown = true;
      this.banner('Max rank. Apex mutations unlocked', 'good');
    }
    const out = keep.concat(apex);
    if (!out.length) out.push({ kind: 'herb' }, { kind: 'credits' });
    return out;
  };

  /** True if this mutation can still be taken (stack caps; Overclock is capped per weapon). */
  G.apexOpen = function (p, id, weaponId) {
    const a = OO.APEX[id];
    if (!a) return false;
    if (id === 'overclock') {
      const w = p.weapons.find((q) => q.id === weaponId);
      return !!w && (w.over || 0) < a.max;
    }
    return !a.max || (p.apex[id] || 0) < a.max;
  };

  G.rollApex = function (p, n) {
    const pool = [];
    for (const id in OO.APEX) {
      const a = OO.APEX[id];
      if (id === 'overclock') {
        const open = p.weapons.filter((w) => this.apexOpen(p, id, w.id));
        for (const w of open) pool.push([{ kind: 'apex', id, weapon: w.id }, a.weight / open.length]);
        continue;
      }
      if (!this.apexOpen(p, id)) continue;
      pool.push([{ kind: 'apex', id }, a.weight]);
    }
    const out = [];
    while (out.length < n && pool.length) {
      const opt = U.weightedPick(pool);
      out.push(opt);
      pool.splice(pool.findIndex((e) => e[0] === opt), 1);
      if (opt.id === 'overclock') for (let i = pool.length - 1; i >= 0; i--) if (pool[i][0].id === 'overclock') pool.splice(i, 1);   // one overclock per hand
    }
    return out;
  };

  G.describeApex = function (p, opt) {
    const a = OO.APEX[opt.id], n = (p.apex[opt.id] || 0) + 1;
    if (opt.id === 'overclock') {
      const w = p.weapons.find((q) => q.id === opt.weapon);
      const over = (w ? w.over || 0 : 0) + 1;
      return { icon: w ? w.def.icon : 'might', name: 'Overclock: ' + (w ? w.def.name : opt.weapon), badge: 'Lv ' + ((w ? w.maxLevel : 8) + over), text: a.text.replace('One weapon', 'This weapon'), type: 'Apex mutation', apex: true };
    }
    const badge = a.max ? n + ' / ' + a.max : n > 1 ? 'x' + n : 'Apex';
    return { icon: a.icon, name: a.name + (a.max && n > 1 ? ' ' + roman(Math.min(n, 10)) : ''), badge, text: a.text, type: 'Apex mutation', apex: true };
  };

  /** quiet: no banner (a supply case announces everything it gave in one line). */
  G.applyApex = function (p, opt, quiet) {
    const a = OO.APEX[opt.id];
    if (!a || !this.apexOpen(p, opt.id, opt.weapon || (p.weapons[0] && p.weapons[0].id))) return;   // capped: nothing to add
    p.apex[opt.id] = (p.apex[opt.id] || 0) + 1;
    p.apexTotal++;
    p.rs.apex++;
    if (opt.id === 'overclock') {
      const w = p.weapons.find((q) => q.id === opt.weapon) || p.weapons[0];
      if (w) { w.over = (w.over || 0) + 1; w._stats = null; }
    }
    this.recalcStats(p);
    if (opt.id === 'titan') this.heal(p, p.stats.maxHp, true);
    if (opt.id === 'dressing') this.heal(p, p.stats.maxHp * 0.25);
    if (opt.id === 'cache') { this.credits += 50; this.addText(p.x, p.y - 24, '+50c', 'credit'); }
    if (opt.id === 'notes') this.team.xp += OO.CONFIG.xpToNext(this.team.level) * 0.25;   // checkLevel() picks it up next tick
    if (!quiet) this.banner((this.coop ? p.name + ': ' : '') + 'Apex mutation: ' + (opt.id === 'overclock' ? 'Overclock' : a.name), 'good');
    if (p.local) this.flashWhite = Math.max(this.flashWhite, 0.2);
  };

  /** Stat side of the Apex stacks; called at the end of recalcStats(). */
  G.applyApexStats = function (p) {
    const s = p.stats, A = p.apex || {}, n = (id) => A[id] || 0;
    const dr = OO.APEX_FX.stacks;                 // diminishing returns on damage stacking (v0.13)
    s.might += 0.25 * dr(n('berserk'));
    s.cooldown /= 1 + 0.11 * dr(n('adrenal'));
    s.amount += n('swarm');
    s.area += 0.25 * n('blast');
    s.maxHp += 40 * n('titan');
    s.regen += 2 * n('regen');
    s.speed *= 1 + 0.1 * n('sprint');            // (no pickup-range part any more: see PICKUPS.maxMagnet)
    s.lifeOnKill = 0.25 * n('hemophage');
    s.phase = 0.15 * n('phase');
    s.cdRate = 1 + 0.3 * n('hotmic');
    s.pulse = n('pulse');
    s.chain = Math.min(0.3, OO.APEX_FX.chain.chance * n('chain'));
    s.creditMul = 1 + 0.1 * n('scav');            // uncapped, stateless
  };

  /** Hemophage and Volatile Blood, for kills credited to p. */
  G.apexOnKill = function (p, e) {
    const s = p.stats;
    if (s.lifeOnKill && !p.downed) p.hp = Math.min(s.maxHp, p.hp + s.lifeOnKill * this.healMul());
    // Volatile Blood: kills made by a Volatile Blood burst don't chain (keeps it from running away).
    if (s.chain && this._killSrc !== 'chain' && Math.random() < s.chain) {
      this.pendingExplosions.push({ x: e.x, y: e.y, r: OO.APEX_FX.chain.r, dmg: 0, enemyDmg: 0, kind: 'fire', barrel: true, chain: true, noPlayer: true, owner: p });
    }
  };

  /** Necrotic Pulse, run every tick from updateTactical (host/solo). */
  G.updateApex = function (p, dt) {
    const lv = p.stats.pulse;
    if (!lv || p.downed) return;
    const F = OO.APEX_FX.pulse;
    p.pulseT -= dt;
    if (p.pulseT > 0) return;
    p.pulseT = F.every;
    const r = this.capAoe(F.r * (1 + F.rPerStack * (lv - 1)));
    const dmg = this.hordeHp() * F.shamblerHits * (1 + F.perStack * (lv - 1)) * p.stats.might;
    this.addEffect({ kind: 'pulse', x: p.x, y: p.y, r, life: 0.45, max: 0.45 });
    this._killer = p;
    for (const e of this.enemies) {
      if (e.dead || e.def.crate || e.def.invulnerable) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > r + e.r) continue;
      this.damageEnemy(e, e.def.boss ? dmg * F.bossShare : dmg, (dx / d) * 260, (dy / d) * 260, null);
    }
    this._killer = null;
    OO.Audio.play('stomp');
  };

  OO.Infinite = { roman };
})(window.OO = window.OO || {});
