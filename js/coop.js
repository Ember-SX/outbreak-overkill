/*
 * Co-op: lobby, host streaming and client mirroring. Extends OO.Game.prototype.
 *
 * Model: the HOST runs the one true simulation (game.js) with two players. Every 1/15 s it sends
 * a snapshot of everything near the partner: enemies, bullets and pickups packed into an
 * Int16Array, plus small JSON lists (players, fire, acid, stampedes) and a queue of one-shot
 * events (blood, sparks, damage numbers, sounds, banners).
 *
 * The CLIENT does not simulate the horde. It moves its own operative locally (so movement feels
 * instant), sends its position to the host 30 times a second, and draws the host's world,
 * interpolating enemies between snapshots. Level-up picks, rerolls, skips and pause requests go
 * to the host, which applies them.
 *
 * Messages (all objects with a `t` field):
 *   client -> host: hello, in, pick, reroll, skip, pause, resume, view, bye
 *   host -> client: welcome, reject, full, start, snap, lvl, lvldone, chest, paused, resumed, results, bye
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const G = OO.Game.prototype;
  const compact = OO.Game.compact;
  const TYPES = Object.keys(OO.ENEMIES);
  const TYPE_INDEX = Object.fromEntries(TYPES.map((t, i) => [t, i]));
  const PICK_KINDS = ['xp', 'herb', 'credit', 'magnet', 'bomb', 'case'];
  const PICK_INDEX = Object.fromEntries(PICK_KINDS.map((k, i) => [k, i]));
  const TIER_VALUE = [1, 3, 10];
  const IN_RUN = new Set(['playing', 'levelup', 'paused', 'chest']);
  const I16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));

  // ================================================================ lobby
  G.hostSession = function (charId) {
    if (!OO.Net.available()) { this.ui.renderCoop({ view: 'choose', error: OO.Coop.unavailableText() }); return; }
    this.leaveSession();
    this.lobby = { role: 'host', charId, code: null, partner: null };
    this.ui.renderCoop({ view: 'choose', busy: true, status: 'Opening a room…' });
    this.net = new OO.Net({
      onHosting: (code) => { this.lobby.code = code; this.renderLobby(); },
      onConnected: () => this.renderLobby(),
      onMessage: (m) => this.onNetMessage(m),
      onDisconnected: () => this.onPartnerLeft(),
      onError: (text) => this.lobbyError(text),
    });
    this.net.host();
  };

  G.joinSession = function (code, charId) {
    if (!OO.Net.available()) { this.ui.renderCoop({ view: 'choose', error: OO.Coop.unavailableText() }); return; }
    this.leaveSession();
    this.lobby = { role: 'client', charId, code, connected: false, hostName: null };
    this.renderLobby();
    this.net = new OO.Net({
      onHosting: () => {},
      onConnected: () => this.netSend({
        t: 'hello', v: OO.VERSION, charId, name: OO.CHARACTERS[charId].name,
        ranks: this.meta.ranks, view: { w: this.viewW, h: this.viewH },
      }),
      onMessage: (m) => this.onNetMessage(m),
      onDisconnected: () => this.onHostLeft(),
      onError: (text) => this.lobbyError(text),
    });
    this.net.join(code);
  };

  G.renderLobby = function () {
    const L = this.lobby;
    if (!L || this.state !== 'menu') return;
    const me = OO.CHARACTERS[L.charId].name;
    if (L.role === 'host') {
      const roster = [{ tag: 'P1', name: me, you: true, host: true }];
      if (L.partner) roster.push({ tag: 'P2', name: L.partner.name });
      this.ui.renderCoop({
        view: 'room', code: L.code, isHost: true, canDeploy: !!L.partner, roster,
        status: !L.code ? 'Opening a room…' : L.partner ? 'Partner connected. Deploy when you are both ready.' : 'Waiting for your partner. Give them this code.',
      });
    } else {
      const roster = [{ tag: 'P1', name: L.hostName || 'Host', host: true }, { tag: 'P2', name: me, you: true }];
      this.ui.renderCoop({
        view: 'room', code: L.code, isHost: false, roster,
        status: L.connected ? 'Connected. Waiting for the host to deploy.' : 'Connecting to room ' + L.code + '…',
      });
    }
  };

  G.lobbyError = function (text) {
    const inRun = IN_RUN.has(this.state) && this.coop;
    this.leaveSession();
    if (inRun) { this.mode = 'solo'; this.state = 'menu'; this.players = []; this.player = null; this.ui.setHud(false); }
    this.ui.renderCoop({ view: 'choose', error: text });
  };

  /** Close the connection and forget the room (safe to call any time). */
  G.leaveSession = function () {
    if (this.net) { this.netSend({ t: 'bye' }); this.net.close(); }
    this.net = null;
    this.lobby = null;
    this.remoteView = null;
    OO.Coop.restoreAudio();
    if (!IN_RUN.has(this.state)) this.mode = 'solo';
    this.updateSpawnRadius();
  };

  /** After a co-op run: back to the shared lobby with the connection kept open. */
  G.backToLobby = function () {
    this.mode = 'solo';
    this.state = 'menu';
    this.players = [];
    this.player = null;
    this.ui.setHud(false);
    if (!this.net || !this.lobby) { this.ui.showMenu(); return; }
    this.renderLobby();
  };

  // ================================================================ messages
  G.onNetMessage = function (m) {
    if (!m || typeof m !== 'object') return;
    this.silentT = 0;
    if (m.t === 'ping') return;
    const host = this.lobby && this.lobby.role === 'host';
    if (host) this.onHostMessage(m); else this.onClientMessage(m);
  };

  G.onHostMessage = function (m) {
    const L = this.lobby;
    const remote = this.players.find((p) => !p.local);
    switch (m.t) {
      case 'hello':
        if (m.v !== OO.VERSION) {
          this.netSend({ t: 'reject', reason: 'Version mismatch: the host runs v' + OO.VERSION + ', you run v' + m.v + '. Both of you need the same version.' });
          return;
        }
        L.partner = { charId: OO.CHARACTERS[m.charId] ? m.charId : 'mara', name: String(m.name || 'Partner').slice(0, 24), ranks: sanitizeRanks(m.ranks) };
        this.remoteView = sanitizeView(m.view);
        this.updateSpawnRadius();
        this.netSend({ t: 'welcome', name: OO.CHARACTERS[L.charId].name });
        OO.Audio.play('select');
        this.renderLobby();
        break;
      case 'view':
        this.remoteView = sanitizeView(m.view);
        this.updateSpawnRadius();
        break;
      case 'in':
        if (remote && Number.isFinite(m.x) && Number.isFinite(m.y)) remote.input = m;
        break;
      case 'pick': if (remote) this.chooseUpgrade(remote, m.i | 0); break;
      case 'reroll': if (remote) this.reroll(remote); break;
      case 'skip': if (remote) this.skipLevel(remote); break;
      case 'pause': this.pause(); break;
      case 'resume': this.resume(); break;
      case 'bye': this.onPartnerLeft(); break;
    }
  };

  G.onClientMessage = function (m) {
    const L = this.lobby;
    switch (m.t) {
      case 'welcome': L.connected = true; L.hostName = m.name; OO.Audio.play('select'); this.renderLobby(); break;
      case 'reject': this.lobbyError(m.reason); break;
      case 'full': this.lobbyError('Room ' + L.code + ' already has two players.'); break;
      case 'start': this.startClient(m); break;
      case 'snap': if (this.mode === 'client') this.applySnapshot(m); break;
      case 'lvl':
        if (this.mode !== 'client') break;
        this.state = 'levelup';
        this.ui.showLevelUp(m.options, m.level, m.rerolls);
        OO.Audio.play('levelup');
        break;
      case 'lvldone': if (this.mode === 'client' && this.state === 'levelup') { this.state = 'playing'; this.ui.hideAll(); } break;
      case 'chest': this.ui.chestToast(m.results, m.bonus); OO.Audio.play('chest'); break;
      case 'paused': if (this.mode === 'client') { this.state = 'paused'; this.ui.showPause(); } break;
      case 'resumed': if (this.mode === 'client' && this.state === 'paused') { this.state = 'playing'; this.ui.hideAll(); } break;
      case 'results': if (this.mode === 'client') this.finishRun(m.summary, m.weapons); break;
      case 'bye': this.onHostLeft(); break;
    }
  };

  G.onPartnerLeft = function () {
    if (!this.lobby) return;
    this.lobby.partner = null;
    this.remoteView = null;
    this.updateSpawnRadius();
    const remote = this.players.find((p) => !p.local);
    if (remote && IN_RUN.has(this.state)) {
      // Keep playing solo; enemy HP goes back to normal for anything that spawns from now on.
      this.players = this.players.filter((p) => p !== remote);
      this.ui.banner('Your partner disconnected. You are on your own.', 'warn');
      if (this.state === 'levelup' && this.players.every((q) => q.luDone)) this.finishLevelUp();
    }
    // The room stays open (same code), so they can rejoin from the lobby.
    this.renderLobby();
  };

  G.onHostLeft = function () {
    const wasInRun = this.mode === 'client' && IN_RUN.has(this.state);
    const text = wasInRun ? 'The host left, so the run ended.' : 'The host closed the room.';
    this.leaveSession();
    this.mode = 'solo';
    if (wasInRun || this.state === 'results') { this.state = 'menu'; this.players = []; this.player = null; this.ui.setHud(false); }
    if (this.state === 'menu') this.ui.renderCoop({ view: 'choose', error: text });
  };

  // ================================================================ host
  G.coopDeploy = function () {
    const L = this.lobby;
    if (!L || L.role !== 'host' || !L.partner || !this.net || !this.net.connected) return;
    OO.Audio.init();
    this.mode = 'host';
    this.resetRun(Math.floor(Math.random() * 1e9));
    this.players = [
      this.makePlayer(0, L.charId, this.meta.ranks, true),
      this.makePlayer(1, L.partner.charId, L.partner.ranks, false),
    ];
    this.player = this.players[0];
    this.director = new OO.Director(this);
    this.snapT = 0;
    this.updateSpawnRadius();
    OO.Coop.hookAudio(this);
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.setHud(true);
    this.netSend({
      t: 'start', seed: this.seed, you: 1,
      players: this.players.map((p) => ({ slot: p.slot, charId: p.charId, x: p.x, y: p.y })),
    });
    OO.Audio.play('select');
  };

  G.hostTick = function (dt) {
    if (!this.net || this.players.length < 2 || !IN_RUN.has(this.state)) return;
    this.snapT = (this.snapT || 0) + dt;
    if (this.snapT < 1 / OO.CONFIG.COOP.snapshotHz) return;
    this.snapT = 0;
    this.sendSnapshot();
  };

  G.sendSnapshot = function () {
    const rp = this.players.find((p) => !p.local);
    if (!rp) return;
    const ax = Math.round(rp.x), ay = Math.round(rp.y);
    const vw = this.remoteView || { w: this.viewW, h: this.viewH };
    const rx = vw.w / 2 + 260, ry = vw.h / 2 + 260;
    const near = (x, y) => Math.abs(x - ax) < rx && Math.abs(y - ay) < ry;

    const es = this.enemies.filter((e) => !e.dead && (near(e.x, e.y) || e.def.boss || e.def.elite));
    const ps = this.projectiles.filter((q) => !q.dead && near(q.x, q.y));
    const ks = this.pickups.filter((k) => !k.dead && (near(k.x, k.y) || k.kind === 'case'));
    const b = new Int16Array(3 + es.length * 7 + ps.length * 6 + ks.length * 6);
    let i = 0;
    b[i++] = es.length; b[i++] = ps.length; b[i++] = ks.length;
    for (const e of es) {
      const flags = (e.flash > 0 ? 1 : 0) | (e.ai.wind > 0 ? 2 : 0) | (e.ai.mode === 'wind' ? 4 : 0) | (Math.min(e.level, 2000) << 4);
      b[i++] = e.id & 0x7fff; b[i++] = TYPE_INDEX[e.type];
      b[i++] = I16(e.x - ax); b[i++] = I16(e.y - ay);
      b[i++] = I16(e.a * 1000); b[i++] = flags;
      b[i++] = I16(U.clamp(e.hp / e.maxHp, 0, 1) * 1000);
    }
    for (const q of ps) {
      b[i++] = q.id & 0x7fff; b[i++] = q.kind === 'pellet' ? 1 : 0;
      b[i++] = I16(q.x - ax); b[i++] = I16(q.y - ay); b[i++] = I16(q.vx); b[i++] = I16(q.vy);
    }
    for (const k of ks) {
      const tier = k.kind === 'xp' ? (k.value >= 10 ? 2 : k.value >= 3 ? 1 : 0) : 0;
      const blink = k.life < OO.CONFIG.PICKUPS.blink;
      b[i++] = k.id & 0x7fff; b[i++] = PICK_INDEX[k.kind];
      b[i++] = I16(k.x - ax); b[i++] = I16(k.y - ay);
      b[i++] = tier; b[i++] = (k.attract ? 1 : 0) | (blink ? 2 : 0) | (k.big ? 4 : 0);
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    const ev = this.netEvents;
    this.netEvents = [];
    this.netSend({
      t: 'snap', b: b.buffer,
      m: {
        ax, ay, time: this.time, kills: this.kills, credits: this.credits, spawnRadius: this.spawnRadius,
        team: this.team, strain: this.strain,
      },
      p: this.players.map((p) => playerState(p)),
      z: this.zones.filter((z) => near(z.x, z.y)).map((z) => [Math.round(z.x), Math.round(z.y), r1(z.r), r1(z.life), r1(z.max), r1(z.seed)]),
      l: this.lobs.map((o) => [Math.round(o.x0), Math.round(o.y0), Math.round(o.x1), Math.round(o.y1), r1(o.t), r1(o.dur)]),
      s: this.enemyShots.map((o) => [Math.round(o.x0), Math.round(o.y0), Math.round(o.x1), Math.round(o.y1), r1(o.t), r1(o.dur), o.r]),
      h: this.hazards.filter((o) => near(o.x, o.y)).map((o) => [Math.round(o.x), Math.round(o.y), o.r, r1(o.life), r1(o.max), r1(o.seed)]),
      st: this.stampedes.map((o) => [o.a, Math.round(o.ax), Math.round(o.ay), r1(o.t), o.warn, o.locked ? 1 : 0, o.count, o.ranks, o.gap]),
      ev,
    });
  };

  function playerState(p) {
    const s = p.stats;
    return {
      slot: p.slot, x: Math.round(p.x), y: Math.round(p.y), fa: p.faceAngle, aa: p.aimAngle, mv: p.moving ? 1 : 0,
      hp: p.hp, it: p.iframes, dn: p.downed ? 1 : 0, rv: p.reviveT, rr: p.rerolls, sw: p.revives,
      st: { maxHp: s.maxHp, might: s.might, cooldown: s.cooldown, amount: s.amount, area: s.area, speed: s.speed, magnet: s.magnet, armor: s.armor, regen: s.regen, growth: s.growth },
      w: p.weapons.map((w) => [w.id, w.level, Math.round(w.damageDealt), w.kills, w.state.active || 0, w.state.angle || 0]),
      ps: p.passiveOrder.map((id) => [id, p.passives[id]]),
    };
  }

  function sanitizeRanks(r) {
    const out = {};
    if (!r || typeof r !== 'object') return out;
    for (const item of OO.ARMORY) out[item.id] = U.clamp(Number(r[item.id]) || 0, 0, item.max);
    return out;
  }

  function sanitizeView(v) {
    if (!v) return null;
    return { w: U.clamp(Number(v.w) || 1000, 300, 4000), h: U.clamp(Number(v.h) || 700, 300, 4000) };
  }

  // ================================================================ client
  G.startClient = function (m) {
    OO.Audio.init();
    this.mode = 'client';
    this.resetRun(m.seed);
    this.players = m.players.map((pp) => {
      const local = pp.slot === m.you;
      const p = this.makePlayer(pp.slot, pp.charId, local ? this.meta.ranks : {}, local);
      p.x = pp.x; p.y = pp.y; p.tx = pp.x; p.ty = pp.y; p.px = pp.x; p.py = pp.y; p.lt = 1;
      return p;
    });
    this.player = this.players.find((p) => p.local);
    this.mirror = { enemies: new Map(), proj: new Map(), picks: new Map() };
    this.inputT = 0;
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.setHud(true);
    OO.Audio.play('select');
  };

  G.clientTick = function (dt) {
    if (!this.players.length || !this.player || !IN_RUN.has(this.state)) return;
    const p = this.player, C = OO.CONFIG.COOP;

    // Own movement is simulated here, against the same seeded obstacles as the host.
    p.iframes -= dt; p.hurt -= dt;
    if (this.state === 'playing' && !p.downed) {
      const ax = OO.Input.axis.x, ay = OO.Input.axis.y;
      p.moving = ax !== 0 || ay !== 0;
      p.vx = ax * p.stats.speed; p.vy = ay * p.stats.speed;
      if (p.moving) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.faceAngle = Math.atan2(ay, ax);
        p.walk += dt * 10 * Math.hypot(ax, ay);
      }
      this.world.update(this.players);
      this.world.resolveCircle(p, p.r);
    } else {
      p.moving = false; p.vx = 0; p.vy = 0;
    }
    this.inputT += dt;
    if (this.inputT >= 1 / C.inputHz) {
      this.inputT = 0;
      this.netSend({ t: 'in', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: Math.round(p.vx), vy: Math.round(p.vy), fa: p.faceAngle, mv: p.moving ? 1 : 0 });
    }

    if (this.state === 'playing') this.time += dt;   // smoothed between snapshots
    const lerpStep = dt * C.snapshotHz;
    const lerpObj = (o) => {
      o.lt = Math.min(1, (o.lt || 0) + lerpStep);
      o.x = o.px + (o.tx - o.px) * o.lt;
      o.y = o.py + (o.ty - o.py) * o.lt;
    };
    for (const q of this.players) if (!q.local) lerpObj(q);
    for (const e of this.enemies) { lerpObj(e); e.t += dt; e.flash -= dt; }
    for (const k of this.pickups) { lerpObj(k); k.t += dt; }
    for (const q of this.projectiles) { q.x += q.vx * dt; q.y += q.vy * dt; }
    if (this.state === 'playing') {
      for (const o of this.lobs) o.t += dt;
      for (const o of this.enemyShots) o.t += dt;
      for (const o of this.zones) o.life -= dt;
      for (const o of this.hazards) o.life -= dt;
      for (const st of this.stampedes) {
        st.t -= dt;
        this.shake(1 + (1 - Math.max(0, st.t) / st.warn) * 3.5);
      }
    }
    // Saw blades keep spinning between snapshots.
    for (const q of this.players) for (const w of q.weapons) if (w.state.active > 0) w.state.angle += (w.getStats(q).speed || 0) * dt;
    this.updateFx(dt);

    if (!p.downed && p.hp / p.stats.maxHp < 0.3) {
      this.heartT -= dt;
      if (this.heartT <= 0) { OO.Audio.play('heartbeat'); this.heartT = 0.95; }
    }
  };

  G.applySnapshot = function (m) {
    const M = m.m, mir = this.mirror;
    if (!mir) return;
    this.time = M.time; this.kills = M.kills; this.credits = M.credits;
    this.team = M.team; this.strain = M.strain; this.spawnRadius = M.spawnRadius;
    const ax = M.ax, ay = M.ay;

    for (const s of m.p) {
      const q = this.playerBySlot(s.slot);
      if (!q) continue;
      if (!q.local) { q.px = q.x; q.py = q.y; q.tx = s.x; q.ty = s.y; q.lt = 0; q.faceAngle = s.fa; q.moving = !!s.mv; if (q.moving) q.walk += 0.6; }
      q.aimAngle = s.aa; q.hp = s.hp; q.downed = !!s.dn; q.reviveT = s.rv; q.rerolls = s.rr; q.revives = s.sw;
      if (!q.local || q.iframes <= 0) q.iframes = s.it;
      q.stats = Object.assign({}, q.stats, s.st); q.statsVersion++;
      syncWeapons(q, s.w);
      q.passives = {}; q.passiveOrder = [];
      for (const [id, lv] of s.ps) { q.passives[id] = lv; q.passiveOrder.push(id); }
    }

    const b = toInt16(m.b);
    let i = 0;
    const nE = b[i++], nP = b[i++], nK = b[i++];
    const seenE = new Set();
    for (let n = 0; n < nE; n++) {
      const id = b[i++], type = TYPES[b[i++]], x = ax + b[i++], y = ay + b[i++], a = b[i++] / 1000, flags = b[i++], hp = b[i++];
      let e = mir.enemies.get(id);
      if (!e || e.type !== type) {
        const d = OO.ENEMIES[type];
        e = { id, type, def: d, r: d.r, x, y, px: x, py: y, tx: x, ty: y, lt: 1, t: U.rand(0, 10), flash: 0, ai: {}, dead: false, hp: 1000, maxHp: 1000, level: 0 };
        mir.enemies.set(id, e);
      } else { e.px = e.x; e.py = e.y; e.tx = x; e.ty = y; e.lt = 0; }
      e.a = a;
      if (flags & 1) e.flash = 0.1;
      e.ai.wind = flags & 2 ? (e.def.ranged ? e.def.ranged.windup * 0.5 : 0.3) : 0;
      e.ai.mode = flags & 4 ? 'wind' : 'walk';
      e.level = flags >> 4;
      e.hp = hp; e.maxHp = 1000;
      seenE.add(id);
    }
    for (const [id] of mir.enemies) if (!seenE.has(id)) mir.enemies.delete(id);
    this.enemies = Array.from(mir.enemies.values());

    const seenP = new Set();
    for (let n = 0; n < nP; n++) {
      const id = b[i++], kind = b[i++] ? 'pellet' : 'bullet', x = ax + b[i++], y = ay + b[i++], vx = b[i++], vy = b[i++];
      let q = mir.proj.get(id);
      if (!q) { q = { id, kind }; mir.proj.set(id, q); }
      q.x = x; q.y = y; q.vx = vx; q.vy = vy;
      seenP.add(id);
    }
    for (const [id] of mir.proj) if (!seenP.has(id)) mir.proj.delete(id);
    this.projectiles = Array.from(mir.proj.values());

    const seenK = new Set();
    for (let n = 0; n < nK; n++) {
      const id = b[i++], kind = PICK_KINDS[b[i++]], x = ax + b[i++], y = ay + b[i++], tier = b[i++], fl = b[i++];
      let k = mir.picks.get(id);
      if (!k) { k = { id, kind, x, y, px: x, py: y, tx: x, ty: y, lt: 1, t: U.rand(0, 10), dead: false }; mir.picks.set(id, k); }
      else { k.px = k.x; k.py = k.y; k.tx = x; k.ty = y; k.lt = 0; }
      k.value = TIER_VALUE[tier] || 1; k.attract = !!(fl & 1); k.life = fl & 2 ? 1 : Infinity; k.big = !!(fl & 4);
      seenK.add(id);
    }
    for (const [id] of mir.picks) if (!seenK.has(id)) mir.picks.delete(id);
    this.pickups = Array.from(mir.picks.values());

    this.zones = m.z.map(([x, y, r, life, max, seed]) => ({ x, y, r, life, max, seed }));
    this.lobs = m.l.map(([x0, y0, x1, y1, t, dur]) => ({ x0, y0, x1, y1, t, dur }));
    this.enemyShots = m.s.map(([x0, y0, x1, y1, t, dur, r]) => ({ x0, y0, x1, y1, t, dur, r }));
    this.hazards = m.h.map(([x, y, r, life, max, seed]) => ({ x, y, r, life, max, seed }));
    this.stampedes = m.st.map(([a, sx, sy, t, warn, locked, count, ranks, gap]) => ({ a, ax: sx, ay: sy, t, warn, locked: !!locked, count, ranks, gap }));

    for (const ev of m.ev) this.applyEvent(ev);
  };

  /** Snapshot payload arrives as an ArrayBuffer (or a byte view of one, depending on the transport). */
  function toInt16(raw) {
    if (raw instanceof ArrayBuffer) return new Int16Array(raw);
    if (ArrayBuffer.isView(raw)) {
      const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      return new Int16Array(bytes.slice().buffer);
    }
    return new Int16Array(0);
  }

  /** Keep the mirror's weapon objects in step with the host (ids, levels, saw state, stats for the results screen). */
  function syncWeapons(q, list) {
    const same = q.weapons.length === list.length && q.weapons.every((w, i) => w.id === list[i][0]);
    if (!same) q.weapons = list.map(([id]) => new OO.Weapon(id, q));
    list.forEach(([, level, dmg, kills, active, angle], i) => {
      const w = q.weapons[i];
      if (w.level !== level) { w.level = level; w._stats = null; }
      w.damageDealt = dmg; w.kills = kills;
      w.state.active = active;
      if (active > 0 && !(w.state.angle && Math.abs(w.state.angle - angle) < 0.6)) w.state.angle = angle;
    });
  }

  /** One-shot effects queued by the host (see Game.emit). */
  G.applyEvent = function (ev) {
    const p = this.player;
    switch (ev[0]) {
      case 'fx': if (this.effects.length < 120) this.effects.push(ev[1]); break;
      case 'l': if (this.lights.length < 40) this.lights.push({ x: ev[1], y: ev[2], r: ev[3], i: ev[4], life: ev[5] || 0.05, max: ev[5] || 0.05 }); break;
      case 'p': this.burst(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
      case 'd':
        if (this.decals.length > 200) this.decals.shift();
        this.decals.push({ x: ev[1], y: ev[2], r: ev[3], kind: ev[4], rot: ev[5], v: ev[6], life: 40 });
        break;
      case 't':
        if (ev[4] === 'dmg' && !this.settings.damageNumbers) break;
        if (this.texts.length > 90) this.texts.shift();
        this.texts.push({ x: ev[1], y: ev[2], val: ev[3], kind: ev[4], life: 0.7, max: 0.7 });
        break;
      case 'b': this.ui.banner(ev[1], ev[2]); break;
      case 's': OO.Coop.playRaw(ev[1], ev[2]); break;
      case 'k': this.shake(ev[1]); break;
      case 'w': this.flashWhite = Math.max(this.flashWhite, ev[1]); break;
      case 'hurt':
        p.hurt = 0.3; p.iframes = OO.CONFIG.PLAYER.iframes;
        this.shake(5); OO.Coop.playRaw('hurt');
        break;
    }
  };

  /**
   * Keepalive: both sides ping every 2s; 8s of silence counts as a dropped connection
   * (closing a tab or losing Wi-Fi doesn't always close a WebRTC channel promptly).
   */
  G.netWatch = function (dt) {
    const net = this.net;
    if (!net || !net.connected) { this.silentT = 0; return; }
    this.pingT = (this.pingT || 0) + dt;
    if (this.pingT >= 2) { this.pingT = 0; this.netSend({ t: 'ping' }); }
    this.silentT = (this.silentT || 0) + dt;
    if (this.silentT > 8) {
      this.silentT = 0;
      try { net.conn.close(); } catch (e) { /* ignore */ }
    }
  };

  // Closing the tab: tell the partner right away instead of letting them time out.
  window.addEventListener('pagehide', () => { if (OO.game && OO.game.net) OO.game.leaveSession(); });

  // Tell the host when our view size changes (spawns must stay off both screens).
  const baseResize = G.resize;
  G.resize = function () {
    baseResize.call(this);
    if (this.lobby && this.lobby.role === 'client') this.netSend({ t: 'view', view: { w: this.viewW, h: this.viewH } });
  };

  // ================================================================ helpers
  OO.Coop = {
    unavailableText() {
      return "Co-op can't start here: this page can't open peer-to-peer connections. Play from GitHub Pages or a local server (npm start) in a current browser.";
    },
    /** Host: forward the sounds the simulation plays (gunfire, kills, explosions) to the partner. */
    hookAudio(game) {
      if (OO.Audio._orig) return;
      const orig = OO.Audio.play;
      const last = {};
      OO.Audio._orig = orig;
      OO.Audio.play = function (name, opt) {
        orig(name, opt);
        if (OO.Game.isLocalSound(name)) return;
        const now = performance.now();
        if (last[name] && now - last[name] < 70) return;   // the partner's own throttle would drop these anyway
        last[name] = now;
        game.emit(['s', name, opt]);
      };
    },
    restoreAudio() {
      if (OO.Audio._orig) { OO.Audio.play = OO.Audio._orig; OO.Audio._orig = null; }
    },
    playRaw(name, opt) { (OO.Audio._orig || OO.Audio.play)(name, opt); },
  };

  void compact;
})(window.OO = window.OO || {});
