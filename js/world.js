/*
 * World: procedural obstacles (wrecked cars, barriers, dumpsters, pillars, barrels).
 *
 * The map is infinite, so it is cut into CHUNK-sized squares. Each chunk's obstacles come
 * from a seeded RNG keyed on the chunk coordinates: walk away and come back, and the same
 * wreck is still there. Only chunks near the player are kept in memory.
 *
 * Shapes are axis-aligned rectangles (x, y = centre; hw, hh = half sizes) or circles.
 * A small uniform grid indexes the active obstacles for collision and line-of-sight queries.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const CHUNK = 640;
  const CELL = 128;
  const KEEP = 2;          // chunks around the player that are active (5x5)
  const SAFE_START = 190;  // keep the spawn point clear

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(cx, cy, seed) {
    let h = seed ^ Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return h ^ (h >>> 16);
  }

  // type -> [weight, factory(rnd)]
  const KINDS = {
    car:      [5, (r) => { const v = r() < 0.5; return { kind: 'rect', hw: v ? 23 : 46, hh: v ? 46 : 23, tint: Math.floor(r() * 4) }; }],
    barrier:  [4, (r) => { const v = r() < 0.5; return { kind: 'rect', hw: v ? 12 : 62, hh: v ? 62 : 12 }; }],
    dumpster: [2, (r) => { const v = r() < 0.5; return { kind: 'rect', hw: v ? 21 : 36, hh: v ? 36 : 21 }; }],
    bus:      [1, (r) => { const v = r() < 0.5; return { kind: 'rect', hw: v ? 30 : 84, hh: v ? 84 : 30 }; }],
    pillar:   [2, () => ({ kind: 'circle', r: 24 })],
    barrels:  [3, () => ({ kind: 'circle', r: 17 })],
  };
  const KIND_TABLE = Object.keys(KINDS).map((k) => [k, KINDS[k][0]]);

  function bounds(o) {
    if (o.kind === 'circle') { o.minX = o.x - o.r; o.maxX = o.x + o.r; o.minY = o.y - o.r; o.maxY = o.y + o.r; }
    else { o.minX = o.x - o.hw; o.maxX = o.x + o.hw; o.minY = o.y - o.hh; o.maxY = o.y + o.hh; }
    return o;
  }

  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.chunks = new Map();
      this.list = [];
      this.cells = new Map();
      this.stamp = 0;
      this.lcx = null; this.lcy = null;
    }

    generate(cx, cy) {
      const rnd = mulberry32(hash(cx, cy, this.seed));
      const out = [];
      const want = 3 + Math.floor(rnd() * 4);
      for (let attempt = 0; attempt < want * 4 && out.length < want; attempt++) {
        let type = KIND_TABLE[0][0];
        let roll = rnd() * KIND_TABLE.reduce((a, k) => a + k[1], 0);
        for (const [k, w] of KIND_TABLE) { roll -= w; if (roll <= 0) { type = k; break; } }
        const o = KINDS[type][1](rnd);
        o.type = type;
        o.seed = rnd();
        o.x = cx * CHUNK + 70 + rnd() * (CHUNK - 140);
        o.y = cy * CHUNK + 70 + rnd() * (CHUNK - 140);
        bounds(o);
        if (Math.abs(o.x) < SAFE_START + 90 && Math.abs(o.y) < SAFE_START + 90) continue;
        // keep at least a corridor (60 units) between obstacles so nothing gets sealed in
        let clash = false;
        for (const q of out) {
          if (o.minX - 60 < q.maxX && o.maxX + 60 > q.minX && o.minY - 60 < q.maxY && o.maxY + 60 > q.minY) { clash = true; break; }
        }
        if (!clash) out.push(o);
      }
      return out;
    }

    /** Call every frame with the player position; rebuilds the active set when the chunk changes. */
    update(px, py) {
      const cx = Math.floor(px / CHUNK), cy = Math.floor(py / CHUNK);
      if (cx === this.lcx && cy === this.lcy) return;
      this.lcx = cx; this.lcy = cy;
      this.list = [];
      for (let dx = -KEEP; dx <= KEEP; dx++) {
        for (let dy = -KEEP; dy <= KEEP; dy++) {
          const k = (cx + dx) + ',' + (cy + dy);
          let c = this.chunks.get(k);
          if (!c) { c = this.generate(cx + dx, cy + dy); this.chunks.set(k, c); }
          for (const o of c) this.list.push(o);
        }
      }
      for (const [k] of this.chunks) {
        const [kx, ky] = k.split(',').map(Number);
        if (Math.abs(kx - cx) > KEEP + 2 || Math.abs(ky - cy) > KEEP + 2) this.chunks.delete(k);
      }
      this.cells.clear();
      for (const o of this.list) {
        for (let gx = Math.floor(o.minX / CELL); gx <= Math.floor(o.maxX / CELL); gx++) {
          for (let gy = Math.floor(o.minY / CELL); gy <= Math.floor(o.maxY / CELL); gy++) {
            const key = gx * 100003 + gy;
            let b = this.cells.get(key);
            if (!b) { b = []; this.cells.set(key, b); }
            b.push(o);
          }
        }
      }
    }

    /** Obstacles whose bounds touch the box around (x, y) +- r. Deduplicated. */
    query(x, y, r, out) {
      out.length = 0;
      const s = ++this.stamp;
      for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
        for (let gy = Math.floor((y - r) / CELL); gy <= Math.floor((y + r) / CELL); gy++) {
          const b = this.cells.get(gx * 100003 + gy);
          if (!b) continue;
          for (const o of b) if (o._s !== s) { o._s = s; out.push(o); }
        }
      }
      return out;
    }

    /** Push a circle out of every obstacle it overlaps. Returns the last obstacle hit, or null. */
    resolveCircle(ent, r) {
      const buf = this._rb || (this._rb = []);
      this.query(ent.x, ent.y, r, buf);
      let hit = null;
      for (const o of buf) {
        if (o.kind === 'circle') {
          const dx = ent.x - o.x, dy = ent.y - o.y, min = r + o.r, d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.001;
          ent.x = o.x + (dx / d) * min; ent.y = o.y + (dy / d) * min;
          hit = o;
        } else {
          const nx = U.clamp(ent.x, o.minX, o.maxX), ny = U.clamp(ent.y, o.minY, o.maxY);
          const dx = ent.x - nx, dy = ent.y - ny, d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            ent.x = nx + (dx / d) * r; ent.y = ny + (dy / d) * r;
          } else {
            // centre is inside the box: leave by the nearest face
            const l = ent.x - o.minX, rr = o.maxX - ent.x, t = ent.y - o.minY, b = o.maxY - ent.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) ent.x = o.minX - r; else if (m === rr) ent.x = o.maxX + r;
            else if (m === t) ent.y = o.minY - r; else ent.y = o.maxY + r;
          }
          hit = o;
        }
      }
      return hit;
    }

    /** First obstacle overlapping a circle, without moving anything. */
    hitCircle(x, y, r) {
      const buf = this._hb || (this._hb = []);
      this.query(x, y, r, buf);
      for (const o of buf) {
        if (o.kind === 'circle') { if (U.dist2(x, y, o.x, o.y) < (r + o.r) ** 2) return o; }
        else {
          const nx = U.clamp(x, o.minX, o.maxX), ny = U.clamp(y, o.minY, o.maxY);
          if (U.dist2(x, y, nx, ny) < r * r) return o;
        }
      }
      return null;
    }

    /** True if the straight line between two points passes through an obstacle. */
    blocked(x0, y0, x1, y1) {
      const buf = this._lb || (this._lb = []);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      this.query(mx, my, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2 + 4, buf);
      const dx = x1 - x0, dy = y1 - y0;
      for (const o of buf) {
        if (o.kind === 'circle') {
          const fx = x0 - o.x, fy = y0 - o.y;
          const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - o.r * o.r;
          if (c < 0) return true;
          const disc = b * b - 4 * a * c;
          if (disc < 0 || a === 0) continue;
          const sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
          if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return true;
        } else {
          // slab test
          let tmin = 0, tmax = 1;
          if (Math.abs(dx) < 1e-9) { if (x0 < o.minX || x0 > o.maxX) continue; }
          else {
            let ta = (o.minX - x0) / dx, tb = (o.maxX - x0) / dx;
            if (ta > tb) [ta, tb] = [tb, ta];
            tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
            if (tmin > tmax) continue;
          }
          if (Math.abs(dy) < 1e-9) { if (y0 < o.minY || y0 > o.maxY) continue; }
          else {
            let ta = (o.minY - y0) / dy, tb = (o.maxY - y0) / dy;
            if (ta > tb) [ta, tb] = [tb, ta];
            tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
            if (tmin > tmax) continue;
          }
          return true;
        }
      }
      return false;
    }
  }

  World.CHUNK = CHUNK;
  OO.World = World;
})(window.OO = window.OO || {});
