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
      calls: 0, revives: 0, downs: 0, evo: 0, cases: 0, dist: 0, sig: 0, by: {} };
  }

  function num(v) { return Number.isFinite(v) ? v : 0; }

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
    has(id) { return !!this.ach[id]; }
    get unlockedCount() { return OO.ACHIEVEMENTS.filter((a) => this.ach[a.id]).length; }
    get points() { return OO.ACHIEVEMENTS.reduce((n, a) => n + (this.ach[a.id] ? OO.TIERS[a.tier].points : 0), 0); }
    get maxPoints() { return OO.ACHIEVEMENTS.reduce((n, a) => n + OO.TIERS[a.tier].points, 0); }
    tierCounts() {
      const out = { bronze: 0, silver: 0, gold: 0 };
      for (const a of OO.ACHIEVEMENTS) if (this.ach[a.id]) out[a.tier]++;
      return out;
    }

    unlock(id) {
      const a = OO.ACHIEVEMENTS.find((x) => x.id === id);
      if (!a || this.ach[id]) return false;
      this.ach[id] = Date.now();
      this.saveAch();
      if (this.live) this.runNew.push(id);
      this.push({ kind: 'ach', a });
      for (const cid in OO.CALLDOWNS) {
        const c = OO.CALLDOWNS[cid];
        if (c.unlock === id) this.push({ kind: 'note', icon: c.icon, title: 'Call-down unlocked', text: c.name + ': equip it from the Dossier.' });
      }
      if (this.unlockedCount === OO.ACHIEVEMENTS.length) {
        this.push({ kind: 'note', icon: 'trophy', title: 'Platinum clearance', text: 'Every commendation on file. Helix would like a word.' });
      }
      if (this.g.ui && this.g.ui.onProgress) this.g.ui.onProgress();
      return true;
    }

    /** Value for a commendation's progress bar (lifetime + the run in progress, where it applies). */
    progressOf(a) {
      const s = this.stats, p = this.live ? this.g.player : null, rs = p && p.rs;
      const t = a.track || '';
      if (t === 'kills') return s.kills + (rs ? rs.kills : 0);
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
      u('pest_control', s.kills + rs.kills >= 50000);
      u('stalker_down', T.stalkers >= 1);
      u('restraining', T.stalkers >= 4);
      u('scrap_metal', T.mechs >= 1);
      u('mutation', rs.evo >= 1);
      u('duck_cover', T.stampedes >= 5 && g.time - T.lastStampede > 5 && rs.burst === 0);
      u('untouchable', g.time >= 180 && rs.hits === 0);
      u('powder_keg', rs.bk >= 30);
      u('buddy', rs.revives >= 1);
      u('danger_close', rs.calls >= 3);
      const sig = 'master_' + p.charId;
      u(sig, OO.ACHIEVEMENTS.some((a) => a.id === sig) && num(s.sig[p.charId]) + rs.sig >= 5000);
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
      // lifetime totals now include this run
      if (s.kills >= 50000) this.unlock('pest_control');
      if (num(s.sig[char]) >= 5000) this.unlock('master_' + char);
      this.live = false;
      return this.runNew.slice();
    }

    // ------------------------------------------------------------ toasts
    /** Slide-down notices, one at a time: commendations, bestiary entries and one-off notes. */
    push(item) {
      this.queue.push(item);
      if (item.kind === 'ach') OO.Audio.play('achieve', OO.TIERS[item.a.tier].points);
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
        const a = item.a, T = OO.TIERS[a.tier];
        tier = a.tier; icon = a.icon; eyebrow = 'Commendation unlocked · ' + T.name; name = a.name; text = a.text;
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
  OO.Progress = Progress;
})(window.OO = window.OO || {});
