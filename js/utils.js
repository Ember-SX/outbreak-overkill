/* Small math helpers, weighted random, storage wrapper and a spatial hash for collision queries. */
(function (OO) {
  'use strict';

  const U = {};
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  /** items: [[value, weight], ...] */
  U.weightedPick = (items) => {
    let total = 0;
    for (const it of items) total += it[1];
    let r = Math.random() * total;
    for (const it of items) { r -= it[1]; if (r <= 0) return it[0]; }
    return items[items.length - 1][0];
  };

  U.shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  U.formatTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  // localStorage can throw (private mode, sandboxed frames), so every access is guarded.
  U.storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };

  /** Uniform grid bucketed by cell. Rebuilt every frame; query() fills a caller-owned array. */
  class SpatialHash {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    clear() { this.map.clear(); }
    _key(cx, cy) { return (cx + 50000) * 100000 + (cy + 50000); }
    insert(e) {
      const k = this._key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
      let b = this.map.get(k);
      if (!b) { b = []; this.map.set(k, b); }
      b.push(e);
    }
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const b = this.map.get(this._key(cx, cy));
          if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
        }
      }
      return out;
    }
  }
  U.SpatialHash = SpatialHash;

  OO.U = U;
})(window.OO = window.OO || {});
