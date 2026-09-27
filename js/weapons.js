/*
 * Weapon instances and their firing behaviours.
 * To add a weapon: add its data to OO.WEAPONS in config.js, then add a behaviour here
 * with update(w, s, dt, game) and optionally draw(w, s, ctx, game).
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const buf = [];      // scratch array for grid queries made by weapons
  const buf2 = [];

  class Weapon {
    constructor(id) {
      this.id = id;
      this.def = OO.WEAPONS[id];
      this.level = 1;
      this.timer = 0.4;
      this.damageDealt = 0;
      this.kills = 0;
      this.state = {};
      this._stats = null;
      this._ver = -1;
    }

    get maxLevel() { return this.def.levels.length + 1; }

    getStats(player) {
      if (this._stats && this._ver === player.statsVersion) return this._stats;
      const s = Object.assign({}, this.def.base);
      for (let i = 0; i < this.level - 1; i++) {
        const d = this.def.levels[i];
        for (const k in d) if (k !== 'text') s[k] = (s[k] || 0) + d[k];
      }
      const ps = player.stats;
      s.dmg *= ps.might;
      s.cd = Math.max(0.1, s.cd * ps.cooldown);
      s.amount = (s.amount || 1) + ps.amount;
      s.area = (s.area || 1) * ps.area;
      this._stats = s;
      this._ver = player.statsVersion;
      return s;
    }

    levelUp() { this.level++; this._stats = null; }

    update(dt, game) {
      const b = Behaviours[this.id];
      if (b) b.update(this, this.getStats(game.player), dt, game);
    }

    draw(ctx, game) {
      const b = Behaviours[this.id];
      if (b && b.draw) b.draw(this, this.getStats(game.player), ctx, game);
    }
  }

  const Behaviours = {};

  // ------------------------------------------------------------ Service Pistol
  Behaviours.pistol = {
    update(w, s, dt, g) {
      const st = w.state, p = g.player;
      if (st.burst > 0) {
        st.burstT -= dt;
        if (st.burstT <= 0) {
          st.burst--; st.burstT = 0.08;
          const t = g.nearestEnemy(p.x, p.y, 750);
          const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.faceAngle;
          p.aimAngle = a; p.aimT = 0.6;
          g.spawnProjectile({
            x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
            vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
            dmg: s.dmg, pierce: s.pierce, life: s.duration, r: 4, kind: 'bullet', kb: s.kb, weapon: w,
          });
          g.addLight(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, 70, 0.6, 0.06);
          OO.Audio.play('pistol');
        }
      }
      w.timer -= dt;
      if (w.timer <= 0) {
        if (g.nearestEnemy(p.x, p.y, 750)) { st.burst = s.amount; st.burstT = 0; w.timer = s.cd; }
        else w.timer = 0.1;
      }
    },
  };

  // ------------------------------------------------------------ Combat Knife
  Behaviours.knife = {
    update(w, s, dt, g) {
      const st = w.state, p = g.player;
      if (st.queue && st.queue.length) {
        st.qt -= dt;
        if (st.qt <= 0) {
          const side = st.queue.shift();
          st.qt = 0.12;
          this.slash(w, s, g, p.faceAngle + (side < 0 ? Math.PI : 0));
        }
      }
      w.timer -= dt;
      if (w.timer <= 0) {
        w.timer = s.cd;
        st.queue = [];
        for (let i = 0; i < s.amount; i++) st.queue.push(i % 2 === 0 ? 1 : -1);
        st.qt = 0;
      }
    },
    slash(w, s, g, ang) {
      const p = g.player;
      const len = 115 * s.area, wid = 46 * s.area;
      const c = Math.cos(ang), sn = Math.sin(ang);
      g.addEffect({ kind: 'slash', x: p.x, y: p.y, ang, len, wid, life: 0.18, max: 0.18 });
      OO.Audio.play('knife');
      g.grid.query(p.x + c * len / 2, p.y + sn * len / 2, len / 2 + wid + 32, buf);
      for (const e of buf) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
        if (lx > -e.r && lx < len + e.r && Math.abs(ly) < wid / 2 + e.r) {
          g.damageEnemy(e, s.dmg, c * s.kb, sn * s.kb, w);
        }
      }
    },
  };

  // ------------------------------------------------------------ Pump Shotgun
  Behaviours.shotgun = {
    update(w, s, dt, g) {
      const p = g.player;
      w.timer -= dt;
      if (w.timer > 0) return;
      const t = g.nearestEnemy(p.x, p.y, s.speed * s.duration + 30);   // only fire when something is in range
      if (!t) { w.timer = 0.15; return; }
      w.timer = s.cd;
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      p.aimAngle = base; p.aimT = 0.6;
      const n = s.amount;
      const spread = s.spread * (1 + (n - 5) * 0.04);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread) + U.rand(-0.04, 0.04);
        const sp = s.speed * U.rand(0.85, 1.1);
        g.spawnProjectile({
          x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          dmg: s.dmg, pierce: s.pierce, life: s.duration * U.rand(0.9, 1.1), r: 3, kind: 'pellet', kb: s.kb, weapon: w,
        });
      }
      g.addLight(p.x + Math.cos(base) * 24, p.y + Math.sin(base) * 24, 120, 0.9, 0.08);
      g.shake(3);
      OO.Audio.play('shotgun');
    },
  };

  // ------------------------------------------------------------ Incendiary Grenade
  Behaviours.grenade = {
    update(w, s, dt, g) {
      const p = g.player;
      w.timer -= dt;
      if (w.timer > 0) return;
      w.timer = s.cd;
      for (let i = 0; i < s.amount; i++) {
        const t = g.randomEnemyNear(p.x, p.y, 380);
        let tx, ty;
        if (t) { tx = t.x + U.rand(-20, 20); ty = t.y + U.rand(-20, 20); }
        else { const a = U.rand(0, U.TAU), d = U.rand(80, 220); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
        g.lobs.push({
          x0: p.x, y0: p.y, x1: tx, y1: ty, t: -i * 0.12, dur: 0.55,
          zone: { r: 50 * s.area, life: s.duration, dmg: s.dmg, tick: s.tick, kind: 'fire', weapon: w },
        });
      }
      OO.Audio.play('throw');
    },
  };

  // ------------------------------------------------------------ Sawblade Drones
  Behaviours.saw = {
    update(w, s, dt, g) {
      const st = w.state, p = g.player;
      if (!st.hits) { st.hits = new Map(); st.angle = 0; st.active = 0; }
      if (st.active > 0) {
        st.active -= dt;
        st.angle += s.speed * dt;
        const R = 78 * s.area, br = 13 * s.area;
        for (let i = 0; i < s.amount; i++) {
          const a = st.angle + (i / s.amount) * U.TAU;
          const bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
          g.grid.query(bx, by, br + 32, buf2);
          for (const e of buf2) {
            if (e.dead) continue;
            if (U.dist2(bx, by, e.x, e.y) > (br + e.r) * (br + e.r)) continue;
            const last = st.hits.get(e.id);
            if (last !== undefined && g.time - last < s.hitCd) continue;
            st.hits.set(e.id, g.time);
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            g.damageEnemy(e, s.dmg, (dx / d) * s.kb, (dy / d) * s.kb, w);
          }
        }
        OO.Audio.play('saw');
        if (st.active <= 0) { w.timer = s.cd; st.hits.clear(); }
      } else {
        w.timer -= dt;
        if (w.timer <= 0) st.active = s.duration;
      }
    },
    draw(w, s, ctx, g) {
      const st = w.state, p = g.player;
      if (!(st.active > 0)) return;
      const R = 78 * s.area, br = 13 * s.area;
      const fade = Math.min(1, st.active / 0.3);
      ctx.save();
      ctx.globalAlpha = fade;
      for (let i = 0; i < s.amount; i++) {
        const a = st.angle + (i / s.amount) * U.TAU;
        const bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(g.time * 22);
        ctx.fillStyle = '#c9ccd2';
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const ka = (k / 16) * U.TAU, kr = k % 2 ? br * 0.72 : br;
          ctx.lineTo(Math.cos(ka) * kr, Math.sin(ka) * kr);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e3a33b';
        ctx.beginPath(); ctx.arc(0, 0, br * 0.3, 0, U.TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  };

  // ------------------------------------------------------------ Tesla Coil
  Behaviours.tesla = {
    update(w, s, dt, g) {
      const p = g.player;
      w.timer -= dt;
      if (w.timer > 0) return;
      const first = g.randomEnemyNear(p.x, p.y, 360);
      if (!first) { w.timer = 0.2; return; }
      w.timer = s.cd;
      const struck = new Set();
      for (let b = 0; b < s.amount; b++) {
        let cur = b === 0 ? first : g.randomEnemyNear(p.x, p.y, 360, struck);
        if (!cur) break;
        const pts = [p.x, p.y - 12];
        for (let j = 0; j <= s.chains && cur; j++) {
          pts.push(cur.x, cur.y);
          struck.add(cur.id);
          g.damageEnemy(cur, s.dmg, 0, 0, w);
          // splash
          g.grid.query(cur.x, cur.y, 28 * s.area + 32, buf);
          for (const o of buf) {
            if (o === cur || o.dead) continue;
            if (U.dist2(cur.x, cur.y, o.x, o.y) < (28 * s.area + o.r) ** 2) g.damageEnemy(o, s.dmg * 0.4, 0, 0, w);
          }
          g.addLight(cur.x, cur.y, 90, 0.8, 0.12);
          cur = g.nearestEnemy(cur.x, cur.y, 150 * s.area, struck);
        }
        g.addEffect({ kind: 'bolt', points: pts, life: 0.22, max: 0.22, seed: Math.random() * 1000 });
      }
      OO.Audio.play('tesla');
    },
  };

  OO.Weapon = Weapon;
})(window.OO = window.OO || {});
