/* The Director: reads the wave table and event script from config.js and puts infected on the field. */
(function (OO) {
  'use strict';

  const U = OO.U;

  class Director {
    constructor(game) {
      this.g = game;
      this.timer = 0.5;
      this.eventIdx = 0;
      this.crateTimer = 12;
      const E = OO.CONFIG.INFINITE.every;
      this.ot = { stampede: E.stampede * 0.5, ring: E.ring * 0.75, stalker: E.stalker * 0.5, mecha: E.mecha, waves: 0 };   // Infinite Mode overtime timers
    }

    wave() {
      const i = Math.min(OO.WAVES.length - 1, Math.floor(this.g.time / 60));
      const w = OO.WAVES[i];
      const m = this.g.overtimeMinutes();
      if (!m) return w;
      // Overtime: the last wave, refilling faster and with Brutes in the mix.
      const I = OO.CONFIG.INFINITE;
      const key = Math.floor(m * 4);   // rebuild four times a minute
      if (this._otKey !== key) {
        this._otKey = key;
        this._otWave = Object.assign({}, w, {
          interval: w.interval / Math.min(2, 1 + I.refillPerMin * m),
          batch: w.batch + Math.floor(m / 3),
          pool: w.pool.concat([['brute', Math.min(I.bruteMax, I.brutePerMin * m)]]),
        });
      }
      return this._otWave;
    }

    ringPos(radius) {
      const p = this.g.anchorPlayer();
      const a = U.rand(0, U.TAU);
      const R = radius || this.g.spawnRadius;
      return [p.x + Math.cos(a) * R, p.y + Math.sin(a) * R];
    }

    update(dt) {
      const g = this.g;
      while (this.eventIdx < OO.EVENTS.length && g.time >= OO.EVENTS[this.eventIdx].t) {
        this.runEvent(OO.EVENTS[this.eventIdx++]);
      }

      if (g.overtime) this.overtimeEvents(dt);

      const w = this.wave();
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = w.interval;
        const alive = g.enemies.length;
        const target = w.target * g.difficulty.count;
        // Top up toward the wave's target quickly, trickle a little past it, then hold.
        let n = 0;
        if (alive < target) n = w.batch + Math.ceil((target - alive) * 0.25);
        else if (alive < target * 1.3) n = w.batch;
        let spitters = 0;
        for (const e of g.enemies) if (e.def.ranged && !e.dead) spitters++;
        const spitCap = OO.CONFIG.spitterCap(g.time / 60);
        for (let i = 0; i < n && g.enemies.length < OO.CONFIG.MAX_ENEMIES; i++) {
          const [x, y] = this.ringPos(g.spawnRadius + U.rand(0, 80));
          let type = U.weightedPick(w.pool);
          if (OO.ENEMIES[type].ranged && spitters++ >= spitCap) type = 'shambler';
          g.spawnEnemy(type, x, y);
        }
      }

      this.crateTimer -= dt;
      if (this.crateTimer <= 0) {
        this.crateTimer = U.rand(18, 28);
        let crates = 0;
        for (const e of g.enemies) if (e.def.crate) crates++;
        for (let tries = 0; crates < 4 && tries < 8; tries++) {
          const [x, y] = this.ringPos(U.rand(260, 480));
          if (g.world.hitCircle(x, y, 22)) continue;   // not inside a wreck
          g.spawnEnemy('crate', x, y);
          break;
        }
      }
    }

    runEvent(ev) {
      const g = this.g, p = g.anchorPlayer();
      if (ev.text) g.banner(ev.text, ev.kind === 'boss' ? 'boss' : 'warn');
      switch (ev.kind) {
        case 'pack': {
          const [cx, cy] = this.ringPos(g.spawnRadius + 60);
          for (let i = 0; i < ev.count; i++) g.spawnEnemy(ev.enemy, cx + U.rand(-70, 70), cy + U.rand(-70, 70));
          break;
        }
        case 'ring': {
          const R = g.spawnRadius * 0.85;
          for (let i = 0; i < ev.count; i++) {
            const a = (i / ev.count) * U.TAU;
            g.spawnEnemy(ev.enemy, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
          }
          break;
        }
        case 'stampede':
          this.stampede(ev);
          break;
        case 'elite':
        case 'boss':
          for (let i = 0; i < ev.count; i++) {
            const [x, y] = this.ringPos(g.spawnRadius + 40);
            g.spawnEnemy(ev.enemy, x, y);
          }
          if (ev.kind === 'boss') { OO.Audio.play('boss'); g.shakeAll(10); }
          break;
      }
    }
  }

  /**
   * Start a Burster stampede. Phases: 'warn' (rumble, shrieks, a lane that tracks you),
   * locked for the last STAMPEDE.lockAt seconds, then the row launches across the lane.
   */
  Director.prototype.stampede = function (ev) {
    const g = this.g, p = g.anchorPlayer(), S = OO.CONFIG.STAMPEDE;
    const count = ev.count || 9;
    const gap = U.randInt(1, Math.max(1, count - 3));    // two empty slots somewhere in the row
    g.stampedes.push({
      a: U.rand(0, U.TAU), ax: p.x, ay: p.y, t: S.warn, warn: S.warn, locked: false,
      count, ranks: ev.ranks || 1, gap, shrieked: false, target: p.slot,
    });
    if (!ev.text) g.banner("Stampede! Bursters can't be stopped. Get behind cover", 'boss');
    OO.Audio.play('rumble');
  };

  /**
   * Infinite Mode overtime pressure, on repeat and growing with every minute past the mark:
   * stampedes, skinner rings, Stalker hunts and the Hare Trigger.
   */
  Director.prototype.overtimeEvents = function (dt) {
    const g = this.g, T = this.ot, E = OO.CONFIG.INFINITE.every, m = g.overtimeMinutes();
    for (const k in E) T[k] -= dt;
    if (T.stampede <= 0) {
      T.stampede = E.stampede;
      this.runEvent({ kind: 'stampede', count: Math.min(21, 15 + Math.floor(m / 2)), ranks: Math.min(4, 2 + Math.floor(m / 6)) });
    }
    if (T.ring <= 0) {
      T.ring = E.ring;
      const type = m >= 10 && U.chance(0.4) ? 'bloater' : 'skinner';
      const room = Math.max(24, OO.CONFIG.MAX_ENEMIES - g.enemies.length);   // rings respect the enemy cap
      this.runEvent({ kind: 'ring', enemy: type, count: Math.min(room, 140, 70 + Math.floor(m * 4)), text: type === 'bloater' ? 'Bloaters closing in from every side' : 'Skinners in the walls' });
    }
    if (T.stalker <= 0) {
      T.stalker = E.stalker;
      const n = Math.min(5, 1 + Math.floor(m / 4));
      this.runEvent({ kind: 'boss', enemy: 'stalker', count: n, text: n > 1 ? n + ' Stalkers are hunting you' : 'Another Stalker found your trail' });
    }
    if (T.mecha <= 0) {
      T.mecha = E.mecha;
      this.runEvent({ kind: 'boss', enemy: 'mecha', count: Math.min(3, 1 + Math.floor(m / 15)), text: 'Biscuit is back in the HARE TRIGGER, and angrier' });
    }
  };

  OO.Director = Director;
})(window.OO = window.OO || {});
