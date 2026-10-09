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
    }

    wave() {
      const i = Math.min(OO.WAVES.length - 1, Math.floor(this.g.time / 60));
      return OO.WAVES[i];
    }

    ringPos(radius) {
      const p = this.g.player;
      const a = U.rand(0, U.TAU);
      const R = radius || this.g.spawnRadius;
      return [p.x + Math.cos(a) * R, p.y + Math.sin(a) * R];
    }

    update(dt) {
      const g = this.g;
      while (this.eventIdx < OO.EVENTS.length && g.time >= OO.EVENTS[this.eventIdx].t) {
        this.runEvent(OO.EVENTS[this.eventIdx++]);
      }

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
      const g = this.g, p = g.player;
      if (ev.text) g.ui.banner(ev.text, ev.kind === 'boss' ? 'boss' : 'warn');
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
          if (ev.kind === 'boss') { OO.Audio.play('boss'); g.shake(10); }
          break;
      }
    }
  }

  /**
   * Start a Burster stampede. Phases: 'warn' (rumble, shrieks, a lane that tracks you),
   * locked for the last STAMPEDE.lockAt seconds, then the row launches across the lane.
   */
  Director.prototype.stampede = function (ev) {
    const g = this.g, p = g.player, S = OO.CONFIG.STAMPEDE;
    const count = ev.count || 9;
    const gap = U.randInt(1, Math.max(1, count - 3));    // two empty slots somewhere in the row
    g.stampedes.push({
      a: U.rand(0, U.TAU), ax: p.x, ay: p.y, t: S.warn, warn: S.warn, locked: false,
      count, ranks: ev.ranks || 1, gap, shrieked: false,
    });
    if (!ev.text) g.ui.banner('Stampede! Get behind cover', 'boss');
    OO.Audio.play('rumble');
  };

  OO.Director = Director;
})(window.OO = window.OO || {});
