/*
 * The Dossier screen (menu > Dossier): achievements, the bestiary, call-downs and lifetime
 * statistics. Extends OO.UI.prototype. Data: js/archive.js; state: js/progress.js.
 * Also drives the in-run call-down button.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const UI = OO.UI.prototype;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TABS = ['ach', 'codex', 'calls', 'stats'];
  const n = (v) => Math.round(v || 0).toLocaleString();
  const date = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  function hours(sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' h ' + m + ' m' : m + ' m ' + (sec % 60) + ' s';
  }
  /** World units to a distance: an operative is about a metre wide (32 units). */
  function distance(units) {
    const m = (units || 0) / 32;
    return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  }

  UI.bindArchive = function () {
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('screen-dossier').hidden) this.showMenu(); });
    this.archiveTab = 'ach';
    this.codexSel = 'shambler';
    $('btn-archive').addEventListener('click', () => { OO.Audio.init(); OO.Audio.play('select'); this.showArchive('ach'); });
    $('btn-ach-view').addEventListener('click', () => this.showArchive('ach'));
    $('btn-calldown-pick').addEventListener('click', () => this.showArchive('calls'));
    $('archive-back').addEventListener('click', () => this.showMenu());
    for (const t of TABS) $('tab-' + t).addEventListener('click', () => this.showArchive(t));
    const btn = $('btn-calldown');
    btn.addEventListener('click', () => { OO.Audio.init(); this.g.requestCalldown(); btn.blur(); });
  };

  /** Called by Progress when something unlocks: keep visible menu text in step. */
  UI.onProgress = function () {
    if (!$('screen-menu').hidden) this.refreshDossier();
    if (!$('screen-dossier').hidden) this.showArchive(this.archiveTab);
  };

  UI.showArchive = function (tab) {
    this.hideAll();
    this.archiveTab = tab || this.archiveTab;
    for (const t of TABS) {
      $('tab-' + t).setAttribute('aria-selected', String(t === this.archiveTab));
      $('archive-' + t).hidden = t !== this.archiveTab;
    }
    this.renderArchiveSummary();
    if (this.archiveTab === 'ach') this.renderAchievements();
    else if (this.archiveTab === 'codex') this.renderCodex();
    else if (this.archiveTab === 'calls') this.renderCalldowns();
    else this.renderStats();
    $('screen-dossier').hidden = false;
  };

  UI.renderArchiveSummary = function () {
    const P = this.g.progress, c = P.tierCounts(), total = P.totalCount, got = P.unlockedCount;
    const pct = Math.round((P.points / P.maxPoints) * 100);
    const full = got === total;
    $('archive-summary').innerHTML = `
      <img class="archive-trophy" src="${OO.Icons.url('trophy', 30, full ? '#e8f4ff' : '#f2c14a')}" alt="">
      <div class="archive-score">
        <span class="archive-count"><strong>${got}</strong> / ${total} unlocks · ${n(P.points)} pts${full ? ' <em>Full clearance</em>' : ''}</span>
        <span class="archive-tiers">${OO.TIER_ORDER.slice().reverse().map((t) => `<span class="tier-dot tier-${t}" title="${OO.TIERS[t].name}"></span>${c[t]}`).join(' ')}</span>
        <span class="archive-bar" aria-label="${pct}% of achievement points"><i style="width:${pct}%"></i></span>
      </div>`;
  };

  // ------------------------------------------------------------ achievements
  UI.renderAchievements = function () {
    const P = this.g.progress, box = $('archive-ach');
    box.innerHTML = OO.ACH_CATS.map(([cat, label]) => {
      const list = OO.ACHIEVEMENTS.filter((a) => a.cat === cat);
      const units = OO.ACH_UNITS.filter((u) => u.a.cat === cat);
      const got = units.filter((u) => P.has(u.key)).length;
      return `<section class="ach-group">
        <h3 class="ach-group-title">${esc(label)} <span>${got} / ${units.length}</span></h3>
        <div class="ach-grid">${list.map((a) => (a.ranks ? this.rankCard(a) : this.achCard(a))).join('')}</div>
      </section>`;
    }).join('') + '<p class="hint">Ranked achievements climb Bronze, Silver, Gold, Platinum, Diamond and Biohazard on one counter; every rank counts as an unlock. Saved on this device. In co-op each of you earns your own.</p>';
  };

  UI.achCard = function (a) {
    const P = this.g.progress, on = P.has(a.id), T = OO.TIERS[a.tier];
    const secret = a.hidden && !on;
    const icon = secret ? 'lock' : a.icon;
    const title = secret ? 'Classified' : a.name;
    const text = secret ? a.hint : a.text;
    let extra = '';
    if (on) extra = `<span class="ach-date">Unlocked ${esc(date(P.ach[a.id]))}</span>`;
    else if (a.goal) {
      const v = Math.min(a.goal, P.progressOf(a));
      extra = `<span class="ach-bar"><i style="width:${(v / a.goal) * 100}%"></i></span><span class="ach-prog">${n(v)} / ${n(a.goal)}</span>`;
    }
    return `<article class="ach tier-${a.tier}${on ? ' on' : ' locked'}${secret ? ' secret' : ''}">
      <span class="medal"><img src="${OO.Icons.url(icon, 24, on ? T.color : '#5a7672')}" alt=""></span>
      <div class="ach-body">
        <h4 class="ach-title">${esc(title)} <em class="ach-tier">${T.name}</em></h4>
        <p class="ach-desc">${esc(text)}</p>
        ${extra}
      </div>
    </article>`;
  };

  /** A ranked achievement: current rank's metal, a pip per rank, progress toward the next one. */
  UI.rankCard = function (a) {
    const P = this.g.progress, PR = OO.Progress, r = P.rank(a.id), max = a.ranks.length;
    const cur = r ? OO.ACH_UNITS.find((u) => u.key === a.id + '.' + r) : null;
    const next = r < max ? OO.ACH_UNITS.find((u) => u.key === a.id + '.' + (r + 1)) : null;
    const tier = cur ? cur.tier : a.ranks[0][1], T = OO.TIERS[tier];
    const v = P.progressOf(a);
    const fmt = (x) => (a.fmt ? PR.fmtGoal(a, x) : n(x));
    const shown = a.fmt === 'hours' ? (v / 3600).toFixed(1) + ' h' : a.fmt === 'time' ? U.formatTime(v) : n(v);
    const pips = a.ranks.map(([goal, t], i) => `<i class="rank-pip tier-${t}${i < r ? ' on' : ''}" title="${PR.ROMAN[i + 1]} · ${OO.TIERS[t].name} · ${esc(fmt(goal))}"></i>`).join('');
    let extra;
    if (next) {
      const prev = r ? a.ranks[r - 1][0] : 0, k = U.clamp((v - prev) / (next.goal - prev), 0, 1);
      extra = `<span class="ach-bar"><i style="width:${k * 100}%"></i></span><span class="ach-prog">${shown} / ${esc(fmt(next.goal))} · next: ${PR.ROMAN[r + 1]} ${OO.TIERS[next.tier].name}</span>`;
    } else extra = `<span class="ach-date">Max rank · ${esc(date(P.ach[cur.key]))}</span>`;
    return `<article class="ach ranked tier-${tier}${r ? ' on' : ' locked'}${!next ? ' maxed' : ''}">
      <span class="medal"><img src="${OO.Icons.url(a.icon, 24, r ? T.color : '#5a7672')}" alt="">${r ? `<b class="medal-rank">${PR.ROMAN[r]}</b>` : ''}</span>
      <div class="ach-body">
        <h4 class="ach-title">${esc(a.name)}${r ? ' ' + PR.ROMAN[r] : ''} <em class="ach-tier">${r ? T.name : 'Unranked'}</em></h4>
        <p class="ach-desc">${esc(PR.unitText(next || cur))}</p>
        <span class="rank-pips" aria-label="Rank ${r} of ${max}">${pips}</span>
        ${extra}
      </div>
    </article>`;
  };

  // ------------------------------------------------------------ bestiary
  /** Draws a specimen into a canvas from the game's own enemy sprites (facing up). Unseen = silhouette. */
  UI.specimenCanvas = function (type, size, seen) {
    const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + 'px';
    c.className = 'specimen';
    const spr = this.g.renderer.enemySprite(type, 0, false);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    x.translate(size / 2, size / 2);
    x.rotate(-Math.PI / 2);
    // fit the body (plus limbs and ears) rather than the whole padded animation frame
    const r = OO.ENEMIES[type].r, s = Math.min(size / (spr.half * 2) * 1.6, size / (r * (type === 'mecha' ? 3.1 : 2.9)));
    x.drawImage(spr, -spr.half * s, -spr.half * s, spr.half * 2 * s, spr.half * 2 * s);
    if (!seen) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#16302f';
      x.fillRect(0, 0, c.width, c.height);
    }
    return c;
  };

  UI.renderCodex = function () {
    const P = this.g.progress, box = $('archive-codex');
    if (!OO.CODEX[this.codexSel]) this.codexSel = OO.CODEX_ORDER[0];
    box.innerHTML = `<p class="codex-head">Specimens catalogued <strong>${P.codexCount} / ${OO.CODEX_ORDER.length}</strong>. A report is filed the first time a specimen comes into view.</p>
      <div class="codex"><div class="codex-list" role="listbox" aria-label="Specimens"></div><article class="codex-entry"></article></div>`;
    const list = box.querySelector('.codex-list');
    for (const type of OO.CODEX_ORDER) {
      const seen = P.seen(type), d = OO.ENEMIES[type];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'codex-item' + (seen ? '' : ' unseen');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(type === this.codexSel));
      b.appendChild(this.specimenCanvas(type, 40, seen));
      const label = document.createElement('span');
      label.className = 'codex-item-name';
      label.innerHTML = `${seen ? esc(d.name) : 'Unidentified'}<em>${seen ? n(P.stats.killsBy[type]) + ' killed' : '?'}</em>`;
      b.appendChild(label);
      b.addEventListener('click', () => { this.codexSel = type; OO.Audio.play('select'); this.renderCodex(); });
      list.appendChild(b);
    }
    this.renderCodexEntry(box.querySelector('.codex-entry'), this.codexSel);
  };

  UI.renderCodexEntry = function (el, type) {
    const P = this.g.progress, seen = P.seen(type), d = OO.ENEMIES[type], C = OO.CODEX[type];
    el.innerHTML = '';
    const fig = document.createElement('div');
    fig.className = 'codex-fig';
    fig.appendChild(this.specimenCanvas(type, 150, seen));
    el.appendChild(fig);
    const body = document.createElement('div');
    body.className = 'codex-body';
    if (!seen) {
      body.innerHTML = `<p class="eyebrow">Specimen ${OO.CODEX_ORDER.indexOf(type) + 1} of ${OO.CODEX_ORDER.length}</p>
        <h3 class="codex-name">Unidentified</h3>
        <p class="codex-lore">No field report yet. Encounter this specimen in the quarantine zone to file one.</p>`;
      el.appendChild(body);
      return;
    }
    const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < C.threat ? 'on' : ''}"></i>`).join('');
    const special = d.burster ? 'Blast ' + d.burster.dmg : d.explode ? 'Death blast ' + d.explode.dmg
      : d.ranged ? 'Acid ' + d.ranged.impact + ' + pool' : d.mech ? 'Leap, missiles, laser' : d.boss ? 'Lunge' : '';
    const rows = [
      ['Base health', d.invulnerable ? 'Immune' : n(d.hp)],
      ['Speed', n(d.speed)],
      ['Contact damage', d.dmg ? n(d.dmg) : '-'],
      ['DNA yield', n(d.xp)],
    ];
    rows.push(['Your kills', n(P.stats.killsBy[type])]);
    if (special) rows.push(['Special', special, true]);
    body.innerHTML = `<p class="eyebrow">${esc(C.cls)}</p>
      <h3 class="codex-name">${esc(d.name)}</h3>
      <p class="codex-threat">Threat <span class="pips">${pips}</span></p>
      <dl class="codex-stats">${rows.map(([k, v, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <ul class="codex-traits">${C.traits.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${C.lore.map((t) => `<p class="codex-lore">${esc(t)}</p>`).join('')}
      <p class="hint">First sighted ${esc(date(P.codex[type]))}. Base values before strain level, surge and threat scaling.</p>`;
    el.appendChild(body);
  };

  // ------------------------------------------------------------ call-downs
  UI.renderCalldowns = function () {
    const g = this.g, box = $('archive-calls'), eq = g.calldownFor(), C = OO.CONFIG.CALLDOWN;
    box.innerHTML = `<p class="codex-head">One call-down per run. Use it with <kbd>Q</kbd> or the button at the bottom of the screen. It charges for ${C.firstCharge} s at the start of every run.</p><div class="calls"></div>`;
    const wrap = box.querySelector('.calls');
    for (const id in OO.CALLDOWNS) {
      const c = OO.CALLDOWNS[id], open = g.calldownUnlocked(id), on = id === eq;
      const card = document.createElement('article');
      card.className = 'call' + (on ? ' equipped' : '') + (open ? '' : ' locked');
      const req = c.unlock && OO.ACHIEVEMENTS.find((a) => a.id === c.unlock);
      card.innerHTML = `<img class="call-icon" src="${OO.Icons.url(open ? c.icon : 'lock', 36, open ? (on ? '#52e6c6' : '#f2b23a') : '#5a7672')}" alt="">
        <h3 class="call-name">${esc(c.name)}</h3>
        <p class="call-cd">Cooldown ${C[id].cd} s</p>
        <p class="call-text">${esc(c.text)}</p>
        ${open ? '' : `<p class="call-req">Unlock: ${esc(req.name)}. ${esc(req.text)}</p>`}`;
      const b = document.createElement('button');
      b.type = 'button';
      if (on) { b.className = 'btn-small btn-equipped'; b.textContent = 'Equipped'; b.disabled = true; }
      else if (open) {
        b.className = 'btn-small'; b.textContent = 'Equip';
        b.addEventListener('click', () => { g.equipCalldown(id); OO.Audio.play('select'); this.renderCalldowns(); });
      } else { b.className = 'btn-small'; b.textContent = 'Locked'; b.disabled = true; }
      card.appendChild(b);
      wrap.appendChild(card);
    }
  };

  // ------------------------------------------------------------ statistics
  UI.renderStats = function () {
    const s = this.g.progress.stats, box = $('archive-stats');
    const group = (title, rows) => `<section class="stat-group"><h3 class="ach-group-title">${title}</h3>
      <dl class="stat-grid stat-grid-archive">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
    const ops = Object.keys(OO.CHARACTERS).map((c) => {
      const o = s.ops[c] || {};
      return `<tr><td>${esc(OO.CHARACTERS[c].name)}</td><td>${n(o.runs)}</td><td>${n(o.evacs)}</td><td>${n(o.kills)}</td><td>${n(s.sig[c])}</td><td>${hours(o.time)}</td></tr>`;
    }).join('');
    box.innerHTML = group('Service record', [
      ['Total playtime', hours(s.playtime)], ['Runs', n(s.runs)], ['Evacuations', n(s.evacs)], ['Killed in action', n(s.deaths)],
      ['Abandoned', n(s.abandoned)], ['Co-op runs', n(s.coopRuns)], ['Longest survival', U.formatTime(s.bestTime)],
      ['Highest level', n(s.bestLevel)], ['Most kills in a run', n(s.bestKills)],
    ]) + group('Combat', [
      ['Infected killed', n(s.kills)], ['Shots fired', n(s.shots)], ['Damage dealt', n(s.dmgDealt)],
      ['Boss takedowns', n(s.stalkers + s.mechs)], ['Stalkers killed', n(s.stalkers)], ['Hare Triggers scrapped', n(s.mechs)],
      ['Drums detonated', n(s.barrels)], ['Drum kills', n(s.barrelKills)], ['Weapons evolved', n(s.evolutions)],
    ]) + group('In the field', [
      ['Damage taken', n(s.dmgTaken)], ['Hits taken', n(s.hitsTaken)], ['Times downed', n(s.downs)],
      ['Partners revived', n(s.revives)], ['Call-downs used', n(s.calls)], ['Supply cases opened', n(s.cases)],
      ['Levels gained', n(s.levels)], ['Distance on foot', distance(s.dist)], ['Credits banked', n(s.credits)],
    ]) + group('Infinite Mode', [
      ['Infinite runs', n(s.infiniteRuns)], ['Longest survival', s.bestInfinite ? U.formatTime(s.bestInfinite) : '-'],
      ['Apex mutations taken', n(s.apexTaken)], ['Most Apex in a run', n(s.bestApex)],
    ]) + `<section class="stat-group"><h3 class="ach-group-title">Operatives</h3>
      <div class="table-wrap"><table class="res-table"><thead><tr><th>Operative</th><th>Runs</th><th>Evacs</th><th>Kills</th><th>Signature kills</th><th>Time</th></tr></thead><tbody>${ops}</tbody></table></div></section>
      <p class="hint">Lifetime totals on this device. Runs from before v0.9 count toward runs, evacuations and records only.</p>`;
  };

  // ------------------------------------------------------------ in-run call-down button
  /** Called every frame by the renderer; only touches the DOM when what it shows changes. */
  UI.updateCalldown = function () {
    const g = this.g, p = g.player, btn = $('btn-calldown');
    if (!p || !p.cd || btn.hidden) return;
    const c = OO.CALLDOWNS[p.cd.id], ready = p.cd.t <= 0 && !p.downed;
    const k = p.cd.max ? 1 - U.clamp(p.cd.t / p.cd.max, 0, 1) : 1;
    const key = p.cd.id + '|' + (ready ? 'r' : Math.ceil(p.cd.t)) + '|' + Math.round(k * 50) + (p.downed ? 'd' : '');
    if (key === this._cdKey) return;
    if (!this._cdKey || this._cdKey.split('|')[0] !== p.cd.id) {
      $('cd-icon').src = OO.Icons.url(c.icon, 22, '#f2b23a');
      $('cd-name').textContent = c.name;
    }
    const wasReady = this._cdKey && this._cdKey.split('|')[1] === 'r';
    this._cdKey = key;
    btn.classList.toggle('ready', ready);
    btn.style.setProperty('--k', k.toFixed(3));
    $('cd-state').textContent = p.downed ? 'Down' : ready ? 'Ready' : Math.ceil(p.cd.t) + ' s';
    btn.disabled = !ready;
    if (ready && !wasReady && g.state === 'playing' && g.time > 1) OO.Audio.play('codex');
  };
})(window.OO = window.OO || {});
