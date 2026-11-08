/* DOM screens: main menu, co-op lobby, level-up cards, supply case, pause, results, toasts and the warning banner. */
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
      this.screens = ['screen-menu', 'screen-levelup', 'screen-chest', 'screen-pause', 'screen-results', 'screen-armory', 'screen-coop'];

      this.buildMenu();
      this.buildDifficulty();
      this.updateSettings();
      $('btn-start').addEventListener('click', () => this.startRun());
      $('btn-armory').addEventListener('click', () => this.showArmory('upgrades'));
      $('btn-outfit').addEventListener('click', () => { this.wardrobeChar = this.selectedChar; this.showArmory('wardrobe'); });
      $('armory-back').addEventListener('click', () => this.showMenu());
      $('armory-refund').addEventListener('click', () => { this.g.refundArmory(); this.showArmory('upgrades'); });
      $('tab-upgrades').addEventListener('click', () => this.showArmory('upgrades'));
      $('tab-wardrobe').addEventListener('click', () => this.showArmory('wardrobe'));
      this.wardrobeChar = this.selectedChar;
      this.armoryTab = 'upgrades';
      $('btn-reroll').addEventListener('click', () => { if (performance.now() >= this.lockUntil) this.g.requestReroll(); });
      $('set-shake').addEventListener('click', () => { this.g.toggleSetting('shake'); this.updateSettings(); });
      $('set-numbers').addEventListener('click', () => { this.g.toggleSetting('damageNumbers'); this.updateSettings(); });
      $('set-fx').addEventListener('click', () => { this.g.toggleSetting('fx'); this.updateSettings(); });
      $('btn-skip').addEventListener('click', () => { if (performance.now() >= this.lockUntil) this.g.requestSkip(); });
      $('btn-resume').addEventListener('click', () => this.g.resume());
      $('btn-quit').addEventListener('click', () => this.g.quitToMenu());
      $('btn-retry').addEventListener('click', () => this.retry());
      $('btn-menu').addEventListener('click', () => this.g.quitToMenu());
      $('chest-ok').addEventListener('click', () => this.g.closeChest());
      $('btn-pause').addEventListener('click', () => (this.g.state === 'paused' ? this.g.resume() : this.g.pause()));
      $('btn-mute').addEventListener('click', () => { OO.Audio.init(); this.g.toggleMute(); });
      this.bindCoop();
      window.addEventListener('keydown', (e) => this.onKey(e));
      this.updateMute();
      this.showMenu();
    }

    startRun() {
      OO.Audio.init();
      OO.Audio.play('select');
      this.g.start(this.selectedChar);
    }

    /** Results screen 'Deploy again': solo restarts; co-op goes back to the shared lobby. */
    retry() {
      if (this.g.coop && this.g.net) { this.g.backToLobby(); return; }
      this.startRun();
    }

    // ------------------------------------------------------------ co-op lobby
    bindCoop() {
      $('btn-coop').addEventListener('click', () => { OO.Audio.init(); this.renderCoop({ view: 'choose' }); });
      $('coop-host').addEventListener('click', () => this.g.hostSession(this.selectedChar));
      $('coop-join').addEventListener('click', () => this.joinFromInput());
      $('coop-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinFromInput(); });
      $('coop-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });
      $('coop-deploy').addEventListener('click', () => this.g.coopDeploy());
      $('coop-leave').addEventListener('click', () => { this.g.leaveSession(); this.renderCoop({ view: 'choose' }); });
      $('coop-back').addEventListener('click', () => { this.g.leaveSession(); this.showMenu(); });
      const relayState = () => {
        const r = OO.Net.relaySettings();
        $('relay-state').textContent = r.server ? 'Your relay is on' : 'Using public relays';
      };
      const fillRelay = () => {
        const r = OO.Net.relaySettings();
        $('relay-server').value = r.server || ''; $('relay-user').value = r.username || ''; $('relay-pass').value = r.credential || '';
        relayState();
      };
      $('relay-save').addEventListener('click', () => {
        OO.Net.saveRelaySettings({ server: $('relay-server').value, username: $('relay-user').value, credential: $('relay-pass').value });
        relayState();
        $('relay-state').textContent += ' · saved';
      });
      $('relay-clear').addEventListener('click', () => { OO.Net.saveRelaySettings({}); fillRelay(); });
      fillRelay();
    }

    joinFromInput() {
      const code = $('coop-code').value.trim();
      if (!/^\d{3}$/.test(code)) { this.renderCoop({ view: 'choose', error: 'Room codes are 3 digits, like 427.' }); return; }
      this.g.joinSession(code, this.selectedChar);
    }

    /**
     * view: 'choose' (Host or Join) | 'room' (code, status, roster).
     * Other fields: code, status, roster [{tag, name, you, host, pending}], canDeploy, isHost, error, notice, busy.
     */
    renderCoop(v) {
      this.hideAll();
      $('coop-choose').hidden = v.view !== 'choose';
      $('coop-room').hidden = v.view !== 'room';
      $('coop-error').hidden = !v.error;
      $('coop-error').textContent = v.error || '';
      $('coop-host').disabled = !!v.busy;
      $('coop-join').disabled = !!v.busy;
      if (v.view === 'choose' && v.status) { $('coop-error').hidden = false; $('coop-error').textContent = v.status; }
      if (v.notice) { $('coop-error').hidden = false; $('coop-error').textContent = v.notice; }
      $('coop-error').className = v.error ? 'coop-error' : 'coop-notice';
      $('coop-relay').hidden = v.view === 'room';
      if (v.view === 'room') {
        $('coop-room-code').textContent = v.code || '---';
        $('coop-status').textContent = v.status || '';
        $('coop-roster').innerHTML = (v.roster || []).map((r) =>
          `<li${r.pending ? ' class="pending"' : ''}><b class="tag-${esc(r.tag)}">${esc(r.tag)}</b> ${esc(r.name)}${r.you ? ' <em>(you)</em>' : ''}${r.host ? ' <em>host</em>' : ''}</li>`).join('');
        $('coop-deploy').hidden = !v.isHost;
        $('coop-deploy').disabled = !v.canDeploy;
      }
      $('coop-selected').textContent = OO.CHARACTERS[this.selectedChar].name;
      $('screen-coop').hidden = false;
    }

    /** Co-op supply case: a toast instead of a pause screen, so your partner keeps playing. */
    chestToast(results, credits) {
      const el = $('toast');
      el.innerHTML = '<p class="toast-title">Supply case</p>' + results.map((d) =>
        `<p class="${d.evolved ? 'evo' : ''}"><img src="${OO.Icons.url(d.icon, 20, d.evolved ? '#ff6f4a' : '#e3a33b')}" alt=""> <strong>${esc(d.name)}</strong> <em>${esc(d.badge)}</em></p>`).join('')
        + `<p><img src="${OO.Icons.url('credits', 20, '#e3a33b')}" alt=""> <strong>+${credits} credits</strong></p>`;
      el.hidden = false;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => { el.hidden = true; }, 4500);
    }

    // ------------------------------------------------------------ menu
    buildMenu() {
      const list = $('char-list');
      list.innerHTML = '';
      for (const id in OO.CHARACTERS) {
        const c = OO.CHARACTERS[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'char-tab';
        b.id = 'char-' + id;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(id === this.selectedChar));
        b.innerHTML = `<span class="char-thumb"></span><span class="char-tab-name">${esc(c.name.split(' ')[0])}</span>`;
        b.addEventListener('click', () => this.selectChar(id));
        list.appendChild(b);
      }
      this.refreshDossier();
    }

    /** The operative dossier on the main menu: big portrait in the equipped outfit plus the facts. */
    refreshDossier() {
      const id = this.selectedChar, c = OO.CHARACTERS[id], w = OO.WEAPONS[c.weapon];
      const skin = OO.Characters.skinOf(id, this.g.skinFor(id));
      const wrap = $('dossier-portrait');
      wrap.innerHTML = '';
      wrap.appendChild(OO.Characters.portraitElement(id, skin.id, 228, 'portrait'));
      $('dossier-name').textContent = c.name;
      $('dossier-role').textContent = c.role;
      $('dossier-weapon').textContent = w.name;
      $('dossier-bonus').textContent = c.bonusText;
      $('dossier-outfit').textContent = skin.name;
      for (const cid in OO.CHARACTERS) {
        const thumb = $('char-' + cid).querySelector('.char-thumb');
        thumb.innerHTML = '';
        thumb.appendChild(OO.Characters.portraitElement(cid, this.g.skinFor(cid), 54, 'thumb'));
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
      $('set-fx').textContent = 'Atmosphere: ' + ({ auto: 'auto', high: 'high', low: 'low' }[s.fx] || 'auto');
      $('set-fx').title = 'Haze, dust and film grain. Auto turns them down if the frame rate drops.';
    }

    selectChar(id) {
      this.selectedChar = id;
      U.storage.set('oo.char', id);
      for (const cid in OO.CHARACTERS) $('char-' + cid).setAttribute('aria-checked', String(cid === id));
      this.refreshDossier();
      OO.Audio.init();
      OO.Audio.play('select');
    }

    showMenu() {
      this.hideAll();
      const r = this.g.records;
      $('records').textContent = r.runs
        ? `Longest survival ${U.formatTime(r.bestTime)} · Most kills ${r.bestKills} · Evacuated ${r.wins} of ${r.runs} runs`
        : 'No runs on file yet.';
      this.refreshDossier();
      $('screen-menu').hidden = false;
      this.startMenuEcg();
    }

    /** The heartbeat line under the logo. Runs only while the menu is on screen. */
    startMenuEcg() {
      if (this._ecgRun) return;
      const c = $('menu-ecg');
      this._ecgRun = true;
      const loop = (now) => {
        if ($('screen-menu').hidden) { this._ecgRun = false; return; }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        OO.ECG.draw(ctx, 0, 0, w, h, now / 1000, { bpm: 64, color: '#52e6c6', reduced: this.g.reducedMotion, grid: false });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    hideAll() { for (const s of this.screens) $(s).hidden = true; }

    setHud(on) { $('hud-buttons').hidden = !on; }

    updateMute() {
      const m = this.g.settings.muted;
      $('btn-mute').textContent = m ? 'Sound off' : 'Sound on';
      $('btn-mute').setAttribute('aria-pressed', String(!m));
    }

    // ------------------------------------------------------------ armory
    showArmory(tab) {
      this.hideAll();
      const g = this.g;
      this.armoryTab = tab || this.armoryTab || 'upgrades';
      const wardrobe = this.armoryTab === 'wardrobe';
      $('tab-upgrades').setAttribute('aria-selected', String(!wardrobe));
      $('tab-wardrobe').setAttribute('aria-selected', String(wardrobe));
      $('armory-upgrades').hidden = wardrobe;
      $('armory-wardrobe').hidden = !wardrobe;
      $('armory-refund').hidden = wardrobe;
      $('armory-bank').textContent = g.meta.bank.toLocaleString();
      if (wardrobe) this.renderWardrobe(); else this.renderUpgrades();
      $('screen-armory').hidden = false;
    }

    renderUpgrades() {
      const g = this.g, list = $('armory-list');
      list.innerHTML = '';
      for (const item of OO.ARMORY) {
        const r = g.rank(item.id), maxed = r >= item.max, cost = maxed ? 0 : item.cost[r];
        const row = document.createElement('div');
        row.className = 'armory-item' + (maxed ? ' maxed' : '');
        const pips = Array.from({ length: item.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
        row.innerHTML = `
          <img src="${OO.Icons.url(item.icon, 28, '#52e6c6')}" alt="">
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
        b.addEventListener('click', () => { if (g.buyArmory(item.id)) { OO.Audio.init(); OO.Audio.play('chest'); this.showArmory('upgrades'); } });
        row.appendChild(b);
        list.appendChild(row);
      }
    }

    /** Wardrobe: five outfits per operative. Buy with banked credits, then equip. */
    renderWardrobe() {
      const g = this.g, cid = this.wardrobeChar in OO.CHARACTERS ? this.wardrobeChar : this.selectedChar;
      $('skin-cost').textContent = OO.SKIN_COST.toLocaleString();
      const seg = $('wardrobe-chars');
      seg.innerHTML = '';
      for (const id in OO.CHARACTERS) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'seg-btn';
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === cid));
        b.textContent = OO.CHARACTERS[id].name;
        b.addEventListener('click', () => { this.wardrobeChar = id; this.showArmory('wardrobe'); });
        seg.appendChild(b);
      }
      const list = $('wardrobe-list');
      list.innerHTML = '';
      const equipped = g.skinFor(cid);
      for (const skin of OO.SKINS[cid]) {
        const owned = g.ownsSkin(cid, skin.id), on = equipped === skin.id;
        const card = document.createElement('article');
        card.className = 'outfit' + (on ? ' equipped' : '') + (owned ? '' : ' locked');
        const fig = document.createElement('div');
        fig.className = 'outfit-fig';
        fig.appendChild(OO.Characters.portraitElement(cid, skin.id, 132, 'portrait'));
        card.appendChild(fig);
        const body = document.createElement('div');
        body.className = 'outfit-body';
        body.innerHTML = `<h3 class="outfit-name">${esc(skin.name)}</h3><p class="outfit-text">${esc(skin.text)}</p>`;
        const b = document.createElement('button');
        b.type = 'button';
        if (on) { b.className = 'btn-small btn-equipped'; b.textContent = 'Equipped'; b.disabled = true; }
        else if (owned) {
          b.className = 'btn-small'; b.textContent = 'Equip';
          b.addEventListener('click', () => { g.equipSkin(cid, skin.id); OO.Audio.init(); OO.Audio.play('select'); this.showArmory('wardrobe'); });
        } else {
          const short = skin.cost - g.meta.bank;
          b.className = 'btn-small btn-buy'; b.textContent = 'Buy ' + skin.cost.toLocaleString() + ' cr';
          b.disabled = short > 0;
          if (short > 0) b.title = 'You need ' + short.toLocaleString() + ' more credits';
          b.addEventListener('click', () => { if (g.buySkin(cid, skin.id)) { OO.Audio.init(); OO.Audio.play('chest'); this.showArmory('wardrobe'); } });
        }
        body.appendChild(b);
        card.appendChild(body);
        list.appendChild(card);
      }
    }

    // ------------------------------------------------------------ level up
    /** descs: already-described options (from Game.describeUpgrade, or sent by the co-op host). */
    showLevelUp(descs, level, rerolls) {
      this.options = descs;
      this.waiting = false;
      this.lockUntil = performance.now() + 350;   // stop a held key or stray tap from picking blind
      $('lu-level').textContent = level;
      $('reroll-n').textContent = '(' + rerolls + ' left)';
      $('btn-reroll').disabled = rerolls <= 0;
      $('lu-cards').hidden = false;
      $('lu-actions').hidden = false;
      $('lu-wait').hidden = true;
      const wrap = $('lu-cards');
      wrap.innerHTML = '';
      descs.forEach((d, i) => {
        const b = document.createElement('button');
        b.className = 'card' + (d.isNew ? ' card-new' : '');
        b.innerHTML = `
          <span class="card-top">
            <span class="card-key">${i + 1}</span>
            <span class="card-type">${esc(d.type)}</span>
            <span class="card-badge">${esc(d.badge)}</span>
          </span>
          <img class="card-icon" src="${OO.Icons.url(d.icon, 40, d.isNew ? '#f2b23a' : '#52e6c6')}" alt="">
          <span class="card-name">${esc(d.name)}</span>
          <span class="card-text">${esc(d.text)}</span>`;
        b.addEventListener('click', () => this.pick(i));
        wrap.appendChild(b);
      });
      $('screen-levelup').hidden = false;
    }

    pick(i) {
      if (performance.now() < this.lockUntil || this.waiting) return;
      if (this.options[i]) this.g.pickUpgrade(i);
    }

    /** Co-op: you've chosen; the game resumes once your partner has too. */
    showLevelWait(name) {
      this.waiting = true;
      $('lu-cards').hidden = true;
      $('lu-actions').hidden = true;
      $('lu-wait').textContent = name ? 'Waiting for ' + name + ' to choose…' : 'Waiting for your partner to choose…';
      $('lu-wait').hidden = false;
      $('screen-levelup').hidden = false;
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
      $('pause-coop').hidden = !this.g.coop;
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
      const team = r.coop && r.team ? ' · Co-op: ' + r.team.map((t) => esc(t.tag + ' ' + t.name)).join(', ') : '';
      const locked = Object.keys(OO.SKINS).some((c) => OO.SKINS[c].some((k) => !this.g.ownsSkin(c, k.id)));
      const toGo = OO.SKIN_COST - r.bank;
      const outfit = !locked ? '' : toGo > 0 ? ` · ${toGo.toLocaleString()} more for a new outfit` : ' · Enough for a new outfit in the Wardrobe';
      $('res-payout').innerHTML = `Banked <strong>+${r.payout.toLocaleString()}</strong> credits for the Armory (${r.bank.toLocaleString()} total) · ${esc(r.difficulty)}${team}${outfit}`;
      $('btn-retry').textContent = r.coop && this.g.net ? 'Back to lobby' : 'Deploy again';
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
        else if (!locked && !this.waiting && (e.key === 'r' || e.key === 'R')) this.g.requestReroll();
        else if (!locked && !this.waiting && (e.key === 'x' || e.key === 'X')) this.g.requestSkip();
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
        if (!locked && e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') this.retry();
      }
    }
  }

  OO.UI = UI;
})(window.OO = window.OO || {});
