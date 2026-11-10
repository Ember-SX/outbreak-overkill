/*
 * Infinite Mode (v0.10). Extends OO.Game.prototype, like boss.js and tactical.js.
 *
 * Chosen on the main menu (Mode: Infinite). The run doesn't end at the extraction mark
 * (CONFIG.RUN_LENGTH, 15:00): it goes into overtime and keeps going until the team is overrun or
 * calls the evac from the pause screen. In overtime (m = minutes past the mark):
 *
 *   - enemy HP, damage and speed compound every minute (CONFIG.INFINITE), the director refills
 *     faster and mixes in Brutes, and stampedes, Stalker hunts, skinner rings and the Hare
 *     Trigger keep coming back (spawner.js);
 *   - necrosis: every source of healing weakens, down to a floor;
 *   - the per-hit ceiling still holds: no single hit kills a healthy operative.
 *
 * Leveling never stops. Once an operative's weapons and gear are all maxed ("max rank"), and on
 * every level-up during overtime, the cards offer Apex mutations (OO.APEX): stackable,
 * uncapped (bar a few performance limits) and deliberately game-breaking.
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
  /** Minutes past the extraction mark (0 outside Infinite Mode). */
  G.overtimeMinutes = function (time = this.time) {
    if (!this.infinite) return 0;
    return Math.max(0, (time - OO.CONFIG.RUN_LENGTH) / 60);
  };
  G.overtimeHp = function (d) {
    const m = this.overtimeMinutes();
    if (!m || (d && d.crate)) return 1;
    const I = OO.CONFIG.INFINITE;
    return Math.pow(1 + (d && d.boss ? I.hpPerMin * I.bossHpScale : I.hpPerMin), m);
  };
  G.overtimeDmg = function (time) {
    const m = this.overtimeMinutes(time);
    return m ? Math.pow(1 + OO.CONFIG.INFINITE.dmgPerMin, m) : 1;
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
    this.banner('Extraction mark passed. The helicopter circles once and leaves. You\'re staying', 'boss');
    OO.Audio.play('boss');
    this.shakeAll(8);
    this.emit(['ot']);
    if (this.progress) this.progress.unlock('no_return');
  };

  /** Pause-screen "Call extraction" (host or solo, overtime only): end the run as an evacuation. */
  G.extractNow = function () {
    if (!this.infinite || !this.overtime || this.mode === 'client') return;
    if (this.state !== 'paused' && this.state !== 'playing') return;
    this.state = 'playing';
    this.netSend({ t: 'resumed' });
    this._extracted = true;
    this.endRun(true);
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

  G.rollApex = function (p, n) {
    const pool = [];
    for (const id in OO.APEX) {
      const a = OO.APEX[id];
      if (id === 'overclock') {
        for (const w of p.weapons) pool.push([{ kind: 'apex', id, weapon: w.id }, a.weight / p.weapons.length]);
        continue;
      }
      if (a.max && (p.apex[id] || 0) >= a.max) continue;
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
    return { icon: a.icon, name: a.name + (n > 1 ? ' ' + roman(Math.min(n, 10)) + (n > 10 ? '+' : '') : ''), badge: n > 1 ? 'x' + n : 'Apex', text: a.text, type: 'Apex mutation', apex: true };
  };

  G.applyApex = function (p, opt) {
    const a = OO.APEX[opt.id];
    if (!a) return;
    p.apex[opt.id] = (p.apex[opt.id] || 0) + 1;
    p.apexTotal++;
    p.rs.apex++;
    if (opt.id === 'overclock') {
      const w = p.weapons.find((q) => q.id === opt.weapon) || p.weapons[0];
      if (w) { w.over = (w.over || 0) + 1; w._stats = null; }
    }
    this.recalcStats(p);
    if (opt.id === 'titan') this.heal(p, p.stats.maxHp, true);
    this.banner((this.coop ? p.name + ': ' : '') + 'Apex mutation: ' + (opt.id === 'overclock' ? 'Overclock' : a.name), 'good');
    if (p.local) this.flashWhite = Math.max(this.flashWhite, 0.2);
  };

  /** Stat side of the Apex stacks; called at the end of recalcStats(). */
  G.applyApexStats = function (p) {
    const s = p.stats, A = p.apex || {}, n = (id) => A[id] || 0;
    s.might += 0.25 * n('berserk');
    s.cooldown *= Math.pow(0.9, n('adrenal'));
    s.amount += n('swarm');
    s.area += 0.25 * n('blast');
    s.maxHp += 40 * n('titan');
    s.regen += 2 * n('regen');
    s.speed *= 1 + 0.1 * n('sprint');
    s.magnet *= 1 + 0.5 * n('sprint');
    s.lifeOnKill = 0.25 * n('hemophage');
    s.phase = 0.15 * n('phase');
    s.cdRate = 1 + 0.3 * n('hotmic');
    s.pulse = n('pulse');
    s.chain = Math.min(0.3, OO.APEX_FX.chain.chance * n('chain'));
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
    const r = F.r * (1 + F.rPerStack * (lv - 1));
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
