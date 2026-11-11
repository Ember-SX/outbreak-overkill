/*
 * Game: owns the run state, the fixed-timestep loop and all simulation.
 * Rendering lives in render.js, menus in ui.js, content in config.js, co-op networking in coop.js.
 *
 * The simulation always works on a list of players (`this.players`). Solo has one; a co-op host
 * has two (the second one is driven by network input). `this.player` is always the local player:
 * the one the camera follows, the HUD shows and the keyboard moves.
 *
 * Modes: 'solo' | 'host' (runs the simulation and streams it) | 'client' (renders the host's
 * stream; see coop.js).
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const Input = OO.Input;
  const STEP = 1 / 60;
  const PLAYER_COLORS = ['#2f4a5c', '#5c3a2f'];
  const SLOT_TINTS = ['#56d6c0', '#ff9f4a'];      // P1 teal, P2 orange (name tags, markers)
  // Sounds that only make sense for the player they happened to (never forwarded to a partner).
  const LOCAL_SOUNDS = new Set(['xp', 'hurt', 'heartbeat', 'levelup', 'select', 'chest', 'evolve', 'herb', 'victory', 'gameover', 'achieve', 'codex', 'radio']);

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.state = 'menu';            // menu | playing | levelup | paused | results
      this.mode = 'solo';             // solo | host | client
      this.debug = false;
      this.player = null;
      this.players = [];
      this.net = null;
      this.netEvents = [];
      this.remoteView = null;         // partner's view size, so spawns stay off both screens
      this.grid = new U.SpatialHash(64);
      this._sepBuf = []; this._prBuf = []; this._exBuf = []; this._zoneBuf = [];
      this.records = U.storage.get('oo.records', { bestTime: 0, bestKills: 0, runs: 0, wins: 0 });
      this.settings = Object.assign({ muted: false, damageNumbers: true, shake: true, difficulty: 'standard', fx: 'auto', mode: 'standard' }, U.storage.get('oo.settings', {}));
      this.meta = Object.assign({ bank: 0, ranks: {}, skins: {}, outfit: {} }, U.storage.get('oo.meta', {}));
      if (!this.meta.skins || typeof this.meta.skins !== 'object') this.meta.skins = {};
      if (!this.meta.outfit || typeof this.meta.outfit !== 'object') this.meta.outfit = {};
      // A save from v0.2 may still have Nightmare selected; fall back to Standard while it is locked.
      const sel = OO.DIFFICULTY[this.settings.difficulty];
      if (!sel || sel.locked) { this.settings.difficulty = 'standard'; U.storage.set('oo.settings', this.settings); }
      OO.Audio.setMuted(this.settings.muted);
      this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.progress = new OO.Progress(this);   // commendations, lifetime stats, bestiary (js/progress.js)
      this.renderer = new OO.Renderer(this, canvas);
      this.ui = new OO.UI(this);
      Input.attach(canvas);

      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing' && !this.coop) this.pause(); });

      this.fps = 60; this.last = performance.now(); this.acc = 0; this.menuTime = 0;
      this.frameGate = U.frameLimiter(OO.CONFIG.MAX_FPS);   // render cap (CONFIG.MAX_FPS)
      requestAnimationFrame((t) => this.frame(t));
    }

    /** True while a co-op session (host or client) is running a shared game. */
    get coop() { return this.mode !== 'solo'; }
    /** True while a partner is actually connected: drives the co-op enemy HP multiplier. */
    get coopActive() { return (this.mode === 'host' && this.players.length > 1) || this.mode === 'client'; }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.screenW = w; this.screenH = h;
      this.zoom = U.clamp(Math.min(w, h) / 620, 0.6, 1.5);
      this.viewW = w / this.zoom; this.viewH = h / this.zoom;
      this.updateSpawnRadius();
      this.renderer.resize(w, h, this.dpr);
    }

    /** Spawn ring sits just outside the larger of the two players' views. */
    updateSpawnRadius() {
      let vw = this.viewW, vh = this.viewH;
      if (this.remoteView && this.mode === 'host') { vw = Math.max(vw, this.remoteView.w); vh = Math.max(vh, this.remoteView.h); }
      this.spawnRadius = Math.hypot(vw, vh) / 2 + 50;
      this.despawnDist = this.spawnRadius + 260;
    }

    // ------------------------------------------------------------ run lifecycle
    /** Shared reset for every kind of run. */
    resetRun(seed) {
      this.time = 0; this.kills = 0; this.credits = 0; this.nextId = 0;
      this.enemies = []; this.projectiles = []; this.pickups = []; this.zones = []; this.lobs = [];
      this.effects = []; this.particles = []; this.decals = []; this.texts = []; this.lights = [];
      this.pendingExplosions = [];
      this.enemyShots = []; this.hazards = []; this.stampedes = []; this.missiles = [];
      this.netEvents = [];
      this.turrets = []; this.fuses = []; this._killer = null;
      this.infinite = this.settings.mode === 'infinite';   // Infinite Mode (co-op clients take the host's)
      this.overtime = false; this.maxRankShown = false; this.mark = null;
      this.tally = { stalkers: 0, mechs: 0, stampedes: 0, lastStampede: -99 };   // team counters for commendations
      this.gemCount = 0; this.otherCount = 0; this.nextPickupId = 0; this.nextProjId = 0; this._immuneT = -9;
      this.team = { level: 1, xp: 0, xpNext: OO.CONFIG.xpToNext(1), pending: 0 };
      this.strain = { level: 0, peak: 0, timeLevel: 0, capped: false, adapt: 0, oneShot: 0, samples: 0, rising: 0 };
      this.shakeAmt = 0; this.flashWhite = 0; this.xpCombo = 0; this.xpComboT = 0; this.heartT = 0;
      this.seed = seed;
      this.world = new OO.World(seed);
      this.world.update(0, 0);
    }

    makePlayer(slot, charId, ranks, local, skin, calldown) {
      const ch = OO.CHARACTERS[charId] || OO.CHARACTERS.mara;
      const P = OO.CONFIG.PLAYER;
      ranks = ranks || {};
      const p = {
        slot, local, charId: OO.CHARACTERS[charId] ? charId : 'mara', name: ch.name, char: ch,
        skin: OO.Characters.skinOf(OO.CHARACTERS[charId] ? charId : 'mara', skin).id,
        tag: 'P' + (slot + 1), tint: SLOT_TINTS[slot] || '#fff', vest: ch.vest || PLAYER_COLORS[slot],
        x: slot * 44, y: 0, r: P.radius, hp: 1, vx: 0, vy: 0,
        faceAngle: 0, aimAngle: 0, aimT: 0, moving: false, walk: 0, iframes: 0, hurt: 0,
        weapons: [], passives: {}, passiveOrder: [], stats: {}, statsVersion: 0, ranks,
        rerolls: 1 + (ranks.reroll || 0), revives: ranks.revive || 0,
        downed: false, reviveT: 0, input: null, luOptions: null, luDone: true,
        rs: OO.Progress.newRunStats(), cd: this.newCalldown(calldown || 'flashbang'), md: 0, mdRate: 0,
        apex: {}, apexTotal: 0, pulseT: 0,
      };
      this.recalcStats(p);
      p.hp = p.stats.maxHp;
      this.addWeapon(p, ch.weapon);
      return p;
    }

    start(charId) {
      this.mode = 'solo';
      this.resetRun(Math.floor(Math.random() * 1e9));
      this.players = [this.makePlayer(0, charId, this.meta.ranks, true, this.skinFor(charId), this.calldownFor())];
      this.player = this.players[0];
      this.charId = charId;
      this.director = new OO.Director(this);
      this.progress.runStart();
      U.storage.set('oo.char', charId);
      this.state = 'playing';
      this.ui.hideAll();
      this.ui.setHud(true);
    }

    endRun(victory) {
      if (this.state === 'results') return;
      // Infinite Mode: there is no evac; holding out to 15:00 still counts as surviving the run
      // (for records and achievements), and the run itself only ends when the team is overrun.
      if (this.infinite && this.time >= OO.CONFIG.RUN_LENGTH) victory = true;
      this.state = 'results';
      const summary = {
        victory, time: this.time, level: this.team.level, kills: this.kills, credits: this.credits,
        infinite: this.infinite, overtime: this.infinite ? Math.max(0, this.time - OO.CONFIG.RUN_LENGTH) : 0,
        mark: this.overtime && this.mark ? this.mark : null,   // credits and kills at 15:00 (payout)
        apex: this.player && this.player.rs ? this.player.rs.apex : 0,
        strain: this.strain.peak, difficulty: this.difficulty.name, coop: this.coop,
        team: this.players.map((p) => ({ tag: p.tag, name: p.name, downed: p.downed })),
      };
      if (this.mode === 'host' && this.net) {
        for (const p of this.players) if (!p.local) this.netSend({ t: 'results', summary, weapons: this.weaponTable(p) });
      }
      this.finishRun(summary, this.weaponTable(this.player));
    }

    /** Bank, record and show results for the local player (both sides of a co-op run call this). */
    finishRun(summary, weapons) {
      this.state = 'results';
      // Run payout goes into the local Armory bank (each co-op player banks their own).
      // Infinite Mode: the run up to 15:00 pays as normal; overtime pays a flat rate
      // per minute plus a trickle from kills and pickups, so one endless run can't empty the Armory.
      const I = OO.CONFIG.INFINITE, ot = summary.mark ? summary.overtime || 0 : 0;
      const credits = summary.mark ? summary.mark.credits + Math.floor((summary.credits - summary.mark.credits) * I.overtimePickupShare) : summary.credits;
      const kills = summary.mark ? summary.mark.kills : summary.kills;
      const time = summary.mark ? Math.min(summary.time, OO.CONFIG.RUN_LENGTH) : summary.time;
      const payout = Math.round((credits + Math.floor(kills / 20) + Math.floor(time / 60) * 5 + (summary.victory ? 100 : 0)
        + Math.floor(ot / 60) * I.overtimeCredits + (summary.mark ? Math.floor((summary.kills - summary.mark.kills) / I.overtimeKillsPerCredit) : 0))
        * (1 + this.rank('greed') * 0.1) * this.difficulty.credits);
      this.meta.bank += payout;
      this.saveMeta();
      const r = this.records;
      r.runs++; if (summary.victory) r.wins++;
      r.bestTime = Math.max(r.bestTime, Math.floor(summary.time));
      r.bestKills = Math.max(r.bestKills, summary.kills);
      U.storage.set('oo.records', r);
      const commendations = this.progress.runEnd(summary, payout);
      OO.Audio.play(summary.victory && !summary.infinite ? 'victory' : 'gameover');
      this.ui.setHud(false);
      this.ui.showResults(Object.assign({}, summary, { payout, bank: this.meta.bank, weapons, commendations }));
    }

    weaponTable(p) {
      return p.weapons.map((w) => ({ id: w.id, name: w.def.name, level: w.level, over: w.over || 0, dmg: Math.round(w.damageDealt), kills: w.kills }));
    }

    quitToMenu() {
      this.abandonRun();
      if (this.net && this.leaveSession) this.leaveSession();
      this.mode = 'solo';
      this.state = 'menu';
      this.player = null;
      this.players = [];
      this.ui.setHud(false);
      this.ui.showMenu();
    }

    /** Leaving mid-run: no payout or service record, but the lifetime stats still count it. */
    abandonRun() {
      if (!this.progress.live || !this.player) return;
      this.progress.runEnd({ victory: false, abandoned: true, time: this.time, level: this.team.level, kills: this.kills, coop: this.coop }, 0);
    }

    pause() {
      if (this.state !== 'playing') return;
      if (this.mode === 'client') { this.netSend({ t: 'pause' }); return; }
      this.state = 'paused';
      this.ui.showPause();
      if (this.mode === 'host') this.netSend({ t: 'paused' });
    }

    resume() {
      if (this.state !== 'paused') return;
      if (this.mode === 'client') { this.netSend({ t: 'resume' }); return; }
      this.state = 'playing';
      this.ui.hideAll();
      if (this.mode === 'host') this.netSend({ t: 'resumed' });
    }

    toggleSetting(key) {
      if (key === 'fx') {
        // Atmosphere effects: auto (drops to low when the frame rate sags) -> high -> low
        const order = ['auto', 'high', 'low'];
        this.settings.fx = order[(order.indexOf(this.settings.fx) + 1) % order.length];
      } else this.settings[key] = !this.settings[key];
      U.storage.set('oo.settings', this.settings);
    }

    setMode(id) {
      this.settings.mode = id === 'infinite' ? 'infinite' : 'standard';
      U.storage.set('oo.settings', this.settings);
    }

    setDifficulty(id) {
      if (!OO.DIFFICULTY[id] || OO.DIFFICULTY[id].locked) return;
      this.settings.difficulty = id;
      U.storage.set('oo.settings', this.settings);
    }

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      OO.Audio.setMuted(this.settings.muted);
      U.storage.set('oo.settings', this.settings);
      this.ui.updateMute();
    }

    // ------------------------------------------------------------ armory (meta progression)
    rank(id) { return this.meta.ranks[id] || 0; }
    saveMeta() { U.storage.set('oo.meta', this.meta); }

    buyArmory(id) {
      const item = OO.ARMORY.find((a) => a.id === id);
      const r = this.rank(id);
      if (!item || r >= item.max || this.meta.bank < item.cost[r]) return false;
      this.meta.bank -= item.cost[r];
      this.meta.ranks[id] = r + 1;
      this.saveMeta();
      return true;
    }

    // ------------------------------------------------------------ wardrobe (skins)
    /** The default skin is always owned. */
    ownsSkin(charId, skinId) {
      const s = OO.SKINS[charId] && OO.SKINS[charId].find((k) => k.id === skinId);
      return !!s && (s.cost === 0 || ((this.meta.skins || {})[charId] || []).includes(skinId));
    }

    skinFor(charId) {
      const id = (this.meta.outfit || {})[charId];
      return this.ownsSkin(charId, id) ? id : 'tactical';
    }

    buySkin(charId, skinId) {
      const s = OO.SKINS[charId] && OO.SKINS[charId].find((k) => k.id === skinId);
      if (!s || this.ownsSkin(charId, skinId) || this.meta.bank < s.cost) return false;
      this.meta.bank -= s.cost;
      this.meta.skins = this.meta.skins || {}; this.meta.outfit = this.meta.outfit || {};
      (this.meta.skins[charId] = this.meta.skins[charId] || []).push(skinId);
      this.meta.outfit[charId] = skinId;
      this.saveMeta();
      return true;
    }

    equipSkin(charId, skinId) {
      if (!this.ownsSkin(charId, skinId)) return false;
      this.meta.outfit = this.meta.outfit || {};
      this.meta.outfit[charId] = skinId;
      this.saveMeta();
      return true;
    }

    /** Refunds Armory upgrades only. Outfits are separate purchases and stay owned. */
    refundArmory() {
      for (const item of OO.ARMORY) {
        for (let i = 0; i < this.rank(item.id); i++) this.meta.bank += item.cost[i];
      }
      this.meta.ranks = {};
      this.saveMeta();
    }

    get difficulty() {
      const d = OO.DIFFICULTY[this.settings.difficulty];
      return d && !d.locked ? d : OO.DIFFICULTY.standard;
    }

    // ------------------------------------------------------------ players
    alivePlayers() { return this.players.filter((p) => !p.downed); }

    /** Nearest player still on their feet (falls back to the local player if everyone is down). */
    nearestPlayer(x, y) {
      let best = null, bd = Infinity;
      for (const p of this.players) {
        if (p.downed) continue;
        const d = U.dist2(x, y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best || this.player || this.players[0];
    }

    /** Random standing player: where the Director spawns things around. */
    anchorPlayer() {
      const a = this.alivePlayers();
      return a.length ? U.pick(a) : this.players[0];
    }

    playerBySlot(slot) { return this.players.find((p) => p.slot === slot); }

    // ------------------------------------------------------------ player build
    recalcStats(p) {
      const b = p.char.bonus, P = OO.CONFIG.PLAYER;
      const lv = (id) => p.passives[id] || 0;
      const prevMax = p.stats.maxHp || 0;
      const m = (id) => p.ranks[id] || 0;     // that player's own Armory ranks
      p.stats = {
        might: 1 + (b.might || 0) + lv('might') * 0.1 + m('power') * 0.05,
        armor: (b.armor || 0) + lv('armor') + m('plating') * OO.CONFIG.MITIGATION.platesArmor,
        dr: Math.min(OO.CONFIG.MITIGATION.maxDr, lv('armor') * OO.CONFIG.MITIGATION.vestDr + m('plating') * OO.CONFIG.MITIGATION.platesDr),
        speed: P.speed * (1 + (b.speed || 0) + lv('speed') * 0.08 + m('stride') * 0.05),
        area: 1 + lv('area') * 0.1,
        cooldown: 1 - lv('cooldown') * 0.08,
        // Pickup radius: the base range raised only by Magnetic upgrade levels (Scavenger Pack in the
        // run plus any free level an operative starts with, Sample Collector in the Armory), capped.
        magnet: Math.min(OO.CONFIG.PICKUPS.maxMagnet, P.pickupRange * (1 + (lv('magnet') + (b.magnetLv || 0)) * 0.3 + m('collector') * 0.15)),
        maxHp: P.maxHp + (b.maxHp || 0) + lv('maxhp') * 35 + m('vitality') * 25,
        regen: lv('maxhp') * 0.6 + m('vitality') * 0.3,
        amount: lv('amount'),
        growth: 1 + m('growth') * 0.08,
      };
      this.applyApexStats(p);
      if (prevMax && p.stats.maxHp > prevMax && !p.downed) p.hp += p.stats.maxHp - prevMax;
      p.statsVersion++;
    }

    addWeapon(p, id) {
      p.weapons.push(new OO.Weapon(id, p));
    }

    /** Owned weapon by id, also matching its evolved form (so an evolved pistol still counts as 'pistol'). */
    getWeapon(p, id) { return p.weapons.find((w) => w.id === id || w.def.from === id); }

    /** First owned weapon that is ready to evolve, or null. */
    findEvolution(p) {
      for (const w of p.weapons) {
        const E = OO.EVOLUTIONS[w.id];
        if (E && w.level >= w.maxLevel && p.passives[E.needs]) return w;
      }
      return null;
    }

    evolve(p, w) {
      const E = OO.EVOLUTIONS[w.id];
      const nw = new OO.Weapon(E.into, p);
      nw.damageDealt = w.damageDealt; nw.kills = w.kills;
      nw.over = w.over || 0;   // Apex overclocks carry over to the evolved weapon
      p.weapons[p.weapons.indexOf(w)] = nw;
      p.rs.evo++;
      this.banner((this.coop ? p.name + ': ' : '') + w.def.name + ' evolved into ' + nw.def.name, 'good');
      this.sfxFor(p, 'evolve');
      if (p.local) this.flashWhite = Math.max(this.flashWhite, 0.4);
      return nw;
    }

    rollUpgrades(p, n) {
      const C = OO.CONFIG, pool = [];
      for (const w of p.weapons) if (w.level < w.maxLevel) pool.push({ kind: 'weapon', id: w.id, weight: 1.5 });
      if (p.weapons.length < C.MAX_WEAPONS) {
        for (const id in OO.WEAPONS) if (!OO.WEAPONS[id].evolved && !this.getWeapon(p, id)) pool.push({ kind: 'weapon', id, weight: 1 });
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
      if (this.infinite) return this.mixApex(p, picked, n);   // Infinite Mode: past max rank, and in overtime (infinite.js)
      if (!picked.length) picked.push({ kind: 'herb' }, { kind: 'credits' });
      return picked;
    }

    describeUpgrade(p, opt) {
      if (opt.kind === 'weapon') {
        const def = OO.WEAPONS[opt.id], w = this.getWeapon(p, opt.id);
        if (!w) return { icon: def.icon, name: def.name, badge: 'New', isNew: true, text: def.desc, type: 'Weapon' };
        const next = w.level + 1;
        let text = def.levels[w.level - 1].text;
        const E = OO.EVOLUTIONS[w.id];
        if (next === w.maxLevel && E) text += ' Evolves with ' + OO.PASSIVES[E.needs].name + ' from a supply case.';
        return { icon: def.icon, name: def.name, badge: next === w.maxLevel ? 'Lv ' + next + ' · Max' : 'Lv ' + next, text, type: 'Weapon' };
      }
      if (opt.kind === 'passive') {
        const def = OO.PASSIVES[opt.id], lv = p.passives[opt.id] || 0;
        return { icon: def.icon, name: def.name, badge: lv ? 'Lv ' + (lv + 1) : 'New', isNew: !lv, text: def.text, type: 'Gear' };
      }
      if (opt.kind === 'apex') return this.describeApex(p, opt);
      if (opt.kind === 'herb') return { icon: 'herb', name: 'Green Herb', badge: 'Heal', text: 'Restore 40 HP.', type: 'Supply' };
      return { icon: 'credits', name: 'Credit Stash', badge: '+25', text: 'Pocket 25 credits.', type: 'Supply' };
    }

    applyUpgrade(p, opt) {
      if (opt.kind === 'weapon') {
        const w = this.getWeapon(p, opt.id);
        if (w) w.levelUp(); else this.addWeapon(p, opt.id);
      } else if (opt.kind === 'passive') {
        if (!p.passives[opt.id]) { p.passives[opt.id] = 1; p.passiveOrder.push(opt.id); }
        else p.passives[opt.id]++;
        this.recalcStats(p);
        if (opt.id === 'maxhp') this.heal(p, 25);      // a medkit patches you up as well
      } else if (opt.kind === 'apex') {
        this.applyApex(p, opt);
      } else if (opt.kind === 'herb') {
        this.heal(p, 40);
      } else {
        this.credits += 25;
      }
    }

    // ------------------------------------------------------------ level-ups (shared team XP)
    // XP is pooled. When the team levels up, every player picks their own upgrade; the game
    // waits until everyone has chosen.
    /**
     * XP for the next level: the standard curve, and in Infinite Mode past INFINITE.xpFrom a steady
     * linear slow-down on top (x(1 + xpSlope per level)), so late levels keep coming, just slower.
     */
    xpToNext(level) {
      const I = OO.CONFIG.INFINITE, base = OO.CONFIG.xpToNext(level);
      return this.infinite && level > I.xpFrom ? Math.round(base * (1 + I.xpSlope * (level - I.xpFrom))) : base;
    }

    checkLevel() {
      const T = this.team;
      while (T.xp >= T.xpNext) {
        T.xp -= T.xpNext;
        T.level++;
        T.xpNext = this.xpToNext(T.level);
        T.pending++;
      }
      if (T.pending > 0 && this.state === 'playing') this.openLevelUp();
    }

    openLevelUp() {
      const T = this.team;
      T.pending--;
      this.state = 'levelup';
      this.luLevel = T.level - T.pending;
      for (const p of this.players) {
        p.luDone = false;
        p.luOptions = this.rollUpgrades(p, 3);
        this.sfxFor(p, 'levelup');
        this.presentLevelUp(p);
      }
    }

    presentLevelUp(p) {
      const descs = p.luOptions.map((o) => this.describeUpgrade(p, o));
      if (p.local) this.ui.showLevelUp(descs, this.luLevel, p.rerolls);
      else this.netSend({ t: 'lvl', level: this.luLevel, options: descs, rerolls: p.rerolls });
    }

    /** UI entry points: route to the host when we are a co-op client. */
    pickUpgrade(i) {
      if (this.mode === 'client') { this.netSend({ t: 'pick', i }); this.ui.showLevelWait(); return; }
      this.chooseUpgrade(this.player, i);
    }
    requestReroll() {
      if (this.mode === 'client') { this.netSend({ t: 'reroll' }); return; }
      this.reroll(this.player);
    }
    requestSkip() {
      if (this.mode === 'client') { this.netSend({ t: 'skip' }); this.ui.showLevelWait(); return; }
      this.skipLevel(this.player);
    }

    chooseUpgrade(p, i) {
      if (this.state !== 'levelup' || p.luDone || !p.luOptions) return;
      const opt = p.luOptions[i];
      if (!opt) return;
      this.applyUpgrade(p, opt);
      p.luDone = true;
      this.sfxFor(p, 'select');
      this.afterChoice(p);
    }

    reroll(p) {
      if (this.state !== 'levelup' || p.luDone || p.rerolls <= 0) return;
      p.rerolls--;
      this.sfxFor(p, 'select');
      p.luOptions = this.rollUpgrades(p, 3);
      this.presentLevelUp(p);
    }

    skipLevel(p) {
      if (this.state !== 'levelup' || p.luDone) return;
      this.credits += 15;
      p.luDone = true;
      this.afterChoice(p);
    }

    afterChoice(p) {
      if (this.players.every((q) => q.luDone)) { this.finishLevelUp(); return; }
      if (p.local) this.ui.showLevelWait(this.players.find((q) => !q.luDone).name);
    }

    finishLevelUp() {
      this.state = 'playing';
      this.ui.hideAll();
      this.netSend({ t: 'lvldone' });
      if (this.team.pending > 0) this.openLevelUp();
    }

    // ------------------------------------------------------------ supply cases
    /**
     * Walking over a supply case applies it on the spot: no case screen, no pause, nothing to
     * confirm. A ready evolution goes first, then each roll levels up something you own. When
     * there is nothing left to level ("max rank"), a roll becomes an Apex mutation plus a chunk
     * of XP instead. Floating text and a one-line banner say what you got.
     */
    openChest(p, big) {
      const got = [];
      p.rs.cases++;
      let rolls = big ? 3 : 1;
      const ready = this.findEvolution(p);
      if (ready) {
        const nw = this.evolve(p, ready);
        got.push(nw.def.name + ' evolved');
        rolls--;
      }
      for (let i = 0; i < rolls; i++) {
        const cands = [];
        for (const w of p.weapons) if (w.level < w.maxLevel) cands.push({ kind: 'weapon', id: w.id });
        for (const id of p.passiveOrder) if (p.passives[id] < OO.PASSIVES[id].max) cands.push({ kind: 'passive', id });
        if (cands.length) {
          const opt = U.pick(cands), d = this.describeUpgrade(p, opt);
          this.applyUpgrade(p, opt);
          got.push(d.name + ' ' + d.badge);
        } else {
          // Nothing left to level: Apex mutation + XP (works in Standard as well as Infinite).
          const opt = this.rollApex(p, 1)[0];
          if (opt) {
            const d = this.describeApex(p, opt);
            this.applyApex(p, opt, true);
            got.push('Apex: ' + d.name.replace(/ [IVX]+\+?$/, ''));
          }
          // A share of the *standard* curve's cost: in Infinite past INFINITE.xpFrom the real cost keeps
          // climbing, so case XP shrinks relative to it instead of outpacing the slow-down.
          this.team.xp += OO.CONFIG.xpToNext(this.team.level) * OO.CONFIG.CASES.apexXp;
          got.push('+XP');
        }
      }
      const bonus = big ? 60 : 20;
      this.credits += bonus;
      got.forEach((txt, i) => this.addText(p.x, p.y - 30 - i * 14, txt, 'heal'));
      this.banner((this.coop ? p.name + ': ' : '') + 'Supply case: ' + got.join(' · ') + ' · +' + bonus + 'c', 'good');
      this.sfxFor(p, 'chest');
    }

    /**
     * Supply crate (the wooden box that turns up around you): walking over it opens it on the
     * spot and the contents go straight to whoever touched it.
     */
    openCrate(p, e) {
      e.dead = true;
      this.burst(e.x, e.y, '#8a6a3c', 12, 160);
      OO.Audio.play('crate');
      const kind = U.weightedPick([['herb', 45], ['credit', 25], ['magnet', 20], ['bomb', 10]]);
      if (kind === 'credit') {
        const v = U.randInt(10, 25);
        this.collect(p, { kind, value: v });
      } else this.collect(p, { kind, value: 1 });
    }

    heal(p, n, raw) {
      const before = p.hp;
      p.hp = Math.min(p.stats.maxHp, p.hp + (raw ? n : n * this.healMul()));
      this.addText(p.x, p.y - 24, '+' + Math.round(p.hp - before), 'heal');
      this.sfxFor(p, 'herb');
    }

    // ------------------------------------------------------------ main loop
    /**
     * One display frame. Frames that arrive faster than CONFIG.MAX_FPS are skipped outright (no
     * simulation, no drawing), so a 144/240 Hz screen draws at most 120 frames a second. The
     * simulation itself always advances in fixed 1/60 s steps from the time actually elapsed, so
     * physics is identical at any frame rate.
     */
    frame(ts) {
      requestAnimationFrame((t) => this.frame(t));
      if (!this.frameGate(ts)) return;
      const dt = Math.min(0.1, (ts - this.last) / 1000);
      this.last = ts;
      if (dt > 0) this.fps = U.lerp(this.fps, 1 / dt, 0.05);
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) { this.tick(STEP); this.acc -= STEP; steps++; }
      if (steps >= 6) this.acc = 0;
      this.frames = (this.frames || 0) + 1;
      this.renderer.render(dt);
    }

    tick(dt) {
      Input.update();
      if (Input.consume('KeyM')) this.toggleMute();
      if (Input.consume('Backquote')) this.debug = !this.debug;
      if (Input.consume('Escape') || Input.consume('KeyP')) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (Input.consume('KeyQ')) this.requestCalldown();
      if (this.mode === 'client') {
        this.clientTick(dt);
      } else if (this.state === 'playing') {
        if (this.debug) this.debugKeys();
        this.update(dt);
      } else if (this.state === 'menu') {
        this.menuTime += dt;
      }
      if (this.mode === 'host') this.hostTick(dt);
      if (this.net) this.netWatch(dt);
      if (this.state === 'playing' && this.player) this.progress.tick(dt);
      Input.endFrame();
    }

    debugKeys() {
      const p = this.player, T = this.team;
      if (Input.consume('KeyL')) T.xp = T.xpNext;
      if (Input.consume('KeyT')) this.time += 60;
      if (Input.consume('KeyH')) p.hp = p.stats.maxHp;
      if (Input.consume('KeyJ')) this.strain.adapt = Math.min(OO.CONFIG.LEVELING.adapt.max, this.strain.adapt + 1);
      if (Input.consume('KeyB')) this.director.runEvent({ kind: 'boss', enemy: 'stalker', count: 1, text: 'Debug: Stalker spawned' });
      if (Input.consume('KeyN')) this.director.runEvent({ kind: 'boss', enemy: 'mecha', count: 1, text: 'Debug: Hare Trigger spawned' });
    }

    update(dt) {
      this.time += dt;
      if (this.time >= OO.CONFIG.RUN_LENGTH) {
        if (!this.infinite) { this.endRun(true); return; }
        if (!this.overtime) this.enterOvertime();
      }

      this.updatePlayers(dt);
      this.updateTactical(dt);
      this.world.update(this.players);
      for (const p of this.players) if (!p.downed) this.world.resolveCircle(p, p.r);

      this.updateStrain(dt);
      this.director.update(dt);
      this.updateStampedes(dt);
      this.updateEnemies(dt);

      this.grid.clear();
      for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
      this.separate();

      for (const p of this.players) if (!p.downed) for (const w of p.weapons) w.update(dt, this);
      this.updateTurrets(dt);
      this.updateProjectiles(dt);
      this.updateLobs(dt);
      this.updateEnemyShots(dt);
      this.updateMissiles(dt);
      this.updateHazards(dt);
      this.updateZones(dt);
      this.updateFuses(dt);
      this.processExplosions();
      this.updatePickups(dt);
      this.updateFx(dt);

      compact(this.enemies);

      const lp = this.player;
      if (!lp.downed && lp.hp / lp.stats.maxHp < 0.3) {
        this.heartT -= dt;
        if (this.heartT <= 0) { OO.Audio.play('heartbeat'); this.heartT = 0.95; }
      }
      if (this.state === 'playing') this.checkLevel();
    }

    updatePlayers(dt) {
      const C = OO.CONFIG.COOP;
      for (const p of this.players) {
        p.iframes -= dt; p.hurt -= dt; p.aimT -= dt;
        if (p.downed) {
          // Revive: a teammate standing close fills the ring; walking away drains it.
          const helper = this.players.find((q) => q !== p && !q.downed && U.dist2(q.x, q.y, p.x, p.y) < C.reviveRadius * C.reviveRadius);
          p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 0.5);
          if (p.reviveT >= C.reviveTime) this.revive(p, helper);
          continue;
        }
        if (p.local) {
          const ax = Input.axis.x, ay = Input.axis.y;
          p.moving = ax !== 0 || ay !== 0;
          p.vx = ax * p.stats.speed; p.vy = ay * p.stats.speed;
          if (p.moving) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.faceAngle = Math.atan2(ay, ax);
            p.walk += dt * 10 * Math.hypot(ax, ay);
          }
        } else if (p.input) {
          // Remote player: the partner's client owns its own position (responsive movement);
          // the host just adopts it.
          const inp = p.input;
          p.x = inp.x; p.y = inp.y; p.vx = inp.vx; p.vy = inp.vy;
          p.moving = !!inp.mv; p.faceAngle = inp.fa;
          if (p.moving) p.walk += dt * 10;
        }
        if (p.aimT <= 0) p.aimAngle = p.faceAngle;
        if (p.stats.regen) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * this.healMul() * dt);
      }
    }

    // ------------------------------------------------------------ enemy leveling (strain)
    /**
     * Strain level = minutes survived + an adaptive bonus. The bonus rises while most kills are
     * one-hit kills (your damage has outgrown the infected) and eases off once they need several
     * hits again, so enemy HP keeps pace with your build instead of only with the clock.
     */
    updateStrain(dt) {
      const S = this.strain, C = OO.CONFIG.LEVELING, A = C.adapt;
      S.capped = this.time >= C.hpCapTime;
      S.timeLevel = (Math.min(this.time, C.hpCapTime) / 60) * C.perMinute;
      S.rising = Math.max(0, S.rising - dt);
      if (this.time > A.grace && S.samples >= A.minSamples) {
        if (S.oneShot > A.target && !S.capped) {
          S.adapt = Math.min(A.max, S.adapt + (S.oneShot - A.target) * A.gain * dt);
          S.rising = 2;
        } else if (S.oneShot < A.target - 0.1) {
          S.adapt = Math.max(0, S.adapt - A.decay * dt);
        }
      }
      const lvl = Math.floor(S.timeLevel + S.adapt);
      if (lvl > S.peak) {
        const crossed = Math.floor(lvl / C.announceEvery) > Math.floor(S.peak / C.announceEvery);
        S.peak = lvl;
        if (crossed) this.banner('Strain level ' + lvl + ': the infected are hardening', 'warn');
      }
      S.level = lvl;
    }

    /** HP multiplier for an enemy of the given def at a given strain level (difficulty, surge and co-op included). */
    enemyHpMul(d, level) {
      if (d.crate) return 1;
      const g = OO.CONFIG.LEVELING.hpGrowth;
      const growth = d.boss ? g.boss : d.elite ? g.elite : g.normal;
      return Math.pow(1 + growth, level) * this.difficulty.hp * this.surgeHp(d) * this.overtimeHp(d) * (this.coopActive ? OO.CONFIG.COOP.enemyHp : 1);
    }

    // ------------------------------------------------------------ late-game surge (after 6:00)
    surgeMinutes() { return Math.max(0, this.time / 60 - OO.CONFIG.SURGE.start); }
    /** Surge minutes that count toward HP: frozen at the 13:00 cap. */
    surgeHpMinutes() { return Math.max(0, Math.min(this.time, OO.CONFIG.LEVELING.hpCapTime) / 60 - OO.CONFIG.SURGE.start); }
    surgeHp(d) {
      const S = OO.CONFIG.SURGE;
      return Math.pow(1 + (d && d.boss ? S.hpPerMin * S.bossHpScale : S.hpPerMin), this.surgeHpMinutes());
    }
    /** Effective surge minutes for damage, following SURGE.dmgCurve. */
    surgeDmgMinutes(time = this.time) {
      const pts = OO.CONFIG.SURGE.dmgCurve, m = time / 60;
      if (m <= pts[0][0]) return 0;
      for (let i = 1; i < pts.length; i++) {
        const [m0, e0] = pts[i - 1], [m1, e1] = pts[i];
        if (m <= m1) return e0 + (e1 - e0) * (m - m0) / (m1 - m0);
      }
      const [mL, eL] = pts[pts.length - 1];
      return eL + (m - mL);
    }
    surgeDmg(d, time) {
      const S = OO.CONFIG.SURGE;
      // Stalkers take half the exponent; the final boss is the late-game test and takes it all.
      return Math.pow(1 + S.dmgPerMin, this.surgeDmgMinutes(time) * (d && d.boss && !d.final ? S.bossDmgScale : 1));
    }

    /** Called for every regular kill: feeds the rolling one-hit-kill share. */
    recordKill(e) {
      const S = this.strain, k = OO.CONFIG.LEVELING.adapt.smoothing;
      S.oneShot = S.oneShot * (1 - k) + (e.hits <= 1 ? 1 : 0) * k;
      S.samples++;
    }

    // ------------------------------------------------------------ enemies
    spawnEnemy(type, x, y) {
      const d = OO.ENEMIES[type];
      const level = d.crate ? 0 : this.strain.level;
      const hpMul = this.enemyHpMul(d, level);
      const e = {
        id: ++this.nextId, type, def: d, x, y, level, hits: 0,
        hp: d.hp * hpMul, maxHp: d.hp * hpMul,
        speed: d.speed * (d.boss || d.crate ? 1 : U.rand(0.88, 1.12)) * (d.crate ? 1 : this.overtimeSpeed()),
        dmg: d.dmg * this.enemyDmgScale(true, d), r: d.r, mass: d.mass,
        kbx: 0, kby: 0, flash: 0, dead: false, t: U.rand(0, 10), a: 0, ai: {},
      };
      if (!d.crate && !d.burster && this.world) this.world.resolveCircle(e, e.r);
      this.enemies.push(e);
      return e;
    }

    updateEnemies(dt) {
      const alive = this.alivePlayers();
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.flash -= dt; e.t += dt;
        if (e.def.crate) {
          // Pass-through supply crate: blocks nothing, opens on contact, never times out. One left
          // far behind every operative is cleared off-screen so the director can place a fresh one.
          let near = Infinity;
          for (const q of this.players) near = Math.min(near, U.dist2(e.x, e.y, q.x, q.y));
          if (near > OO.CONFIG.CRATES.recycleDist ** 2) { e.dead = true; continue; }
          for (const q of alive) if (U.dist2(e.x, e.y, q.x, q.y) < (e.r + q.r) ** 2) { this.openCrate(q, e); break; }
          continue;
        }
        if (e.def.burster) { this.updateBurster(e, dt); continue; }
        if (e.stun > 0) {
          // Flashbanged: reeling in place, no attacks, no contact damage (knockback still carries them).
          e.stun -= dt;
          e.x += e.kbx * dt; e.y += e.kby * dt;
          const k = Math.max(0, 1 - dt * 9);
          e.kbx *= k; e.kby *= k;
          continue;
        }
        if (e.def.mech) { this.updateMecha(e, dt, alive); continue; }   // final boss: boss.js
        const p = this.nearestPlayer(e.x, e.y);     // everyone hunts whoever is closest
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;

        if (d > this.despawnDist) {
          // Fell too far behind everyone: bring it back ahead of a player instead of despawning.
          const q = this.anchorPlayer();
          const a = (q.moving ? q.faceAngle : Math.atan2(q.y - e.y, q.x - e.x)) + U.rand(-0.9, 0.9);
          e.x = q.x + Math.cos(a) * this.spawnRadius;
          e.y = q.y + Math.sin(a) * this.spawnRadius;
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
        if (e.def.ranged) e.a = Math.atan2(dy, dx);   // always faces its target, even while backing off

        for (const q of alive) if (U.dist2(e.x, e.y, q.x, q.y) < (e.r + q.r) ** 2) this.contactHit(q, e);
      }
    }

    separate() {
      const buf = this._sepBuf;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate || e.def.burster || e.airborne) continue;
        this.grid.query(e.x, e.y, e.r + 32, buf);
        for (const o of buf) {
          if (o === e || o.dead || o.def.burster || o.def.crate || o.airborne) continue;   // bursters plough straight through; crates block nothing
          if (o.id < e.id) continue;   // each enemy pair handled once
          let dx = e.x - o.x, dy = e.y - o.y;
          const min = e.r + o.r;
          let d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          if (d2 < 0.01) { dx = U.rand(-1, 1); dy = U.rand(-1, 1); d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          const tm = e.mass + o.mass;
          e.x += nx * push * (o.mass / tm); e.y += ny * push * (o.mass / tm);
          o.x -= nx * push * (e.mass / tm); o.y -= ny * push * (e.mass / tm);
        }
      }
      for (const e of this.enemies) if (!e.dead && !e.def.crate && !e.def.burster && !e.airborne) this.world.resolveCircle(e, e.r);
    }

    /** Auto-aim never wastes shots on crates or on infected that can't be hurt. */
    targetable(e) { return !e.dead && !e.def.crate && !e.def.invulnerable && !e.airborne; }

    nearestEnemy(x, y, maxD, exclude) {
      let best = null, bd = maxD * maxD;
      for (const e of this.enemies) {
        if (!this.targetable(e)) continue;
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
        if (!this.targetable(e)) continue;
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
        if (!this.targetable(e)) continue;
        if (exclude && exclude.has(e.id)) continue;
        if (U.dist2(x, y, e.x, e.y) > md) continue;
        n++;
        if (Math.random() * n < 1) pick = e;   // reservoir sampling
      }
      return pick;
    }

    damageEnemy(e, dmg, kbx, kby, weapon) {
      if (e.dead || e.def.invulnerable || e.airborne || e.def.crate) return;   // Bursters: nothing hurts them. A mech mid-jump is out of reach. Crates open by walking over them
      dmg = Math.max(1, Math.round(dmg));
      e.hits++;
      const dealt = Math.min(dmg, e.hp);
      e.hp -= dmg;
      e.flash = 0.1;
      const kbScale = e.def.boss ? 0.04 : e.def.elite ? 0.25 : 1;
      e.kbx += (kbx / e.mass) * kbScale;
      e.kby += (kby / e.mass) * kbScale;
      if (weapon) weapon.damageDealt += dealt;
      const by = weapon ? weapon.owner : this._killer;
      if (by && by.rs) by.rs.dmg += dealt;
      if (this.settings.damageNumbers && !e.def.crate) this.addText(e.x + U.rand(-6, 6), e.y - e.r, dmg, 'dmg');
      OO.Audio.play('hit');
      if (e.hp <= 0) this.killEnemy(e, weapon);
    }

    killEnemy(e, weapon) {
      e.dead = true;
      if (weapon) {
        weapon.kills++;
        const ls = weapon.def.base.lifesteal, o = weapon.owner;
        if (ls && o && !o.downed) o.hp = Math.min(o.stats.maxHp, o.hp + ls * this.healMul());
      }
      this.kills++;
      this.creditKill(e, weapon);
      if (!e.def.elite && !e.def.boss) this.recordKill(e);
      this.dropXp(e.x, e.y, e.def.xp);
      const bile = e.def.blood === 'bile', oil = e.def.blood === 'oil';
      this.addDecal(e.x, e.y, e.r * U.rand(1.4, 2.1), bile ? 'bile' : oil ? 'scorch' : 'red');
      this.burst(e.x, e.y, bile ? '#a8b83a' : oil ? '#2b2620' : '#8f1712', e.def.boss ? 50 : 7, e.def.boss ? 280 : 140);
      if (e.def.explode) this.pendingExplosions.push({ x: e.x, y: e.y, r: e.def.explode.r, dmg: e.def.explode.dmg * this.enemyDmgScale(), enemyDmg: e.def.explode.enemyDmg, kind: 'bile' });
      if (e.def.elite && (!this.overtime || U.chance(OO.CONFIG.INFINITE.eliteCaseChance))) this.addPickup('case', e.x, e.y, { big: false });
      if (e.def.mech) this.mechaDown(e);
      else if (e.def.boss) {
        this.addPickup('case', e.x, e.y, { big: true });
        this.banner('The Stalker is down', 'good');
        this.shakeAll(12);
        OO.Audio.play('explode');
      }
      if (U.chance(0.007)) this.addPickup('herb', e.x + 12, e.y);
      OO.Audio.play('kill');
    }

    /** Run stats for commendations: who got the kill, with what, and the team's boss tally. */
    creditKill(e, weapon) {
      if (e.def.mech) this.tally.mechs++;
      else if (e.def.boss) this.tally.stalkers++;
      const by = weapon ? weapon.owner : this._killer;
      if (!by || !by.rs) return;
      const rs = by.rs;
      rs.kills++;
      rs.by[e.type] = (rs.by[e.type] || 0) + 1;
      if (this._killSrc === 'barrel') rs.bk++;
      if (weapon && weapon.id) {
        const sigW = OO.CHARACTERS[by.charId].weapon;
        if (weapon.id === sigW || (OO.EVOLUTIONS[sigW] && OO.EVOLUTIONS[sigW].into === weapon.id)) rs.sig++;
      }
      if (by.apexTotal) this.apexOnKill(by, e);   // Hemophage, Volatile Blood (infinite.js)
    }

    /**
     * Damage actually taken from one hit: capped at the per-hit ceiling (so a healthy operative
     * survives any single hit), then percentage reduction, then flat armor.
     */
    mitigate(p, dmg) {
      const capped = Math.min(dmg, this.hitCeiling(p));
      return Math.max(1, Math.min(Math.floor(this.hitCeiling(p)), Math.round(capped * (1 - (p.stats.dr || 0)) - p.stats.armor)));
    }

    /** src: optional source tag for run stats ('burst' = a Burster blast). */
    hurtPlayer(p, dmg, src) {
      if (this.state !== 'playing' || p.downed) return;
      if (p.iframes > 0) return;
      const d = this.mitigate(p, dmg);
      p.hp -= d;
      p.rs.taken += d; p.rs.hits++;
      if (src === 'burst') p.rs.burst++;
      p.rs.minHp = Math.min(p.rs.minHp, Math.max(0, p.hp / p.stats.maxHp));
      p.iframes = OO.CONFIG.PLAYER.iframes + (p.stats.phase || 0);
      p.hurt = 0.3;
      if (p.local) { this.shake(5); OO.Audio.play('hurt'); }
      else this.emit(['hurt', d]);
      this.addText(p.x, p.y - 22, d, 'hurt');
      if (p.hp <= 0) {
        if (p.revives > 0) { this.secondWind(p); return; }
        if (this.players.length > 1) { this.down(p); return; }
        p.hp = 0;
        this.endRun(false);
      }
    }

    /** Co-op: a player at 0 HP goes down instead of dying. The run ends when everyone is down. */
    down(p) {
      p.rs.downs++;
      p.downed = true;
      p.hp = 0;
      p.reviveT = 0;
      p.moving = false;
      this.banner(p.name + ' is down. Stand next to them to revive', 'boss');
      if (!this.alivePlayers().length) this.endRun(false);
    }

    revive(p, by) {
      if (by && by.rs) by.rs.revives++;
      p.downed = false;
      p.reviveT = 0;
      p.hp = p.stats.maxHp * OO.CONFIG.COOP.reviveHp;
      p.iframes = 2;
      this.addLight(p.x, p.y, 200, 1, 0.5);
      this.banner(p.name + ' is back on their feet', 'good');
      this.sfxFor(p, 'herb');
    }

    /** Armory revive: back on your feet at half HP, with a shockwave to clear space. */
    secondWind(p) {
      p.revives--;
      p.hp = p.stats.maxHp * 0.5;
      p.iframes = 2;
      if (p.local) { this.flashWhite = 0.7; this.shake(12); } else this.emit(['w', 0.7]);
      this._killer = p;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < 240) this.damageEnemy(e, e.def.boss ? 150 : 60, (dx / d) * 600, (dy / d) * 600, null);
      }
      this._killer = null;
      this.banner((this.coop ? p.name + ': ' : '') + 'Second Wind', 'good');
      this.sfxFor(p, 'evolve');
    }

    processExplosions() {
      let n = 0;
      const buf = this._exBuf;
      while (this.pendingExplosions.length && n++ < 40) {
        const ex = this.pendingExplosions.shift();
        ex.r = this.capAoe(ex.r);
        const blood = ex.kind === 'blood', fire = ex.kind === 'fire';
        this.addEffect({ kind: 'burst', x: ex.x, y: ex.y, r: ex.r, life: 0.35, max: 0.35, blood, tint: fire ? 'fire' : undefined });
        this.addDecal(ex.x, ex.y, ex.r * 0.8, blood ? 'red' : fire ? 'scorch' : 'bile');
        this.addLight(ex.x, ex.y, ex.r * 2.2, 1, 0.3);
        this.burst(ex.x, ex.y, blood ? '#c0262a' : fire ? '#ff8a2a' : '#b9c94a', 18, 260);
        const lp = this.player;
        if (U.dist2(ex.x, ex.y, lp.x, lp.y) < this.spawnRadius * this.spawnRadius) { OO.Audio.play('explode'); this.shake(blood ? 7 : 5); }
        this.emitNear(ex.x, ex.y, ['k', blood ? 7 : 5]);
        // Cover blocks blasts: no damage if an obstacle sits between a player and the explosion.
        if (ex.dmg > 0) for (const p of this.alivePlayers()) {
          if (U.dist2(ex.x, ex.y, p.x, p.y) < (ex.r + p.r) ** 2 && !this.world.blocked(ex.x, ex.y, p.x, p.y)) this.hurtPlayer(p, ex.dmg, blood ? 'burst' : ex.kind);   // every blast respects i-frames, so hits can't stack into one
        }
        this.grid.query(ex.x, ex.y, ex.r + 32, buf);
        if (ex.barrel) { this._killer = ex.owner || null; this._killSrc = ex.chain ? 'chain' : 'barrel'; }
        for (const o of buf) {
          if (o.dead) continue;
          if (ex.kind === 'blood' && o.def.burster) continue;   // one burster can't set off the whole row
          const dx = o.x - ex.x, dy = o.y - ex.y, d = Math.hypot(dx, dy) || 1;
          if (d < ex.r + o.r) this.damageEnemy(o, ex.barrel ? this.barrelDamage(o) : ex.enemyDmg, (dx / d) * (ex.barrel ? 320 : 220), (dy / d) * (ex.barrel ? 320 : 220), null);
        }
        this._killer = null; this._killSrc = null;
        this.chainBarrels(ex);   // volatile drums in the blast go off next
      }
    }

    // ------------------------------------------------------------ burster stampedes
    updateStampedes(dt) {
      const S = OO.CONFIG.STAMPEDE;
      for (const st of this.stampedes) {
        st.t -= dt;
        // The lane never moves once the warning is up (no player tracking); the last lockAt
        // seconds only change the sound and the pulse.
        if (!st.locked && st.t <= S.lockAt) { st.locked = true; OO.Audio.play('shriek', 1); }
        if (!st.shrieked && st.t <= st.warn * 0.55) { st.shrieked = true; OO.Audio.play('shriek', 0.5); }
        const k = 1 - Math.max(0, st.t) / st.warn;
        this.shake(1 + k * 3.5);
        if (st.t <= 0) { this.launchStampede(st); st.dead = true; }
      }
      compact(this.stampedes);
    }

    /** Geometry shared by the simulation and the renderer. */
    stampedeLane(st) {
      const ca = Math.cos(st.a), sa = Math.sin(st.a);
      const back = this.spawnRadius + 140;
      return {
        dx: -ca, dy: -sa,                 // travel direction
        nx: sa, ny: -ca,                  // across the row
        sx: st.ax + ca * back, sy: st.ay + sa * back,   // where the row starts
        back, width: st.count * OO.CONFIG.STAMPEDE.spacing,
      };
    }

    launchStampede(st) {
      const L = this.stampedeLane(st), sp = OO.CONFIG.STAMPEDE.spacing;
      for (let r = 0; r < st.ranks; r++) {
        for (let j = 0; j < st.count; j++) {   // a solid row: every slot filled
          const off = (j - (st.count - 1) / 2) * sp;
          const x = L.sx + L.nx * off - L.dx * r * 60, y = L.sy + L.ny * off - L.dy * r * 60;
          const e = this.spawnEnemy('burster', x, y);
          e.ai.dx = L.dx; e.ai.dy = L.dy; e.ai.travel = 0;
          e.ai.max = L.back * 2 + 260 + r * 60;
          e.a = Math.atan2(L.dy, L.dx);
        }
      }
      OO.Audio.play('stampede');
      this.tally.stampedes++;
      this.tally.lastStampede = this.time;
    }

    updateBurster(e, dt) {
      // Locked in at launch: the heading never changes and nothing pushes them off their line,
      // so whatever stands between them and you takes the hit.
      const p = this.nearestPlayer(e.x, e.y), ai = e.ai;
      const step = e.speed * dt;
      e.x += ai.dx * step; e.y += ai.dy * step;
      e.kbx = 0; e.kby = 0;
      ai.travel += step;
      if (Math.random() < 0.25) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.35, max: 0.35, color: '#5e0f0c', size: 3 });
      // Far from everyone they scramble over wrecks; close in, they slam into whatever is in the way.
      for (const q of this.alivePlayers()) {
        if (U.dist2(e.x, e.y, q.x, q.y) < (e.r + q.r) ** 2) { this.detonate(e); return; }
      }
      if (U.dist2(e.x, e.y, p.x, p.y) < 320 * 320 && this.world.hitCircle(e.x, e.y, e.r)) { this.detonate(e); return; }
      if (ai.travel > ai.max) e.dead = true;    // ran off the far side
    }

    detonate(e) {
      e.dead = true;
      const b = e.def.burster;
      this.pendingExplosions.push({ x: e.x, y: e.y, r: b.r, dmg: b.dmg * this.enemyDmgScale(false), enemyDmg: b.enemyDmg, kind: 'blood' });
    }

    /** Damage multiplier for enemy attacks at the current time. */
    enemyDmgScale(withSurge = true, d, time = this.time) {
      const T = OO.CONFIG.THREAT;
      return T.base * (1 + (time / 60) * T.perMin) * this.difficulty.dmg * (withSurge ? this.surgeDmg(d, time) : 1) * this.overtimeDmg(time);
    }

    /** Contact damage from an infected. */
    contactHit(p, e) { this.hurtPlayer(p, e.dmg); }

    /** Largest single hit this operative can take right now (CONFIG.HIT_CEILING x max HP). */
    hitCeiling(p, time = this.time) {
      const pts = OO.CONFIG.HIT_CEILING, m = time / 60;
      let f = pts[pts.length - 1][1];
      if (m <= pts[0][0]) f = pts[0][1];
      else for (let i = 1; i < pts.length; i++) {
        if (m <= pts[i][0]) { const [m0, f0] = pts[i - 1], [m1, f1] = pts[i]; f = f0 + (f1 - f0) * (m - m0) / (m1 - m0); break; }
      }
      return p.stats.maxHp * Math.min(f, 0.95);
    }

    spit(e) {
      const p = this.nearestPlayer(e.x, e.y), R = e.def.ranged;
      const lead = R.flight * 0.5;      // aims where you're going, but only half-committed
      const tx = p.x + (p.vx || 0) * lead + U.rand(-14, 14);
      const ty = p.y + (p.vy || 0) * lead + U.rand(-14, 14);
      this.enemyShots.push({ x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, dur: R.flight, r: R.splash,
        impact: R.impact * this.enemyDmgScale(), pool: R.pool });
      OO.Audio.play('spit');
    }

    updateEnemyShots(dt) {
      for (const s of this.enemyShots) {
        s.t += dt;
        if (s.t < s.dur) continue;
        s.dead = true;
        for (const p of this.alivePlayers()) if (U.dist2(p.x, p.y, s.x1, s.y1) < (s.r + p.r) ** 2) this.hurtPlayer(p, s.impact);
        this.hazards.push({ x: s.x1, y: s.y1, r: s.pool.r, life: s.pool.life, max: s.pool.life, tick: s.pool.tick, tickT: 0.1,
          dmg: s.pool.dmg * this.enemyDmgScale(), seed: Math.random() * 100 });
        this.burst(s.x1, s.y1, '#a8d84a', 10, 150);
        this.addDecal(s.x1, s.y1, s.r * 0.7, 'bile');
        OO.Audio.play('splat');
      }
      compact(this.enemyShots);
    }

    updateHazards(dt) {
      for (const h of this.hazards) {
        h.life -= dt;
        if (h.life <= 0) { h.dead = true; continue; }
        h.tickT -= dt;
        if (h.tickT <= 0) {
          h.tickT = h.tick;
          for (const p of this.alivePlayers()) if (U.dist2(p.x, p.y, h.x, h.y) < (h.r + p.r * 0.4) ** 2) this.hurtPlayer(p, h.dmg);
        }
      }
      compact(this.hazards);
    }

    /** Airstrike flare: clears the screen around whoever picked it up. */
    airstrike(p) {
      this.flashWhite = 1;
      this.emit(['w', 1]);
      this.shakeAll(16);
      OO.Audio.play('airstrike');
      let vw = this.viewW, vh = this.viewH;
      if (this.remoteView) { vw = Math.max(vw, this.remoteView.w); vh = Math.max(vh, this.remoteView.h); }
      const hw = vw / 2 + 40, hh = vh / 2 + 40;
      for (const e of this.enemies) {
        if (e.dead || e.def.crate) continue;
        if (Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue;
        this.damageEnemy(e, e.def.boss ? 400 : e.def.elite ? 250 : 99999, 0, 0, null);
      }
      this.banner('Airstrike called in', 'good');
    }

    // ------------------------------------------------------------ projectiles & areas
    /**
     * Fire a player projectile. Engine limits (CONFIG.LIMITS): past maxProjectiles live ones a new
     * shot simply isn't fired, and nothing flies faster than maxProjectileSpeed.
     */
    spawnProjectile(o) {
      const L = OO.CONFIG.LIMITS;
      if (this.projectiles.length >= L.maxProjectiles) return null;   // compacted every update, so this is ~live count
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > L.maxProjectileSpeed) { const k = L.maxProjectileSpeed / sp; o.vx *= k; o.vy *= k; }
      this.countShot(o.weapon);
      o.hit = new Set();
      o.dead = false;
      o.id = ++this.nextProjId;
      this.projectiles.push(o);
      return o;
    }

    /** Largest radius any blast, pool, shockwave or flashbang may have: just past a full screen across. */
    capAoe(r) {
      const L = OO.CONFIG.LIMITS;
      let vw = Math.max(this.viewW || 0, this.viewH || 0);
      if (this.remoteView) vw = Math.max(vw, this.remoteView.w || 0, this.remoteView.h || 0);
      return Math.min(r, Math.max(L.aoeMin, vw * L.aoeScreen));
    }

    updateProjectiles(dt) {
      const buf = this._prBuf;
      for (const pr of this.projectiles) {
        if (pr.dead) continue;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        pr.life -= dt;
        if (pr.life <= 0) { pr.dead = true; continue; }
        const ob = this.world.hitCircle(pr.x, pr.y, pr.r);
        if (ob) {
          if (ob.volatile) this.lightBarrel(ob, pr.weapon ? pr.weapon.owner : null, OO.CONFIG.HAZARDS.fuse);
          pr.dead = true;
          this.burst(pr.x, pr.y, '#ffd98a', 3, 90);
          continue;
        }
        this.grid.query(pr.x, pr.y, pr.r + 32, buf);
        for (const e of buf) {
          if (e.dead || e.airborne || e.def.crate || pr.hit.has(e.id)) continue;   // shots pass through crates
          if (U.dist2(pr.x, pr.y, e.x, e.y) > (pr.r + e.r) ** 2) continue;
          if (e.def.invulnerable) {
            // glances off the carapace
            pr.dead = true;
            this.burst(pr.x, pr.y, '#e8e2d4', 4, 140);
            if (this.time - this._immuneT > 0.5) { this._immuneT = this.time; this.addText(e.x, e.y - e.r - 4, 'IMMUNE', 'immune'); }
            OO.Audio.play('ricochet');
            break;
          }
          pr.hit.add(e.id);
          const sp = Math.hypot(pr.vx, pr.vy) || 1;
          this.damageEnemy(e, pr.dmg, (pr.vx / sp) * pr.kb, (pr.vy / sp) * pr.kb, pr.weapon);
          if (pr.ignite && Math.random() < pr.ignite && this.zones.length < 60) {
            const might = pr.weapon && pr.weapon.owner ? pr.weapon.owner.stats.might : 1;
            this.zones.push({ x: e.x, y: e.y, r: 26, life: 1.4, max: 1.4, dmg: 5 * might, tick: 0.3, tickT: 0, kind: 'fire', weapon: pr.weapon, seed: Math.random() * 100 });
          }
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
          this.countShot(l.zone && l.zone.weapon);
          const z = Object.assign({ x: l.x1, y: l.y1, max: l.zone.life, tickT: 0, seed: Math.random() * 100 }, l.zone);
          z.r = this.capAoe(z.r);
          this.zones.push(z);
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
          this.zoneBarrels(z);
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
    /**
     * Drop an item on the ground. Enforces the caps in OO.CONFIG.PICKUPS by retiring the oldest
     * item of the same class, so fresh drops always appear (v0.3 bug: once 320 gems were on the
     * map, every new drop was folded into a single far-away 'overflow' gem and drops seemed to stop).
     */
    addPickup(kind, x, y, extra) {
      const C = OO.CONFIG.PICKUPS;
      const life = C.life[kind] || 0;
      const g = Object.assign({ kind, x, y, value: 1, attract: false, v: -140, t: U.rand(0, 10), dead: false,
        life: life || Infinity, max: life || Infinity, id: ++this.nextPickupId }, extra || {});
      if (kind === 'xp') {
        if (this.gemCount >= C.maxGems) {
          const old = this.oldestPickup((o) => o.kind === 'xp' && !o.attract);
          if (old) { old.dead = true; g.value += old.value; this.gemCount--; }
        }
        this.gemCount++;
      } else if (kind !== 'case') {
        if (this.otherCount >= C.maxOther) {
          const old = this.oldestPickup((o) => o.kind !== 'xp' && o.kind !== 'case' && !o.attract);
          if (old) { old.dead = true; this.otherCount--; }
        }
        this.otherCount++;
      }
      this.pickups.push(g);
      return g;
    }

    /** Pickups stay in insertion order, so the first live match is the oldest. */
    oldestPickup(test) {
      for (const o of this.pickups) if (!o.dead && test(o)) return o;
      return null;
    }

    dropXp(x, y, v) {
      if (v <= 0) return;
      this.addPickup('xp', x, y, { value: v });
    }

    updatePickups(dt) {
      let gems = 0, other = 0;
      for (const g of this.pickups) {
        if (g.dead) continue;
        g.t += dt;
        // Despawn timer (items already flying to someone are never taken away).
        if (!g.attract) {
          g.life -= dt;
          if (g.life <= 0) { g.dead = true; continue; }
        }
        if (g.kind === 'xp') gems++; else if (g.kind !== 'case') other++;
        const p = this.nearestPlayer(g.x, g.y);
        if (p.downed) continue;
        const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
        if (!g.attract && d < p.stats.magnet) g.attract = true;
        if (g.attract) {
          g.v = Math.min(g.v + 1500 * dt, 1100);
          const step = g.v > 0 ? Math.min(d, g.v * dt) : g.v * dt;
          g.x += (dx / d) * step; g.y += (dy / d) * step;
        }
        if (U.dist2(p.x, p.y, g.x, g.y) < (p.r + 10) ** 2) this.collect(p, g);
      }
      this.gemCount = gems; this.otherCount = other;
      compact(this.pickups);
    }

    collect(p, g) {
      g.dead = true;
      switch (g.kind) {
        case 'xp':
          this.team.xp += g.value * p.stats.growth;    // XP is shared; the collector's Lab Notes rank applies
          if (p.local) {
            this.xpCombo = this.xpComboT > 0 ? this.xpCombo + 1 : 0;
            this.xpComboT = 0.4;
            OO.Audio.play('xp', this.xpCombo);
          } else this.emit(['s', 'xp', 4]);
          break;
        case 'herb': this.heal(p, 30); break;
        case 'credit': {
          const v = Math.round(g.value * (p.stats.creditMul || 1));   // Scavenger's Cut (Apex)
          this.credits += v;
          this.addText(p.x, p.y - 24, '+' + v + 'c', 'credit');
          this.sfxFor(p, 'xp', 10);
          break;
        }
        case 'magnet': {
          // Scanner pulse: pulls the DNA within a few pickup radii of you, never the whole map.
          const reach = p.stats.magnet * OO.CONFIG.PICKUPS.scannerReach;
          for (const o of this.pickups) if (o.kind === 'xp' && U.dist2(o.x, o.y, p.x, p.y) < reach * reach) o.attract = true;
          this.banner('Scanner pulse: samples incoming', 'good');
          this.sfxFor(p, 'select');
          break;
        }
        case 'bomb': this._killer = p; this.airstrike(p); this._killer = null; break;
        case 'case': this.openChest(p, !!g.big); break;
      }
    }

    // ------------------------------------------------------------ effects (and their co-op mirror)
    /**
     * Host side of co-op: one-shot effects, sounds and banners are queued here and shipped with
     * the next snapshot so the partner sees and hears them. In solo and on the client it is a no-op.
     */
    emit(ev) {
      if (this.mode === 'host' && this.players.length > 1 && this.netEvents.length < 400) this.netEvents.push(ev);
    }
    /** Same, but only if the partner is close enough to see it. */
    emitNear(x, y, ev) {
      if (this.mode !== 'host' || this.players.length < 2) return;
      for (const p of this.players) {
        if (p.local) continue;
        const vw = (this.remoteView ? this.remoteView.w : this.viewW) / 2 + 120, vh = (this.remoteView ? this.remoteView.h : this.viewH) / 2 + 120;
        if (Math.abs(x - p.x) < vw && Math.abs(y - p.y) < vh) { this.emit(ev); return; }
      }
    }
    netSend(msg) { if (this.net) this.net.send(msg); }

    /** Play a sound for the player it concerns: locally, or on the partner's machine. */
    sfxFor(p, name, opt) {
      if (p.local) OO.Audio.play(name, opt);
      else this.emit(['s', name, opt]);
    }
    static isLocalSound(name) { return LOCAL_SOUNDS.has(name); }

    banner(text, kind) {
      this.ui.banner(text, kind);
      this.emit(['b', text, kind]);
    }

    addEffect(fx) {
      if (this.effects.length < 120) this.effects.push(fx);
      this.emitNear(fx.x || (fx.points && fx.points[0]) || 0, fx.y || (fx.points && fx.points[1]) || 0, ['fx', fx]);
    }
    addLight(x, y, r, i, life) {
      if (this.lights.length < 40) this.lights.push({ x, y, r, i, life: life || 0.05, max: life || 0.05 });
      this.emitNear(x, y, ['l', x, y, r, i, life]);
    }
    shake(a) { if (!this.reducedMotion && this.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a); }
    /** Shake both screens (boss arrivals, airstrikes). */
    shakeAll(a) { this.shake(a); this.emit(['k', a]); }
    /** Shake only the screen of the player it concerns (recoil, hits). */
    shakeFor(p, a) { if (p.local) this.shake(a); else this.emit(['k', a]); }

    addText(x, y, val, kind) {
      if (this.texts.length > 90) this.texts.shift();
      this.texts.push({ x, y, val, kind, life: 0.7, max: 0.7 });
      this.emitNear(x, y, ['t', x, y, val, kind]);
    }

    addDecal(x, y, r, kind) {
      const v = U.randInt(0, 7), rot = U.rand(0, U.TAU);
      if (this.decals.length > 200) this.decals.shift();
      this.decals.push({ x, y, r, kind, rot, v, life: 40 });
      this.emitNear(x, y, ['d', x, y, r, kind, rot, v]);
    }

    burst(x, y, color, n, speed) {
      for (let i = 0; i < n && this.particles.length < 600; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(0.3, 1) * speed;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.3, 0.7), max: 0.7, color, size: U.rand(1.5, 3.5) });
      }
      this.emitNear(x, y, ['p', x, y, color, n, speed]);
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

    // Co-op hooks; coop.js fills these in.
    hostTick() {}
    clientTick() {}
    netWatch() {}
  }

  /** Remove items flagged dead, in place (no new array every frame). */
  function compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
    arr.length = j;
  }

  Game.compact = compact;
  OO.Game = Game;
})(window.OO = window.OO || {});
