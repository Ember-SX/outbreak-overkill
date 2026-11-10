/*
 * Tactical layer (v0.9). Extends OO.Game.prototype, like boss.js.
 *
 *   Call-downs   one per operative per run, on a cooldown: Flashbang, Sentry Turret, Med Drone,
 *                Airstrike Beacon. Key Q or the call-down button. In co-op the client asks the
 *                host ({t:'cd'}) and the host runs it, like everything else.
 *   Volatile     red fuel drums among the obstacles. Shooting one (or a fire pool or a nearby
 *   drums        blast) lights a short fuse; the explosion shreds the horde, chains into other
 *                drums and leaves a scorch mark where the cover used to be.
 *   Run stats    distance walked and the other per-operative counters in p.rs (js/progress.js).
 *
 * The host is authoritative for all of it. The client mirrors turrets, stuns, drones, cooldowns
 * and drum state from the snapshot and the event queue.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const G = OO.Game.prototype;
  const compact = OO.Game.compact;
  const TAU = Math.PI * 2;

  // ================================================================ call-downs: selection
  G.calldownUnlocked = function (id) {
    const c = OO.CALLDOWNS[id];
    return !!c && (!c.unlock || (!!this.progress && this.progress.has(c.unlock)));
  };
  /** The equipped call-down, falling back to the Flashbang if it isn't unlocked (old saves). */
  G.calldownFor = function () {
    const id = this.meta.calldown;
    return this.calldownUnlocked(id) ? id : 'flashbang';
  };
  G.equipCalldown = function (id) {
    if (!this.calldownUnlocked(id)) return false;
    this.meta.calldown = id;
    this.saveMeta();
    return true;
  };
  G.newCalldown = function (id) {
    const t = OO.CONFIG.CALLDOWN.firstCharge;
    return { id: OO.CALLDOWNS[id] ? id : 'flashbang', t, max: t };
  };

  // ================================================================ call-downs: use
  /** Local input (Q / button). The client forwards it to the host. */
  G.requestCalldown = function () {
    const p = this.player;
    if (this.state !== 'playing' || !p || p.downed || !p.cd) return;
    if (p.cd.t > 0) { OO.Audio.play('select'); return; }
    if (this.mode === 'client') { this.netSend({ t: 'cd' }); return; }
    this.useCalldown(p);
  };

  G.useCalldown = function (p) {
    if (!p || p.downed || !p.cd || p.cd.t > 0 || this.state !== 'playing') return false;
    const C = OO.CONFIG.CALLDOWN, id = p.cd.id;
    p.cd.t = p.cd.max = C[id].cd;
    p.rs.calls++;
    this.sfxFor(p, 'radio');
    if (id === 'flashbang') this.flashbang(p);
    else if (id === 'sentry') this.dropSentry(p);
    else if (id === 'meddrone') this.medDrone(p);
    else if (id === 'airstrike') { this._killer = p; this.airstrike(p); this._killer = null; }
    return true;
  };

  G.flashbang = function (p) {
    const F = OO.CONFIG.CALLDOWN.flashbang;
    this.addEffect({ kind: 'flashbang', x: p.x, y: p.y, r: F.r, life: 0.55, max: 0.55 });
    this.addLight(p.x, p.y, F.r * 1.5, 1, 0.45);
    OO.Audio.play('flashbang');
    if (p.local) this.flashWhite = Math.max(this.flashWhite, 0.3); else this.emit(['w', 0.3]);
    this.shakeFor(p, 4);
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || e.def.crate || e.def.invulnerable || e.airborne) continue;
      if (e.def.mech && e.ai.mode !== 'walk' && e.ai.mode !== 'recover') continue;   // mid-attack, it doesn't care
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > F.r + e.r) continue;
      const s = e.def.boss ? F.bossStun : e.def.elite ? F.eliteStun : F.stun;
      e.stun = Math.max(e.stun || 0, s);
      if (!e.def.boss) { e.kbx += (dx / d) * 160 / e.mass; e.kby += (dy / d) * 160 / e.mass; }
      n++;
    }
    this.banner((this.coop ? p.name + ': ' : '') + 'Flashbang out' + (n ? ', ' + n + ' infected stunned' : ''), 'good');
  };

  /** A Sentry's stand-in "weapon", so kills, damage and shots are credited to its owner. */
  function sentryWeapon(owner) {
    return { id: 'sentry', def: { name: 'Sentry Turret', icon: 'turret', base: {} }, owner, damageDealt: 0, kills: 0, level: 1 };
  }

  G.dropSentry = function (p) {
    const S = OO.CONFIG.CALLDOWN.sentry;
    const pos = { x: p.x + Math.cos(p.faceAngle) * 30, y: p.y + Math.sin(p.faceAngle) * 30 };
    this.world.resolveCircle(pos, 12);
    if (this.turrets.length >= 4) this.turrets.shift();
    this.turrets.push({ id: ++this.nextProjId, x: pos.x, y: pos.y, a: p.faceAngle, life: S.life, max: S.life, fireT: 0.6, owner: p, w: sentryWeapon(p), flash: 0 });
    this.addLight(pos.x, pos.y, 120, 0.8, 0.3);
    this.burst(pos.x, pos.y, '#8fd4c4', 10, 120);
    OO.Audio.play('stomp');
    this.banner((this.coop ? p.name + ': ' : '') + 'Sentry turret deployed', 'good');
  };

  G.updateTurrets = function (dt) {
    const S = OO.CONFIG.CALLDOWN.sentry;
    for (const t of this.turrets) {
      t.life -= dt;
      t.flash -= dt;
      if (t.life <= 0) { t.dead = true; this.burst(t.x, t.y, '#5a6a68', 8, 110); continue; }
      const e = this.nearestVisible(t.x, t.y, S.range);
      if (e) {
        const want = Math.atan2(e.y - t.y, e.x - t.x);
        let da = ((want - t.a + Math.PI) % TAU + TAU) % TAU - Math.PI;
        t.a += U.clamp(da, -9 * dt, 9 * dt);
        da = ((want - t.a + Math.PI) % TAU + TAU) % TAU - Math.PI;
        t.fireT -= dt;
        if (t.fireT <= 0 && Math.abs(da) < 0.25) {
          t.fireT = S.rate;
          t.flash = 0.06;
          const dmg = this.hordeHp() * S.shamblerHits * (t.owner ? t.owner.stats.might : 1);
          const sp = 760, a = t.a + U.rand(-0.04, 0.04);
          this.spawnProjectile({ x: t.x + Math.cos(t.a) * 16, y: t.y + Math.sin(t.a) * 16, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            dmg, pierce: 1, life: 0.7, r: 3, kind: 'bullet', kb: 40, weapon: t.w });
          OO.Audio.play('turret');
        }
      } else t.fireT = Math.max(t.fireT, 0.1);
    }
    compact(this.turrets);
  };

  G.medDrone = function (p) {
    const M = OO.CONFIG.CALLDOWN.meddrone;
    p.md = M.dur;
    p.mdRate = (p.stats.maxHp * M.heal) / M.dur;
    this.addText(p.x, p.y - 30, '+' + Math.round(p.stats.maxHp * M.heal), 'heal');
    OO.Audio.play('drone');
    this.banner((this.coop ? p.name + ': ' : '') + 'Med drone on station', 'good');
  };

  /** Lifetime "shots fired": every round, pellet, grenade, knife slash and tesla bolt. */
  G.countShot = function (w) {
    if (w && w.owner && w.owner.rs) w.owner.rs.shots++;
  };

  // ================================================================ per-tick upkeep (host / solo)
  G.updateTactical = function (dt) {
    for (const p of this.players) {
      if (p.cd && p.cd.t > 0 && !p.downed) p.cd.t = Math.max(0, p.cd.t - dt * (p.stats.cdRate || 1));   // Hot Mic (Apex)
      this.updateApex(p, dt);   // Necrotic Pulse (infinite.js)
      if (p.md > 0) {
        p.md -= dt;
        if (!p.downed) p.hp = Math.min(p.stats.maxHp, p.hp + p.mdRate * this.healMul() * dt);
        if (Math.random() < 0.2) this.particles.push({ x: p.x + U.rand(-10, 10), y: p.y + U.rand(-10, 10), vx: 0, vy: -30, life: 0.5, max: 0.5, color: '#7ddc6a', size: 2 });
      }
      // distance walked (positions that jump, like a respawn, don't count)
      if (p._lx !== undefined) {
        const d = Math.hypot(p.x - p._lx, p.y - p._ly);
        if (d < 60) p.rs.dist += d;
      }
      p._lx = p.x; p._ly = p.y;
    }
  };

  // ================================================================ volatile drums
  /** Light a drum's fuse. owner = the operative who set it off (credited with the kills), or null. */
  G.lightBarrel = function (o, owner, fuse) {
    if (!o || !o.volatile || o.gone || o.lit) return;
    o.lit = true; o.litT = this.time;
    this.fuses.push({ o, t: fuse, owner: owner || null });
    this.emit(['bf', o.key]);
    this.burst(o.x, o.y - 6, '#ffb347', 6, 90);
    if (U.dist2(o.x, o.y, this.player.x, this.player.y) < this.spawnRadius * this.spawnRadius) OO.Audio.play('fuse');
  };

  G.updateFuses = function (dt) {
    const H = OO.CONFIG.HAZARDS;
    for (const f of this.fuses) {
      f.t -= dt;
      if (Math.random() < 0.5) this.particles.push({ x: f.o.x + U.rand(-4, 4), y: f.o.y - 10, vx: U.rand(-30, 30), vy: U.rand(-80, -30), life: 0.3, max: 0.3, color: '#ffd27a', size: 2 });
      if (f.t > 0) continue;
      f.dead = true;
      const o = f.o;
      this.world.destroy(o.key);
      this.emit(['bx', o.key]);
      if (f.owner && f.owner.rs) f.owner.rs.barrels++;
      this.pendingExplosions.push({ x: o.x, y: o.y, r: H.r, dmg: H.playerDmg * this.enemyDmgScale(false), enemyDmg: 0, kind: 'fire', barrel: true, owner: f.owner });
      this.addDecal(o.x, o.y, H.r * 0.55, 'scorch');
      this.shakeAll(6);
    }
    compact(this.fuses);
  };

  /** Blast damage a drum deals to one infected: scales with the horde rather than a flat number. */
  G.barrelDamage = function (e) {
    const H = OO.CONFIG.HAZARDS;
    if (e.def.boss) return e.maxHp * H.bossShare;
    if (e.def.elite) return e.maxHp * H.eliteShare;
    return this.hordeHp() * H.shamblerHits;   // horde-scaled (not overtime-scaled: see hordeHp)
  };

  /** Any blast near a drum sets it off after a short delay (chain reactions). */
  G.chainBarrels = function (ex) {
    const buf = this._chainBuf || (this._chainBuf = []);
    this.world.query(ex.x, ex.y, ex.r, buf);
    for (const o of buf) {
      if (!o.volatile || o.lit) continue;
      if (U.dist2(o.x, o.y, ex.x, ex.y) < (ex.r + o.r) ** 2) this.lightBarrel(o, ex.owner || null, OO.CONFIG.HAZARDS.chainFuse);
    }
  };

  /** Fire pools (grenades, napalm, Dragon's Breath) cook off drums they touch. */
  G.zoneBarrels = function (z) {
    const buf = this._chainBuf || (this._chainBuf = []);
    this.world.query(z.x, z.y, z.r, buf);
    for (const o of buf) {
      if (o.volatile && !o.lit && U.dist2(o.x, o.y, z.x, z.y) < (z.r + o.r) ** 2) this.lightBarrel(o, z.weapon ? z.weapon.owner : null, OO.CONFIG.HAZARDS.fuse);
    }
  };

  // ================================================================ client mirror
  G.applyBarrelEvent = function (kind, key) {
    if (kind === 'bx') { this.world.destroy(key); return; }
    const o = this.world.find(key);
    if (o && !o.lit) { o.lit = true; o.litT = this.time; }
  };

  OO.Tactical = { sentryWeapon };
})(window.OO = window.OO || {});
