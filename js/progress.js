/*
 * Progress: commendations (achievements), lifetime statistics and the bestiary, all saved in
 * localStorage on this device.
 *
 *   oo.achievements   { id: unlocked-at timestamp }
 *   oo.stats          lifetime totals (see defaults below)
 *   oo.codex          { enemyType: first-sighted timestamp }
 *
 * During a run the host keeps per-player run stats in p.rs (see newRunStats) and team tallies in
 * game.tally; in co-op both reach the partner through the snapshot, so each machine checks its
 * own operative's commendations and banks its own lifetime stats. Nothing here touches balance.
 *
 * Old saves: the first time this loads, lifetime stats are seeded from the v0.1-0.8 service
 * record (oo.records) and commendations you have already earned (evacuations, outfits bought,
 * secret codes found) are backdated, with one toast instead of a flood.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const OPS = () => Object.fromEntries(Object.keys(OO.CHARACTERS).map((c) => [c, { runs: 0, evacs: 0, kills: 0, time: 0 }]));
  const STAT_DEFAULTS = () => ({
    v: 1,
    playtime: 0, runs: 0, evacs: 0, deaths: 0, abandoned: 0, coopRuns: 0,
    kills: 0, killsBy: {}, shots: 0, dmgDealt: 0, dmgTaken: 0, hitsTaken: 0,
    stalkers: 0, mechs: 0, barrels: 0, barrelKills: 0, calls: 0, revives: 0, downs: 0,
    cases: 0, evolutions: 0, levels: 0, dist: 0, credits: 0,
    bestTime: 0, bestKills: 0, bestLevel: 0, bestStalkers: 0, bestBarrelKills: 0,
    infiniteRuns: 0, bestInfinite: 0, apexTaken: 0, bestApex: 0,
    sig: {}, ops: OPS(),
  });
  // Run-stat keys that add straight into a lifetime total of a different name.
  const RUN_TO_LIFE = { kills: 'kills', shots: 'shots', dmg: 'dmgDealt', taken: 'dmgTaken', hits: 'hitsTaken', barrels: 'barrels', bk: 'barrelKills',
    calls: 'calls', revives: 'revives', downs: 'downs', cases: 'cases', evo: 'evolutions', dist: 'dist' };
  const SCAN_EVERY = 0.4;     // seconds between live checks
  const TOAST_TIME = 4300;    // ms each toast stays up (CSS animation length)

  /** Per-run, per-operative counters. Kept small: they ride in every co-op snapshot. */
  function newRunStats() {
    return { kills: 0, shots: 0, dmg: 0, taken: 0, hits: 0, burst: 0, minHp: 1, barrels: 0, bk: 0,
      calls: 0, revives: 0, downs: 0, evo: 0, cases: 0, dist: 0, sig: 0, apex: 0, by: {} };
  }

  function num(v) { return Number.isFinite(v) ? v : 0; }

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  /** A rank's goal as the achievement text shows it. */
  function fmtGoal(a, goal) {
    if (a.fmt === 'time') return U.formatTime(goal);
    if (a.fmt === 'hours') return goal / 3600 + (goal === 3600 ? ' hour' : ' hours');
    return goal.toLocaleString('en-US');
  }
  /** Display name and text of one unlock (a one-off, or one rank of a ranked achievement). */
  function unitName(u) { return u.rank ? u.a.name + ' ' + ROMAN[u.rank] : u.a.name; }
  function unitText(u) { return u.rank ? u.a.text.replace('{n}', fmtGoal(u.a, u.goal)) : u.a.text; }

  class Progress {
    constructor(game) {
      this.g = game;
      const S = U.storage;
      const firstLoad = S.get('oo.achievements', null) === null;
      const rawAch = S.get('oo.achievements', {});
      this.ach = rawAch && typeof rawAch === 'object' ? rawAch : {};
      const rawCodex = S.get('oo.codex', {});
      this.codex = rawCodex && typeof rawCodex === 'object' ? rawCodex : {};
      const rawStats = S.get('oo.stats', null);
      this.stats = this.normalise(rawStats);
      if (!rawStats) this.seedFromRecords();
      this.queue = [];
      this.showing = false;
      this.runNew = [];
      this.live = false;
      this.scanT = 0;
      if (firstLoad) this.backdate();
      this.migrateRanks();
    }

    /**
     * v0.10: Pest Control and the three signature-weapon masteries became ranked. Drop their old
     * one-off keys and grant every rank the lifetime stats already prove, quietly, with one notice.
     */
    migrateRanks() {
      let dirty = false;
      for (const a of OO.ACHIEVEMENTS) if (a.ranks && this.ach[a.id]) { delete this.ach[a.id]; dirty = true; }
      const got = this.checkRanks(true);
      if (dirty || got) this.saveAch();
      if (got) this.push({ kind: 'note', icon: 'trophy', title: 'Service record reviewed', text: got + (got === 1 ? ' achievement rank' : ' achievement ranks') + ' backdated from your lifetime stats. See the Dossier.' });
    }

    // ------------------------------------------------------------ storage
    normalise(raw) {
      const d = STAT_DEFAULTS();
      if (!raw || typeof raw !== 'object') return d;
      for (const k in d) {
        if (typeof d[k] === 'number') d[k] = num(raw[k]);
      }
      if (raw.killsBy && typeof raw.killsBy === 'object') for (const t in raw.killsBy) d.killsBy[t] = num(raw.killsBy[t]);
      if (raw.sig && typeof raw.sig === 'object') for (const c in raw.sig) d.sig[c] = num(raw.sig[c]);
      if (raw.ops && typeof raw.ops === 'object') {
        for (const c in d.ops) if (raw.ops[c]) for (const k in d.ops[c]) d.ops[c][k] = num(raw.ops[c][k]);
      }
      return d;
    }

    /** v0.8 and older only kept a short service record; start the lifetime stats from it. */
    seedFromRecords() {
      const r = this.g.records || {}, s = this.stats;
      s.runs = num(r.runs); s.evacs = num(r.wins); s.deaths = Math.max(0, s.runs - s.evacs);
      s.bestTime = num(r.bestTime); s.bestKills = num(r.bestKills);
      this.saveStats();
    }

    /** First load: grant what the old save already proves, quietly, then one summary toast. */
    backdate() {
      const g = this.g, got = [];
      const give = (id) => { if (!this.ach[id]) { this.ach[id] = Date.now(); got.push(id); } };
      if (num((g.records || {}).wins) > 0) give('extraction');
      if (num((g.records || {}).bestKills) >= 1) give('first_blood');
      const skins = (g.meta && g.meta.skins) || {};
      if (Object.keys(skins).some((c) => Array.isArray(skins[c]) && skins[c].length)) give('dressed');
      const found = (g.settings.secrets && Array.isArray(g.settings.secrets.found)) ? g.settings.secrets.found : [];
      if (found.includes('ears')) give('bunny');
      if (found.includes('vhs')) give('footage');
      this.saveAch();
      if (got.length) {
        this.push({ kind: 'note', title: 'Service record reviewed',
          text: got.length + (got.length === 1 ? ' commendation' : ' commendations') + ' backdated from earlier deployments. See the Dossier.' });
      }
    }

    saveAch() { U.storage.set('oo.achievements', this.ach); }
    saveStats() { U.storage.set('oo.stats', this.stats); }
    saveCodex() { U.storage.set('oo.codex', this.codex); }

    // ------------------------------------------------------------ commendations
    /** key: a one-off achievement id, or "<id>.<rank>" for one rank of a ranked achievement. */
    has(key) { return !!this.ach[key]; }
    /** Highest rank unlocked for a ranked achievement (0 = none). */
    rank(id) {
      const a = OO.ACHIEVEMENTS.find((x) => x.id === id);
      if (!a || !a.ranks) return this.ach[id] ? 1 : 0;
      let r = 0;
      for (let i = 1; i <= a.ranks.length; i++) if (this.ach[id + '.' + i]) r = i;
      return r;
    }
    get unlockedCount() { return OO.ACH_UNITS.filter((u) => this.ach[u.key]).length; }
    get totalCount() { return OO.ACH_UNITS.length; }
    get points() { return OO.ACH_UNITS.reduce((n, u) => n + (this.ach[u.key] ? OO.TIERS[u.tier].points : 0), 0); }
    get maxPoints() { return OO.ACH_UNITS.reduce((n, u) => n + OO.TIERS[u.tier].points, 0); }
    tierCounts() {
      const out = {};
      for (const t of OO.TIER_ORDER) out[t] = 0;
      for (const u of OO.ACH_UNITS) if (this.ach[u.key]) out[u.tier]++;
      return out;
    }

    unlock(key, silent) {
      const u = OO.achUnit(key);
      if (!u || this.ach[key]) return false;
      this.ach[key] = Date.now();
      if (silent) return true;          // caller saves and announces
      this.saveAch();
      if (this.live) this.runNew.push(key);
      this.push({ kind: 'ach', u });
      for (const cid in OO.CALLDOWNS) {
        const c = OO.CALLDOWNS[cid];
        if (c.unlock === key) this.push({ kind: 'note', icon: c.icon, title: 'Call-down unlocked', text: c.name + ': equip it from the Dossier.' });
      }
      if (this.unlockedCount === this.totalCount) {
        this.push({ kind: 'note', icon: 'trophy', title: 'Full clearance', text: 'Every achievement and every rank on file. Helix would like a word.' });
      }
      if (this.g.ui && this.g.ui.onProgress) this.g.ui.onProgress();
      return true;
    }

    /** Grant every rank whose goal the counter has reached. Returns how many were new. */
    checkRanks(silent) {
      let n = 0;
      for (const u of OO.ACH_UNITS) {
        if (!u.rank || this.ach[u.key]) continue;
        if (this.progressOf(u.a) >= u.goal && this.unlock(u.key, silent)) n++;
      }
      return n;
    }

    /** Value for a commendation's progress bar (lifetime + the run in progress, where it applies). */
    progressOf(a) {
      const liveRun = this.live && !this.banked;   // after runEnd banks the run, don't count it twice
      const s = this.stats, p = liveRun ? this.g.player : null, rs = p && p.rs;
      const t = a.track || '';
      const g = this.g, T = liveRun ? g.tally : null;
      if (t === 'kills') return s.kills + (rs ? rs.kills : 0);
      if (t === 'bosses') return s.stalkers + s.mechs + (T ? T.stalkers + T.mechs : 0);
      if (t === 'shots') return s.shots + (rs ? rs.shots : 0);
      if (t === 'barrelKills') return s.barrelKills + (rs ? rs.bk : 0);
      if (t === 'evacs') return s.evacs;
      if (t === 'playtime') return s.playtime + (liveRun ? num(g.time) : 0);
      if (t === 'bestInfinite') return Math.max(s.bestInfinite, liveRun && g.infinite ? num(g.time) : 0);
      if (t === 'bestApex') return Math.max(s.bestApex, rs ? rs.apex || 0 : 0);
      if (t === 'bestLevel') return Math.max(s.bestLevel, liveRun && g.team ? g.team.level : 0);
      if (t === 'bestKills') return Math.max(s.bestKills, this.live ? this.g.kills : 0);
      if (t === 'bestStalkers') return Math.max(s.bestStalkers, this.live && this.g.tally ? this.g.tally.stalkers : 0);
      if (t === 'bestBarrelKills') return Math.max(s.bestBarrelKills, rs ? rs.bk : 0);
      if (t === 'roster') return Object.keys(s.ops).filter((c) => s.ops[c].evacs > 0).length;
      if (t === 'codex') return OO.CODEX_ORDER.filter((k) => this.codex[k]).length;
      if (t.startsWith('sig:')) {
        const c = t.slice(4);
        return num(s.sig[c]) + (rs && p.charId === c ? rs.sig : 0);
      }
      return 0;
    }

    // ------------------------------------------------------------ bestiary
    seen(type) { return !!this.codex[type]; }
    get codexCount() { return OO.CODEX_ORDER.filter((k) => this.codex[k]).length; }

    markSeen(type) {
      if (!OO.CODEX[type] || this.codex[type]) return;
      this.codex[type] = Date.now();
      this.saveCodex();
      const d = OO.ENEMIES[type];
      this.push({ kind: 'codex', type, title: 'New bestiary entry', text: (d.name || type) + ': report filed in the Dossier.' });
      if (this.codexCount >= OO.CODEX_ORDER.length) this.unlock('researcher');
    }

    // ------------------------------------------------------------ run lifecycle
    runStart() {
      this.runNew = [];
      this.live = true;
      this.scanT = 0;
    }

    /** Called every simulation tick while a run is on screen (host, client and solo alike). */
    tick(dt) {
      if (!this.live) return;
      this.scanT -= dt;
      if (this.scanT > 0) return;
      this.scanT = SCAN_EVERY;
      this.scanSightings();
      this.checkLive();
    }

    /** Bestiary: anything on (or just off) the local player's screen counts as sighted. */
    scanSightings() {
      const g = this.g, p = g.player;
      if (!p) return;
      const hw = g.viewW / 2 + 40, hh = g.viewH / 2 + 40;
      for (const e of g.enemies) {
        if (e.dead || e.def.crate || this.codex[e.type]) continue;
        if (Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) this.markSeen(e.type);
      }
    }

    checkLive() {
      const g = this.g, p = g.player, rs = p && p.rs, T = g.tally;
      if (!rs || !T) return;
      const s = this.stats, u = (id, ok) => { if (ok && !this.ach[id]) this.unlock(id); };
      u('first_blood', rs.kills >= 1);
      u('body_count', g.kills >= 3000);
      u('stalker_down', T.stalkers >= 1);
      u('restraining', T.stalkers >= 4);
      u('scrap_metal', T.mechs >= 1);
      u('mutation', rs.evo >= 1);
      u('duck_cover', T.stampedes >= 5 && g.time - T.lastStampede > 5 && rs.burst === 0);
      u('untouchable', g.time >= 180 && rs.hits === 0);
      u('powder_keg', rs.bk >= 30);
      u('buddy', rs.revives >= 1);
      u('danger_close', rs.calls >= 3);
      this.checkRanks(false);
    }

    /**
     * End of a run on this machine: bank the run into the lifetime stats and check the end-of-run
     * commendations. Returns the commendations earned during the run (for the results screen).
     */
    runEnd(summary, payout) {
      if (!this.live) return [];
      const g = this.g, p = g.player, rs = (p && p.rs) || newRunStats(), T = g.tally || {}, s = this.stats;
      this.checkLive();
      const char = p ? p.charId : 'mara';
      s.playtime += num(summary.time);
      s.runs++;
      if (summary.abandoned) s.abandoned++;
      else if (summary.victory) s.evacs++;
      else s.deaths++;
      if (summary.coop) s.coopRuns++;
      for (const k in RUN_TO_LIFE) s[RUN_TO_LIFE[k]] += num(rs[k]);
      for (const t in rs.by) s.killsBy[t] = num(s.killsBy[t]) + num(rs.by[t]);
      s.stalkers += num(T.stalkers); s.mechs += num(T.mechs);
      s.levels += Math.max(0, num(summary.level) - 1);
      s.credits += num(payout);
      s.bestTime = Math.max(s.bestTime, Math.floor(num(summary.time)));
      s.bestKills = Math.max(s.bestKills, num(summary.kills));
      s.bestLevel = Math.max(s.bestLevel, num(summary.level));
      s.bestStalkers = Math.max(s.bestStalkers, num(T.stalkers));
      s.bestBarrelKills = Math.max(s.bestBarrelKills, num(rs.bk));
      s.apexTaken += num(rs.apex);
      s.bestApex = Math.max(s.bestApex, num(rs.apex));
      if (summary.infinite) { s.infiniteRuns++; s.bestInfinite = Math.max(s.bestInfinite, Math.floor(num(summary.time))); }
      s.sig[char] = num(s.sig[char]) + num(rs.sig);
      const op = s.ops[char] || (s.ops[char] = { runs: 0, evacs: 0, kills: 0, time: 0 });
      op.runs++; op.kills += num(rs.kills); op.time += num(summary.time);
      if (summary.victory) op.evacs++;
      this.saveStats();

      if (summary.victory) {
        this.unlock('extraction');
        this.unlock('evac_' + char);
        if (rs.minHp < 0.1) this.unlock('flatline');
        if (Object.keys(OO.CHARACTERS).every((c) => s.ops[c] && s.ops[c].evacs > 0)) this.unlock('full_roster');
      }
      // lifetime totals now include this run (the live part of each counter is the same run, so
      // stop counting it twice before the final rank check)
      this.banked = true;
      this.checkRanks(false);
      this.banked = false;
      this.live = false;
      return this.runNew.slice();
    }

    // ------------------------------------------------------------ toasts
    /** Slide-down notices, one at a time: commendations, bestiary entries and one-off notes. */
    push(item) {
      this.queue.push(item);
      if (item.kind === 'ach') OO.Audio.play('achieve', OO.TIERS[item.u.tier].points);
      else if (item.kind === 'codex') OO.Audio.play('codex');
      if (!this.showing) this.next();
    }

    next() {
      const el = document.getElementById('ach-toast');
      const item = this.queue.shift();
      if (!el || !item) { this.showing = false; if (el) el.hidden = true; return; }
      this.showing = true;
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      let tier = 'note', icon = item.icon || 'dna', eyebrow = item.title, name = '', text = item.text || '';
      if (item.kind === 'ach') {
        const u = item.u, T = OO.TIERS[u.tier];
        tier = u.tier; icon = u.a.icon; eyebrow = (u.rank ? 'Rank up' : 'Achievement unlocked') + ' · ' + T.name; name = unitName(u); text = unitText(u);
      } else if (item.kind === 'codex') {
        tier = 'codex'; icon = 'dna'; name = ''; eyebrow = item.title;
      }
      const color = item.kind === 'ach' ? OO.TIERS[tier].color : item.kind === 'codex' ? '#52e6c6' : '#f2b23a';
      el.className = 'ach-toast tier-' + tier;
      el.innerHTML = `<span class="medal"><img src="${OO.Icons.url(icon, 26, color)}" alt=""></span>
        <span class="ach-toast-body"><span class="ach-eyebrow">${esc(eyebrow)}</span>${name ? `<span class="ach-name">${esc(name)}</span>` : ''}<span class="ach-text">${esc(text)}</span></span>`;
      // Achievements get the full time; bestiary notes are shorter, and a backlog speeds everything up.
      let ms = item.kind === 'ach' ? TOAST_TIME : 3200;
      if (this.queue.length >= 2) ms = Math.min(ms, 2600);
      el.style.setProperty('--dur', ms + 'ms');
      el.hidden = false;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(this._t);
      this._t = setTimeout(() => this.next(), ms);
    }
  }

  Progress.newRunStats = newRunStats;
  Progress.unitName = unitName;
  Progress.unitText = unitText;
  Progress.fmtGoal = fmtGoal;
  Progress.ROMAN = ROMAN;
  OO.Progress = Progress;
})(window.OO = window.OO || {});
