/*
 * Renderer: procedural art for the world, the flashlight darkness pass, and the canvas HUD.
 * Everything is drawn with canvas primitives so the prototype ships without image assets.
 * When real sprites arrive, replace drawEnemy / drawPlayer and keep the rest.
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const TAU = Math.PI * 2;
  const FONT_DISPLAY = '"Big Shoulders Stencil Display", Impact, "Arial Narrow", sans-serif';
  const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const FONT_UI = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
  const HEAD = { burster: 0.9, spitter: 0.3, shambler: 0.45, hound: 1.45, skinner: 0.35, bloater: 0.6, brute: 0.55, stalker: 0.5, mecha: 1.12 };
  const ANIM = { burster: 18, spitter: 6, shambler: 5, hound: 16, skinner: 9, bloater: 4, brute: 3, stalker: 4, mecha: 5 };   // anim speed (rad/s)
  const FRAMES = 8;
  const SPRITE_SCALE = 2;

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  /** Height (0..1) of a mech mid rocket-jump, shared by body, eyes and shadow. */
  function mechLift(e) { return e.ai && e.ai.mode === 'air' ? Math.sin(Math.PI * U.clamp(e.ai.k || 0, 0, 1)) : 0; }

  // ---------------------------------------------------------------- ECG trace
  // Shared by the HUD vitals monitor and the menu header. wave(u) is one heartbeat, u in [0, 1).
  const ECG = {
    wave(u) {
      if (u > 0.08 && u < 0.18) return 0.12 * Math.sin(Math.PI * (u - 0.08) / 0.1);           // P
      if (u >= 0.24 && u < 0.26) return -0.14 * (u - 0.24) / 0.02;                            // Q
      if (u >= 0.26 && u < 0.285) return -0.14 + 1.14 * (u - 0.26) / 0.025;                    // R up
      if (u >= 0.285 && u < 0.31) return 1 - 1.32 * (u - 0.285) / 0.025;                       // R down to S
      if (u >= 0.31 && u < 0.34) return -0.32 + 0.32 * (u - 0.31) / 0.03;                       // S back
      if (u > 0.46 && u < 0.66) return 0.24 * Math.sin(Math.PI * (u - 0.46) / 0.2);            // T
      return 0;
    },
    /**
     * A scrolling trace in the box (x, y, w, h). opts: bpm, color, amp (0..1), noise (0..1),
     * flat (true = asystole line), reduced (no scrolling), grid.
     */
    draw(ctx, x, y, w, h, t, opts) {
      const o = Object.assign({ bpm: 70, color: '#52e6c6', amp: 1, noise: 0, flat: false, reduced: false, grid: true }, opts);
      const speed = 90;                                   // px per second
      const beatPx = speed * 60 / o.bpm;
      const head = o.reduced ? 0 : t * speed;
      const mid = y + h * 0.62, A = h * 0.52 * o.amp;
      if (o.grid) {
        ctx.strokeStyle = 'rgba(82,230,198,0.07)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = x + ((-head) % 12 + 12) % 12; gx < x + w; gx += 12) { ctx.moveTo(Math.round(gx) + 0.5, y); ctx.lineTo(Math.round(gx) + 0.5, y + h); }
        for (let gy = y + 6; gy < y + h; gy += 12) { ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + w, gy + 0.5); }
        ctx.stroke();
      }
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.35, o.color);
      grad.addColorStop(1, o.color);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y - 2, w, h + 4); ctx.clip();
      ctx.lineJoin = 'round';
      const path = new Path2D();
      let last = mid;
      for (let px = 0; px <= w; px += 1.5) {
        const pos = head - (w - px);
        let v = o.flat ? 0 : ECG.wave((((pos / beatPx) % 1) + 1) % 1);
        if (o.noise) v += (Math.sin(pos * 0.9) + Math.sin(pos * 2.3)) * 0.05 * o.noise;
        last = mid - v * A;
        if (px === 0) path.moveTo(x + px, last); else path.lineTo(x + px, last);
      }
      // glow as a wide faint stroke under the line (cheaper than shadowBlur)
      ctx.globalAlpha = 0.22; ctx.strokeStyle = grad; ctx.lineWidth = 5; ctx.stroke(path);
      ctx.globalAlpha = 1; ctx.lineWidth = 1.6; ctx.stroke(path);
      ctx.fillStyle = o.color; ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(x + w, last, 5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x + w, last, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    },
  };
  OO.ECG = ECG;

  class Renderer {
    constructor(game, canvas) {
      this.g = game;
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
      this.dctx = this.dark.getContext('2d');
      this.groundTile = this.makeGround();
      this.pattern = this.ctx.createPattern(this.groundTile, 'repeat');
      this.scenery = new OO.Scenery(this);
      this.splats = { red: [], bile: [], scorch: [] };
      for (let i = 0; i < 8; i++) {
        this.splats.red.push(this.makeSplat('#4f0a08', '#7a130f'));
        this.splats.bile.push(this.makeSplat('#4d5a17', '#8b9c2b'));
        this.splats.scorch.push(this.makeSplat('#141210', '#2e2924'));
      }
      this.menuEyes = [];
      for (let i = 0; i < 14; i++) this.menuEyes.push({ x: Math.random(), y: Math.random(), p: Math.random() * 10, s: U.rand(0.7, 1.3) });
      this.cam = { x: 0, y: 0 };
      this.cache = new Map();
      this.shadow = document.createElement('canvas');
      this.shadow.width = 64; this.shadow.height = 26;
      const sh = this.shadow.getContext('2d');
      sh.fillStyle = 'rgba(0,0,0,0.38)';
      sh.beginPath(); sh.ellipse(32, 13, 31, 12, 0, 0, TAU); sh.fill();
    }

    resize(w, h, dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.dark.width = Math.ceil(w / 2);
      this.dark.height = Math.ceil(h / 2);
      this.pattern = this.ctx.createPattern(this.groundTile, 'repeat');
    }

    // ---------------------------------------------------------------- procedural textures
    makeGround() {
      const S = 512;
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      const tiled = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };

      x.fillStyle = '#171b1b';
      x.fillRect(0, 0, S, S);

      for (let i = 0; i < 70; i++) {
        const px = Math.random() * S, py = Math.random() * S, r = U.rand(20, 110);
        const light = Math.random() < 0.5;
        tiled(() => {
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, light ? 'rgba(48,58,56,0.35)' : 'rgba(4,8,8,0.35)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
        });
      }
      // concrete slab seams: give the eye something to track while moving
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2;
      for (let i = 0; i <= S; i += 128) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
        x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
      }
      x.strokeStyle = 'rgba(90,92,84,0.12)'; x.lineWidth = 1;
      for (let i = 0; i <= S; i += 128) {
        x.beginPath(); x.moveTo(i + 2, 0); x.lineTo(i + 2, S); x.stroke();
        x.beginPath(); x.moveTo(0, i + 2); x.lineTo(S, i + 2); x.stroke();
      }
      // grit
      for (let i = 0; i < 4200; i++) {
        const v = Math.floor(U.rand(20, 70));
        x.fillStyle = `rgba(${v},${v},${v - 4},${U.rand(0.2, 0.6)})`;
        x.fillRect(Math.random() * S, Math.random() * S, 1, 1);
      }
      // cracks
      for (let i = 0; i < 16; i++) {
        let px = Math.random() * S, py = Math.random() * S, a = U.rand(0, TAU);
        const pts = [[px, py]];
        for (let k = 0; k < U.randInt(6, 16); k++) {
          a += U.rand(-0.7, 0.7);
          px += Math.cos(a) * U.rand(6, 16); py += Math.sin(a) * U.rand(6, 16);
          pts.push([px, py]);
        }
        tiled(() => {
          x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = U.rand(0.8, 1.8);
          x.beginPath(); pts.forEach((p, j) => (j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
        });
      }
      // old stains
      for (let i = 0; i < 7; i++) {
        const px = Math.random() * S, py = Math.random() * S, r = U.rand(10, 34);
        tiled(() => {
          x.fillStyle = 'rgba(58,16,12,0.22)';
          for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(px + U.rand(-r, r) * 0.6, py + U.rand(-r, r) * 0.6, r * U.rand(0.3, 0.7), 0, TAU); x.fill(); }
        });
      }
      // faded hazard paint
      x.fillStyle = 'rgba(200,160,40,0.07)';
      for (let i = 0; i < S; i += 48) x.fillRect(i, 318, 26, 6);
      return c;
    }

    /** A blood (or bile, or scorch) splat: an irregular pool, a directional spray of droplets, a wet highlight. */
    makeSplat(dark, light) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const x = c.getContext('2d');
      x.translate(48, 48);
      // pool: a short random walk of overlapping blobs
      x.fillStyle = dark;
      let px = 0, py = 0;
      for (let i = 0; i < 10; i++) {
        circle(x, px, py, U.rand(5, 12));
        px = U.clamp(px + U.rand(-6, 6), -12, 12); py = U.clamp(py + U.rand(-6, 6), -12, 12);
      }
      // spray: droplets thrown one way, smaller and sparser with distance, with a few elongated streaks
      const dir = U.rand(0, TAU);
      for (let i = 0; i < 22; i++) {
        const a = dir + U.rand(-0.55, 0.55), d = U.rand(16, 44), s = Math.max(0.7, 3.6 - d * 0.065) * U.rand(0.6, 1.2);
        circle(x, Math.cos(a) * d, Math.sin(a) * d, s);
        if (i % 5 === 0) {
          x.save(); x.translate(Math.cos(a) * (d - 6), Math.sin(a) * (d - 6)); x.rotate(a);
          x.beginPath(); x.ellipse(0, 0, 6, s * 0.7, 0, 0, TAU); x.fill(); x.restore();
        }
      }
      for (let i = 0; i < 8; i++) { const a = U.rand(0, TAU), d = U.rand(12, 22); circle(x, Math.cos(a) * d, Math.sin(a) * d, U.rand(1, 2.4)); }
      // darker core and a wet sheen
      x.globalAlpha = 0.5; x.fillStyle = '#000'; circle(x, U.rand(-3, 3), U.rand(-3, 3), U.rand(4, 7));
      x.globalAlpha = 0.5; x.fillStyle = light;
      for (let i = 0; i < 3; i++) circle(x, U.rand(-6, 6), U.rand(-6, 6), U.rand(2, 5));
      x.globalAlpha = 0.25; x.fillStyle = '#fff'; circle(x, U.rand(-5, 0), U.rand(-5, 0), 1.6);
      return c;
    }

    // ---------------------------------------------------------------- frame
    render() {
      const g = this.g, ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0d0f0e';
      ctx.fillRect(0, 0, this.w, this.h);

      if (!g.player) { this.renderMenuBackdrop(); return; }

      const p = g.player, z = g.zoom;
      let sx = 0, sy = 0;
      if (g.shakeAmt > 0.2) { sx = U.rand(-1, 1) * g.shakeAmt; sy = U.rand(-1, 1) * g.shakeAmt; }
      const camX = p.x - g.viewW / 2, camY = p.y - g.viewH / 2;
      this.cam.x = camX; this.cam.y = camY; this.sx = sx; this.sy = sy;

      const world = () => { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.translate(sx, sy); ctx.scale(z, z); ctx.translate(-camX, -camY); };

      world();
      if (!this.scenery.covers(this.cam, g.viewW, g.viewH, g.world.seed)) {
        ctx.fillStyle = this.pattern;
        ctx.fillRect(camX - 40, camY - 40, g.viewW + 80, g.viewH + 80);
      }
      this.scenery.drawGround(ctx, this.cam, g.viewW, g.viewH, g.world.seed);
      this.drawDecals(ctx);
      this.drawZones(ctx);
      this.scenery.drawFixtures(ctx, g.time);
      this.drawObstacles(ctx);
      this.drawEnemies(ctx);
      this.drawTurrets(ctx);
      for (const pl of g.players) this.drawPlayer(ctx, pl);
      for (const pl of g.players) if (pl.md > 0) this.drawDrone(ctx, pl);
      for (const pl of g.players) if (!pl.downed) for (const w of pl.weapons) w.draw(ctx, g);
      this.drawLobs(ctx);
      this.drawEffects(ctx, false);
      this.drawParticles(ctx);
      const fx = this.fxLevel();
      if (fx === 'high') this.scenery.drawHaze(ctx, this.cam, g.viewW, g.viewH, g.time);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawDarkness();

      // Things that should read through the dark: lamps, eyes, loot, tracers, lightning, numbers.
      world();
      this.scenery.drawGlows(ctx, g.time);
      this.drawObstacleEdges(ctx);
      this.drawDrumGlows(ctx);
      this.drawEyes(ctx);
      this.drawStuns(ctx);
      this.drawTurretFx(ctx);
      this.drawPickups(ctx);
      this.drawStampedeLanes(ctx);
      this.drawHazards(ctx);
      this.drawEnemyShots(ctx);
      this.drawMechFx(ctx);
      this.drawProjectiles(ctx);
      this.drawEffects(ctx, true);
      this.drawTexts(ctx);
      this.drawEnemyBars(ctx);
      if (g.players.length > 1) this.drawPlayerTags(ctx);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (!p.downed && fx === 'high') this.scenery.drawMotes(ctx, (p.x - camX) * z + sx, (p.y - camY) * z + sy, p.faceAngle, 520 * z, g.time);
      this.scenery.drawPost(ctx, this.w, this.h, g.time, g.reducedMotion, fx === 'high');
      this.drawScreenFx();
      if (g.state !== 'results') this.drawHud();
      this.g.ui.updateCalldown();
      if (g.settings.secrets && g.settings.secrets.vhs) this.drawVhs();
      this.drawStick();
      if (g.debug) this.drawDebug();
    }

    /**
     * Atmosphere level for this frame. 'auto' starts high and drops to low after a few seconds
     * under ~42 fps (haze, dust and grain are full-screen passes), and comes back above ~56 fps.
     */
    fxLevel() {
      const g = this.g, want = g.settings.fx || 'auto';
      if (want !== 'auto') return want;
      const now = g.time;
      if (this.autoFx === undefined) { this.autoFx = 'high'; this.fxT = now; }
      if (g.state !== 'playing') { this.fxT = now; return this.autoFx; }
      const bad = this.autoFx === 'high' ? g.fps < 42 : g.fps > 56;
      if (!bad) this.fxT = now;
      else if (now - this.fxT > (this.autoFx === 'high' ? 4 : 10)) { this.autoFx = this.autoFx === 'high' ? 'low' : 'high'; this.fxT = now; }
      return this.autoFx;
    }

    inView(x, y, r) {
      const g = this.g, c = this.cam;
      return x + r > c.x && x - r < c.x + g.viewW && y + r > c.y && y - r < c.y + g.viewH;
    }

    renderMenuBackdrop() {
      const ctx = this.ctx, t = this.g.menuTime, w = this.w, h = this.h;
      ctx.save();
      ctx.translate(-(t * 12) % 512, -(t * 7) % 512);
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, w + 512, h + 512);
      ctx.restore();
      const d = this.dctx, W = this.dark.width, H = this.dark.height;
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, W, H);
      d.fillStyle = 'rgba(4,6,5,0.93)';
      d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';
      const R = Math.max(W, H) * 0.42, cx = W * 0.5, cy = H * 0.42;
      const gr = d.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.beginPath(); d.arc(cx, cy, R, 0, TAU); d.fill();
      ctx.drawImage(this.dark, 0, 0, w, h);
      // eyes in the dark, blinking
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.menuEyes) {
        const blink = Math.sin(t * 0.7 + e.p);
        if (blink < -0.2) continue;
        const a = Math.min(1, (blink + 0.2) * 2);
        const ex = e.x * w, ey = e.y * h, sp = 5 * e.s;
        ctx.fillStyle = `rgba(255,70,40,${0.18 * a})`;
        circle(ctx, ex - sp, ey, 5 * e.s); circle(ctx, ex + sp, ey, 5 * e.s);
        ctx.fillStyle = `rgba(255,190,120,${0.9 * a})`;
        circle(ctx, ex - sp, ey, 1.4 * e.s); circle(ctx, ex + sp, ey, 1.4 * e.s);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- world layers
    drawDecals(ctx) {
      for (const d of this.g.decals) {
        if (!this.inView(d.x, d.y, d.r * 2)) continue;
        const img = this.splats[d.kind][d.v];
        ctx.globalAlpha = Math.min(1, d.life / 6) * 0.85;
        ctx.save();
        ctx.translate(d.x, d.y); ctx.rotate(d.rot);
        const s = d.r * 2.4;
        ctx.drawImage(img, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawZones(ctx) {
      const t = this.g.time;
      for (const z of this.g.zones) {
        const fade = Math.min(1, z.life / 0.4, (z.max - z.life) / 0.15 + 0.3);
        const flick = 0.85 + Math.sin(t * 23 + z.seed) * 0.08 + Math.sin(t * 37 + z.seed * 2) * 0.07;
        const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r * 1.15);
        gr.addColorStop(0, `rgba(255,214,120,${0.75 * fade * flick})`);
        gr.addColorStop(0.45, `rgba(240,110,30,${0.55 * fade})`);
        gr.addColorStop(0.8, `rgba(150,40,10,${0.35 * fade})`);
        gr.addColorStop(1, 'rgba(60,10,0,0)');
        ctx.fillStyle = gr;
        circle(ctx, z.x, z.y, z.r * 1.15);
      }
    }

    // ---------------------------------------------------------------- obstacles
    drawObstacles(ctx) {
      for (const o of this.g.world.list) {
        if (o.gone || !this.inView(o.x, o.y, Math.max(o.maxX - o.minX, o.maxY - o.minY))) continue;
        const spr = o.spr || (o.spr = this.obstacleSprite(o));
        if (o.lit) {
          // lit fuse: the drum shudders and flashes faster and faster
          const k = U.clamp((this.g.time - o.litT) / OO.CONFIG.HAZARDS.fuse, 0, 1);
          const on = Math.sin((this.g.time - o.litT) * (14 + k * 40)) > 0;
          const j = 1.2 + k * 1.5;
          ctx.drawImage(spr, o.x - spr.hw + U.rand(-j, j), o.y - spr.hh + U.rand(-j, j), spr.hw * 2, spr.hh * 2);
          if (on) { ctx.fillStyle = 'rgba(255,170,60,0.55)'; circle(ctx, o.x, o.y, o.r + 3); }
        } else ctx.drawImage(spr, o.x - spr.hw, o.y - spr.hh, spr.hw * 2, spr.hh * 2);
      }
    }

    /** Volatile drums get a faint warning glow through the dark, so you can plan around them. */
    drawDrumGlows(ctx) {
      const t = this.g.time;
      for (const o of this.g.world.list) {
        if (!o.volatile || o.gone || !this.inView(o.x, o.y, 40)) continue;
        const a = o.lit ? 0.7 : 0.16 + Math.sin(t * 2 + o.seed * 9) * 0.05;
        ctx.strokeStyle = `rgba(255,96,48,${a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 4, 0, TAU); ctx.stroke();
      }
    }

    /** Faint rim on every obstacle, drawn over the darkness so cover is readable in the dark. */
    drawObstacleEdges(ctx) {
      ctx.strokeStyle = 'rgba(235,226,207,0.13)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const o of this.g.world.list) {
        if (o.gone || !this.inView(o.x, o.y, 100)) continue;
        if (o.kind === 'circle') { ctx.moveTo(o.x + o.r, o.y); ctx.arc(o.x, o.y, o.r, 0, TAU); }
        else ctx.rect(o.minX, o.minY, o.maxX - o.minX, o.maxY - o.minY);
      }
      ctx.stroke();
    }

    /** Pre-renders one obstacle (with its drop shadow) into its own little canvas. */
    obstacleSprite(o) {
      const pad = 12;
      const hw = (o.kind === 'circle' ? o.r : o.hw) + pad, hh = (o.kind === 'circle' ? o.r : o.hh) + pad;
      const c = document.createElement('canvas');
      c.width = Math.ceil(hw * 2 * SPRITE_SCALE); c.height = Math.ceil(hh * 2 * SPRITE_SCALE);
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(hw, hh);
      let seed = Math.floor(o.seed * 1e6);
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const rrect = (X, Y, W, H, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, W, H, r) : x.rect(X, Y, W, H); };

      // shadow
      x.fillStyle = 'rgba(0,0,0,0.5)';
      if (o.kind === 'circle') { x.beginPath(); x.arc(5, 7, o.r, 0, TAU); x.fill(); }
      else { rrect(-o.hw + 5, -o.hh + 7, o.hw * 2, o.hh * 2, 6); x.fill(); }

      // vehicles are drawn lying along x, then rotated if the obstacle is vertical
      const vertical = o.kind === 'rect' && o.hh > o.hw;
      if (vertical) x.rotate(Math.PI / 2);
      const L = vertical ? o.hh : o.hw, Wd = vertical ? o.hw : o.hh;

      switch (o.type) {
        case 'car':
        case 'bus': {
          const pal = [['#5b3b2c', '#3e2a20'], ['#33424f', '#232e37'], ['#2a2724', '#191715'], ['#5e5a3c', '#3c3926']][o.tint || 0];
          const bus = o.type === 'bus';
          x.fillStyle = bus ? '#5c5031' : pal[0]; rrect(-L, -Wd, L * 2, Wd * 2, bus ? 5 : 9); x.fill();
          x.fillStyle = bus ? '#423a24' : pal[1]; rrect(-L * (bus ? 0.92 : 0.45), -Wd * 0.72, L * (bus ? 1.84 : 0.95), Wd * 1.44, 5); x.fill();
          x.fillStyle = '#162026';
          if (bus) {
            for (let i = -5; i <= 5; i++) { x.fillRect(i * L * 0.16 - 5, -Wd + 3, 10, 5); x.fillRect(i * L * 0.16 - 5, Wd - 8, 10, 5); }
          } else {
            x.beginPath(); x.moveTo(L * 0.5, -Wd * 0.72); x.lineTo(L * 0.7, -Wd * 0.6); x.lineTo(L * 0.7, Wd * 0.6); x.lineTo(L * 0.5, Wd * 0.72); x.fill();
            x.beginPath(); x.moveTo(-L * 0.45, -Wd * 0.72); x.lineTo(-L * 0.62, -Wd * 0.6); x.lineTo(-L * 0.62, Wd * 0.6); x.lineTo(-L * 0.45, Wd * 0.72); x.fill();
            x.fillStyle = '#c9c0a0'; x.fillRect(L - 4, -Wd + 4, 3, 6); x.fillRect(L - 4, Wd - 10, 3, 6);
          }
          // scorch and rust
          for (let i = 0; i < 4; i++) {
            x.fillStyle = `rgba(${rnd() < 0.5 ? '15,12,10' : '110,52,24'},${0.25 + rnd() * 0.3})`;
            x.beginPath(); x.arc((rnd() - 0.5) * L * 1.6, (rnd() - 0.5) * Wd * 1.4, 4 + rnd() * 9, 0, TAU); x.fill();
          }
          x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(-L * 0.1, -Wd); x.lineTo(-L * 0.1, Wd); x.stroke();
          break;
        }
        case 'barrier': {
          x.fillStyle = '#6f6d64'; rrect(-L, -Wd, L * 2, Wd * 2, 3); x.fill();
          x.fillStyle = '#8b897f'; x.fillRect(-L + 3, -Wd * 0.35, L * 2 - 6, Wd * 0.7);
          for (const end of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              x.fillStyle = i % 2 ? '#1b1a17' : '#c9a227';
              x.fillRect(end * (L - 6 - i * 7) - 3.5, -Wd, 7, Wd * 2);
            }
          }
          x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 1;
          x.beginPath(); x.moveTo((rnd() - 0.5) * L, -Wd); x.lineTo((rnd() - 0.5) * L, Wd); x.stroke();
          break;
        }
        case 'dumpster': {
          x.fillStyle = '#2d4633'; rrect(-L, -Wd, L * 2, Wd * 2, 3); x.fill();
          x.fillStyle = '#3a5a41'; x.fillRect(-L + 3, -Wd + 3, L - 4, Wd * 2 - 6); x.fillRect(1, -Wd + 3, L - 4, Wd * 2 - 6);
          x.fillStyle = 'rgba(110,52,24,0.5)';
          for (let i = 0; i < 3; i++) { x.beginPath(); x.arc((rnd() - 0.5) * L * 1.6, (rnd() - 0.5) * Wd * 1.4, 3 + rnd() * 5, 0, TAU); x.fill(); }
          break;
        }
        case 'pillar': {
          x.fillStyle = '#5f5d56'; x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.fill();
          x.fillStyle = '#76746b'; x.beginPath(); x.arc(-2, -2, o.r * 0.78, 0, TAU); x.fill();
          x.fillStyle = '#3a3833';
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; x.fillRect(Math.cos(a) * o.r * 0.45 - 1.5, Math.sin(a) * o.r * 0.45 - 1.5, 3, 3); }
          break;
        }
        case 'barrels': {
          if (o.volatile) {
            // red fuel drum: rim, hazard band and a flame mark on the lid
            x.fillStyle = '#8f2318'; x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.fill();
            x.strokeStyle = '#5a140e'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, o.r * 0.8, 0, TAU); x.stroke();
            x.save(); x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.clip();
            x.fillStyle = '#e8b030';
            for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(i * 8 - 4, -o.r); x.lineTo(i * 8, -o.r); x.lineTo(i * 8 + 10, o.r); x.lineTo(i * 8 + 6, o.r); x.closePath(); x.globalAlpha = 0.28; x.fill(); }
            x.restore(); x.globalAlpha = 1;
            x.fillStyle = '#f2b23a';
            x.beginPath(); x.moveTo(0, -o.r * 0.55); x.quadraticCurveTo(o.r * 0.45, -o.r * 0.05, 0, o.r * 0.45); x.quadraticCurveTo(-o.r * 0.45, -o.r * 0.05, 0, -o.r * 0.55); x.fill();
            x.fillStyle = '#8f2318';
            x.beginPath(); x.moveTo(0, -o.r * 0.1); x.quadraticCurveTo(o.r * 0.2, o.r * 0.15, 0, o.r * 0.32); x.quadraticCurveTo(-o.r * 0.2, o.r * 0.15, 0, -o.r * 0.1); x.fill();
            x.fillStyle = '#3a0d08'; x.beginPath(); x.arc(o.r * 0.5, -o.r * 0.42, o.r * 0.13, 0, TAU); x.fill();
            break;
          }
          x.fillStyle = '#9c8228'; x.beginPath(); x.arc(0, 0, o.r, 0, TAU); x.fill();
          x.strokeStyle = '#5c4c16'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, o.r * 0.78, 0, TAU); x.stroke();
          x.fillStyle = '#1b1a17';
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU - Math.PI / 2;
            x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, o.r * 0.55, a - 0.38, a + 0.38); x.closePath(); x.fill();
          }
          x.fillStyle = '#9c8228'; x.beginPath(); x.arc(0, 0, o.r * 0.16, 0, TAU); x.fill();
          break;
        }
      }
      c.hw = hw; c.hh = hh;
      return c;
    }

    // ---------------------------------------------------------------- tactical (v0.9)
    drawTurrets(ctx) {
      for (const t of this.g.turrets) {
        if (!this.inView(t.x, t.y, 30)) continue;
        const fade = Math.min(1, t.life / 1.5);
        ctx.globalAlpha = 0.4 + fade * 0.6;
        ctx.drawImage(this.shadow, t.x - 14, t.y + 2, 28, 12);
        // tripod
        ctx.strokeStyle = '#2b3433'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(a) * 13, t.y + Math.sin(a) * 13); }
        ctx.stroke();
        // head
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.a);
        ctx.fillStyle = '#3d4a48'; ctx.fillRect(-8, -7, 16, 14);
        ctx.fillStyle = '#56d6c0'; ctx.fillRect(-6, -5, 3, 3);
        ctx.fillStyle = '#20282a'; ctx.fillRect(6, -2.5, 13, 5);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    drawTurretFx(ctx) {
      for (const t of this.g.turrets) {
        if (!this.inView(t.x, t.y, 40)) continue;
        if (t.flash > 0) {
          const mx = t.x + Math.cos(t.a) * 21, my = t.y + Math.sin(t.a) * 21;
          ctx.fillStyle = 'rgba(255,220,140,0.9)'; circle(ctx, mx, my, 4.5);
        }
        // remaining time as a thin arc
        ctx.strokeStyle = 'rgba(82,230,198,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 19, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(t.life / t.max, 0, 1)); ctx.stroke();
      }
    }

    /** Med drone: a little quadcopter circling the operative it's patching up. */
    drawDrone(ctx, p) {
      const t = this.g.time * 2.4 + p.slot, x = p.x + Math.cos(t) * 26, y = p.y - 18 + Math.sin(t) * 12;
      ctx.strokeStyle = 'rgba(125,220,106,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#2c3534'; ctx.fillRect(x - 5, y - 4, 10, 8);
      ctx.fillStyle = 'rgba(200,220,215,0.5)';
      for (const [dx, dy] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 4.5, 1.4, (t * 9) % TAU, 0, TAU); ctx.fill(); }
      ctx.fillStyle = Math.sin(t * 6) > 0 ? '#7ddc6a' : '#2f6a28'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    /** Flashbanged infected: little white sparks circling their heads. */
    drawStuns(ctx) {
      const t = this.g.time;
      ctx.fillStyle = 'rgba(255,250,225,0.85)';
      for (const e of this.g.enemies) {
        if (!(e.stun > 0) || e.dead || !this.inView(e.x, e.y, e.r * 2)) continue;
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * (TAU / 3) + e.id;
          ctx.fillRect(e.x + Math.cos(a) * e.r * 0.8 - 1.5, e.y - e.r * 0.7 + Math.sin(a) * e.r * 0.3 - 1.5, 3, 3);
        }
      }
    }

    drawEnemies(ctx) {
      const list = this.g.enemies;
      for (const e of list) if (e.def.crate && !e.dead && this.inView(e.x, e.y, 30)) this.drawCrate(ctx, e);
      for (const e of list) if (!e.def.crate && !e.dead && this.inView(e.x, e.y, e.r * 2.2)) this.drawEnemy(ctx, e);
    }

    drawCrate(ctx, e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-14, -8, 32, 26);
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#6b5232';
      ctx.fillRect(-16, -14, 32, 28);
      ctx.strokeStyle = '#3e2e1a'; ctx.lineWidth = 2;
      ctx.strokeRect(-16, -14, 32, 28);
      ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(16, 14); ctx.moveTo(16, -14); ctx.lineTo(-16, 14); ctx.stroke();
      ctx.fillStyle = '#d8ccb0'; ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = '#a3201b'; ctx.fillRect(-1.5, -4, 3, 8); ctx.fillRect(-5, -1.5, 10, 3);
      ctx.restore();
    }

    /**
     * Enemies are drawn once per animation frame into cached sprites (facing +x),
     * then blitted with a rotation. Far cheaper than re-tracing paths for 400 infected.
     * To switch to painted art later, make enemySprite() return frames from an image atlas.
     */
    enemySprite(type, frame, fl) {
      const d = OO.ENEMIES[type];
      const ears = !!(this.g.settings.secrets && this.g.settings.secrets.ears) && !d.mech && !d.crate;
      const key = type + ':' + frame + (fl ? 'f' : '') + (ears ? 'e' : '');
      let c = this.cache.get(key);
      if (c) return c;
      const r = d.r, half = Math.ceil(r * 2.4);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      this.drawEnemyShape(x, type, d, r, (frame / FRAMES) * (TAU / ANIM[type]), fl);
      if (ears) this.drawBunnyEars(x, type, r, (frame / FRAMES) * TAU, fl);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    /** Secret code BISCUIT: floppy bunny ears on the infected (cached into their sprites). */
    drawBunnyEars(x, type, r, phase, fl) {
      const hx = HEAD[type] * r, len = Math.max(7, r * 0.75), w = Math.max(2.2, len * 0.28);
      for (const s of [-1, 1]) {
        x.save();
        x.translate(hx - r * 0.1, s * r * 0.2);
        x.rotate(Math.PI + s * (0.42 + Math.sin(phase + s) * 0.12));
        x.fillStyle = fl ? '#ffffff' : '#efe8e2';
        x.beginPath(); x.ellipse(len * 0.5, 0, len * 0.55, w, 0, 0, TAU); x.fill();
        x.fillStyle = fl ? '#ffffff' : '#f2a3bd';
        x.beginPath(); x.ellipse(len * 0.55, 0, len * 0.38, w * 0.5, 0, 0, TAU); x.fill();
        x.restore();
      }
    }

    /** Secret code (Konami): found-footage VHS look over the whole frame, HUD included. */
    drawVhs() {
      const ctx = this.ctx, W = this.w, H = this.h, t = this.g.time;
      if (!this.scanPat) {
        const c = document.createElement('canvas'); c.width = 4; c.height = 3;
        const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, 0, 4, 1);
        this.scanPat = ctx.createPattern(c, 'repeat');
      }
      // colour bleed: a faint red and cyan copy of the frame, nudged sideways
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.07;
      ctx.drawImage(this.c, 0, 0, this.c.width, this.c.height, 2.5, 0, W, H);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,190,150,0.05)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = this.scanPat; ctx.fillRect(0, 0, W, H);
      // a tracking band rolls down the screen every few seconds
      const cyc = (t % 7) / 7, by = cyc * (H + 80) - 40;
      if (cyc < 0.6) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, by, W, 18);
        for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * W, by + Math.random() * 18, Math.random() * 30 + 4, 1); }
      }
      // camcorder overlay
      ctx.font = `600 18px ${FONT_MONO}`; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const play = 'PLAY \u25B6', clock = 'NOV 09 2026  02:' + String(10 + Math.floor(t / 60)).padStart(2, '0') + ' AM';
      ctx.textAlign = 'left'; ctx.fillText(play, 20, H - 20);
      ctx.textAlign = 'right'; ctx.fillText(clock, W - 18, H - 20);
      ctx.fillStyle = '#f2f2ea';
      ctx.textAlign = 'left'; ctx.fillText(play, 18, H - 22);
      ctx.textAlign = 'right'; ctx.fillText(clock, W - 20, H - 22);
      if (Math.floor(t * 1.5) % 2 === 0) { ctx.fillStyle = '#ff3b4e'; ctx.beginPath(); ctx.arc(22, H - 52, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#f2f2ea'; ctx.textAlign = 'left'; ctx.font = `600 13px ${FONT_MONO}`; ctx.fillText('REC', 32, H - 47); }
      ctx.textAlign = 'left';
    }

    eyeSprite(type) {
      const key = 'eyes:' + type;
      let c = this.cache.get(key);
      if (c) return c;
      const d = OO.ENEMIES[type], r = d.r, half = Math.ceil(r * 2.4);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      const h = HEAD[type] * r, sp = type === 'mecha' ? r * 0.97 : Math.max(2.6, r * 0.2);   // the mech's "eyes" are its cannon muzzles
      const big = type === 'mecha' ? 1.5 : d.boss ? 2.2 : d.elite ? 1.6 : 1;
      x.fillStyle = d.eye + '44';
      circle(x, h, sp, 3.4 * big); circle(x, h, -sp, 3.4 * big);
      x.fillStyle = d.eye;
      circle(x, h, sp, 1.3 * big); circle(x, h, -sp, 1.3 * big);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    drawEnemy(ctx, e) {
      if (e.def.mech) { this.drawMecha(ctx, e); return; }
      const r = e.r;
      ctx.drawImage(this.shadow, e.x - r * 1.1, e.y + r * 0.25, r * 2.2, r * 0.9);
      const period = TAU / ANIM[e.type];
      const frame = Math.floor(((e.t % period) / period) * FRAMES) % FRAMES;
      const spr = this.enemySprite(e.type, frame, e.flash > 0);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.a);
      ctx.drawImage(spr, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.restore();

      if (e.def.ranged && e.ai.wind > 0) {
        const k = 1 - e.ai.wind / e.def.ranged.windup;
        const sx = e.x + Math.cos(e.a) * r * 0.65, sy = e.y + Math.sin(e.a) * r * 0.65;
        ctx.fillStyle = `rgba(190,240,90,${0.55 + k * 0.4})`;
        circle(ctx, sx, sy, r * (0.45 + k * 0.45));
      }
      if (e.type === 'stalker' && e.ai.mode === 'wind') {
        ctx.strokeStyle = `rgba(255,40,60,${0.5 + Math.sin(e.t * 40) * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.5, 0, TAU); ctx.stroke();
      }
    }

    /** The Hare Trigger: shadow, overdrive glow, jump height and thrusters around the cached sprite. */
    drawMecha(ctx, e) {
      const r = e.r, ai = e.ai, lift = mechLift(e);
      const sh = 1 - lift * 0.45;
      ctx.globalAlpha = 1 - lift * 0.4;
      ctx.drawImage(this.shadow, e.x - r * 1.3 * sh, e.y + r * 0.2 - r * 0.5 * sh, r * 2.6 * sh, r * 1.1 * sh);
      ctx.globalAlpha = 1;
      if (ai.over) {
        const pulse = 0.35 + Math.sin(e.t * 10) * 0.15;
        ctx.fillStyle = `rgba(255,40,70,${pulse * (1 - lift)})`;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.2, r * 1.5, r * 1.1, 0, 0, TAU); ctx.fill();
      }
      const walking = ai.mode === 'walk' || ai.mode === undefined;
      const period = TAU / ANIM.mecha;
      const frame = walking ? Math.floor(((e.t % period) / period) * FRAMES) % FRAMES : 0;
      const spr = this.enemySprite('mecha', frame, e.flash > 0);
      const crouch = ai.mode === 'crouch' ? 0.1 : ai.mode === 'recover' ? 0.06 : 0;
      const scale = (1 + lift * 0.45) * (1 - crouch);
      ctx.save();
      ctx.translate(e.x, e.y - lift * 70);
      ctx.rotate(e.a);
      ctx.scale(scale, scale);
      if (ai.mode === 'air' || (ai.mode === 'crouch' && ai.timer < 0.25)) {
        // rocket boots
        ctx.globalCompositeOperation = 'lighter';
        for (const sgn of [-1, 1]) {
          const fx = -r * 0.05, fy = sgn * r * 0.62, fr = r * (0.35 + Math.random() * 0.15);
          const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
          grd.addColorStop(0, 'rgba(255,240,200,0.95)'); grd.addColorStop(0.4, 'rgba(255,150,40,0.7)'); grd.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = grd; circle(ctx, fx, fy, fr);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(spr, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.restore();
    }

    /** Telegraphs for the Hare Trigger, drawn over the darkness so they're always readable. */
    drawMechFx(ctx) {
      const g = this.g, time = g.time;
      for (const m of g.missiles || []) {
        const k = U.clamp(m.t / m.dur, 0, 1), warm = m.t < 0 ? 0.45 : 0.55 + k * 0.45;
        if (this.inView(m.x1, m.y1, m.r + 10)) {
          // ground reticle: fills in as the missile comes down
          ctx.fillStyle = `rgba(255,120,30,${0.08 + k * 0.22})`; circle(ctx, m.x1, m.y1, m.r * Math.max(0.15, k));
          ctx.strokeStyle = `rgba(255,140,40,${warm})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(m.x1, m.y1, m.r, 0, TAU); ctx.stroke();
          ctx.save(); ctx.translate(m.x1, m.y1); ctx.rotate(time * 2.5);
          ctx.lineWidth = 2.5;
          for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.moveTo(m.r * 0.55, 0); ctx.lineTo(m.r * 0.85, 0); ctx.stroke(); }
          ctx.restore();
        }
        if (m.t < 0) continue;
        // the carrot itself, on a high arc
        const x = U.lerp(m.x0, m.x1, k), y = U.lerp(m.y0, m.y1, k), h = Math.sin(Math.PI * k) * 130;
        if (!this.inView(x, y - h, 30)) continue;
        const k2 = Math.min(1, k + 0.03);
        const ang = Math.atan2((U.lerp(m.y0, m.y1, k2) - Math.sin(Math.PI * k2) * 130) - (y - h), U.lerp(m.x0, m.x1, k2) - x);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; circle(ctx, x, y, 4);
        ctx.save(); ctx.translate(x, y - h); ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,170,60,0.8)'; circle(ctx, -12, 0, 4 + Math.random() * 3);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -4.5); ctx.lineTo(-7, 4.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#c45a12'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -2.4); ctx.lineTo(4, 0); ctx.moveTo(-2, 3); ctx.lineTo(0, 1); ctx.stroke();
        ctx.fillStyle = '#5dbb4a';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-12, -5); ctx.lineTo(-10, 0); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      for (const e of g.enemies) {
        if (e.dead || !e.def.mech) continue;
        const ai = e.ai, M = e.def.mech;
        if (ai.mode === 'crouch' || ai.mode === 'air') {
          const R = M.leap.r, k = ai.mode === 'air' ? U.clamp(ai.k || 0, 0, 1) : 0;
          const blink = 0.55 + Math.sin(time * 18) * 0.3;
          ctx.fillStyle = `rgba(255,30,40,${0.08 + k * 0.2})`; circle(ctx, ai.tx, ai.ty, R);
          ctx.strokeStyle = `rgba(255,50,50,${blink})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(ai.tx, ai.ty, R, 0, TAU); ctx.stroke();
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(ai.tx, ai.ty, R * Math.max(0.08, k), 0, TAU); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ai.tx - R - 10, ai.ty); ctx.lineTo(ai.tx - R * 0.6, ai.ty); ctx.moveTo(ai.tx + R * 0.6, ai.ty); ctx.lineTo(ai.tx + R + 10, ai.ty);
          ctx.moveTo(ai.tx, ai.ty - R - 10); ctx.lineTo(ai.tx, ai.ty - R * 0.6); ctx.moveTo(ai.tx, ai.ty + R * 0.6); ctx.lineTo(ai.tx, ai.ty + R + 10);
          ctx.stroke();
        }
        if ((ai.mode === 'charge' || ai.mode === 'laser') && ai.ll > 0) {
          const c = Math.cos(ai.la), sn = Math.sin(ai.la);
          const ox = e.x + c * e.r * 0.6, oy = e.y + sn * e.r * 0.6, ex = e.x + c * ai.ll, ey = e.y + sn * ai.ll;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          if (ai.mode === 'charge') {
            const locked = ai.timer <= 0.3;
            ctx.strokeStyle = locked ? 'rgba(255,220,240,0.9)' : `rgba(255,80,170,${0.25 + Math.random() * 0.35})`;
            ctx.lineWidth = locked ? 2.5 : 1.5;
            ctx.setLineDash(locked ? [] : [10, 8]);
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,90,180,0.8)'; circle(ctx, ox, oy, 4 + (1 - ai.timer / M.laser.charge) * 7);
          } else {
            const w = M.laser.width;
            for (const [col, lw] of [['rgba(255,40,140,0.35)', w * 2.2], ['rgba(255,90,180,0.7)', w], ['rgba(255,240,250,0.95)', w * 0.35]]) {
              ctx.strokeStyle = col; ctx.lineWidth = lw * (0.9 + Math.random() * 0.2);
              ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
            }
            ctx.fillStyle = 'rgba(255,200,230,0.9)'; circle(ctx, ex, ey, w * 0.8 + Math.random() * 4);
          }
          ctx.restore();
        }
      }
    }

    /** Biscuit floating away under a little parachute after the mech is destroyed. */
    drawEject(ctx, f, a) {
      const k = 1 - a, x = f.x + f.drift * k * 70 + Math.sin(k * 9) * 8, y = f.y - 30 - k * 110;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2.5);
      ctx.translate(x, y);
      ctx.rotate(Math.sin(k * 9) * 0.15);
      // canopy
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#f2ede4' : '#d9342b';
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.arc(0, -22, 22, Math.PI + (i / 4) * Math.PI, Math.PI + ((i + 1) / 4) * Math.PI); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(240,235,225,0.8)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); for (const sx of [-21, -8, 8, 21]) { ctx.moveTo(sx, -22); ctx.lineTo(0, 0); } ctx.stroke();
      // bunny (side-on this time)
      ctx.fillStyle = '#f5f0ea';
      ctx.beginPath(); ctx.ellipse(-3, -9, 2.6, 8, -0.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -9, 2.6, 8, 0.25, 0, TAU); ctx.fill();
      circle(ctx, 0, 2, 7);
      ctx.fillStyle = '#f4a6c0'; ctx.beginPath(); ctx.ellipse(-3, -9, 1.2, 5.5, -0.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -9, 1.2, 5.5, 0.25, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1416'; circle(ctx, -2.5, 1, 1.1); circle(ctx, 2.5, 1, 1.1);
      ctx.fillStyle = '#ef7fa2'; circle(ctx, 0, 3.5, 1);
      ctx.restore();
    }

    drawEnemyShape(ctx, type, d, r, t, fl) {
      const body = fl ? '#ffffff' : d.body, skin = fl ? '#ffffff' : d.skin;
      if (type === 'bloater') {
        ctx.fillStyle = body; circle(ctx, 0, 0, r);
        ctx.fillStyle = skin;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3 + 0.4, pr = r * (0.26 + Math.sin(t * 4 + i) * 0.05);
          circle(ctx, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, pr);
        }
        ctx.fillStyle = fl ? '#fff' : '#3b420f';
        circle(ctx, r * 0.6, 0, r * 0.32);
        return;
      }

      ctx.lineCap = 'round';
      switch (type) {
        case 'shambler': {
          const sw = Math.sin(t * 5) * 0.25;
          ctx.strokeStyle = skin; ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.65); ctx.lineTo(r * 1.5, -r * 0.45 + sw * 8);
          ctx.moveTo(0, r * 0.65); ctx.lineTo(r * 1.5, r * 0.45 - sw * 8);
          ctx.stroke();
          ctx.fillStyle = body; circle(ctx, 0, 0, r);
          ctx.fillStyle = fl ? '#fff' : '#4a0d0b'; circle(ctx, -r * 0.35, r * 0.35, r * 0.28);
          ctx.fillStyle = skin; circle(ctx, r * 0.35, 0, r * 0.55);
          break;
        }
        case 'hound': {
          const leg = Math.sin(t * 16) * r * 0.45;
          ctx.strokeStyle = body; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(r * 0.6, -r * 0.5); ctx.lineTo(r * 0.6 + leg, -r * 1.05);
          ctx.moveTo(r * 0.6, r * 0.5); ctx.lineTo(r * 0.6 - leg, r * 1.05);
          ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.7 - leg, -r * 1.05);
          ctx.moveTo(-r * 0.7, r * 0.5); ctx.lineTo(-r * 0.7 + leg, r * 1.05);
          ctx.stroke();
          ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.45, r * 0.72, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = fl ? '#fff' : '#b9806a'; ctx.lineWidth = 1.4;
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.35, -r * 0.55); ctx.lineTo(i * r * 0.35, r * 0.55); ctx.stroke(); }
          ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(r * 1.45, 0, r * 0.62, r * 0.45, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'skinner': {
          const sw = Math.sin(t * 9) * 0.3;
          ctx.strokeStyle = fl ? '#fff' : '#e6d6c4'; ctx.lineWidth = 2;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(r * 0.2, s * r * 0.7); ctx.lineTo(r * 1.3, s * r * (0.9 + sw));
            ctx.moveTo(r * 1.3, s * r * (0.9 + sw)); ctx.lineTo(r * 1.75, s * r * (0.55 + sw));
            ctx.moveTo(r * 1.3, s * r * (0.9 + sw)); ctx.lineTo(r * 1.8, s * r * (0.95 + sw));
            ctx.stroke();
          }
          ctx.fillStyle = body; circle(ctx, 0, 0, r);
          ctx.strokeStyle = fl ? '#fff' : '#e0907f'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * (0.35 + i * 0.18), 1.9, 4.4); ctx.stroke(); }
          ctx.fillStyle = fl ? '#fff' : '#e8909c'; circle(ctx, r * 0.35, 0, r * 0.55);
          ctx.strokeStyle = fl ? '#fff' : '#b35a68'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(r * 0.1, 0); ctx.lineTo(r * 0.75, 0); ctx.stroke();
          break;
        }
        case 'burster': {
          const leg = Math.sin(t * 18) * r * 0.5;
          ctx.strokeStyle = body; ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(r * 0.3, -r * 0.5); ctx.lineTo(r * 0.3 + leg, -r * 1.1);
          ctx.moveTo(r * 0.3, r * 0.5); ctx.lineTo(r * 0.3 - leg, r * 1.1);
          ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(-r * 0.6 - leg, -r * 1.1);
          ctx.moveTo(-r * 0.6, r * 0.5); ctx.lineTo(-r * 0.6 + leg, r * 1.1);
          ctx.stroke();
          ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = fl ? '#fff' : '#ff6b5a';
          circle(ctx, -r * 0.35, -r * 0.25, r * 0.38); circle(ctx, -r * 0.2, r * 0.3, r * 0.32); circle(ctx, -r * 0.75, 0, r * 0.3);
          // bone carapace: overlapping plates down the back (why nothing gets through)
          ctx.fillStyle = '#d9d0bd'; ctx.strokeStyle = '#6b6252'; ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const px = r * 0.55 - i * r * 0.5;
            ctx.beginPath(); ctx.ellipse(px, 0, r * 0.32, r * 0.62 - i * r * 0.06, 0, -Math.PI / 2, Math.PI / 2); ctx.fill(); ctx.stroke();
          }
          ctx.fillStyle = skin; circle(ctx, r * 0.9, 0, r * 0.45);
          ctx.fillStyle = '#d9d0bd'; ctx.beginPath(); ctx.ellipse(r * 0.95, 0, r * 0.32, r * 0.42, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
          break;
        }
        case 'spitter': {
          const pulse = Math.sin(t * 6) * 0.06;
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.ellipse(-r * 0.15, 0, r * 1.05, r * 0.9, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = fl ? '#fff' : '#22361b';
          for (let i = 0; i < 4; i++) circle(ctx, -r * 0.9 + i * r * 0.3, 0, r * 0.14);
          ctx.fillStyle = fl ? '#fff' : '#b8e070';
          circle(ctx, r * 0.55, 0, r * (0.5 + pulse));
          ctx.fillStyle = skin; circle(ctx, r * 0.2, 0, r * 0.42);
          ctx.fillStyle = fl ? '#fff' : '#1b2a12';
          ctx.beginPath(); ctx.ellipse(r * 0.95, 0, r * 0.16, r * 0.3, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'brute': {
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 1.05, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = skin;
          const sw = Math.sin(t * 3) * r * 0.2;
          circle(ctx, r * 0.75 + sw, -r * 0.95, r * 0.45);
          circle(ctx, r * 0.75 - sw, r * 0.95, r * 0.45);
          ctx.fillStyle = fl ? '#fff' : '#2a2b31'; circle(ctx, r * 0.4, 0, r * 0.38);
          ctx.fillStyle = fl ? '#fff' : '#5e0f0c'; ctx.fillRect(-r * 0.6, -r * 0.2, r * 0.5, r * 0.15);
          break;
        }
        case 'mecha': {
          // Combat frame seen from above, facing +x, with Biscuit in the cockpit.
          const metal = fl ? '#ffffff' : body, dark = fl ? '#ffffff' : '#23272e', yel = fl ? '#ffffff' : skin, seam = fl ? '#dddddd' : '#16191d';
          const step = Math.sin(t * 5) * r * 0.32;
          // big feet, long enough to stride out past the hull
          for (const [sg, off] of [[-1, step], [1, -step]]) {
            ctx.fillStyle = dark; rrect(ctx, -r * 0.45 + off, sg * r * 0.5 - r * 0.2, r * 1.2, r * 0.4, r * 0.1); ctx.fill();
            ctx.strokeStyle = seam; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = yel; rrect(ctx, -r * 0.45 + off + r * 1.0, sg * r * 0.5 - r * 0.17, r * 0.18, r * 0.34, r * 0.06); ctx.fill();
          }
          ctx.fillStyle = metal; rrect(ctx, -r * 0.78, -r * 0.72, r * 1.36, r * 1.44, r * 0.24); ctx.fill();
          ctx.strokeStyle = seam; ctx.lineWidth = 1.4; ctx.stroke();
          // hazard-striped back plate
          ctx.save();
          rrect(ctx, -r * 0.76, -r * 0.5, r * 0.24, r * 1.0, r * 0.06); ctx.clip();
          ctx.fillStyle = yel; ctx.fillRect(-r, -r, r * 2, r * 2);
          if (!fl) { ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = r * 0.08; for (let i = -6; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.8, i * r * 0.2); ctx.lineTo(-r * 0.5, i * r * 0.2 + r * 0.3); ctx.stroke(); } }
          ctx.restore();
          // shoulder missile pods (carrot tips showing)
          for (const sg of [-1, 1]) {
            ctx.fillStyle = yel; rrect(ctx, -r * 0.48, sg * r * 0.97 - r * 0.25, r * 0.88, r * 0.5, r * 0.1); ctx.fill();
            ctx.strokeStyle = seam; ctx.lineWidth = 1.2; ctx.stroke();
            for (let i = 0; i < 3; i++) {
              const mx = -r * 0.28 + i * r * 0.27, my = sg * r * 0.97;
              ctx.fillStyle = fl ? '#fff' : '#1c1d20'; circle(ctx, mx, my, r * 0.1);
              ctx.fillStyle = fl ? '#fff' : '#ff8a2a'; circle(ctx, mx, my, r * 0.07);
            }
            // arm cannon
            ctx.fillStyle = dark; ctx.fillRect(r * 0.3, sg * r * 0.97 - r * 0.1, r * 0.82, r * 0.2);
            ctx.fillStyle = metal; ctx.fillRect(r * 1.02, sg * r * 0.97 - r * 0.13, r * 0.12, r * 0.26);
          }
          // antenna with a blinking tip
          ctx.strokeStyle = dark; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.38); ctx.lineTo(-r * 1.08, -r * 0.55); ctx.stroke();
          ctx.fillStyle = fl ? '#fff' : Math.sin(t * 5) > 0 ? '#ff3b5c' : '#5a1020'; circle(ctx, -r * 1.08, -r * 0.55, r * 0.06);
          // cockpit
          ctx.fillStyle = fl ? '#fff' : '#1b2a33'; circle(ctx, r * 0.12, 0, r * 0.5);
          // Biscuit: ears first (they flop back over the canopy rim), then head and face
          const sway = Math.sin(t * 5) * 0.08;
          for (const sg of [-1, 1]) {
            ctx.save();
            ctx.translate(r * 0.04, sg * r * 0.12);
            ctx.rotate(Math.PI + sg * (0.38 + sway));
            ctx.fillStyle = fl ? '#fff' : '#f5f0ea';
            ctx.beginPath(); ctx.ellipse(r * 0.27, 0, r * 0.3, r * 0.1, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = fl ? '#fff' : '#f4a6c0';
            ctx.beginPath(); ctx.ellipse(r * 0.29, 0, r * 0.21, r * 0.048, 0, 0, TAU); ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle = fl ? '#fff' : '#f5f0ea'; circle(ctx, r * 0.2, 0, r * 0.26);
          if (!fl) {
            ctx.fillStyle = 'rgba(255,140,170,0.55)'; circle(ctx, r * 0.31, -r * 0.15, r * 0.06); circle(ctx, r * 0.31, r * 0.15, r * 0.06);
            ctx.fillStyle = '#1a1416'; circle(ctx, r * 0.33, -r * 0.09, r * 0.05); circle(ctx, r * 0.33, r * 0.09, r * 0.05);
            ctx.fillStyle = '#ffffff'; circle(ctx, r * 0.345, -r * 0.1, r * 0.018); circle(ctx, r * 0.345, r * 0.08, r * 0.018);
            ctx.fillStyle = '#ef7fa2'; circle(ctx, r * 0.44, 0, r * 0.035);
            // determined little frown
            ctx.strokeStyle = '#1a1416'; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(r * 0.27, -r * 0.16); ctx.lineTo(r * 0.3, -r * 0.05); ctx.moveTo(r * 0.27, r * 0.16); ctx.lineTo(r * 0.3, r * 0.05); ctx.stroke();
          }
          // canopy glass and rim
          ctx.fillStyle = fl ? 'rgba(255,255,255,0.3)' : 'rgba(150,215,235,0.2)'; circle(ctx, r * 0.12, 0, r * 0.5);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.4, -2.5, -1.6); ctx.stroke();
          ctx.strokeStyle = yel; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.5, 0, TAU); ctx.stroke();
          break;
        }
        case 'stalker': {
          ctx.strokeStyle = fl ? '#fff' : '#6b3f7d'; ctx.lineWidth = 5;
          for (let i = -1; i <= 1; i++) {
            const w = Math.sin(t * 4 + i * 2) * r * 0.5;
            ctx.beginPath();
            ctx.moveTo(-r * 0.5, i * r * 0.4);
            ctx.bezierCurveTo(-r * 1.2, i * r * 0.6 + w, -r * 1.5, i * r * 0.9 - w, -r * 2, i * r * 1.1 + w);
            ctx.stroke();
          }
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 1.1, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = skin; circle(ctx, r * 0.15, -r * 0.8, r * 0.38); circle(ctx, r * 0.15, r * 0.8, r * 0.38);
          ctx.fillStyle = fl ? '#fff' : '#5a4a60'; circle(ctx, r * 0.45, 0, r * 0.42);
          ctx.fillStyle = fl ? '#fff' : '#7a2a3a'; circle(ctx, r * 0.55, r * 0.12, r * 0.18);
          break;
        }
      }
    }

    drawEyes(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.g.enemies) {
        if (e.dead || e.def.crate || !this.inView(e.x, e.y, e.r * 2)) continue;
        const spr = this.eyeSprite(e.type);
        const lift = e.def.mech ? mechLift(e) : 0;
        ctx.save();
        ctx.translate(e.x, e.y - lift * 70);
        if (lift) ctx.scale(1 + lift * 0.45, 1 + lift * 0.45);
        ctx.rotate(e.a);
        ctx.drawImage(spr, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawEnemyBars(ctx) {
      for (const e of this.g.enemies) {
        if (e.dead || !e.def.elite || e.hp >= e.maxHp) continue;
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
        ctx.fillStyle = '#c62a22'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * Math.max(0, e.hp / e.maxHp), 4);
        ctx.font = `700 9px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ff8a3a'; ctx.fillText('LV ' + e.level, e.x, e.y - e.r - 14);
        ctx.textBaseline = 'alphabetic';
      }
    }

    drawPlayer(ctx, p) {
      const g = this.g;
      if (p.downed) { this.drawDowned(ctx, p); return; }
      const blink = p.iframes > 0 && Math.floor(g.time * 30) % 2 === 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(0, p.r * 0.75, p.r * 1.1, p.r * 0.45, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink ? 0.45 : 1;

      OO.Characters.drawTopDown(ctx, p, g.time);

      if (p.hurt > 0) {
        ctx.globalAlpha = p.hurt / 0.3 * 0.6;
        ctx.fillStyle = '#ff2a1a'; circle(ctx, 0, 0, p.r + 2);
      }
      ctx.restore();

      // HP bar under the operative
      const w = 38, y = p.y + p.r + 9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = '#3a0c0a'; ctx.fillRect(p.x - w / 2, y, w, 4);
      ctx.fillStyle = p.hp / p.stats.maxHp < 0.3 ? '#ff3b2f' : '#c62a22';
      ctx.fillRect(p.x - w / 2, y, w * U.clamp(p.hp / p.stats.maxHp, 0, 1), 4);
    }

    /** Co-op: a downed operative lies on the ground with a revive ring that fills while a teammate stands close. */
    drawDowned(ctx, p) {
      const g = this.g, C = OO.CONFIG.COOP;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(90,10,8,0.55)'; circle(ctx, 0, 4, p.r * 1.6);
      ctx.rotate(0.5);
      ctx.globalAlpha = 0.75;
      const sk = OO.Characters.skinOf(p.charId, p.skin), look = OO.Characters.LOOKS[p.charId];
      ctx.fillStyle = sk.top || look.skin;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.1, p.r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = look.skin; circle(ctx, p.r * 1.05, 0, 4.2);
      ctx.restore();
      const k = U.clamp(p.reviveT / C.reviveTime, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(g.time * 5);
      ctx.strokeStyle = `rgba(235,226,207,${0.25 + pulse * 0.2})`; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(p.x, p.y, C.reviveRadius, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (k > 0) {
        ctx.strokeStyle = '#56d6c0'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
      }
    }

    /** Co-op name tags over each operative, drawn over the darkness. */
    drawPlayerTags(ctx) {
      ctx.font = `700 10px ${FONT_MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const p of this.g.players) {
        const label = p.tag + (p.downed ? ' DOWN' : '');
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(label, p.x + 1, p.y - p.r - 9);
        ctx.fillStyle = p.downed ? '#ff5a4a' : p.tint; ctx.fillText(label, p.x, p.y - p.r - 10);
      }
      ctx.textBaseline = 'alphabetic';
    }

    drawPickups(ctx) {
      const t = this.g.time;
      for (const g of this.g.pickups) {
        if (g.dead || !this.inView(g.x, g.y, 20)) continue;
        if (g.life < OO.CONFIG.PICKUPS.blink && Math.floor(g.life * 8) % 2 === 0) continue;   // about to despawn
        const bob = g.attract ? 0 : Math.sin(t * 3 + g.t) * 2;
        const x = g.x, y = g.y + bob;
        if (g.kind === 'xp') {
          const tier = g.value >= 10 ? 2 : g.value >= 3 ? 1 : 0;
          const spr = this.gemSprite(tier);
          ctx.drawImage(spr, x - spr.half, y - spr.half, spr.half * 2, spr.half * 2);
          continue;
        }
        const pulse = 0.5 + Math.sin(t * 5 + g.t) * 0.5;
        if (g.kind === 'case') {
          ctx.fillStyle = `rgba(227,163,59,${0.15 + pulse * 0.2})`; circle(ctx, x, y, 30);
          ctx.fillStyle = '#6c707c'; ctx.fillRect(x - 15, y - 10, 30, 20);
          ctx.fillStyle = '#e3a33b'; ctx.fillRect(x - 15, y - 2, 30, 4);
          ctx.fillStyle = '#2a2b31'; ctx.fillRect(x - 5, y - 14, 10, 4);
          ctx.strokeStyle = '#2a2b31'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 15, y - 10, 30, 20);
          continue;
        }
        const map = { herb: ['herb', '#6fd05a'], magnet: ['magnet', '#56d6c0'], bomb: ['tesla', '#ff5a4a'], credit: ['credits', '#e3a33b'] };
        const [icon, col] = map[g.kind] || ['credits', '#fff'];
        ctx.fillStyle = col + '30'; circle(ctx, x, y, 14 + pulse * 3);
        ctx.drawImage(OO.Icons.image(icon, 20, col), x - 10, y - 10, 20, 20);
      }
    }

    /** DNA sample gem: 0 = small teal, 1 = green, 2 = big red. */
    gemSprite(tier) {
      const key = 'gem' + tier;
      let c = this.cache.get(key);
      if (c) return c;
      const col = ['#56d6c0', '#9ee05a', '#ff5a4a'][tier], s = [4.5, 5.5, 7][tier], half = Math.ceil(s * 2 + 1);
      c = document.createElement('canvas');
      c.width = c.height = half * 2 * SPRITE_SCALE;
      const x = c.getContext('2d');
      x.scale(SPRITE_SCALE, SPRITE_SCALE);
      x.translate(half, half);
      x.fillStyle = col + '33'; circle(x, 0, 0, s * 2);
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, -s * 1.4); x.lineTo(s, 0); x.lineTo(0, s * 1.4); x.lineTo(-s, 0); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(-1, -s * 0.8, 1.6, s * 0.7);
      c.half = half;
      this.cache.set(key, c);
      return c;
    }

    /**
     * Stampede warning lane, drawn over the darkness: one solid red band exactly as wide as the
     * Burster row and as long as its run, with edge lines and chevrons in the direction of travel.
     * It is fixed in place from the first frame (the lane never tracks anyone). Pulses faster in
     * the last STAMPEDE.lockAt seconds.
     */
    drawStampedeLanes(ctx) {
      const g = this.g, t = g.time, sp = OO.CONFIG.STAMPEDE.spacing;
      for (const st of g.stampedes) {
        const L = g.stampedeLane(st), ang = Math.atan2(L.dy, L.dx);
        const len = L.back * 2;
        const k = 1 - st.t / st.warn;
        const pulse = st.locked ? 0.5 + 0.5 * Math.sin(t * 30) : 0.5 + 0.5 * Math.sin(t * 8);
        ctx.save();
        ctx.translate(L.sx, L.sy);
        ctx.rotate(ang);
        // one continuous band covering the whole row (local x = direction of travel, local y = across)
        const halfW = (st.count * sp) / 2;
        ctx.fillStyle = `rgba(210,30,25,${(0.05 + k * 0.1) + pulse * 0.06})`;
        ctx.fillRect(0, -halfW, len, halfW * 2);
        ctx.strokeStyle = `rgba(255,60,50,${0.35 + k * 0.35 + (st.locked ? pulse * 0.25 : 0)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -halfW); ctx.lineTo(len, -halfW); ctx.moveTo(0, halfW); ctx.lineTo(len, halfW); ctx.stroke();
        // chevrons
        ctx.strokeStyle = `rgba(255,80,60,${0.18 + k * 0.3 + (st.locked ? pulse * 0.3 : 0)})`;
        ctx.lineWidth = 3;
        const half = L.width / 2, step = 90, shift = (t * 260) % step;
        ctx.beginPath();
        for (let x = shift; x < len; x += step) {
          ctx.moveTo(x, -half * 0.5); ctx.lineTo(x + 26, 0); ctx.lineTo(x, half * 0.5);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    /** Acid pools: drawn over the darkness so you can always see where not to stand. */
    drawHazards(ctx) {
      const t = this.g.time;
      for (const h of this.g.hazards) {
        if (!this.inView(h.x, h.y, h.r)) continue;
        const a = Math.min(1, h.life / 0.6, (h.max - h.life) / 0.15 + 0.2);
        const gr = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
        gr.addColorStop(0, `rgba(150,210,60,${0.5 * a})`);
        gr.addColorStop(0.7, `rgba(110,170,40,${0.38 * a})`);
        gr.addColorStop(1, 'rgba(80,120,20,0)');
        ctx.fillStyle = gr; circle(ctx, h.x, h.y, h.r);
        ctx.fillStyle = `rgba(210,255,140,${0.6 * a})`;
        for (let i = 0; i < 4; i++) {
          const ph = (t * 1.3 + h.seed + i * 0.37) % 1;
          const ang = h.seed * 7 + i * 2.1, rr = h.r * 0.55 * ((i * 0.31 + h.seed) % 1);
          circle(ctx, h.x + Math.cos(ang) * rr, h.y + Math.sin(ang) * rr, 1 + ph * 3.5);
        }
      }
    }

    /** Spitter globs in flight, plus a closing reticle on the landing spot. */
    drawEnemyShots(ctx) {
      for (const s of this.g.enemyShots) {
        const k = U.clamp(s.t / s.dur, 0, 1);
        ctx.strokeStyle = `rgba(190,240,90,${0.25 + k * 0.55})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(s.x1, s.y1, s.r * (1.5 - k * 0.5), 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        const x = U.lerp(s.x0, s.x1, k), y = U.lerp(s.y0, s.y1, k) - Math.sin(k * Math.PI) * 80;
        ctx.fillStyle = 'rgba(150,210,60,0.35)'; circle(ctx, x, y, 9);
        ctx.fillStyle = '#c6f06a'; circle(ctx, x, y, 5);
      }
    }

    drawProjectiles(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const pr of this.g.projectiles) {
        const k = pr.kind === 'pellet' ? 0.022 : 0.035;
        ctx.strokeStyle = pr.kind === 'pellet' ? '#ffb35a' : '#ffd98a';
        ctx.lineWidth = pr.kind === 'pellet' ? 2 : 2.6;
        ctx.beginPath(); ctx.moveTo(pr.x - pr.vx * k, pr.y - pr.vy * k); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawLobs(ctx) {
      for (const l of this.g.lobs) {
        if (l.t < 0) continue;
        const k = l.t / l.dur;
        const x = U.lerp(l.x0, l.x1, k), y = U.lerp(l.y0, l.y1, k), h = Math.sin(k * Math.PI) * 70;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; circle(ctx, x, y, 4);
        ctx.fillStyle = '#4b5a2e'; circle(ctx, x, y - h, 5);
        ctx.fillStyle = '#e3a33b'; circle(ctx, x + 1.5, y - h - 2, 1.5);
      }
    }

    drawEffects(ctx, overDark) {
      for (const f of this.g.effects) {
        const a = Math.max(0, f.life / f.max);
        if (f.kind === 'slash' && !overDark) {
          ctx.save();
          ctx.translate(f.x, f.y); ctx.rotate(f.ang);
          const L = f.len, W = f.wid / 2, grow = 1 - a * 0.3;
          ctx.fillStyle = `rgba(236,228,210,${0.85 * a})`;
          ctx.beginPath();
          ctx.moveTo(L * 0.15, -W);
          ctx.quadraticCurveTo(L * 1.2 * grow, 0, L * 0.15, W);
          ctx.quadraticCurveTo(L * 0.75 * grow, 0, L * 0.15, -W);
          ctx.fill();
          ctx.strokeStyle = `rgba(200,40,30,${0.7 * a})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(L * 0.2, -W * 0.9); ctx.quadraticCurveTo(L * 1.1 * grow, 0, L * 0.2, W * 0.9); ctx.stroke();
          ctx.restore();
        } else if (f.kind === 'burst' && !overDark) {
          const r = f.r * (1.1 - a * 0.6);
          const fire = f.tint === 'fire';
          ctx.fillStyle = fire ? `rgba(255,120,30,${0.5 * a})` : f.blood ? `rgba(200,40,30,${0.5 * a})` : `rgba(185,201,74,${0.45 * a})`; circle(ctx, f.x, f.y, r);
          ctx.strokeStyle = fire ? `rgba(255,220,140,${0.9 * a})` : f.blood ? `rgba(255,170,120,${0.85 * a})` : `rgba(230,255,140,${0.8 * a})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
        } else if (f.kind === 'pulse' && overDark) {
          const r = f.r * (1 - a * 0.7);
          ctx.strokeStyle = `rgba(255,122,217,${0.8 * a})`; ctx.lineWidth = 2 + a * 5;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(160,40,140,${0.12 * a})`; circle(ctx, f.x, f.y, r);
        } else if (f.kind === 'flashbang' && overDark) {
          const r = f.r * (1 - a * 0.85);
          ctx.fillStyle = `rgba(255,252,236,${0.35 * a * a})`; circle(ctx, f.x, f.y, r);
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = 2 + a * 4;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
        } else if (f.kind === 'eject' && overDark) {
          this.drawEject(ctx, f, a);
        } else if (f.kind === 'bolt' && overDark) {
          ctx.globalCompositeOperation = 'lighter';
          const pts = f.points;
          for (const [col, lw] of [[`rgba(120,190,255,${0.5 * a})`, 5], [`rgba(235,248,255,${a})`, 1.6]]) {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) {
              const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
              const segs = 5;
              for (let s = 1; s <= segs; s++) {
                const k = s / segs, j = s === segs ? 0 : 12;
                ctx.lineTo(U.lerp(x0, x1, k) + U.rand(-j, j), U.lerp(y0, y1, k) + U.rand(-j, j));
              }
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    drawParticles(ctx) {
      for (const q of this.g.particles) {
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;
    }

    drawTexts(ctx) {
      ctx.textAlign = 'center';
      ctx.font = `700 12px ${FONT_MONO}`;
      for (const t of this.g.texts) {
        ctx.globalAlpha = Math.min(1, t.life / t.max * 1.6);
        const col = t.kind === 'hurt' ? '#ff5a4a' : t.kind === 'heal' ? '#7ddc6a' : t.kind === 'credit' ? '#e3a33b' : t.kind === 'immune' ? '#9fd4ff' : '#ebe2cf';
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillText(t.val, t.x + 1, t.y + 1);
        ctx.fillStyle = col;
        ctx.fillText(t.val, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- darkness
    drawDarkness() {
      const g = this.g, p = g.player, d = this.dctx, W = this.dark.width, H = this.dark.height;
      const z = g.zoom * 0.5, cam = this.cam, sx = this.sx * 0.5, sy = this.sy * 0.5;
      const X = (wx) => (wx - cam.x) * z + sx, Y = (wy) => (wy - cam.y) * z + sy;
      const punch = (wx, wy, r, i) => {
        const cx = X(wx), cy = Y(wy), R = r * z;
        if (cx + R < 0 || cy + R < 0 || cx - R > W || cy - R > H) return;
        const gr = d.createRadialGradient(cx, cy, 0, cx, cy, R);
        gr.addColorStop(0, `rgba(0,0,0,${i})`);
        gr.addColorStop(0.5, `rgba(0,0,0,${i * 0.8})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gr; d.beginPath(); d.arc(cx, cy, R, 0, TAU); d.fill();
      };

      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, W, H);
      d.fillStyle = 'rgba(2,9,11,0.88)';
      d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = 'destination-out';

      for (const [lx, ly, lr, li] of this.scenery.lightSources(g.time)) punch(lx, ly, lr, li);
      for (const pl of g.players) {
        if (pl.downed) { punch(pl.x, pl.y, 140, 0.7); continue; }
        punch(pl.x, pl.y, OO.CONFIG.LIGHT_RADIUS * (pl === p ? 1 : 0.8), 1);
        // flashlight cone in the facing direction
        const cx = X(pl.x), cy = Y(pl.y), R = 560 * z, a = pl.faceAngle;
        const cg = d.createRadialGradient(cx, cy, 0, cx, cy, R);
        cg.addColorStop(0, 'rgba(0,0,0,0.75)'); cg.addColorStop(0.6, 'rgba(0,0,0,0.45)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = cg;
        d.beginPath(); d.moveTo(cx, cy); d.arc(cx, cy, R, a - 0.42, a + 0.42); d.closePath(); d.fill();
      }

      for (const zn of g.zones) punch(zn.x, zn.y, zn.r * 2.6, 0.85 * Math.min(1, zn.life / 0.4));
      for (const l of g.lights) punch(l.x, l.y, l.r, l.i * Math.max(0, l.life / l.max));
      for (const pk of g.pickups) if (pk.kind === 'case') punch(pk.x, pk.y, 90, 0.6);

      this.ctx.globalAlpha = 1 - g.flashWhite * 0.8;
      this.ctx.drawImage(this.dark, 0, 0, this.w, this.h);
      this.ctx.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- screen space
    drawScreenFx() {
      const g = this.g, p = g.player, ctx = this.ctx, w = this.w, h = this.h;
      if (p.downed) {
        ctx.fillStyle = 'rgba(40,0,0,0.45)'; ctx.fillRect(0, 0, w, h);
        ctx.font = `800 30px ${FONT_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff5a4a'; ctx.fillText('YOU ARE DOWN', w / 2, h * 0.62);
        ctx.font = `500 12px ${FONT_MONO}`; ctx.fillStyle = '#ebe2cf';
        ctx.fillText('Your partner can revive you by standing next to you for ' + OO.CONFIG.COOP.reviveTime + 's', w / 2, h * 0.62 + 28);
        ctx.textBaseline = 'alphabetic';
        return;
      }
      const low = p.hp / p.stats.maxHp < 0.3;
      const hurtA = Math.max(0, p.hurt / 0.3) * 0.55 + (low ? 0.25 + Math.sin(g.time * 6) * 0.12 : 0);
      if (hurtA > 0.01) {
        const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        gr.addColorStop(0, 'rgba(120,0,0,0)');
        gr.addColorStop(1, `rgba(150,8,4,${hurtA})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      }
      if (g.flashWhite > 0) {
        ctx.fillStyle = `rgba(255,244,220,${g.flashWhite * 0.85})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ---------------------------------------------------------------- HUD
    /** A glass plate with bracketed corners, the HUD's one framing device. */
    plate(x, y, w, h, accent) {
      const ctx = this.ctx, b = 8;
      ctx.fillStyle = 'rgba(5,14,16,0.78)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(46,90,95,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = accent || '#52e6c6';
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        ctx.fillRect(sx > 0 ? cx : cx - b, sy > 0 ? cy : cy - 1, b, 1);
        ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - b, 1, b);
      }
    }

    /** Vital signs for one operative: status, ECG trace that speeds up as HP drops, HP readout. */
    vitals(p) {
      const k = p.stats && p.stats.maxHp ? U.clamp(p.hp / p.stats.maxHp, 0, 1) : 0;
      if (p.downed) return { k: 0, status: 'DOWN', color: '#ff3b4e', bpm: 0, flat: true };
      if (k > 0.6) return { k, status: 'STABLE', color: '#52e6c6', bpm: Math.round(66 + (1 - k) * 40), flat: false };
      if (k > 0.3) return { k, status: 'STRAINED', color: '#f2b23a', bpm: Math.round(96 + (0.6 - k) * 90), flat: false };
      return { k, status: 'CRITICAL', color: '#ff3b4e', bpm: Math.round(128 + (0.3 - k) * 140), flat: false };
    }

    drawVitals(x, y, w, p, big) {
      const ctx = this.ctx, g = this.g, v = this.vitals(p), h = big ? 84 : 50;
      this.plate(x, y, w, h, v.color);
      // header: name and status
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.font = `600 ${big ? 12 : 11}px ${FONT_UI}`;
      ctx.fillStyle = '#82a09b';
      ctx.fillText((g.players.length > 1 ? p.tag + '  ' : '') + p.name, x + 10, y + 7);
      ctx.textAlign = 'right'; ctx.fillStyle = v.color;
      const blink = v.status === 'CRITICAL' || v.status === 'DOWN' ? (Math.sin(g.time * 8) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = blink;
      ctx.font = `700 ${big ? 12 : 11}px ${FONT_UI}`;
      ctx.fillText(v.status, x + w - 10, y + 7);
      ctx.globalAlpha = 1;
      // trace
      const tw = big ? w - 98 : w - 70, th = big ? 44 : 22, ty = y + (big ? 26 : 22);
      ECG.draw(ctx, x + 10, ty, tw, th, g.time + p.slot * 0.37, {
        bpm: v.bpm || 60, color: v.color, flat: v.flat, amp: v.flat ? 0 : 0.85 + (1 - v.k) * 0.15,
        noise: v.status === 'CRITICAL' ? 0.8 : 0, reduced: g.reducedMotion, grid: big,
      });
      // numbers
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${big ? 24 : 16}px ${FONT_MONO}`;
      ctx.fillStyle = '#dce7e3';
      ctx.fillText(String(Math.max(0, Math.ceil(p.hp))), x + w - 10, ty + (big ? 22 : 17));
      if (big) {
        ctx.font = `500 10px ${FONT_MONO}`; ctx.fillStyle = '#5a7672';
        ctx.fillText('/' + Math.round(p.stats.maxHp) + ' HP', x + w - 10, ty + 35);
        ctx.fillStyle = v.color;
        ctx.fillText(v.flat ? '-- BPM' : v.bpm + ' BPM', x + w - 10, ty + 48);
      }
      // HP bar along the bottom edge
      ctx.fillStyle = 'rgba(82,230,198,0.1)'; ctx.fillRect(x + 1, y + h - 4, w - 2, 3);
      ctx.fillStyle = v.color; ctx.fillRect(x + 1, y + h - 4, (w - 2) * (p.downed ? U.clamp(p.reviveT / OO.CONFIG.COOP.reviveTime, 0, 1) : v.k), 3);
      return h;
    }

    drawHud() {
      const g = this.g, p = g.player, ctx = this.ctx, W = this.w, H = this.h;
      const narrow = W < 560;

      // XP: a thin specimen-tube strip across the top
      const T = g.team, prog = U.clamp(T.xp / T.xpNext, 0, 1);
      ctx.fillStyle = 'rgba(5,14,16,0.9)'; ctx.fillRect(0, 0, W, 6);
      const xg = ctx.createLinearGradient(0, 0, W * prog, 0);
      xg.addColorStop(0, '#1d6f62'); xg.addColorStop(1, '#52e6c6');
      ctx.fillStyle = xg; ctx.fillRect(0, 0, W * prog, 6);
      ctx.fillStyle = 'rgba(5,14,16,0.7)';
      for (let x = 24; x < W; x += 24) ctx.fillRect(x, 0, 1, 6);
      ctx.fillStyle = '#2e5a5f'; ctx.fillRect(0, 6, W, 1);

      // Vitals monitor, then weapon and gear slots under it
      const vx = 12, vy = 14, vw = narrow ? 200 : 250;
      const vh = this.drawVitals(vx, vy, vw, p, true);
      ctx.font = `700 11px ${FONT_MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#52e6c6';
      const lvl = 'LV ' + T.level;
      ctx.fillText(lvl, vx + vw + 8, vy + 2);

      const slot = 30, gap = 4, sy0 = vy + vh + 8;
      const drawSlot = (x, y, icon, lvl2, max, color) => {
        ctx.fillStyle = 'rgba(5,14,16,0.78)'; ctx.fillRect(x, y, slot, slot);
        ctx.strokeStyle = lvl2 >= max ? color : 'rgba(46,90,95,0.7)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);
        ctx.drawImage(OO.Icons.image(icon, 20, color), x + 5, y + 4, 20, 20);
        const pip = (slot - 6) / max;
        for (let i = 0; i < max; i++) {
          ctx.fillStyle = i < lvl2 ? color : 'rgba(220,231,227,0.12)';
          ctx.fillRect(x + 3 + i * pip, y + slot - 4, Math.max(1, pip - 1), 2);
        }
      };
      p.weapons.forEach((w, i) => {
        const x = vx + i * (slot + gap);
        drawSlot(x, sy0, w.def.icon, w.level, w.maxLevel, w.over ? '#ff7ad9' : w.def.evolved ? '#ff7a52' : '#f2b23a');
        if (w.over) {   // Apex overclocks: +n badge
          ctx.font = `700 9px ${FONT_MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillStyle = '#ff7ad9'; ctx.fillText('+' + w.over, x + slot - 2, sy0 + 1);
        }
      });
      p.passiveOrder.forEach((id, i) => drawSlot(vx + i * (slot + gap), sy0 + slot + gap, OO.PASSIVES[id].icon, p.passives[id], OO.PASSIVES[id].max, '#52e6c6'));
      if (g.players.length > 1) this.drawPartnerPanel(sy0 + (slot + gap) * 2 + 6, vw);

      // Mission clock, centre top
      const remaining = OO.CONFIG.RUN_LENGTH - g.time;
      const over = g.infinite && remaining <= 0;
      const cw = narrow ? 120 : 150, cx = W / 2 - cw / 2, cy = 14;
      this.plate(cx, cy, cw, 44, over ? '#ff3b4e' : remaining < 60 ? '#f2b23a' : '#52e6c6');
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `600 ${narrow ? 22 : 26}px ${FONT_MONO}`;
      ctx.fillStyle = over ? '#ff6b78' : remaining < 60 ? '#f2b23a' : '#dce7e3';
      ctx.fillText(U.formatTime(g.time), W / 2, cy + 4);
      ctx.font = `600 10px ${FONT_UI}`;
      ctx.fillStyle = over ? '#ff8a94' : '#82a09b';
      const sub = over ? 'Overtime +' + U.formatTime(-remaining)
        : (g.infinite ? 'Overtime in ' : 'Evac in ') + U.formatTime(remaining);
      ctx.fillText(sub + (g.difficulty !== OO.DIFFICULTY.standard ? '  ' + g.difficulty.name : ''), W / 2, cy + (narrow ? 29 : 32) - 1);

      // Strain line under the clock
      const S = g.strain, sl = S.level;
      ctx.font = `600 11px ${FONT_MONO}`;
      ctx.fillStyle = sl >= 12 ? '#ff3b4e' : sl >= 6 ? '#f2b23a' : '#82a09b';
      const surge = g.surgeMinutes() > 0 ? '   SURGE HP x' + g.surgeHp().toFixed(1) + (S.capped ? ' (MAX)' : '') + '  DMG x' + g.surgeDmg().toFixed(1) : '';
      if (surge) ctx.fillStyle = '#ff3b4e';
      if (over) {
        ctx.fillStyle = '#ff3b4e';
        ctx.fillText('OVERTIME  HP x' + g.overtimeHp().toFixed(1) + '  DMG x' + g.overtimeDmg().toFixed(1) + '  SPD x' + g.overtimeSpeed().toFixed(2) + '  HEAL ' + Math.round(g.healMul() * 100) + '%', W / 2, cy + 50);
      } else ctx.fillText('STRAIN ' + sl + (S.rising > 0 ? '  ▲ ADAPTING' : '') + surge, W / 2, cy + 50);
      if (p.apexTotal) {
        ctx.font = `700 11px ${FONT_UI}`;
        ctx.fillStyle = '#ff7ad9';
        ctx.fillText('APEX ' + p.apexTotal, W / 2, cy + 64);
      }

      this.drawOffscreenMarkers();

      // Kills and credits, left of the DOM pause/mute buttons
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = `600 14px ${FONT_MONO}`;
      const rx = narrow ? W - 12 : W - 128, ky = narrow ? 62 : 30, cry = narrow ? 80 : 50;
      ctx.fillStyle = '#dce7e3'; ctx.fillText(String(g.kills), rx, ky);
      ctx.drawImage(OO.Icons.image('skull', 14, '#82a09b'), rx - ctx.measureText(String(g.kills)).width - 20, ky - 7, 14, 14);
      ctx.fillStyle = '#f2b23a'; ctx.fillText(String(g.credits), rx, cry);
      ctx.drawImage(OO.Icons.image('credits', 14, '#f2b23a'), rx - ctx.measureText(String(g.credits)).width - 20, cry - 7, 14, 14);

      // Stampede origin arrows at the screen edge
      for (const st of g.stampedes) {
        const L = g.stampedeLane(st);
        const ang = Math.atan2(L.sy - p.y, L.sx - p.x);
        const ccx = W / 2, ccy = H / 2, m = 46;
        const tx = Math.cos(ang), ty = Math.sin(ang);
        const sc = Math.min((ccx - m) / Math.max(Math.abs(tx), 1e-3), (ccy - m) / Math.max(Math.abs(ty), 1e-3));
        const ex = ccx + tx * sc, ey = ccy + ty * sc;
        const pulse = 0.55 + 0.45 * Math.sin(g.time * (st.locked ? 30 : 10));
        ctx.save();
        ctx.translate(ex, ey); ctx.rotate(ang + Math.PI);
        ctx.fillStyle = `rgba(255,59,78,${pulse})`;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(-14 + i * 12, -14); ctx.lineTo(i * 12, 0); ctx.lineTo(-14 + i * 12, 14); ctx.lineTo(-8 + i * 12, 0); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.font = `700 14px ${FONT_UI}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,90,100,${pulse})`;
        ctx.fillText(st.locked ? 'INCOMING' : 'STAMPEDE', ex - tx * 46, ey - ty * 46);
      }

      // Boss health: a name plate over a segmented bar
      const bosses = g.bosses;
      if (bosses.length) {
        const mech = bosses.find((b) => b.def.mech);
        let hp = 0, max = 0;
        for (const b of mech ? [mech] : bosses) { hp += Math.max(0, b.hp); max += b.maxHp; }
        const bw = Math.min(460, W - 40), bx = (W - bw) / 2, by = narrow ? 112 : 100;
        const label = mech ? 'HARE TRIGGER' + (mech.ai.over ? '  ·  OVERDRIVE' : '') : bosses.length > 1 ? 'THE STALKERS' : 'THE STALKER';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.font = `700 14px ${FONT_UI}`; ctx.fillStyle = '#ff3b4e';
        ctx.fillText(label, bx, by - 3);
        if (mech) {
          ctx.textAlign = 'right'; ctx.font = `600 10px ${FONT_UI}`; ctx.fillStyle = '#f4a6c0';
          ctx.fillText('Pilot: Biscuit (lab subject B-0)', bx + bw, by - 4);
        }
        ctx.fillStyle = 'rgba(5,14,16,0.85)'; ctx.fillRect(bx - 2, by - 1, bw + 4, 11);
        ctx.fillStyle = '#4a0c14'; ctx.fillRect(bx, by + 1, bw, 7);
        const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        bg.addColorStop(0, '#8f1020'); bg.addColorStop(1, '#ff3b4e');
        ctx.fillStyle = bg; ctx.fillRect(bx, by + 1, bw * (hp / max), 7);
        ctx.fillStyle = 'rgba(5,14,16,0.85)';
        for (let i = 1; i < 20; i++) ctx.fillRect(bx + (bw / 20) * i, by + 1, 1, 7);
      }
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }

    /** Co-op: partner's vitals (small monitor) under your gear slots. */
    drawPartnerPanel(y, w) {
      const g = this.g;
      for (const q of g.players) {
        if (q === g.player) continue;
        y += this.drawVitals(12, y, Math.min(w, 200), q, false) + 6;
      }
    }

    drawOffscreenMarkers() {
      const g = this.g, ctx = this.ctx, z = g.zoom, W = this.w, H = this.h;
      const marks = [];
      for (const q of g.players) if (q !== g.player) marks.push([q.x, q.y, q.downed ? '#ff5a4a' : q.tint, 12]);
      for (const e of g.enemies) {
        if (e.dead || !(e.def.boss || e.def.elite)) continue;
        marks.push([e.x, e.y, e.def.boss ? '#ff3b2f' : '#ff8a3a', e.def.boss ? 13 : 9]);
      }
      for (const k of g.pickups) if (k.kind === 'case' && !k.dead) marks.push([k.x, k.y, '#e3a33b', 9]);
      const cx = W / 2, cy = H / 2, mx = 22, myTop = 100, myBot = 22;
      for (const [wx, wy, col, size] of marks) {
        const sx = (wx - this.cam.x) * z, sy = (wy - this.cam.y) * z;
        if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
        const a = Math.atan2(sy - cy, sx - cx), tx = Math.cos(a), ty = Math.sin(a);
        const kx = (cx - mx) / Math.max(Math.abs(tx), 1e-3);
        const ky = ty < 0 ? (cy - myTop) / Math.max(-ty, 1e-3) : (cy - myBot) / Math.max(ty, 1e-3);
        const k = Math.min(kx, ky), px = cx + tx * k, py = cy + ty * k;
        ctx.save();
        ctx.translate(px, py); ctx.rotate(a);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.75 + Math.sin(g.time * 6) * 0.2;
        ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.75); ctx.lineTo(-size * 0.35, 0); ctx.lineTo(-size * 0.7, size * 0.75); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    drawStick() {
      const s = OO.Input.stick, ctx = this.ctx;
      if (!s.active || this.g.state !== 'playing') return;
      const dx = s.x - s.sx, dy = s.y - s.sy, d = Math.hypot(dx, dy), m = Math.min(d, s.max);
      const kx = s.sx + (d ? (dx / d) * m : 0), ky = s.sy + (d ? (dy / d) * m : 0);
      ctx.strokeStyle = 'rgba(235,226,207,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, s.max, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(235,226,207,0.35)'; circle(ctx, kx, ky, 22);
    }

    drawDebug() {
      const g = this.g, ctx = this.ctx;
      const lines = [
        'FPS ' + g.fps.toFixed(0),
        'enemies ' + g.enemies.length + '  projectiles ' + g.projectiles.length,
        'pickups ' + g.pickups.length + '  particles ' + g.particles.length,
        'wave ' + Math.floor(g.time / 60) + '  zoom ' + g.zoom.toFixed(2),
        'strain ' + g.strain.level + ' = time ' + g.strain.timeLevel.toFixed(1) + ' + adapt ' + g.strain.adapt.toFixed(2) +
          '  one-hit ' + Math.round(g.strain.oneShot * 100) + '%  shambler hp ' + Math.round(OO.ENEMIES.shambler.hp * g.enemyHpMul(OO.ENEMIES.shambler, g.strain.level)),
        '[L] level  [T] +1 min  [H] heal  [B] boss  [J] +1 strain',
      ];
      ctx.font = `500 11px ${FONT_MONO}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(8, this.h - 18 * lines.length - 16, 560, 18 * lines.length + 8);
      ctx.fillStyle = '#9ee05a';
      lines.forEach((l, i) => ctx.fillText(l, 14, this.h - 18 * lines.length - 12 + i * 18));
      ctx.textBaseline = 'alphabetic';
    }
  }

  OO.Renderer = Renderer;
})(window.OO = window.OO || {});
