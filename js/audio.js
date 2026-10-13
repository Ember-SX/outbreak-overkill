/*
 * Synthesised sound effects with the Web Audio API — no audio files needed yet.
 * Swap any case in play() for a sample later without touching game code.
 */
(function (OO) {
  'use strict';

  const A = { ctx: null, master: null, muted: false, last: {}, noiseBuf: null, volume: 0.5 };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : A.volume;
      A.master.connect(A.ctx.destination);
      const len = A.ctx.sampleRate;
      A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = A.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      startAmbience();
    } catch (e) { A.ctx = null; }
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.master) A.master.gain.value = m ? 0 : A.volume;
  };

  function throttle(name, ms) {
    const now = performance.now();
    if (A.last[name] && now - A.last[name] < ms) return false;
    A.last[name] = now;
    return true;
  }

  function tone({ type = 'square', f = 440, f2 = 0, dur = 0.1, vol = 0.2, delay = 0 }) {
    const t = A.ctx.currentTime + delay;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise({ dur = 0.1, vol = 0.3, freq = 1000, f2 = 0, q = 1, type = 'lowpass', delay = 0 }) {
    const t = A.ctx.currentTime + delay;
    const s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf;
    const fl = A.ctx.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(A.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  function startAmbience() {
    // Low detuned drone through a slowly breathing filter: the "something is wrong here" bed.
    const ctx = A.ctx;
    const g = ctx.createGain(); g.gain.value = 0.045;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency);
    [55, 55.6, 82.4].forEach((hz) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      o.connect(f); o.start();
    });
    f.connect(g); g.connect(A.master); lfo.start();
  }

  A.play = function (name, opt) {
    if (!A.ctx || A.muted) return;
    switch (name) {
      case 'pistol':
        if (!throttle(name, 55)) return;
        noise({ dur: 0.07, vol: 0.22, freq: 2600, f2: 600 });
        tone({ type: 'square', f: 240, f2: 70, dur: 0.06, vol: 0.06 });
        break;
      case 'shotgun':
        if (!throttle(name, 80)) return;
        noise({ dur: 0.28, vol: 0.45, freq: 2200, f2: 180 });
        tone({ type: 'sine', f: 130, f2: 40, dur: 0.22, vol: 0.3 });
        break;
      case 'knife':
        if (!throttle(name, 60)) return;
        noise({ dur: 0.09, vol: 0.14, freq: 5000, f2: 1400, type: 'bandpass', q: 2 });
        break;
      case 'tesla':
        if (!throttle(name, 70)) return;
        tone({ type: 'sawtooth', f: 1200, f2: 160, dur: 0.16, vol: 0.06 });
        noise({ dur: 0.14, vol: 0.12, freq: 6000, type: 'highpass' });
        break;
      case 'throw':
        if (!throttle(name, 80)) return;
        tone({ type: 'triangle', f: 300, f2: 500, dur: 0.12, vol: 0.05 });
        break;
      case 'ignite':
        if (!throttle(name, 90)) return;
        noise({ dur: 0.4, vol: 0.25, freq: 900, f2: 200 });
        break;
      case 'rumble':
        // the ground starts shaking: long sub-bass swell
        noise({ dur: 3.0, vol: 0.5, freq: 60, f2: 300, q: 3 });
        tone({ type: 'sine', f: 30, f2: 52, dur: 3.0, vol: 0.38 });
        tone({ type: 'triangle', f: 41, f2: 70, dur: 3.0, vol: 0.12 });
        break;
      case 'shriek': {
        // distant screaming pack; opt = loudness 0..1
        const v = opt || 0.6;
        for (let i = 0; i < 3; i++) {
          tone({ type: 'sawtooth', f: 700 + i * 170, f2: 1500 + i * 220, dur: 0.38, vol: 0.035 * v, delay: i * 0.07 });
        }
        noise({ dur: 0.4, vol: 0.12 * v, freq: 2600, type: 'bandpass', q: 3 });
        break;
      }
      case 'stampede':
        noise({ dur: 1.1, vol: 0.3, freq: 300, f2: 1400, type: 'bandpass', q: 1 });
        break;
      case 'evolve':
        [262, 392, 523, 784, 1046].forEach((f, i) => tone({ type: 'sawtooth', f, dur: 0.3, vol: 0.06, delay: i * 0.06 }));
        noise({ dur: 0.6, vol: 0.15, freq: 4000, f2: 800, type: 'bandpass', q: 1 });
        break;
      case 'ricochet':
        if (!throttle(name, 70)) return;
        tone({ type: 'triangle', f: 2400, f2: 1400, dur: 0.07, vol: 0.05 });
        break;
      case 'gurgle':
        if (!throttle(name, 160)) return;
        tone({ type: 'sine', f: 110, f2: 300, dur: 0.5, vol: 0.07 });
        noise({ dur: 0.45, vol: 0.05, freq: 500, f2: 1400, type: 'bandpass', q: 4 });
        break;
      case 'spit':
        if (!throttle(name, 90)) return;
        noise({ dur: 0.18, vol: 0.18, freq: 1600, f2: 400, type: 'bandpass', q: 2 });
        tone({ type: 'sine', f: 320, f2: 140, dur: 0.14, vol: 0.08 });
        break;
      case 'splat':
        if (!throttle(name, 90)) return;
        noise({ dur: 0.28, vol: 0.2, freq: 900, f2: 160 });
        break;
      case 'saw':
        if (!throttle(name, 400)) return;
        tone({ type: 'sawtooth', f: 90, f2: 140, dur: 0.3, vol: 0.03 });
        break;
      case 'hit':
        if (!throttle(name, 45)) return;
        tone({ type: 'triangle', f: 190, f2: 90, dur: 0.05, vol: 0.06 });
        break;
      case 'kill':
        if (!throttle(name, 50)) return;
        noise({ dur: 0.1, vol: 0.16, freq: 700, f2: 120 });
        tone({ type: 'sine', f: 95, f2: 45, dur: 0.09, vol: 0.12 });
        break;
      case 'explode':
        if (!throttle(name, 90)) return;
        noise({ dur: 0.55, vol: 0.45, freq: 900, f2: 60 });
        tone({ type: 'sine', f: 80, f2: 30, dur: 0.4, vol: 0.35 });
        break;
      case 'xp': {
        if (!throttle(name, 28)) return;
        const step = Math.min(opt || 0, 24);
        tone({ type: 'sine', f: 620 + step * 28, dur: 0.06, vol: 0.05 });
        break;
      }
      case 'crate':
        noise({ dur: 0.18, vol: 0.25, freq: 1400, f2: 300, type: 'bandpass', q: 1.5 });
        break;
      case 'herb':
        tone({ type: 'sine', f: 520, f2: 880, dur: 0.25, vol: 0.12 });
        break;
      case 'levelup':
        [440, 554, 659, 880].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.18, vol: 0.1, delay: i * 0.07 }));
        break;
      case 'chest':
        [330, 415, 494, 659, 830].forEach((f, i) => tone({ type: 'square', f, dur: 0.16, vol: 0.05, delay: i * 0.09 }));
        break;
      case 'select':
        tone({ type: 'square', f: 660, f2: 990, dur: 0.08, vol: 0.06 });
        break;
      case 'hurt':
        if (!throttle(name, 150)) return;
        tone({ type: 'sawtooth', f: 140, f2: 55, dur: 0.22, vol: 0.18 });
        break;
      case 'heartbeat':
        tone({ type: 'sine', f: 62, f2: 40, dur: 0.14, vol: 0.4 });
        tone({ type: 'sine', f: 58, f2: 38, dur: 0.12, vol: 0.3, delay: 0.2 });
        break;
      case 'boss':
        tone({ type: 'sawtooth', f: 55, f2: 48, dur: 1.6, vol: 0.22 });
        tone({ type: 'sawtooth', f: 58.3, f2: 50, dur: 1.6, vol: 0.18 });
        noise({ dur: 1.2, vol: 0.12, freq: 300, f2: 80 });
        break;
      case 'airstrike':
        noise({ dur: 1.2, vol: 0.6, freq: 1500, f2: 50 });
        tone({ type: 'sine', f: 70, f2: 25, dur: 1.0, vol: 0.4 });
        break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.4, vol: 0.12, delay: i * 0.22 }));
        break;
      case 'victory':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.3, vol: 0.1, delay: i * 0.12 }));
        break;
    }
  };

  OO.Audio = A;
})(window.OO = window.OO || {});
