/*
 * Scenery: everything that makes the ground and the air feel like a quarantined town at night.
 *
 *   - Ground detail baked per world chunk (roads with markings, crossings, drains, puddles,
 *     paper, glass, shell casings, skid marks, hazard tape, old blood pools, drag trails,
 *     bloody footprints and handprints, quarantine stencils). Seeded, so a chunk looks the
 *     same every time you pass it. Baked lazily (one chunk per frame) and kept in a small cache.
 *   - Light fixtures: sodium street lamps along the roads (some flicker) and rotating red
 *     emergency beacons. They cut through the darkness pass and add coloured glow on top.
 *   - Atmosphere: drifting haze, dust motes in the flashlight cone, vignette, film grain.
 *
 * Purely visual. Nothing here affects the simulation, so co-op partners don't need to agree on it.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const TAU = Math.PI * 2;
  const ROAD_EVERY = 2;        // a road runs through every other chunk column / row
  const ROAD_W = 230;
  const CACHE = 24;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(cx, cy, seed) {
    let h = (seed ^ 0x5bd1e995) ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return h ^ (h >>> 16);
  }
  const mod = (a, n) => ((a % n) + n) % n;

  class Scenery {
    constructor(renderer) {
      this.r = renderer;
      this.chunks = new Map();     // key -> { canvas, lamps, used }
      this.seed = 0;
      this.frame = 0;
      this.fog = this.makeFog();
      this.grain = this.makeGrain();
      this.motes = [];
      for (let i = 0; i < 46; i++) this.motes.push({ x: Math.random(), y: Math.random(), s: U.rand(0.6, 1.8), p: Math.random() * TAU });
      this.vignette = null;
      this.sprites = this.makeLightSprites();
    }

    /** Pre-rendered light shapes, so glows are cheap image blits instead of per-frame gradients. */
    makeLightSprites() {
      const make = (size, fn) => { const c = document.createElement('canvas'); c.width = c.height = size; fn(c.getContext('2d'), size / 2); return c; };
      const pool = make(400, (x, r) => {
        const g = x.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, 'rgba(255,170,80,0.2)'); g.addColorStop(0.4, 'rgba(255,140,60,0.08)'); g.addColorStop(1, 'rgba(255,120,40,0)');
        x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
      });
      const beam = make(460, (x, r) => {
        const g = x.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, 'rgba(255,40,50,0.32)'); g.addColorStop(1, 'rgba(255,20,30,0)');
        x.fillStyle = g;
        x.beginPath(); x.moveTo(r, r); x.arc(r, r, r, -0.32, 0.32); x.closePath(); x.fill();
      });
      const halo = make(80, (x, r) => {
        const g = x.createRadialGradient(r, r, 0, r, r, r);
        g.addColorStop(0, 'rgba(255,40,50,0.35)'); g.addColorStop(1, 'rgba(255,40,50,0)');
        x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2);
      });
      return { pool, beam, halo };
    }

    get CHUNK() { return OO.World.CHUNK; }

    reset(seed) {
      if (seed === this.seed) return;
      this.seed = seed | 0;
      this.chunks.clear();
    }

    // ---------------------------------------------------------------- layout rules
    roadX(cx) { return mod(cx, ROAD_EVERY) === 0; }      // vertical road through this chunk column
    roadY(cy) { return mod(cy, ROAD_EVERY) === 1; }      // horizontal road through this chunk row

    // ---------------------------------------------------------------- baking
    chunk(cx, cy, allowBake) {
      const key = cx + ',' + cy;
      let c = this.chunks.get(key);
      if (c) { c.used = this.frame; return c; }
      if (!allowBake) return null;
      c = this.bake(cx, cy);
      c.used = this.frame;
      this.chunks.set(key, c);
      if (this.chunks.size > CACHE) {
        let oldK = null, oldU = Infinity;
        for (const [k, v] of this.chunks) if (v.used < oldU) { oldU = v.used; oldK = k; }
        if (oldK) this.chunks.delete(oldK);
      }
      return c;
    }

    bake(cx, cy) {
      const S = this.CHUNK, rnd = mulberry32(hash(cx, cy, this.seed));
      const R = (a, b) => a + rnd() * (b - a);
      // Opaque tile: the base asphalt texture (aligned to world coords so it tiles seamlessly)
      // with the detail baked on top. One opaque blit per chunk replaces the base fill.
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d', { alpha: false });
      const base = this.r.groundTile, T = base.width;
      for (let tx = -mod(cx * S, T); tx < S; tx += T) for (let ty = -mod(cy * S, T); ty < S; ty += T) x.drawImage(base, tx, ty);
      const lamps = [];
      const vRoad = this.roadX(cx), hRoad = this.roadY(cy);
      const mid = S / 2, half = ROAD_W / 2;

      // ---- roads
      const road = (vertical) => {
        x.fillStyle = 'rgba(8,10,11,0.55)';
        if (vertical) x.fillRect(mid - half, 0, ROAD_W, S); else x.fillRect(0, mid - half, S, ROAD_W);
        // worn tar patches
        for (let i = 0; i < 6; i++) {
          x.fillStyle = `rgba(0,0,0,${R(0.12, 0.25)})`;
          const a = R(0, S), b = R(-half + 10, half - 30);
          if (vertical) x.fillRect(mid + b, a, R(20, 60), R(30, 90)); else x.fillRect(a, mid + b, R(30, 90), R(20, 60));
        }
        // kerbs
        x.fillStyle = 'rgba(120,128,126,0.16)';
        if (vertical) { x.fillRect(mid - half - 6, 0, 6, S); x.fillRect(mid + half, 0, 6, S); }
        else { x.fillRect(0, mid - half - 6, S, 6); x.fillRect(0, mid + half, S, 6); }
        // edge lines and the dashed centre line
        x.fillStyle = 'rgba(210,214,210,0.13)';
        if (vertical) { x.fillRect(mid - half + 10, 0, 3, S); x.fillRect(mid + half - 13, 0, 3, S); }
        else { x.fillRect(0, mid - half + 10, S, 3); x.fillRect(0, mid + half - 13, S, 3); }
        x.fillStyle = 'rgba(230,180,60,0.22)';
        for (let d = 10; d < S; d += 64) {
          if (rnd() < 0.15) continue;      // paint worn away
          if (vertical) x.fillRect(mid - 2, d, 4, 34); else x.fillRect(d, mid - 2, 34, 4);
        }
        // drains along the kerb
        for (let d = 60; d < S; d += 220) {
          x.fillStyle = 'rgba(0,0,0,0.6)';
          const gx = vertical ? mid - half + 2 : d, gy = vertical ? d : mid - half + 2;
          x.fillRect(gx, gy, vertical ? 12 : 30, vertical ? 30 : 12);
          x.strokeStyle = 'rgba(90,96,94,0.4)'; x.lineWidth = 1;
          for (let k = 3; k < (vertical ? 30 : 30); k += 5) {
            x.beginPath();
            if (vertical) { x.moveTo(gx, gy + k); x.lineTo(gx + 12, gy + k); } else { x.moveTo(gx + k, gy); x.lineTo(gx + k, gy + 12); }
            x.stroke();
          }
        }
        // street lamps on alternating sides
        for (let d = 90 + R(0, 60); d < S; d += 260) {
          const side = rnd() < 0.5 ? -1 : 1;
          const lx = vertical ? mid + side * (half + 14) : d, ly = vertical ? d : mid + side * (half + 14);
          lamps.push({ x: cx * S + lx, y: cy * S + ly, kind: 'lamp', arm: vertical ? [-side, 0] : [0, -side], phase: R(0, 100), flicker: rnd() < 0.3, dead: rnd() < 0.12 });
        }
      };
      if (vRoad) road(true);
      if (hRoad) road(false);
      if (vRoad && hRoad) {
        // intersection: clear the centre line, add crossings
        x.fillStyle = 'rgba(8,10,11,0.55)';
        x.fillRect(mid - half, mid - half, ROAD_W, ROAD_W);
        x.fillStyle = 'rgba(220,224,220,0.14)';
        for (let i = 0; i < 9; i++) {
          const o = -half + 14 + i * 24;
          x.fillRect(mid + o, mid - half - 34, 12, 26); x.fillRect(mid + o, mid + half + 8, 12, 26);
          x.fillRect(mid - half - 34, mid + o, 26, 12); x.fillRect(mid + half + 8, mid + o, 26, 12);
        }
      }
      // stencilled quarantine markings on some roads
      if ((vRoad || hRoad) && rnd() < 0.45) {
        x.save();
        const along = R(80, S - 80);
        if (vRoad) x.translate(mid + R(-half * 0.5, half * 0.5), along); else x.translate(along, mid + R(-half * 0.5, half * 0.5));
        x.rotate(vRoad ? -Math.PI / 2 : 0);
        x.font = '800 34px "Big Shoulders Stencil Display", Impact, sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = rnd() < 0.5 ? 'rgba(230,180,60,0.16)' : 'rgba(220,224,220,0.12)';
        x.fillText(['QUARANTINE', 'NO ENTRY', 'DECON  >>', 'CHECKPOINT', 'ZONE 4'][Math.floor(rnd() * 5)], 0, 0);
        x.restore();
      }

      // ---- puddles and oil
      for (let i = 0, n = Math.floor(R(1, 4)); i < n; i++) {
        const px = R(30, S - 30), py = R(30, S - 30), rw = R(20, 60), rh = rw * R(0.4, 0.8), rot = R(0, TAU);
        x.save(); x.translate(px, py); x.rotate(rot);
        x.fillStyle = 'rgba(4,10,12,0.55)';
        x.beginPath(); x.ellipse(0, 0, rw, rh, 0, 0, TAU); x.fill();
        x.beginPath(); x.ellipse(rw * 0.5, rh * 0.2, rw * 0.5, rh * 0.6, 0.4, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(120,200,200,0.1)'; x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(-rw * 0.2, -rh * 0.3, rw * 0.55, rh * 0.35, 0, Math.PI * 1.1, Math.PI * 1.7); x.stroke();
        x.restore();
      }
      for (let i = 0, n = Math.floor(R(0, 3)); i < n; i++) {
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
        x.save(); x.translate(R(0, S), R(0, S)); x.scale(R(14, 34), R(10, 24));
        g.addColorStop(0, 'rgba(10,8,14,0.5)'); g.addColorStop(0.7, 'rgba(40,20,60,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.fill();
        x.restore();
      }

      // ---- skid marks
      if (rnd() < 0.5) {
        const sx = R(60, S - 60), sy = R(60, S - 60), a = R(0, TAU), len = R(90, 220), bend = R(-0.6, 0.6);
        x.strokeStyle = 'rgba(0,0,0,0.38)'; x.lineWidth = 5; x.lineCap = 'round';
        for (const off of [-11, 11]) {
          x.beginPath();
          const ox = Math.cos(a + Math.PI / 2) * off, oy = Math.sin(a + Math.PI / 2) * off;
          x.moveTo(sx + ox, sy + oy);
          x.quadraticCurveTo(sx + ox + Math.cos(a) * len * 0.5, sy + oy + Math.sin(a) * len * 0.5,
            sx + ox + Math.cos(a + bend) * len, sy + oy + Math.sin(a + bend) * len);
          x.stroke();
        }
        x.lineCap = 'butt';
      }

      // ---- litter
      const scatter = (n, fn) => { for (let i = 0; i < n; i++) { x.save(); x.translate(R(0, S), R(0, S)); x.rotate(R(0, TAU)); fn(); x.restore(); } };
      scatter(Math.floor(R(6, 14)), () => {                         // paper
        const v = Math.floor(R(150, 200));
        x.fillStyle = `rgba(${v},${v},${v - 10},${R(0.1, 0.22)})`;
        const w = R(8, 16), h = R(10, 20);
        x.beginPath(); x.moveTo(-w / 2, -h / 2); x.lineTo(w / 2, -h / 2 + R(-2, 2)); x.lineTo(w / 2, h / 2); x.lineTo(-w / 2 + R(0, 4), h / 2); x.closePath(); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.2)'; for (let l = -h / 2 + 4; l < h / 2 - 2; l += 3) x.fillRect(-w / 2 + 2, l, w - 4, 0.7);
      });
      scatter(Math.floor(R(2, 6)), () => {                          // cans and bottles
        x.fillStyle = ['rgba(150,30,30,0.35)', 'rgba(60,110,140,0.35)', 'rgba(60,110,60,0.3)'][Math.floor(rnd() * 3)];
        x.fillRect(-5, -2.5, 10, 5); x.fillStyle = 'rgba(200,200,200,0.25)'; x.fillRect(4, -2.5, 1.5, 5);
      });
      scatter(Math.floor(R(1, 4)), () => {                          // broken glass
        for (let k = 0; k < 8; k++) {
          x.fillStyle = `rgba(170,220,225,${R(0.1, 0.3)})`;
          const gx = R(-14, 14), gy = R(-14, 14), s = R(1.5, 4);
          x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + s, gy + R(-1, 2)); x.lineTo(gx + R(-1, 2), gy + s); x.closePath(); x.fill();
        }
      });
      scatter(Math.floor(R(1, 4)), () => {                          // spent shell casings, a firefight was here
        for (let k = 0; k < 9; k++) {
          x.save(); x.translate(R(-20, 20), R(-20, 20)); x.rotate(R(0, TAU));
          x.fillStyle = 'rgba(200,160,70,0.5)'; x.fillRect(-2, -0.8, 4, 1.6);
          x.restore();
        }
      });
      if (rnd() < 0.4) scatter(1, () => {                           // torn hazard tape
        const len = R(40, 90);
        for (let d = 0; d < len; d += 8) { x.fillStyle = (d / 8) % 2 ? 'rgba(20,20,20,0.4)' : 'rgba(230,180,40,0.38)'; x.fillRect(d, Math.sin(d * 0.2) * 2, 8, 4); }
      });
      if (rnd() < 0.3) scatter(1, () => {                           // cardboard box flattened
        x.fillStyle = 'rgba(120,90,55,0.28)'; x.fillRect(-16, -12, 32, 24);
        x.strokeStyle = 'rgba(60,40,20,0.35)'; x.lineWidth = 1; x.strokeRect(-16, -12, 32, 24);
        x.beginPath(); x.moveTo(-16, 0); x.lineTo(16, 0); x.stroke();
      });

      // ---- old blood
      const bloodPool = (bx, by, r0) => {
        const n = 7 + Math.floor(rnd() * 6);
        x.fillStyle = 'rgba(52,6,6,0.45)';
        for (let k = 0; k < n; k++) { x.beginPath(); x.arc(bx + R(-r0, r0) * 0.6, by + R(-r0, r0) * 0.6, r0 * R(0.35, 0.7), 0, TAU); x.fill(); }
        x.fillStyle = 'rgba(30,2,2,0.35)';
        for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(bx + R(-r0, r0) * 0.3, by + R(-r0, r0) * 0.3, r0 * R(0.25, 0.45), 0, TAU); x.fill(); }
        x.fillStyle = 'rgba(70,10,8,0.4)';
        for (let k = 0; k < 14; k++) { const a = R(0, TAU), d = r0 * R(1, 1.9); x.beginPath(); x.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, R(0.8, 2.6), 0, TAU); x.fill(); }
      };
      for (let i = 0, n = Math.floor(R(0, 3)); i < n; i++) bloodPool(R(40, S - 40), R(40, S - 40), R(14, 30));
      if (rnd() < 0.45) {
        // a drag trail ending at a pool
        const sx = R(80, S - 80), sy = R(80, S - 80), a = R(0, TAU), len = R(80, 200);
        x.lineCap = 'round';
        for (let s = 0; s < len; s += 4) {
          const k = s / len, px = sx + Math.cos(a) * s + Math.sin(s * 0.05) * 4, py = sy + Math.sin(a) * s + Math.cos(s * 0.05) * 4;
          x.strokeStyle = `rgba(60,6,6,${0.12 + k * 0.25})`; x.lineWidth = 3 + k * 9;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5); x.stroke();
          if (rnd() < 0.15) { x.strokeStyle = 'rgba(30,2,2,0.3)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px - 4, py); x.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); x.stroke(); }
        }
        x.lineCap = 'butt';
        bloodPool(sx + Math.cos(a) * len, sy + Math.sin(a) * len, R(16, 26));
      }
      if (rnd() < 0.35) {
        // bloody footprints walking away
        let px = R(60, S - 60), py = R(60, S - 60), a = R(0, TAU);
        for (let s = 0; s < 10; s++) {
          a += R(-0.2, 0.2);
          px += Math.cos(a) * 18; py += Math.sin(a) * 18;
          const side = s % 2 ? 1 : -1;
          x.save(); x.translate(px + Math.cos(a + Math.PI / 2) * side * 5, py + Math.sin(a + Math.PI / 2) * side * 5); x.rotate(a);
          x.fillStyle = `rgba(70,8,8,${0.42 - s * 0.035})`;
          x.beginPath(); x.ellipse(2, 0, 5, 2.6, 0, 0, TAU); x.fill();
          x.beginPath(); x.ellipse(-5, 0, 2.6, 2.2, 0, 0, TAU); x.fill();
          x.restore();
        }
      }
      if (rnd() < 0.25) {
        // handprints, smeared toward one direction
        for (let h = 0; h < 2; h++) {
          x.save(); x.translate(R(40, S - 40), R(40, S - 40)); x.rotate(R(0, TAU));
          x.fillStyle = 'rgba(80,8,8,0.42)';
          x.beginPath(); x.ellipse(0, 0, 6, 7, 0, 0, TAU); x.fill();
          for (let f = 0; f < 4; f++) { x.beginPath(); x.ellipse(-4.5 + f * 3, -10, 1.3, 4, (f - 1.5) * 0.12, 0, TAU); x.fill(); }
          x.beginPath(); x.ellipse(7, -1, 1.5, 3.5, 0.9, 0, TAU); x.fill();
          x.fillStyle = 'rgba(60,6,6,0.18)'; x.fillRect(-6, 4, 12, R(10, 26));
          x.restore();
        }
      }

      // ---- an emergency beacon now and then (abandoned checkpoint light)
      if (rnd() < 0.22) lamps.push({ x: cx * S + R(80, S - 80), y: cy * S + R(80, S - 80), kind: 'beacon', phase: R(0, TAU), speed: R(2.2, 3.4) });

      return { canvas: c, lamps, used: 0 };
    }

    // ---------------------------------------------------------------- per frame
    /** Visible chunks around the camera, baking at most one new chunk per frame. */
    visible(cam, w, h) {
      this.frame++;
      const S = this.CHUNK, out = [];
      let budget = this.chunks.size === 0 ? 99 : 1;     // fresh map: bake everything on screen at once
      const x0 = Math.floor(cam.x / S), x1 = Math.floor((cam.x + w) / S), y0 = Math.floor(cam.y / S), y1 = Math.floor((cam.y + h) / S);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          let c = this.chunks.get(cx + ',' + cy);
          if (!c && budget > 0) { c = this.chunk(cx, cy, true); budget--; }
          if (!c) continue;
          c.used = this.frame;
          out.push([cx, cy, c]);
        }
      }
      return out;
    }

    /** True when every chunk on screen is already baked (then the base fill can be skipped). */
    covers(cam, w, h, seed) {
      if (seed !== this.seed) return false;
      const S = this.CHUNK;
      for (let cx = Math.floor(cam.x / S); cx <= Math.floor((cam.x + w) / S); cx++) {
        for (let cy = Math.floor(cam.y / S); cy <= Math.floor((cam.y + h) / S); cy++) if (!this.chunks.has(cx + ',' + cy)) return false;
      }
      return true;
    }

    drawGround(ctx, cam, w, h, seed) {
      const S = this.CHUNK;
      this.reset(seed);
      this.vis = this.visible(cam, w, h);
      // Only blit the part of each chunk that's on screen. Chunks not baked yet keep the plain
      // asphalt fill the renderer put down first.
      for (const [cx, cy, c] of this.vis) {
        const ox = cx * S, oy = cy * S;
        const sx = Math.max(0, Math.floor(cam.x - ox)), sy = Math.max(0, Math.floor(cam.y - oy));
        const ex = Math.min(S, Math.ceil(cam.x + w - ox)), ey = Math.min(S, Math.ceil(cam.y + h - oy));
        if (ex > sx && ey > sy) ctx.drawImage(c.canvas, sx, sy, ex - sx, ey - sy, ox + sx, oy + sy, ex - sx, ey - sy);
      }
    }

    lamps() {
      const out = [];
      if (this.vis) for (const v of this.vis) for (const l of v[2].lamps) out.push(l);
      return out;
    }

    lampIntensity(l, t) {
      if (l.kind === 'beacon') return 1;
      if (l.dead) return 0;
      if (!l.flicker) return 1;
      const k = Math.sin(t * 13 + l.phase) + Math.sin(t * 31 + l.phase * 2);
      const out = (Math.floor(t * 3 + l.phase) % 11 === 0) ? 0.15 : 1;
      return out * (k > 1.7 ? 0.35 : 1);
    }

    /** Lamp posts and beacon housings, drawn in the world layer before the darkness. */
    drawFixtures(ctx, t) {
      for (const l of this.lamps()) {
        if (!this.r.inView(l.x, l.y, 60)) continue;
        if (l.kind === 'lamp') {
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(l.x + 3, l.y + 4, 7, 4, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#2b3236'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.arm[0] * 26, l.y + l.arm[1] * 26); ctx.stroke();
          ctx.fillStyle = '#3a444a'; ctx.beginPath(); ctx.arc(l.x, l.y, 5, 0, TAU); ctx.fill();
          const on = this.lampIntensity(l, t);
          ctx.fillStyle = on > 0.5 ? '#ffd9a0' : '#4a4038';
          ctx.fillRect(l.x + l.arm[0] * 26 - 4, l.y + l.arm[1] * 26 - 4, 8, 8);
        } else {
          ctx.fillStyle = '#22282c'; ctx.fillRect(l.x - 7, l.y - 7, 14, 14);
          ctx.fillStyle = '#7a1018'; ctx.beginPath(); ctx.arc(l.x, l.y, 4.5, 0, TAU); ctx.fill();
        }
      }
    }

    /** Where the darkness pass should open up for fixtures (world coords). */
    lightSources(t) {
      const out = [];
      for (const l of this.lamps()) {
        if (l.kind === 'lamp') {
          const i = this.lampIntensity(l, t);
          if (i > 0) out.push([l.x + l.arm[0] * 26, l.y + l.arm[1] * 26, 190, 0.7 * i]);
        } else out.push([l.x, l.y, 90, 0.45]);
      }
      return out;
    }

    /** Coloured light over the darkness: sodium pools and sweeping beacon beams. */
    drawGlows(ctx, t) {
      const L = this.sprites;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lamps()) {
        if (!this.r.inView(l.x, l.y, 240)) continue;
        if (l.kind === 'lamp') {
          const i = this.lampIntensity(l, t);
          if (i <= 0) continue;
          const lx = l.x + l.arm[0] * 26, ly = l.y + l.arm[1] * 26;
          ctx.globalAlpha = i;
          ctx.drawImage(L.pool, lx - 200, ly - 200);
          ctx.fillStyle = 'rgba(255,230,180,0.8)'; ctx.fillRect(lx - 2.5, ly - 2.5, 5, 5);
        } else {
          const a = t * l.speed + l.phase;
          ctx.globalAlpha = 1;
          for (const off of [0, Math.PI]) {
            ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(a + off);
            ctx.drawImage(L.beam, -230, -230);
            ctx.restore();
          }
          ctx.drawImage(L.halo, l.x - 40, l.y - 40);
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * l.speed * 2);
          ctx.fillStyle = 'rgb(255,70,80)'; ctx.fillRect(l.x - 3, l.y - 3, 6, 6);
        }
      }
      ctx.restore();
    }

    // ---------------------------------------------------------------- atmosphere
    makeFog() {
      const S = 512, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      for (let i = 0; i < 60; i++) {
        const px = Math.random() * S, py = Math.random() * S, r = U.rand(40, 150);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
          g.addColorStop(0, 'rgba(170,210,205,0.16)'); g.addColorStop(1, 'rgba(170,210,205,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px + ox, py + oy, r, 0, TAU); x.fill();
        }
      }
      return c;
    }

    makeGrain() {
      const S = 160, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d'), img = x.createImageData(S, S);
      for (let i = 0; i < img.data.length; i += 4) {
        const light = Math.random() < 0.5;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
        img.data[i + 3] = Math.random() * 13;
      }
      x.putImageData(img, 0, 0);
      return c;
    }

    /** Drifting haze in world space, before the darkness, so it shows where light falls. */
    drawHaze(ctx, cam, w, h, t) {
      if (!this.fogPat) this.fogPat = ctx.createPattern(this.fog, 'repeat');
      ctx.save();
      ctx.globalAlpha = 0.3;
      const ox = t * 9, oy = t * 4;
      ctx.translate(ox, oy);
      ctx.fillStyle = this.fogPat;
      ctx.fillRect(cam.x - ox - 20, cam.y - oy - 20, w + 40, h + 40);
      ctx.restore();
    }

    /** Dust hanging in the flashlight beam (screen space, after the darkness). */
    drawMotes(ctx, sx, sy, ang, len, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        const d = (m.x * 0.9 + 0.08) * len, spread = (m.y - 0.5) * 0.7;
        const a = ang + spread * (0.5 + m.x * 0.5);
        const px = sx + Math.cos(a) * d + Math.sin(t * 0.7 + m.p) * 6, py = sy + Math.sin(a) * d + Math.cos(t * 0.5 + m.p) * 6;
        const fade = (1 - m.x) * (0.5 + 0.5 * Math.sin(t * 1.3 + m.p));
        ctx.fillStyle = `rgba(255,236,200,${0.22 * fade})`;
        ctx.fillRect(px, py, m.s, m.s);
      }
      ctx.restore();
    }

    /** Vignette and grain over the whole frame. */
    drawPost(ctx, w, h, t, reduced, grain) {
      if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w / 2)); c.height = Math.max(1, Math.round(h / 2));
        const x = c.getContext('2d');
        const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.6);
        g.addColorStop(0, 'rgba(0,6,8,0)'); g.addColorStop(1, 'rgba(0,6,8,0.6)');
        x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        this.vignette = { canvas: c, w, h };
      }
      ctx.drawImage(this.vignette.canvas, 0, 0, w, h);
      if (!grain) return;
      if (!this.grainPat) this.grainPat = ctx.createPattern(this.grain, 'repeat');
      ctx.save();
      const j = reduced ? 0 : Math.floor(t * 24);
      ctx.translate(-(j * 37) % 160, -(j * 53) % 160);
      ctx.fillStyle = this.grainPat;
      ctx.fillRect(0, 0, w + 160, h + 160);
      ctx.restore();
    }
  }

  OO.Scenery = Scenery;
})(window.OO = window.OO || {});
