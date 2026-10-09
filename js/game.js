/*
 * Game: owns the run state, the fixed-timestep loop and all simulation.
 * Rendering lives in render.js, menus in ui.js, content in config.js.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const Input = OO.Input;
  const STEP = 1 / 60;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.state = 'menu';            // menu | playing | levelup | chest | paused | results
      this.debug = false;
      this.player = null;
      this.grid = new U.SpatialHash(64);
      this._sepBuf = []; this._prBuf = []; this._exBuf = []; this._zoneBuf = [];
      this.records = U.storage.get('oo.records', { bestTime: 0, bestKills: 0, runs: 0, wins: 0 });
      this.settings = U.storage.get('oo.settings', { muted: false, damageNumbers: true });
      OO.Audio.setMuted(this.settings.muted);
      this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.renderer = new OO.Renderer(this, canvas);
      this.ui = new OO.UI(this);
      Input.attach(canvas);

      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });

      this.fps = 60; this.last = performance.now(); this.acc = 0; this.menuTime = 0;
      requestAnimationFrame((t) => this.frame(t));
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.screenW = w; this.screenH = h;
      this.zoom = U.clamp(Math.min(w, h) / 620, 0.6, 1.5);
      this.viewW = w / this.zoom; this.viewH = h / this.zoom;
      this.spawnRadius = Math.hypot(this.viewW, this.viewH) / 2 + 50;
      this.despawnDist = this.spawnRadius + 260;
      this.renderer.resize(w, h, this.dpr);
    }

    // ------------------------------------------------------------ run lifecycle
    start(charId) {
      const ch = OO.CHARACTERS[charId] || OO.CHARACTERS.mara;
      const P = OO.CONFIG.PLAYER;
      this.charId = charId;
      this.time = 0; this.kills = 0; this.credits = 0; this.nextId = 0;
      this.enemies = []; this.projectiles = []; this.pickups = []; this.zones = []; this.lobs = [];
      this.effects = []; this.particles = []; this.decals = []; this.texts = []; this.lights = [];
      this.pendingExplosions = [];
      this.enemyShots = []; this.hazards = [];
      this.overflowGem = null; this.gemCount = 0;
      this.shakeAmt = 0; this.flashWhite = 0; this.xpCombo = 0; this.xpComboT = 0; this.heartT = 0;
      this.player = {
        x: 0, y: 0, r: P.radius, hp: 1, level: 1, xp: 0, xpNext: OO.CONFIG.xpToNext(1),
        faceAngle: 0, aimAngle: 0, aimT: 0, moving: false, walk: 0, iframes: 0, hurt: 0,
        weapons: [], passives: {}, passiveOrder: [], stats: {}, statsVersion: 0, char: ch, pendingLevels: 0,
      };
      this.world = new OO.World(Math.floor(Math.random() * 1e9));
      this.world.update(0, 0);
      this.recalcStats();
      this.player.hp = this.player.stats.maxHp;
      this.addWeapon(ch.weapon);
      this.director = new OO.Director(this);
      U.storage.set('oo.char', charId);
      this.state = 'playing';
      this.ui.hideAll();
      this.ui.setHud(true);
    }

    endRun(victory) {
      if (this.state === 'results') return;
      this.state = 'results';
      const r = this.records;
      r.runs++; if (victory) r.wins++;
      r.bestTime = Math.max(r.bestTime, Math.floor(this.time));
      r.bestKills = Math.max(r.bestKills, this.kills);
      U.storage.set('oo.records', r);
      OO.Audio.play(victory ? 'victory' : 'gameover');
      this.ui.setHud(false);
      this.ui.showResults({
        victory, time: this.time, level: this.player.level, kills: this.kills, credits: this.credits,
        weapons: this.player.weapons.map((w) => ({ id: w.id, name: w.def.name, level: w.level, dmg: Math.round(w.damageDealt), kills: w.kills })),
      });
    }

    quitToMenu() {
      this.state = 'menu';
      this.player = null;
      this.ui.setHud(false);
      this.ui.showMenu();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.ui.showPause();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.ui.hideAll();
    }

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      OO.Audio.setMuted(this.settings.muted);
      U.storage.set('oo.settings', this.settings);
      this.ui.updateMute();
    }

    // ------------------------------------------------------------ player build
    recalcStats() {
      const p = this.player, b = p.char.bonus, P = OO.CONFIG.PLAYER;
      const lv = (id) => p.passives[id] || 0;
      const prevMax = p.stats.maxHp || 0;
      p.stats = {
        might: 1 + (b.might || 0) + lv('might') * 0.1,
        armor: (b.armor || 0) + lv('armor'),
        speed: P.speed * (1 + (b.speed || 0) + lv('speed') * 0.08),
        area: 1 + lv('area') * 0.1,
        cooldown: 1 - lv('cooldown') * 0.08,
        magnet: P.pickupRange * (1 + (b.magnet || 0) + lv('magnet') * 0.3),
        maxHp: P.maxHp + (b.maxHp || 0) + lv('maxhp') * 20,
        regen: lv('maxhp') * 0.25,
        amount: lv('amount'),
      };
      if (prevMax && p.stats.maxHp > prevMax) p.hp += p.stats.maxHp - prevMax;
      p.statsVersion++;
    }

    addWeapon(id) {
      this.player.weapons.push(new OO.Weapon(id));
    }

    getWeapon(id) { return this.player.weapons.find((w) => w.id === id); }

    rollUpgrades(n) {
      const p = this.player, C = OO.CONFIG, pool = [];
      for (const w of p.weapons) if (w.level < w.maxLevel) pool.push({ kind: 'weapon', id: w.id, weight: 1.5 });
      if (p.weapons.length < C.MAX_WEAPONS) {
        for (const id in OO.WEAPONS) if (!this.getWeapon(id)) pool.push({ kind: 'weapon', id, weight: 1 });
      }
      for (const id of p.passiveOrder) if (p.passives[id] < OO.PASSIVES[id].max) pool.push({ kind: 'passive', id, weight: 1 });
      if (p.passiveOrder.length < C.MAX_PASSIVES) {
        for (const id in OO.PASSIVES) if (!p.passives[id]) pool.push({ kind: 'passive', id, weight: 0.85 });
      }
      const picked = [];
      while (picked.length < n && pool.length) {
        const opt = U.weightedPick(pool.map((o) => [o, o.weight]));
        picked.push(opt);
        pool.splice(pool.indexOf(opt), 1);
      }
      if (!picked.length) picked.push({ kind: 'herb' }, { kind: 'credits' });
      return picked;
    }

    describeUpgrade(opt) {
      if (opt.kind === 'weapon') {
        const def = OO.WEAPONS[opt.id], w = this.getWeapon(opt.id);
        if (!w) return { icon: def.icon, name: def.name, badge: 'New', isNew: true, text: def.desc, type: 'Weapon' };
        const next = w.level + 1;
        return { icon: def.icon, name: def.name, badge: next === w.maxLevel ? 'Lv ' + next + ' · Max' : 'Lv ' + next, text: def.levels[w.level - 1].text, type: 'Weapon' };
      }
      if (opt.kind === 'passive') {
        const def = OO.PASSIVES[opt.id], lv = this.player.passives[opt.id] || 0;
        return { icon: def.icon, name: def.name, badge: lv ? 'Lv ' + (lv + 1) : 'New', isNew: !lv, text: def.text, type: 'Gear' };
      }
      if (opt.kind === 'herb') return { icon: 'herb', name: 'Green Herb', badge: 'Heal', text: 'Restore 40 HP.', type: 'Supply' };
      return { icon: 'credits', name: 'Credit Stash', badge: '+25', text: 'Pocket 25 credits.', type: 'Supply' };
    }

    applyUpgrade(opt) {
      const p = this.player;
      if (opt.kind === 'weapon') {
        const w = this.getWeapon(opt.id);
        if (w) w.levelUp(); else this.addWeapon(opt.id);
      } else if (opt.kind === 'passive') {
        if (!p.passives[opt.id]) { p.passives[opt.id] = 1; p.passiveOrder.push(opt.id); }
        else p.passives[opt.id]++;
        this.recalcStats();
      } else if (opt.kind === 'herb') {
        this.heal(40);
      } else {
        this.credits += 25;
      }
    }

    checkLevel() {
      const p = this.player;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = OO.CONFIG.xpToNext(p.level);
        p.pendingLevels++;
      }
      if (p.pendingLevels > 0 && this.state === 'playing') this.openLevelUp();
    }

    openLevelUp() {
      const p = this.player;
      p.pendingLevels--;
      this.state = 'levelup';
      OO.Audio.play('levelup');
      this.ui.showLevelUp(this.rollUpgrades(3), p.level - p.pendingLevels);
    }

    chooseUpgrade(opt) {
      if (this.state !== 'levelup') return;
      this.applyUpgrade(opt);
      OO.Audio.play('select');
      this.state = 'playing';
      this.ui.hideAll();
      if (this.player.pendingLevels > 0) this.openLevelUp();
    }

    openChest(big) {
      const p = this.player, results = [];
      const rolls = big ? 3 : 1;
      for (let i = 0; i < rolls; i++) {
        const cands = [];
        for (const w of p.weapons) if (w.level < w.maxLevel) cands.push({ kind: 'weapon', id: w.id });
        for (const id of p.passiveOrder) if (p.passives[id] < OO.PASSIVES[id].max) cands.push({ kind: 'passive', id });
        const opt = cands.length ? U.pick(cands) : { kind: 'credits' };
        const d = this.describeUpgrade(opt);
        this.applyUpgrade(opt);
        results.push(d);
      }
      const bonus = big ? 60 : 20;
      this.credits += bonus;
      this.state = 'chest';
      OO.Audio.play('chest');
      this.ui.showChest(results, bonus);
    }

    closeChest() {
      if (this.state !== 'chest') return;
      this.state = 'playing';
      this.ui.hideAll();
      this.checkLevel();
    }

    heal(n) {
      const p = this.player;
      const before = p.hp;
      p.hp = Math.min(p.stats.maxHp, p.hp + n);
      this.addText(p.x, p.y - 24, '+' + Math.round(p.hp - before), 'heal');
      OO.Audio.play('herb');
    }

    // ------------------------------------------------------------ main loop
    frame(ts) {
      const dt = Math.min(0.1, (ts - this.last) / 1000);
      this.last = ts;
      if (dt > 0) this.fps = U.lerp(this.fps, 1 / dt, 0.05);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) { this.tick(STEP); this.acc -= STEP; steps++; }
      if (steps >= 6) this.acc = 0;
      this.renderer.render(dt);
      requestAnimationFrame((t) => this.frame(t));
    }

    tick(dt) {
      Input.update();
      if (Input.consume('KeyM')) this.toggleMute();
      if (Input.consume('Backquote')) this.debug = !this.debug;
      if (Input.consume('Escape') || Input.consume('KeyP')) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (this.state === 'playing') {
        if (this.debug) this.debugKeys();
        this.update(dt);
      } else if (this.state === 'menu') {
        this.menuTime += dt;
      }
      Input.endFrame();
    }

    debugKeys() {
      const p = this.player;
      if (Input.consume('KeyL')) p.xp = p.xpNext;
      if (Input.consume('KeyT')) this.time += 60;
      if (Input.consume('KeyH')) p.hp = p.stats.maxHp;
      if (Input.consume('KeyB')) this.director.runEvent({ kind: 'boss', enemy: 'stalker', count: 1, text: 'Debug: Stalker spawned' });
    }

    update(dt) {
      this.time += dt;
      if (this.time >= OO.CONFIG.RUN_LENGTH) { this.endRun(true); return; }
      const p = this.player;

      // Player movement
      const ax = Input.axis.x, ay = Input.axis.y;
      p.moving = ax !== 0 || ay !== 0;
      p.vx = ax * p.stats.speed; p.vy = ay * p.stats.speed;
      if (p.moving) {
        p.x += ax * p.stats.speed * dt;
        p.y += ay * p.stats.speed * dt;
        p.faceAngle = Math.atan2(ay, ax);
        p.walk += dt * 10 * Math.hypot(ax, ay);
      }
      this.world.update(p.x, p.y);
      this.world.resolveCircle(p, p.r);
      p.iframes -= dt; p.hurt -= dt; p.aimT -= dt;
      if (p.aimT <= 0) p.aimAngle = p.faceAngle;
      if (p.stats.regen) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * dt);

      this.director.update(dt);
      this.updateEnemies(dt);

      this.grid.clear();
      for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
      this.separate();

      for (const w of p.weapons) w.update(dt, this);
      this.updateProjectiles(dt);
      this.updateLobs(dt);
      this.updateEnemyShots(dt);
      this.updateHazards(dt);
      this.updateZones(dt);
      this.processExplosions();
      this.updatePickups(dt);
      this.updateFx(dt);

      compact(this.enemies);

      if (p.hp / p.stats.maxHp < 0.3) {
        this.heartT -= dt;
        if (this.heartT <= 0) { OO.Audio.play('heartbeat'); this.heartT = 0.95; }
      }
      if (this.state === 'playing') this.checkLevel();
    }

    // ------------------------------------------------------------ enemies
    spawnEnemy(type, x, y) {
      const d = OO.ENEMIES[type], m = this.time / 60;
      const hpMul = d.crate ? 1 : d.boss ? 1 + m * 0.12 : 1 + m * 0.15;
      const e = {
        id: ++this.nextId, type, def: d, x, y,
        hp: d.hp * hpMul, maxHp: d.hp * hpMul,
        speed: d.speed * (d.boss || d.crate ? 1 : U.rand(0.88, 1.12)),
        dmg: d.dmg * (1 + m * 0.05), r: d.r, mass: d.mass,
        kbx: 0, kby: 0, flash: 0, dead: false, t: U.rand(0, 10), a: 0, ai: {},
      };
      if (!d.crate && this.world) this.world.resolveCircle(e, e.r);
      this.enemies.push(e);
      return e;
    }

    updateEnemies(dt) {
      const p = this.player;
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.flash -= dt; e.t += dt;
        if (e.def.crate) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;

        if (d > this.despawnDist) {
          // Fell too far behind: bring it back ahead of the player instead of despawning.
          const a = (p.moving ? p.faceAngle : Math.atan2(dy, dx)) + U.rand(-0.9, 0.9);
          e.x = p.x + Math.cos(a) * this.spawnRadius;
          e.y = p.y + Math.sin(a) * this.spawnRadius;
          continue;
        }

        let mx = dx / d, my = dy / d, spd = e.speed;
        if (e.def.boss) {
          const ai = e.ai;
          if (ai.timer === undefined) { ai.timer = 4; ai.mode = 'walk'; }
          ai.timer -= dt;
          if (ai.mode === 'wind') {
            spd = 0;
            if (ai.timer <= 0) { ai.mode = 'dash'; ai.timer = 0.7; ai.dx = mx; ai.dy = my; }
          } else if (ai.mode === 'dash') {
            spd = e.speed * 5; mx = ai.dx; my = ai.dy;
            if (Math.random() < 0.5) this.burst(e.x, e.y, '#3a2d44', 1, 40);
            if (ai.timer <= 0) { ai.mode = 'walk'; ai.timer = U.rand(4, 6); }
          } else if (ai.timer <= 0 && d < 520) {
            ai.mode = 'wind'; ai.timer = 0.7;
          }
        } else if (e.def.ranged) {
          // Spitter: hold a firing distance, strafe, wind up, spit.
          const R = e.def.ranged, ai = e.ai;
          if (ai.cd === undefined) { ai.cd = U.rand(1, 2); ai.wind = 0; ai.strafe = U.chance(0.5) ? 1 : -1; }
          if (ai.wind > 0) {
            spd = 0;
            ai.wind -= dt;
            if (ai.wind <= 0) this.spit(e);
          } else {
            if (d < R.min) { mx = -mx; my = -my; spd *= 0.85; }
            else if (d <= R.max) { const tx = -my * ai.strafe, ty = mx * ai.strafe; mx = tx; my = ty; spd *= 0.55; }
            ai.cd -= dt;
            if (ai.cd <= 0 && d < R.max + 60) {
              ai.wind = R.windup;
              ai.cd = U.rand(R.cd[0], R.cd[1]);
              OO.Audio.play('gurgle');
            }
          }
        } else if (e.type === 'shambler') {
          const wob = Math.sin(e.t * 1.7 + e.id) * 0.35;
          const c = Math.cos(wob), s = Math.sin(wob);
          const nx = mx * c - my * s; my = mx * s + my * c; mx = nx;
        }
        // Obstacle avoidance: if something solid is just ahead, slide around it
        // (the side is remembered briefly so they don't dither in front of a wall).
        if (spd > 0) {
          const ahead = e.r + 24;
          const o = this.world.hitCircle(e.x + mx * ahead, e.y + my * ahead, e.r);
          const ai = e.ai;
          if (ai.sideT > 0) ai.sideT -= dt;
          if (o) {
            let tx = -(e.y - o.y), ty = e.x - o.x;
            if (!(ai.sideT > 0)) { ai.side = tx * mx + ty * my >= 0 ? 1 : -1; ai.sideT = 1.2; }
            tx *= ai.side; ty *= ai.side;
            const tl = Math.hypot(tx, ty) || 1;
            mx = mx * 0.35 + tx / tl; my = my * 0.35 + ty / tl;
            const ml = Math.hypot(mx, my) || 1;
            mx /= ml; my /= ml;
          }
        }
        e.a = Math.atan2(my, mx);
        e.x += mx * spd * dt + e.kbx * dt;
        e.y += my * spd * dt + e.kby * dt;
        const k = Math.max(0, 1 - dt * 9);
        e.kbx *= k; e.kby *= k;
        if (e.def.ranged) e.a = Math.atan2(dy, dx);   // always faces you, even while backing off

        if (d < e.r + p.r) this.hurtPlayer(e.dmg);
      }
    }

    separate() {
      const buf = this._sepBuf;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        this.grid.query(e.x, e.y, e.r + 32, buf);
        for (const o of buf) {
          if (o === e || o.dead) continue;
          if (!o.def.crate && o.id < e.id) continue;   // each enemy pair handled once
          let dx = e.x - o.x, dy = e.y - o.y;
          const min = e.r + o.r;
          let d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          if (d2 < 0.01) { dx = U.rand(-1, 1); dy = U.rand(-1, 1); d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          if (o.def.crate) { e.x += nx * push * 2; e.y += ny * push * 2; continue; }
          const tm = e.mass + o.mass;
          e.x += nx * push * (o.mass / tm); e.y += ny * push * (o.mass / tm);
          o.x -= nx * push * (e.mass / tm); o.y -= ny * push * (e.mass / tm);
        }
      }
      for (const e of this.enemies) if (!e.dead && !e.def.crate) this.world.resolveCircle(e, e.r);
    }

    nearestEnemy(x, y, maxD, exclude) {
      let best = null, bd = maxD * maxD;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        if (exclude && exclude.has(e.id)) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /** Nearest enemy with a clear line of fire (obstacles block bullets). */
    nearestVisible(x, y, maxD) {
      const first = this.nearestEnemy(x, y, maxD);
      if (!first || !this.world.blocked(x, y, first.x, first.y)) return first;
      const md = maxD * maxD, cands = [];
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < md) cands.push([d, e]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < cands.length && i < 10; i++) {
        const e = cands[i][1];
        if (!this.world.blocked(x, y, e.x, e.y)) return e;
      }
      return null;
    }

    randomEnemyNear(x, y, maxD, exclude) {
      let pick = null, n = 0;
      const md = maxD * maxD;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        if (exclude && exclude.has(e.id)) continue;
        if (U.dist2(x, y, e.x, e.y) > md) continue;
        n++;
        if (Math.random() * n < 1) pick = e;   // reservoir sampling
      }
      return pick;
    }

    damageEnemy(e, dmg, kbx, kby, weapon) {
      if (e.dead) return;
      dmg = Math.max(1, Math.round(dmg));
      const dealt = Math.min(dmg, e.hp);
      e.hp -= dmg;
      e.flash = 0.1;
      const kbScale = e.def.boss ? 0.04 : e.def.elite ? 0.25 : 1;
      e.kbx += (kbx / e.mass) * kbScale;
      e.kby += (kby / e.mass) * kbScale;
      if (weapon) weapon.damageDealt += dealt;
      if (this.settings.damageNumbers && !e.def.crate) this.addText(e.x + U.rand(-6, 6), e.y - e.r, dmg, 'dmg');
      OO.Audio.play('hit');
      if (e.hp <= 0) this.killEnemy(e, weapon);
    }

    killEnemy(e, weapon) {
      e.dead = true;
      if (weapon) weapon.kills++;
      if (e.def.crate) {
        this.crateLoot(e);
        this.burst(e.x, e.y, '#8a6a3e', 12, 170);
        OO.Audio.play('crate');
        return;
      }
      this.kills++;
      this.dropXp(e.x, e.y, e.def.xp);
      const bile = e.def.blood === 'bile';
      this.addDecal(e.x, e.y, e.r * U.rand(1.4, 2.1), bile ? 'bile' : 'red');
      this.burst(e.x, e.y, bile ? '#a8b83a' : '#8f1712', e.def.boss ? 50 : 7, e.def.boss ? 280 : 140);
      if (e.def.explode) this.pendingExplosions.push({ x: e.x, y: e.y, r: e.def.explode.r, dmg: e.def.explode.dmg, enemyDmg: e.def.explode.enemyDmg });
      if (e.def.elite) this.addPickup('case', e.x, e.y, { big: false });
      if (e.def.boss) {
        this.addPickup('case', e.x, e.y, { big: true });
        this.ui.banner('The Stalker is down', 'good');
        this.shake(12);
        OO.Audio.play('explode');
      }
      if (U.chance(0.004)) this.addPickup('herb', e.x + 12, e.y);
      OO.Audio.play('kill');
    }

    crateLoot(e) {
      const kind = U.weightedPick([['herb', 45], ['credit', 25], ['magnet', 20], ['bomb', 10]]);
      this.addPickup(kind, e.x, e.y, kind === 'credit' ? { value: U.randInt(10, 25) } : {});
    }

    hurtPlayer(dmg, ignoreIframes) {
      const p = this.player;
      if (this.state !== 'playing') return;
      if (p.iframes > 0 && !ignoreIframes) return;
      const d = Math.max(1, Math.round(dmg - p.stats.armor));
      p.hp -= d;
      p.iframes = OO.CONFIG.PLAYER.iframes;
      p.hurt = 0.3;
      this.shake(5);
      OO.Audio.play('hurt');
      this.addText(p.x, p.y - 22, d, 'hurt');
      if (p.hp <= 0) { p.hp = 0; this.endRun(false); }
    }

    processExplosions() {
      let n = 0;
      const p = this.player, buf = this._exBuf;
      while (this.pendingExplosions.length && n++ < 40) {
        const ex = this.pendingExplosions.shift();
        this.addEffect({ kind: 'burst', x: ex.x, y: ex.y, r: ex.r, life: 0.35, max: 0.35 });
        this.addDecal(ex.x, ex.y, ex.r * 0.8, 'bile');
        this.addLight(ex.x, ex.y, ex.r * 2.2, 1, 0.3);
        this.burst(ex.x, ex.y, '#b9c94a', 18, 260);
        OO.Audio.play('explode');
        this.shake(5);
        if (U.dist2(ex.x, ex.y, p.x, p.y) < (ex.r + p.r) ** 2) this.hurtPlayer(ex.dmg, true);
        this.grid.query(ex.x, ex.y, ex.r + 32, buf);
        for (const o of buf) {
          if (o.dead) continue;
          const dx = o.x - ex.x, dy = o.y - ex.y, d = Math.hypot(dx, dy) || 1;
          if (d < ex.r + o.r) this.damageEnemy(o, ex.enemyDmg, (dx / d) * 220, (dy / d) * 220, null);
        }
      }
    }

    /** Damage multiplier for enemy attacks at the current time. */
    enemyDmgScale() { return 1 + (this.time / 60) * 0.05; }

    spit(e) {
      const p = this.player, R = e.def.ranged;
      const lead = R.flight * 0.5;      // aims where you're going, but only half-committed
      const tx = p.x + (p.vx || 0) * lead + U.rand(-14, 14);
      const ty = p.y + (p.vy || 0) * lead + U.rand(-14, 14);
      this.enemyShots.push({ x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, dur: R.flight, r: R.splash,
        impact: R.impact * this.enemyDmgScale(), pool: R.pool });
      OO.Audio.play('spit');
    }

    updateEnemyShots(dt) {
      const p = this.player;
      for (const s of this.enemyShots) {
        s.t += dt;
        if (s.t < s.dur) continue;
        s.dead = true;
        if (U.dist2(p.x, p.y, s.x1, s.y1) < (s.r + p.r) ** 2) this.hurtPlayer(s.impact);
        this.hazards.push({ x: s.x1, y: s.y1, r: s.pool.r, life: s.pool.life, max: s.pool.life, tick: s.pool.tick, tickT: 0.1,
          dmg: s.pool.dmg * this.enemyDmgScale(), seed: Math.random() * 100 });
        this.burst(s.x1, s.y1, '#a8d84a', 10, 150);
        this.addDecal(s.x1, s.y1, s.r * 0.7, 'bile');
        OO.Audio.play('splat');
      }
      compact(this.enemyShots);
    }

    updateHazards(dt) {
      const p = this.player;
      for (const h of this.hazards) {
        h.life -= dt;
        if (h.life <= 0) { h.dead = true; continue; }
        h.tickT -= dt;
        if (h.tickT <= 0) {
          h.tickT = h.tick;
          if (U.dist2(p.x, p.y, h.x, h.y) < (h.r + p.r * 0.4) ** 2) this.hurtPlayer(h.dmg);
        }
      }
      compact(this.hazards);
    }

    airstrike() {
      const p = this.player;
      this.flashWhite = 1;
      this.shake(16);
      OO.Audio.play('airstrike');
      const hw = this.viewW / 2 + 40, hh = this.viewH / 2 + 40;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        if (Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue;
        this.damageEnemy(e, e.def.boss ? 400 : e.def.elite ? 250 : 99999, 0, 0, null);
      }
      this.ui.banner('Airstrike called in', 'good');
    }

    // ------------------------------------------------------------ projectiles & areas
    spawnProjectile(o) {
      o.hit = new Set();
      o.dead = false;
      this.projectiles.push(o);
    }

    updateProjectiles(dt) {
      const buf = this._prBuf;
      for (const pr of this.projectiles) {
        if (pr.dead) continue;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        pr.life -= dt;
        if (pr.life <= 0) { pr.dead = true; continue; }
        if (this.world.hitCircle(pr.x, pr.y, pr.r)) {
          pr.dead = true;
          this.burst(pr.x, pr.y, '#ffd98a', 3, 90);
          continue;
        }
        this.grid.query(pr.x, pr.y, pr.r + 32, buf);
        for (const e of buf) {
          if (e.dead || pr.hit.has(e.id)) continue;
          if (U.dist2(pr.x, pr.y, e.x, e.y) > (pr.r + e.r) ** 2) continue;
          pr.hit.add(e.id);
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          this.damageEnemy(e, pr.dmg, (pr.vx / sp) * pr.kb, (pr.vy / sp) * pr.kb, pr.weapon);
          if (--pr.pierce <= 0) { pr.dead = true; break; }
        }
      }
      compact(this.projectiles);
    }

    updateLobs(dt) {
      for (const l of this.lobs) {
        l.t += dt;
        if (l.t >= l.dur) {
          l.dead = true;
          this.zones.push(Object.assign({ x: l.x1, y: l.y1, max: l.zone.life, tickT: 0, seed: Math.random() * 100 }, l.zone));
          this.addLight(l.x1, l.y1, 160, 1, 0.25);
          OO.Audio.play('ignite');
        }
      }
      compact(this.lobs);
    }

    updateZones(dt) {
      const buf = this._zoneBuf;
      for (const z of this.zones) {
        z.life -= dt;
        if (z.life <= 0) { z.dead = true; continue; }
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.tick;
          this.grid.query(z.x, z.y, z.r + 32, buf);
          for (const e of buf) {
            if (e.dead) continue;
            if (U.dist2(z.x, z.y, e.x, e.y) < (z.r + e.r * 0.5) ** 2) this.damageEnemy(e, z.dmg, 0, 0, z.weapon);
          }
        }
        if (Math.random() < 0.3) {
          const a = U.rand(0, U.TAU), rr = U.rand(0, z.r);
          this.particles.push({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr, vx: U.rand(-10, 10), vy: U.rand(-50, -20), life: 0.6, max: 0.6, color: '#ffb347', size: 2 });
        }
      }
      compact(this.zones);
    }

    // ------------------------------------------------------------ pickups
    addPickup(kind, x, y, extra) {
      const g = Object.assign({ kind, x, y, value: 1, attract: false, v: -140, t: U.rand(0, 10), dead: false }, extra || {});
      this.pickups.push(g);
      return g;
    }

    dropXp(x, y, v) {
      if (v <= 0) return;
      if (this.gemCount >= OO.CONFIG.MAX_GEMS) {
        if (!this.overflowGem || this.overflowGem.dead) this.overflowGem = this.addPickup('xp', x, y, { value: 0, overflow: true });
        this.overflowGem.value += v;
        return;
      }
      this.gemCount++;
      this.addPickup('xp', x, y, { value: v });
    }

    updatePickups(dt) {
      const p = this.player, mag = p.stats.magnet;
      let gems = 0;
      for (const g of this.pickups) {
        if (g.dead) continue;
        if (g.kind === 'xp') gems++;
        g.t += dt;
        const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
        if (!g.attract && g.kind !== 'case' && d < mag) g.attract = true;
        if (g.attract) {
          g.v = Math.min(g.v + 1500 * dt, 1100);
          const step = g.v > 0 ? Math.min(d, g.v * dt) : g.v * dt;
          g.x += (dx / d) * step; g.y += (dy / d) * step;
        }
        if (g.kind === 'case' && this.state !== 'playing') continue;   // one case screen at a time
        if (U.dist2(p.x, p.y, g.x, g.y) < (p.r + 10) ** 2) this.collect(g);
      }
      this.gemCount = gems;
      compact(this.pickups);
    }

    collect(g) {
      const p = this.player;
      g.dead = true;
      switch (g.kind) {
        case 'xp':
          p.xp += g.value;
          this.xpCombo = this.xpComboT > 0 ? this.xpCombo + 1 : 0;
          this.xpComboT = 0.4;
          OO.Audio.play('xp', this.xpCombo);
          break;
        case 'herb': this.heal(30); break;
        case 'credit':
          this.credits += g.value;
          this.addText(p.x, p.y - 24, '+' + g.value + 'c', 'credit');
          OO.Audio.play('xp', 10);
          break;
        case 'magnet':
          for (const o of this.pickups) if (o.kind === 'xp') o.attract = true;
          this.ui.banner('Scanner pulse: samples incoming', 'good');
          OO.Audio.play('select');
          break;
        case 'bomb': this.airstrike(); break;
        case 'case': this.openChest(!!g.big); break;
      }
    }

    // ------------------------------------------------------------ effects
    addEffect(fx) { if (this.effects.length < 120) this.effects.push(fx); }
    addLight(x, y, r, i, life) { if (this.lights.length < 40) this.lights.push({ x, y, r, i, life: life || 0.05, max: life || 0.05 }); }
    shake(a) { if (!this.reducedMotion) this.shakeAmt = Math.max(this.shakeAmt, a); }

    addText(x, y, val, kind) {
      if (this.texts.length > 90) this.texts.shift();
      this.texts.push({ x, y, val, kind, life: 0.7, max: 0.7 });
    }

    addDecal(x, y, r, kind) {
      if (this.decals.length > 200) this.decals.shift();
      this.decals.push({ x, y, r, kind, rot: U.rand(0, U.TAU), v: U.randInt(0, 5), life: 40 });
    }

    burst(x, y, color, n, speed) {
      for (let i = 0; i < n && this.particles.length < 600; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(0.3, 1) * speed;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.3, 0.7), max: 0.7, color, size: U.rand(1.5, 3.5) });
      }
    }

    updateFx(dt) {
      for (const f of this.effects) { f.life -= dt; if (f.life <= 0) f.dead = true; }
      compact(this.effects);
      for (const l of this.lights) { l.life -= dt; if (l.life <= 0) l.dead = true; }
      compact(this.lights);
      const fr = Math.max(0, 1 - dt * 5);
      for (const q of this.particles) {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= fr; q.vy *= fr;
        q.life -= dt; if (q.life <= 0) q.dead = true;
      }
      compact(this.particles);
      for (const t of this.texts) { t.y -= 28 * dt; t.life -= dt; if (t.life <= 0) t.dead = true; }
      compact(this.texts);
      for (const d of this.decals) { d.life -= dt; if (d.life <= 0) d.dead = true; }
      compact(this.decals);
      this.shakeAmt *= Math.max(0, 1 - dt * 10);
      this.flashWhite = Math.max(0, this.flashWhite - dt * 1.5);
      this.xpComboT -= dt;
    }

    get bosses() { return this.enemies.filter((e) => e.def.boss && !e.dead); }
  }

  /** Remove items flagged dead, in place (no new array every frame). */
  function compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
    arr.length = j;
  }

  OO.Game = Game;
})(window.OO = window.OO || {});
