/*
 * The final boss: the HARE TRIGGER, a combat mech piloted by lab subject B-0, "Biscuit".
 * Extends OO.Game.prototype (like coop.js). Tuning lives in OO.ENEMIES.mecha.mech (config.js).
 *
 * Behaviour (host / solo only; the co-op client just mirrors the state it is sent):
 *   drop     arrives by rocket-jumping in from off screen onto a marked spot near you
 *   walk     strides after the nearest operative, turning its whole body (it can't strafe)
 *   crouch   telegraph for a leap: a target reticle appears where you are heading
 *   air      rocket jump; it can't be hit up there. Lands with a shockwave (cover doesn't help: move)
 *   recover  a short stagger after landing, the best moment to unload on it
 *   aim      opens its shoulder pods and marks the ground, then launches a carrot-missile volley
 *   charge   (overdrive) visor glows and tracks you, then locks for a moment...
 *   laser    ...and sweeps a beam toward you. Obstacles stop the beam; outrun the sweep or hide
 * Below half health it goes into OVERDRIVE: faster, more missiles, shorter pauses, adds the laser.
 * If you get far away it leaps after you, so there is no outrunning it for long.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const G = OO.Game.prototype;
  const MODES = ['walk', 'crouch', 'air', 'recover', 'aim', 'charge', 'laser'];
  const buf = [];

  const angDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= U.TAU;
    while (d < -Math.PI) d += U.TAU;
    return d;
  };

  G.updateMecha = function (e, dt, alive) {
    const M = e.def.mech, ai = e.ai;
    const p = this.nearestPlayer(e.x, e.y);
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    const over = !!ai.over;

    if (ai.mode === undefined) this.mechaDrop(e, p);
    ai.t = (ai.t || 0) + dt;
    ai.timer -= dt;
    e.airborne = ai.mode === 'air';

    if (!over && e.hp < e.maxHp * M.overdrive) {
      ai.over = true;
      ai.cool = Math.min(ai.cool, 0.6);
      this.banner('Biscuit is FURIOUS. The Hare Trigger goes into overdrive', 'boss');
      OO.Audio.play('squeak');
      OO.Audio.play('servo');
      this.shakeAll(8);
      this.addLight(e.x, e.y, 260, 1, 0.5);
    }
    const speed = e.speed * (over ? M.overSpeed : 1);

    switch (ai.mode) {
      case 'walk': {
        // Turn the whole frame toward the target, then stride forward.
        const want = Math.atan2(dy, dx);
        const turn = M.turn * (over ? 1.25 : 1) * dt;
        e.a += U.clamp(angDiff(e.a, want), -turn, turn);
        let mx = Math.cos(e.a), my = Math.sin(e.a);
        // Slide around anything solid just ahead (same idea as the horde's steering).
        const ahead = e.r + 26;
        const o = this.world.hitCircle(e.x + mx * ahead, e.y + my * ahead, e.r);
        if (ai.sideT > 0) ai.sideT -= dt;
        if (o) {
          let tx = -(e.y - o.y), ty = e.x - o.x;
          if (!(ai.sideT > 0)) { ai.side = tx * mx + ty * my >= 0 ? 1 : -1; ai.sideT = 1.4; }
          tx *= ai.side; ty *= ai.side;
          const tl = Math.hypot(tx, ty) || 1;
          mx = mx * 0.3 + tx / tl; my = my * 0.3 + ty / tl;
          const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
          ai.stuck = (ai.stuck || 0) + dt;
        } else ai.stuck = Math.max(0, (ai.stuck || 0) - dt);
        // Slow down a little while turning hard: it's a walking tank, not a hound.
        const facing = Math.max(0.35, Math.cos(angDiff(e.a, want)));
        e.x += mx * speed * facing * dt + e.kbx * dt;
        e.y += my * speed * facing * dt + e.kby * dt;
        ai.stride = (ai.stride || 0) + speed * facing * dt;
        if (ai.stride > 46) { ai.stride = 0; this.mechaStep(e); }

        ai.cool -= dt;
        if (d > M.leap.farLeap || ai.stuck > 1.5) { this.mechaLeap(e, p, true); break; }
        if (ai.cool <= 0) this.mechaAttack(e, p, d);
        break;
      }
      case 'crouch': {
        // Keep tracking the landing spot until the last 0.25 s, then it's committed.
        if (ai.timer > 0.25) this.mechaAim(e, p);
        e.a += U.clamp(angDiff(e.a, Math.atan2(ai.ty - e.y, ai.tx - e.x)), -6 * dt, 6 * dt);
        if (ai.timer <= 0) {
          ai.mode = 'air'; ai.timer = ai.airDur; ai.sx = e.x; ai.sy = e.y; ai.k = 0;
          OO.Audio.play('thrust');
          this.burst(e.x, e.y, '#ffb347', 22, 260);
          this.addLight(e.x, e.y, 200, 1, 0.3);
        }
        break;
      }
      case 'air': {
        const k = 1 - Math.max(0, ai.timer) / ai.airDur;
        ai.k = k;
        const ease = k * k * (3 - 2 * k);
        e.x = U.lerp(ai.sx, ai.tx, ease);
        e.y = U.lerp(ai.sy, ai.ty, ease);
        e.kbx = 0; e.kby = 0;
        if (Math.random() < 0.6) this.particles.push({ x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), vx: U.rand(-30, 30), vy: U.rand(-30, 30), life: 0.5, max: 0.5, color: '#ff9a3a', size: 4 });
        if (ai.timer <= 0) this.mechaLand(e);
        break;
      }
      case 'recover':
        if (ai.timer <= 0) this.mechaWalk(e);
        break;
      case 'aim': {
        e.a += U.clamp(angDiff(e.a, Math.atan2(dy, dx)), -3 * dt, 3 * dt);
        if (ai.timer <= 0) { this.mechaVolley(e); this.mechaWalk(e); }
        break;
      }
      case 'charge': {
        const L = M.laser;
        if (ai.timer > 0.3) ai.la += U.clamp(angDiff(ai.la, Math.atan2(dy, dx)), -4 * dt, 4 * dt);   // tracks, then locks
        e.a = ai.la;
        ai.ll = this.beamLength(e, ai.la, L.length);
        if (ai.timer <= 0) { ai.mode = 'laser'; ai.timer = L.sweep; ai.tickT = 0; OO.Audio.play('laser'); }
        break;
      }
      case 'laser': {
        const L = M.laser;
        ai.la += U.clamp(angDiff(ai.la, Math.atan2(dy, dx)), -L.turn * dt, L.turn * dt);
        e.a = ai.la;
        ai.ll = this.beamLength(e, ai.la, L.length);
        ai.tickT -= dt;
        if (ai.tickT <= 0) {
          ai.tickT = L.tick;
          OO.Audio.play('laser');
          const ox = e.x + Math.cos(ai.la) * e.r * 0.6, oy = e.y + Math.sin(ai.la) * e.r * 0.6;
          const ex = e.x + Math.cos(ai.la) * ai.ll, ey = e.y + Math.sin(ai.la) * ai.ll;
          for (const q of alive) {
            if (U.distToSegment(q.x, q.y, ox, oy, ex, ey) < L.width / 2 + q.r) this.hurtPlayer(q, e.dmg * L.dmg);
          }
          this.burst(ex, ey, '#ff7ac0', 3, 120);
          this.addLight(ex, ey, 70, 0.8, 0.12);
        }
        if (ai.timer <= 0) this.mechaWalk(e);
        break;
      }
    }

    e.kbx *= Math.max(0, 1 - dt * 9); e.kby *= Math.max(0, 1 - dt * 9);
    if (!e.airborne) {
      for (const q of alive) if (U.dist2(e.x, e.y, q.x, q.y) < (e.r + q.r) ** 2) this.hurtPlayer(q, e.dmg);
    }
  };

  /** Entrance: rocket-jump in from where it spawned (off screen) onto a marked spot near the player. */
  G.mechaDrop = function (e, p) {
    const ai = e.ai, a = Math.atan2(e.y - p.y, e.x - p.x);
    ai.over = false; ai.cool = 2.5; ai.last = 'leap';
    ai.mode = 'air'; ai.airDur = 1.9; ai.timer = ai.airDur; ai.k = 0;
    ai.sx = e.x; ai.sy = e.y;
    ai.tx = p.x + Math.cos(a) * 240; ai.ty = p.y + Math.sin(a) * 240;
    this.clearLanding(e);
    e.a = Math.atan2(p.y - e.y, p.x - e.x);
    OO.Audio.play('thrust');
  };

  G.mechaWalk = function (e) {
    const M = e.def.mech, ai = e.ai;
    ai.mode = 'walk';
    ai.timer = 0;
    ai.cool = U.rand(M.attackGap[0], M.attackGap[1]) * (ai.over ? 0.7 : 1);
  };

  G.mechaStep = function (e) {
    this.addDecal(e.x + U.rand(-12, 12), e.y + U.rand(-12, 12), 9, 'scorch');
    const lp = this.player;
    if (lp && U.dist2(e.x, e.y, lp.x, lp.y) < 600 * 600) { OO.Audio.play('stomp'); this.shake(2); }
    this.emitNear(e.x, e.y, ['s', 'stomp']);
  };

  /** Pick the next attack, avoiding the same one twice in a row when there's a choice. */
  G.mechaAttack = function (e, p, d) {
    const M = e.def.mech, ai = e.ai;
    const options = [];
    if (d >= M.leap.range[0] && d <= M.leap.range[1]) options.push(['leap', 4]);
    if (d < 820) options.push(['missiles', 4]);
    if (ai.over && d < M.laser.length * 0.9) options.push(['laser', 5]);
    if (!options.length) { ai.cool = 0.5; return; }
    const pool = options.length > 1 ? options.filter((o) => o[0] !== ai.last) : options;
    const pick = U.weightedPick(pool);
    ai.last = pick;
    if (pick === 'leap') this.mechaLeap(e, p, false);
    else if (pick === 'missiles') {
      ai.mode = 'aim'; ai.timer = M.missiles.aim;
      this.mechaMark(e);
      OO.Audio.play('lockon');
      OO.Audio.play('servo');
    } else {
      ai.mode = 'charge'; ai.timer = M.laser.charge;
      ai.la = Math.atan2(p.y - e.y, p.x - e.x); ai.ll = 0;
      OO.Audio.play('charge');
    }
  };

  G.mechaLeap = function (e, p, far) {
    const M = e.def.mech, ai = e.ai;
    ai.mode = 'crouch'; ai.timer = M.leap.crouch * (ai.over ? 0.8 : 1);
    ai.target = p.slot;
    this.mechaAim(e, p);
    const dist = Math.hypot(ai.tx - e.x, ai.ty - e.y);
    ai.airDur = M.leap.air + (far ? Math.min(1.2, dist / 1400) : 0);
    ai.stuck = 0;
    OO.Audio.play('servo');
  };

  /** Landing spot: where the target is heading (half-committed lead), kept off obstacles. */
  G.mechaAim = function (e, p) {
    const ai = e.ai, lead = 0.55;
    const q = this.playerBySlot(ai.target);
    const t = q && !q.downed ? q : p;
    ai.tx = t.x + (t.vx || 0) * lead;
    ai.ty = t.y + (t.vy || 0) * lead;
    this.clearLanding(e);
  };

  G.clearLanding = function (e) {
    const ai = e.ai, probe = { x: ai.tx, y: ai.ty };
    this.world.update(this.players);
    this.world.resolveCircle(probe, e.r);
    ai.tx = probe.x; ai.ty = probe.y;
  };

  G.mechaLand = function (e) {
    const M = e.def.mech.leap, ai = e.ai;
    e.x = ai.tx; e.y = ai.ty;
    e.airborne = false;
    ai.mode = 'recover'; ai.timer = ai.over ? 0.45 : 0.7;
    this.world.resolveCircle(e, e.r);
    // Shockwave: hurts players in the ring (cover is no help) and flings the horde aside.
    for (const q of this.alivePlayers()) {
      if (U.dist2(e.x, e.y, q.x, q.y) < (M.r + q.r) ** 2) this.hurtPlayer(q, e.dmg * M.dmg);
    }
    this.grid.query(e.x, e.y, M.r + 32, buf);
    for (const o of buf) {
      if (o === e || o.dead || o.def.crate) continue;
      const dx = o.x - e.x, dy = o.y - e.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < M.r + o.r) this.damageEnemy(o, 120, (dx / dd) * 900, (dy / dd) * 900, null);
    }
    this.addEffect({ kind: 'burst', x: e.x, y: e.y, r: M.r, life: 0.45, max: 0.45, tint: 'fire' });
    this.addDecal(e.x, e.y, M.r * 0.7, 'scorch');
    this.addLight(e.x, e.y, M.r * 2.4, 1, 0.35);
    this.burst(e.x, e.y, '#8a8174', 30, 320);
    const lp = this.player;
    if (lp && U.dist2(e.x, e.y, lp.x, lp.y) < 700 * 700) { OO.Audio.play('slam'); this.shake(11); }
    this.emitNear(e.x, e.y, ['s', 'slam']);
    this.emitNear(e.x, e.y, ['k', 11]);
  };

  /** Mark the ground for a missile volley: some on each operative, some where they're heading, the rest around them. */
  G.mechaMark = function (e) {
    const M = e.def.mech.missiles, ai = e.ai;
    const n = ai.over ? M.overdrive : M.count;
    const targets = this.alivePlayers();
    const marks = [];
    for (let i = 0; i < n; i++) {
      const q = targets[i % targets.length];
      let tx, ty;
      if (i < targets.length) { tx = q.x; ty = q.y; }
      else if (i < targets.length * 2) { tx = q.x + (q.vx || 0) * M.flight; ty = q.y + (q.vy || 0) * M.flight; }
      else { const a = U.rand(0, U.TAU), r = U.rand(40, M.spread); tx = q.x + Math.cos(a) * r; ty = q.y + Math.sin(a) * r; }
      marks.push([tx, ty]);
    }
    ai.marks = marks;
    const scale = e.dmg / e.def.dmg;    // the mech's own damage scale at spawn time
    for (let i = 0; i < marks.length; i++) {
      // Reticles go up now; missiles fly when the pods fire (after the aim pause).
      this.missiles.push({
        x0: e.x, y0: e.y, x1: marks[i][0], y1: marks[i][1], t: -M.aim - i * M.stagger,
        dur: M.flight, r: M.r, dmg: e.def.dmg * M.dmg * scale, side: i % 2 ? 1 : -1, owner: e.id,
      });
    }
  };

  /** Pods fire. The missiles queued in mechaMark take off one by one (see updateMissiles). */
  G.mechaVolley = function (e) {
    this.addLight(e.x, e.y, 140, 0.9, 0.15);
    this.burst(e.x, e.y, '#ffb347', 10, 160);
  };

  G.updateMissiles = function (dt) {
    for (const m of this.missiles) {
      const before = m.t;
      m.t += dt;
      if (before < 0 && m.t >= 0) {
        m.launched = true;
        const owner = this.enemies.find((o) => o.id === m.owner && !o.dead);
        if (owner) {
          m.x0 = owner.x + Math.cos(owner.a + Math.PI / 2 * m.side) * owner.r * 0.9;
          m.y0 = owner.y + Math.sin(owner.a + Math.PI / 2 * m.side) * owner.r * 0.9;
        }
        OO.Audio.play('missile');
      }
      if (m.t < m.dur) continue;
      m.dead = true;
      // Cover blocks the blast, just like Burster explosions.
      for (const p of this.alivePlayers()) {
        if (U.dist2(m.x1, m.y1, p.x, p.y) < (m.r + p.r) ** 2 && !this.world.blocked(m.x1, m.y1, p.x, p.y)) this.hurtPlayer(p, m.dmg);
      }
      this.grid.query(m.x1, m.y1, m.r + 32, buf);
      for (const o of buf) {
        if (o.dead || o.def.boss || o.def.crate) continue;
        if (U.dist2(m.x1, m.y1, o.x, o.y) < (m.r + o.r) ** 2) this.damageEnemy(o, 60, 0, 0, null);
      }
      this.addEffect({ kind: 'burst', x: m.x1, y: m.y1, r: m.r, life: 0.35, max: 0.35, tint: 'fire' });
      this.addDecal(m.x1, m.y1, m.r * 0.6, 'scorch');
      this.addLight(m.x1, m.y1, m.r * 2.4, 1, 0.25);
      this.burst(m.x1, m.y1, '#ff8a2a', 12, 240);
      const lp = this.player;
      if (lp && U.dist2(m.x1, m.y1, lp.x, lp.y) < this.spawnRadius * this.spawnRadius) { OO.Audio.play('explode'); this.shake(4); }
      this.emitNear(m.x1, m.y1, ['k', 4]);
    }
    OO.Game.compact(this.missiles);
  };

  /** How far the visor beam reaches before something solid stops it. */
  G.beamLength = function (e, a, max) {
    const c = Math.cos(a), s = Math.sin(a);
    const x0 = e.x + c * e.r * 0.6, y0 = e.y + s * e.r * 0.6;
    if (!this.world.blocked(x0, y0, e.x + c * max, e.y + s * max)) return max;
    let lo = e.r * 0.6, hi = max;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      if (this.world.blocked(x0, y0, e.x + c * mid, e.y + s * mid)) hi = mid; else lo = mid;
    }
    return hi;
  };

  /** Defeat: the frame blows apart and the pilot ejects (Biscuit is fine, just furious). */
  G.mechaDown = function (e) {
    this.missiles = this.missiles.filter((m) => m.owner !== e.id || m.launched);
    this.addPickup('case', e.x, e.y, { big: true });
    for (let i = 0; i < 3; i++) this.addPickup('herb', e.x + U.rand(-50, 50), e.y + U.rand(-50, 50));
    for (let i = 0; i < 5; i++) {
      const a = U.rand(0, U.TAU), r = U.rand(10, 60);
      this.pendingExplosions.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, r: 40, dmg: 0, enemyDmg: 200, kind: 'fire' });
    }
    this.addEffect({ kind: 'eject', x: e.x, y: e.y, life: 3.2, max: 3.2, drift: U.chance(0.5) ? 1 : -1 });
    this.addDecal(e.x, e.y, e.r * 1.4, 'scorch');
    this.banner('The Hare Trigger is scrap. Biscuit ejected, unharmed and absolutely livid', 'good');
    this.shakeAll(14);
    OO.Audio.play('slam');
    OO.Audio.play('squeak');
  };

  /** Co-op snapshot helpers: the mech's state as a small array, and back. */
  G.mechaState = function (e) {
    const ai = e.ai;
    const k = ai.mode === 'air' ? 1 - Math.max(0, ai.timer) / ai.airDur : 0;
    return [e.id & 0x7fff, MODES.indexOf(ai.mode), Math.round(k * 1000) / 1000, Math.round(ai.tx || 0), Math.round(ai.ty || 0),
      Math.round((ai.la || 0) * 1000) / 1000, Math.round(ai.ll || 0), ai.over ? 1 : 0, Math.round(Math.max(0, ai.timer) * 100) / 100, ai.airDur || 1];
  };

  G.applyMechaState = function (e, s) {
    const ai = e.ai;
    ai.mode = MODES[s[1]] || 'walk';
    ai.k = s[2]; ai.tx = s[3]; ai.ty = s[4]; ai.la = s[5]; ai.ll = s[6]; ai.over = !!s[7]; ai.timer = s[8]; ai.airDur = s[9];
    e.airborne = ai.mode === 'air';
  };

  OO.Boss = { MODES };
})(window.OO = window.OO || {});
