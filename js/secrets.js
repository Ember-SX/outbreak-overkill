/*
 * Secret codes. Purely cosmetic, so they never touch balance or records (finding one does unlock
 * its Classified achievement in the Dossier).
 *
 *   BISCUIT                      type it anywhere (menu, pause, mid-run): every infected grows
 *                                bunny ears in Biscuit's honour. On touch screens, tap the
 *                                OVERKILL wordmark seven times.
 *   Up Up Down Down Left Right Left Right B A
 *                                "VHS tape" mode: scanlines, colour bleed, tracking noise and a
 *                                camcorder overlay, like found footage from the outbreak.
 *
 * Once found, each one gets an on/off switch on the pause screen. State lives in
 * game.settings.secrets = { found: [...], ears: bool, vhs: bool }.
 */
(function (OO) {
  'use strict';

  const CODES = [
    { id: 'ears', name: 'Bunny ears', seq: 'BISCUIT'.split(''), on: 'Biscuit approves. Bunny ears for everyone', off: 'Bunny ears off' },
    { id: 'vhs', name: 'VHS tape', seq: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'], on: 'Recovered tape loaded. Press play', off: 'Tape ejected' },
  ];
  const LONGEST = Math.max(...CODES.map((c) => c.seq.length));

  class Secrets {
    constructor(game) {
      this.g = game;
      const s = game.settings.secrets;
      game.settings.secrets = Object.assign({ found: [], ears: false, vhs: false }, s && typeof s === 'object' ? s : {});
      this.buf = [];
      this.taps = 0; this.tapT = 0;
      window.addEventListener('keydown', (e) => this.onKey(e));
      const mark = document.querySelector('.logo-bottom');
      if (mark) mark.addEventListener('click', () => this.onTap());
    }

    get state() { return this.g.settings.secrets; }
    isOn(id) { return !!this.state[id]; }
    found(id) { return this.state.found.includes(id); }

    onKey(e) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      this.buf.push(k);
      if (this.buf.length > LONGEST) this.buf.shift();
      for (const c of CODES) {
        const tail = this.buf.slice(-c.seq.length);
        if (tail.length === c.seq.length && tail.every((v, i) => v === c.seq[i])) { this.buf = []; this.toggle(c.id, true); }
      }
    }

    /** Touch fallback for the bunny ears: seven quick taps on the wordmark. */
    onTap() {
      const now = performance.now();
      this.taps = now - this.tapT < 700 ? this.taps + 1 : 1;
      this.tapT = now;
      if (this.taps >= 7) { this.taps = 0; this.toggle('ears', true); }
    }

    toggle(id, announce) {
      const c = CODES.find((x) => x.id === id), S = this.state;
      if (!S.found.includes(id)) S.found.push(id);
      if (this.g.progress) this.g.progress.unlock(id === 'ears' ? 'bunny' : 'footage');   // Dossier > Achievements > Classified
      S[id] = !S[id];
      OO.U.storage.set('oo.settings', this.g.settings);
      if (id === 'ears' && this.g.renderer) this.g.renderer.cache.clear();     // sprites are cached with or without ears
      if (announce) {
        OO.Audio.init();
        OO.Audio.play(id === 'ears' ? 'squeak' : 'lockon');
        this.g.ui.banner(S[id] ? c.on : c.off, 'good');
      }
      this.g.ui.updateSettings();
    }

    /** Pause-screen switches for the codes you've found. */
    settingButtons() {
      return CODES.filter((c) => this.found(c.id)).map((c) => ({ id: c.id, label: c.name + ': ' + (this.isOn(c.id) ? 'on' : 'off') }));
    }
  }

  OO.Secrets = Secrets;
  OO.SECRET_CODES = CODES;
})(window.OO = window.OO || {});
