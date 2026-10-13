/* DOM screens: main menu, level-up cards, supply case, pause, results, and the warning banner. */
(function (OO) {
  'use strict';

  const U = OO.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class UI {
    constructor(game) {
      this.g = game;
      this.options = [];
      this.lockUntil = 0;
      this.selectedChar = U.storage.get('oo.char', 'mara');
      if (!OO.CHARACTERS[this.selectedChar]) this.selectedChar = 'mara';
      this.screens = ['screen-menu', 'screen-levelup', 'screen-chest', 'screen-pause', 'screen-results', 'screen-armory'];

      this.buildMenu();
      this.buildDifficulty();
      this.updateSettings();
      $('btn-start').addEventListener('click', () => this.startRun());
      $('btn-armory').addEventListener('click', () => this.showArmory());
      $('armory-back').addEventListener('click', () => this.showMenu());
      $('armory-refund').addEventListener('click', () => { this.g.refundArmory(); this.showArmory(); });
      $('btn-reroll').addEventListener('click', () => this.g.reroll());
      $('set-shake').addEventListener('click', () => { this.g.toggleSetting('shake'); this.updateSettings(); });
      $('set-numbers').addEventListener('click', () => { this.g.toggleSetting('damageNumbers'); this.updateSettings(); });
      $('btn-skip').addEventListener('click', () => { if (performance.now() >= this.lockUntil) this.g.skipLevel(); });
      $('btn-resume').addEventListener('click', () => this.g.resume());
      $('btn-quit').addEventListener('click', () => this.g.quitToMenu());
      $('btn-retry').addEventListener('click', () => this.startRun());
      $('btn-menu').addEventListener('click', () => this.g.quitToMenu());
      $('chest-ok').addEventListener('click', () => this.g.closeChest());
      $('btn-pause').addEventListener('click', () => (this.g.state === 'paused' ? this.g.resume() : this.g.pause()));
      $('btn-mute').addEventListener('click', () => { OO.Audio.init(); this.g.toggleMute(); });
      window.addEventListener('keydown', (e) => this.onKey(e));
      this.updateMute();
      this.showMenu();
    }

    startRun() {
      OO.Audio.init();
      OO.Audio.play('select');
      this.g.start(this.selectedChar);
    }

    // ------------------------------------------------------------ menu
    buildMenu() {
      const list = $('char-list');
      list.innerHTML = '';
      for (const id in OO.CHARACTERS) {
        const c = OO.CHARACTERS[id], w = OO.WEAPONS[c.weapon];
        const b = document.createElement('button');
        b.className = 'char-card';
        b.id = 'char-' + id;
        b.setAttribute('aria-pressed', String(id === this.selectedChar));
        b.innerHTML = `
          <span class="char-photo"><img src="${OO.Icons.url(w.icon, 36, '#d9ceb2')}" alt=""></span>
          <span class="char-body">
            <span class="char-name">${esc(c.name)}</span>
            <span class="char-role">${esc(c.role)}</span>
            <span class="char-kit">Starts with ${esc(w.name)}</span>
            <span class="char-bonus">${esc(c.bonusText)}</span>
          </span>`;
        b.addEventListener('click', () => this.selectChar(id));
        list.appendChild(b);
      }
    }

    buildDifficulty() {
      const list = $('diff-list');
      list.innerHTML = '';
      for (const id in OO.DIFFICULTY) {
        const d = OO.DIFFICULTY[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'threat-btn threat-' + id;
        b.id = 'diff-' + id;
        b.setAttribute('aria-pressed', String(this.g.settings.difficulty === id));
        b.innerHTML = `<span class="threat-name">${d.locked ? '<img class="threat-lock" src="' + OO.Icons.url('lock', 16, '#8f8a7d') + '" alt="Locked">' : ''}${esc(d.name)}</span><span class="threat-text">${esc(d.text)}</span>`;
        if (d.locked) { b.disabled = true; b.title = d.name + ' is locked for now'; }
        b.addEventListener('click', () => {
          if (d.locked) return;
          this.g.setDifficulty(id);
          for (const k in OO.DIFFICULTY) $('diff-' + k).setAttribute('aria-pressed', String(k === id));
          OO.Audio.init(); OO.Audio.play('select');
        });
        list.appendChild(b);
      }
    }

    updateSettings() {
      const s = this.g.settings;
      $('set-shake').textContent = 'Screen shake: ' + (s.shake ? 'on' : 'off');
      $('set-numbers').textContent = 'Damage numbers: ' + (s.damageNumbers ? 'on' : 'off');
    }

    selectChar(id) {
      this.selectedChar = id;
      for (const cid in OO.CHARACTERS) $('char-' + cid).setAttribute('aria-pressed', String(cid === id));
      OO.Audio.init();
      OO.Audio.play('select');
    }

    showMenu() {
      this.hideAll();
      const r = this.g.records;
      $('records').textContent = r.runs
        ? `Longest survival ${U.formatTime(r.bestTime)} · Most kills ${r.bestKills} · Evacuated ${r.wins} of ${r.runs} runs`
        : 'No runs on file yet.';
      $('screen-menu').hidden = false;
    }

    hideAll() { for (const s of this.screens) $(s).hidden = true; }

    setHud(on) { $('hud-buttons').hidden = !on; }

    updateMute() {
      const m = this.g.settings.muted;
      $('btn-mute').textContent = m ? 'Sound off' : 'Sound on';
      $('btn-mute').setAttribute('aria-pressed', String(!m));
    }

    // ------------------------------------------------------------ armory
    showArmory() {
      this.hideAll();
      const g = this.g;
      $('armory-bank').textContent = g.meta.bank.toLocaleString();
      const list = $('armory-list');
      list.innerHTML = '';
      for (const item of OO.ARMORY) {
        const r = g.rank(item.id), maxed = r >= item.max, cost = maxed ? 0 : item.cost[r];
        const row = document.createElement('div');
        row.className = 'armory-item' + (maxed ? ' maxed' : '');
        const pips = Array.from({ length: item.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
        row.innerHTML = `
          <img src="${OO.Icons.url(item.icon, 28, '#e3a33b')}" alt="">
          <div class="armory-body">
            <span class="armory-name">${esc(item.name)}</span>
            <span class="armory-text">${esc(item.text)}</span>
            <span class="pips" aria-label="Rank ${r} of ${item.max}">${pips}</span>
          </div>`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-small btn-buy';
        b.textContent = maxed ? 'Maxed' : cost + ' cr';
        b.disabled = maxed || g.meta.bank < cost;
        b.addEventListener('click', () => { if (g.buyArmory(item.id)) { OO.Audio.init(); OO.Audio.play('chest'); this.showArmory(); } });
        row.appendChild(b);
        list.appendChild(row);
      }
      $('screen-armory').hidden = false;
    }

    // ------------------------------------------------------------ level up
    showLevelUp(options, level) {
      this.options = options;
      this.lockUntil = performance.now() + 350;   // stop a held key or stray tap from picking blind
      $('lu-level').textContent = level;
      const rr = this.g.player.rerolls;
      $('reroll-n').textContent = '(' + rr + ' left)';
      $('btn-reroll').disabled = rr <= 0;
      const wrap = $('lu-cards');
      wrap.innerHTML = '';
      options.forEach((opt, i) => {
        const d = this.g.describeUpgrade(opt);
        const b = document.createElement('button');
        b.className = 'card' + (d.isNew ? ' card-new' : '');
        b.innerHTML = `
          <span class="card-top">
            <span class="card-key">${i + 1}</span>
            <span class="card-type">${esc(d.type)}</span>
            <span class="card-badge">${esc(d.badge)}</span>
          </span>
          <img class="card-icon" src="${OO.Icons.url(d.icon, 40, '#1b1a17')}" alt="">
          <span class="card-name">${esc(d.name)}</span>
          <span class="card-text">${esc(d.text)}</span>`;
        b.addEventListener('click', () => this.pick(i));
        wrap.appendChild(b);
      });
      $('screen-levelup').hidden = false;
    }

    pick(i) {
      if (performance.now() < this.lockUntil) return;
      const opt = this.options[i];
      if (opt) this.g.chooseUpgrade(opt);
    }

    // ------------------------------------------------------------ supply case
    showChest(results, credits) {
      const ul = $('chest-list');
      ul.innerHTML = results.map((d) => `
        <li class="${d.evolved ? 'evo' : ''}"><img src="${OO.Icons.url(d.icon, 28, d.evolved ? '#ff6f4a' : '#e3a33b')}" alt="">
          <span><strong>${esc(d.name)}</strong> <em>${esc(d.badge)}</em><br>${esc(d.text)}</span></li>`).join('')
        + `<li><img src="${OO.Icons.url('credits', 28, '#e3a33b')}" alt=""><span><strong>+${credits} credits</strong></span></li>`;
      this.lockUntil = performance.now() + 400;
      $('screen-chest').hidden = false;
    }

    // ------------------------------------------------------------ pause
    showPause() {
      const p = this.g.player;
      const rows = p.weapons.map((w) => `<li><img src="${OO.Icons.url(w.def.icon, 24, w.def.evolved ? '#ff6f4a' : '#e3a33b')}" alt=""><span>${esc(w.def.name)}</span><b>${w.def.evolved ? 'Evolved' : 'Lv ' + w.level}</b></li>`)
        .concat(p.passiveOrder.map((id) => `<li><img src="${OO.Icons.url(OO.PASSIVES[id].icon, 24, '#56d6c0')}" alt=""><span>${esc(OO.PASSIVES[id].name)}</span><b>Lv ${p.passives[id]}</b></li>`));
      $('pause-build').innerHTML = rows.join('');
      // Field manual: evolution recipes for the weapons you carry
      const recipes = p.weapons.filter((w) => OO.EVOLUTIONS[w.id]).map((w) => {
        const E = OO.EVOLUTIONS[w.id], gear = OO.PASSIVES[E.needs];
        const haveMax = w.level >= w.maxLevel, haveGear = !!p.passives[E.needs];
        return `<li><span class="${haveMax ? 'ok' : ''}">${esc(w.def.name)} Lv ${w.maxLevel}</span> + <span class="${haveGear ? 'ok' : ''}">${esc(gear.name)}</span> → <strong>${esc(OO.WEAPONS[E.into].name)}</strong>${haveMax && haveGear ? ' <em>Ready: open a supply case</em>' : ''}</li>`;
      });
      $('pause-evo').innerHTML = recipes.length ? recipes.join('') : '<li>Every weapon you carry has evolved.</li>';
      const s = p.stats;
      $('pause-stats').innerHTML = [
        ['Max HP', Math.round(s.maxHp)], ['Armor', s.armor], ['Damage', Math.round(s.might * 100) + '%'],
        ['Area', Math.round(s.area * 100) + '%'], ['Cooldown', Math.round(s.cooldown * 100) + '%'],
        ['Speed', Math.round(s.speed)], ['Pickup range', Math.round(s.magnet)], ['Time', U.formatTime(this.g.time)],
      ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      $('screen-pause').hidden = false;
    }

    // ------------------------------------------------------------ results
    showResults(r) {
      this.hideAll();
      $('res-eyebrow').textContent = r.victory ? 'Extraction confirmed' : 'Signal lost';
      $('res-title').textContent = r.victory ? 'You made the chopper' : 'You were overrun';
      $('screen-results').classList.toggle('won', r.victory);
      $('res-payout').innerHTML = `Banked <strong>+${r.payout.toLocaleString()}</strong> credits for the Armory (${r.bank.toLocaleString()} total) · ${esc(r.difficulty)}`;
      $('res-stats').innerHTML = [
        ['Survived', U.formatTime(r.time)], ['Level', r.level], ['Kills', r.kills], ['Credits', r.credits], ['Strain', 'LV ' + r.strain],
      ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      const rows = r.weapons.slice().sort((a, b) => b.dmg - a.dmg).map((w) => `
        <tr><td><img src="${OO.Icons.url(OO.WEAPONS[w.id].icon, 20, OO.WEAPONS[w.id].evolved ? '#ff6f4a' : '#e3a33b')}" alt=""> ${esc(w.name)}</td>
        <td>${w.level}</td><td>${w.dmg.toLocaleString()}</td><td>${w.kills}</td></tr>`).join('');
      $('res-weapons').innerHTML = `<thead><tr><th>Weapon</th><th>Lv</th><th>Damage</th><th>Kills</th></tr></thead><tbody>${rows}</tbody>`;
      this.lockUntil = performance.now() + 600;
      $('screen-results').hidden = false;
    }

    // ------------------------------------------------------------ banner
    banner(text, kind) {
      const el = $('banner');
      el.textContent = text;
      el.className = 'banner banner-' + (kind || 'warn');
      el.hidden = false;
      void el.offsetWidth;          // restart the CSS animation
      el.classList.add('show');
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => { el.hidden = true; }, 3400);
    }

    // ------------------------------------------------------------ keyboard for screens
    onKey(e) {
      const s = this.g.state;
      const locked = performance.now() < this.lockUntil;
      if (s === 'levelup') {
        if (e.repeat) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= this.options.length) this.pick(n - 1);
        else if (!locked && (e.key === 'r' || e.key === 'R')) this.g.reroll();
        else if (!locked && (e.key === 'x' || e.key === 'X')) this.g.skipLevel();
      } else if (s === 'chest') {
        if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.g.closeChest(); }
      } else if (s === 'menu' && !$('screen-menu').hidden) {
        if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') this.startRun();
        const ids = Object.keys(OO.CHARACTERS);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const i = ids.indexOf(this.selectedChar) + (e.key === 'ArrowRight' ? 1 : -1);
          this.selectChar(ids[(i + ids.length) % ids.length]);
        }
      } else if (s === 'results') {
        if (!locked && e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') this.startRun();
      }
    }
  }

  OO.UI = UI;
})(window.OO = window.OO || {});
