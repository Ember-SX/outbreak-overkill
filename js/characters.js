/*
 * Operatives: skin sets, the top-down sprite drawn in the field, and the front-facing portrait
 * used by the menu dossier and the Armory wardrobe. Everything is canvas primitives.
 *
 * Each operative has a build (body proportions) and five skins. A skin is plain data: colours
 * plus a few style keys (top, legs, vest, head, hair, pack...). The same data drives both the
 * portrait and the in-game sprite, so a new skin needs no new drawing code unless it brings a
 * new garment type.
 *
 * Silhouettes: Mara is a patrol officer (fitted uniform, duty vest, hair up), Dex is a heavy
 * contractor (wide shoulders, plate carrier, bare forearms, shotgun on his back), Rin is a lab
 * technician in a powered containment suit (helmet dome, air unit, glowing seams).
 */
(function (OO) {
  'use strict';

  const U = OO.U;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- colour helpers
  function rgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /** amt < 0 darkens toward black, amt > 0 lightens toward white. */
  function shade(hex, amt) {
    const [r, g, b] = rgb(hex);
    const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    const f = (c) => Math.round(c + (t - c) * k);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

  // ---------------------------------------------------------------- data
  // Builds are in portrait units (the portrait is drawn on a 240 x 320 grid).
  const BUILDS = {
    mara: { neck: 7.5, sh: 43, chest: 34, waist: 24, hip: 38, arm: 7.5, headRx: 19, headRy: 23.5, headY: 54, bust: 1, bulk: 0.92, jaw: 0.78 },
    dex:  { neck: 15, sh: 63, chest: 52, waist: 39, hip: 40, arm: 14, headRx: 23, headRy: 26, headY: 54, bust: 0, bulk: 1.14, jaw: 1 },
    rin:  { neck: 7, sh: 40, chest: 32, waist: 23, hip: 37, arm: 7, headRx: 18.5, headRy: 23, headY: 55, bust: 1, bulk: 0.9, jaw: 0.72 },
  };

  const LOOKS = {
    mara: { skin: '#c99677', hair: '#5a2618', lips: '#b0504a', eyes: '#3b2a1c', iris: '#6f7b3a', brow: '#3c1a10' },
    dex:  { skin: '#6a422e', hair: '#141010', lips: '#5a2e25', eyes: '#1b120d', iris: '#4a2a18', brow: '#100b09' },
    rin:  { skin: '#e3bc99', hair: '#121318', lips: '#c46a6c', eyes: '#1d1714', iris: '#4b3226', brow: '#15121a' },
  };

  /** Skin price: three full evacuations' worth of payout (a clean 15:00 run banks ~550-650 credits). */
  const SKIN_COST = 1800;

  const SKINS = {
    mara: [
      { id: 'tactical', name: 'Patrol uniform', text: 'R.U.S.T. patrol blues under a soft armor vest. Hair up, radio on the shoulder.',
        top: '#1f3550', topKind: 'shirt', sleeves: 'long', legs: '#18222e', legKind: 'pants',
        vest: { color: '#121921', kind: 'police' }, belt: '#121316', holster: 'thigh', hair: 'bun', head: null,
        gloves: '#1a1a1c', accent: '#5fd0ff', pack: 'radio' },
      { id: 'covert', name: 'Night shift', text: 'Matte black fatigues and a chest rig for jobs that never make the report.',
        top: '#16191d', topKind: 'shirt', sleeves: 'long', legs: '#121417', legKind: 'pants',
        vest: { color: '#252a2f', kind: 'harness' }, belt: '#0d0e10', holster: 'thigh', hair: 'bun', head: 'beanie', headColor: '#1b1d20',
        gloves: '#0f1012', accent: '#ff5a5a', pack: null },
      { id: 'undercover', name: 'Off the books', text: 'Leather jacket, jeans, shoulder holster. Nobody looks twice at a civilian.',
        top: '#5a3222', topKind: 'jacket', inner: '#d5cfc4', sleeves: 'long', legs: '#2b3d5a', legKind: 'jeans',
        vest: null, belt: '#2a1a12', holster: 'shoulder', hair: 'down', head: null, gloves: null, accent: '#e8b45a', pack: null },
      { id: 'hazmat', name: 'Decon shell', text: 'A sealed yellow decon suit and air tank, borrowed from the Sub-Level 4 lockers.',
        top: '#d9b42a', topKind: 'suit', sleeves: 'long', legs: '#d9b42a', legKind: 'suit', panel: '#2a2a2a',
        vest: null, belt: '#2b2b2b', holster: 'thigh', hair: 'hidden', head: 'hood', headColor: '#d9b42a', visor: '#9fe8ff',
        gloves: '#202020', accent: '#ffe066', pack: 'tank' },
      { id: 'swimsuit', name: 'Shore leave', text: 'A red two-piece, sunglasses and the duty pistol, because the outbreak didn\'t ask.',
        top: '#c4243a', topKind: 'bikini', sleeves: 'none', legs: '#c4243a', legKind: 'bikini',
        vest: null, belt: null, holster: 'thigh', hair: 'ponytail', head: 'shades', headColor: '#151515',
        gloves: null, accent: '#ffd36b', pack: null },
    ],
    dex: [
      { id: 'tactical', name: 'Contractor rig', text: 'Olive plate carrier over a field tee, sleeves pushed up, shotgun slung.',
        top: '#2c2f2a', topKind: 'tee', sleeves: 'short', legs: '#3c3a2b', legKind: 'pants',
        vest: { color: '#4b5130', kind: 'plate' }, belt: '#1d1c17', holster: null, hair: 'shaved', head: null,
        gloves: '#26241e', accent: '#c9d16a', pack: 'shotgun' },
      { id: 'covert', name: 'Black site', text: 'Everything black, nothing reflective, a watch cap and a carrier with no patches.',
        top: '#141517', topKind: 'tee', sleeves: 'long', legs: '#131416', legKind: 'pants',
        vest: { color: '#1e2124', kind: 'plate' }, belt: '#0c0d0e', holster: null, hair: 'shaved', head: 'beanie', headColor: '#1a1b1d',
        gloves: '#0e0f10', accent: '#ff5a5a', pack: 'shotgun' },
      { id: 'undercover', name: 'Street clothes', text: 'Maroon hoodie and jeans. The shotgun goes in a gym bag until it doesn\'t.',
        top: '#6a1d22', topKind: 'hoodie', sleeves: 'long', legs: '#26324a', legKind: 'jeans',
        vest: null, belt: null, holster: null, hair: 'shaved', head: null, gloves: null, accent: '#e0e0e0', pack: 'shotgun' },
      { id: 'hazmat', name: 'CBRN heavy', text: 'Orange chemical suit, full-face respirator, taped seams. Built for walking into the source.',
        top: '#d6611c', topKind: 'suit', sleeves: 'long', legs: '#d6611c', legKind: 'suit', panel: '#2b2b2b',
        vest: { color: '#2b2b2b', kind: 'harness' }, belt: '#2b2b2b', holster: null, hair: 'hidden', head: 'mask', headColor: '#d6611c', visor: '#9fe8ff',
        gloves: '#1d1d1d', accent: '#ffb070', pack: 'shotgun' },
      { id: 'swimsuit', name: 'Lifeguard', text: 'Red board shorts, a whistle and nothing to hide. Still carries the shotgun.',
        top: null, topKind: 'bare', sleeves: 'none', legs: '#cf2a2a', legKind: 'shorts', stripe: '#f2f2f2',
        vest: null, belt: null, holster: null, hair: 'shaved', head: null, gloves: null, accent: '#ffd23f', pack: 'shotgun', whistle: '#ffd23f' },
    ],
    rin: [
      { id: 'tactical', name: 'Field agent', text: 'Helix field response kit: a fitted tech jacket with sensor piping, a comms earpiece and the coil gauntlet. Built to move.',
        top: '#1c252b', topKind: 'techjacket', sleeves: 'long', legs: '#1f272c', legKind: 'pants', panel: '#2a363d', kneepads: '#2a363d',
        vest: null, belt: '#2c353b', holster: 'pouch', hair: 'bob', head: 'earpiece', headColor: '#1c252b',
        gloves: '#14181b', accent: '#5ff5d8', pack: null, glow: true },
      { id: 'covert', name: 'Ghost protocol', text: 'A black stealth bodysuit with dimmed sensor lines and a heads-up visor.',
        top: '#11161a', topKind: 'suit', sleeves: 'long', legs: '#11161a', legKind: 'suit', panel: '#1c2a30',
        vest: null, belt: '#0b0f12', holster: null, hair: 'bob', head: 'visor', visor: '#5ff5d8',
        gloves: '#0b0e10', accent: '#5ff5d8', pack: null, glow: true },
      { id: 'undercover', name: 'Lab coat', text: 'The coat she had on when the alarms went. ID badge still clipped to the pocket.',
        top: '#e9eded', topKind: 'coat', inner: '#3d5b75', sleeves: 'long', legs: '#2a2f38', legKind: 'pants',
        vest: null, belt: null, holster: null, hair: 'bob', head: 'glasses', headColor: '#2a2a2a',
        gloves: null, accent: '#7fd6ff', pack: null },
      { id: 'hazmat', name: 'Level A', text: 'A fully encapsulated lime suit with a wide faceplate. Nothing gets in, nothing gets out.',
        top: '#9cc23a', topKind: 'suit', sleeves: 'long', legs: '#9cc23a', legKind: 'suit', panel: '#2f3a1a',
        vest: null, belt: '#2f3a1a', holster: null, hair: 'hidden', head: 'hood', headColor: '#9cc23a', visor: '#c8f4ff',
        gloves: '#2b2b2b', accent: '#e0ff70', pack: 'tank' },
      { id: 'swimsuit', name: 'Pool day', text: 'A teal two-piece and swim goggles pushed up. The coil gauntlet stays on.',
        top: '#169d92', topKind: 'bikini', sleeves: 'none', legs: '#169d92', legKind: 'bikini', trim: '#f4f4f4',
        vest: null, belt: null, holster: null, hair: 'bob', head: 'goggles', headColor: '#ff7a3d',
        gloves: null, accent: '#5ff5d8', pack: null },
    ],
  };
  for (const id in SKINS) for (const s of SKINS[id]) s.cost = s.id === 'tactical' ? 0 : SKIN_COST;

  function skinOf(charId, skinId) {
    const list = SKINS[charId] || SKINS.mara;
    return list.find((s) => s.id === skinId) || list[0];
  }

  // ================================================================ portrait (front view)
  const PW = 240, PH = 320, CX = 120;

  /** Horizontal key-light gradient: shadow on the left, colour, a lift on the right. */
  function lit(ctx, hex, x0 = CX - 80, x1 = CX + 80, k = 0.3) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, shade(hex, -k));
    g.addColorStop(0.55, hex);
    g.addColorStop(1, shade(hex, k * 0.45));
    return g;
  }

  function torsoPath(ctx, b) {
    const p = new Path2D();
    const { neck, sh, chest, waist, hip } = b;
    p.moveTo(CX - neck, 84);
    p.quadraticCurveTo(CX - neck, 95, CX - sh * 0.68, 98);
    p.quadraticCurveTo(CX - sh, 100, CX - sh, 114);
    p.quadraticCurveTo(CX - chest - 3, 124, CX - chest, 134);
    p.bezierCurveTo(CX - chest, 152, CX - waist, 164, CX - waist, 182);
    p.bezierCurveTo(CX - waist, 196, CX - hip, 202, CX - hip, 216);
    p.lineTo(CX - hip + 1, 240);
    p.lineTo(CX + hip - 1, 240);
    p.lineTo(CX + hip, 216);
    p.bezierCurveTo(CX + hip, 202, CX + waist, 196, CX + waist, 182);
    p.bezierCurveTo(CX + waist, 164, CX + chest, 152, CX + chest, 134);
    p.quadraticCurveTo(CX + chest + 3, 124, CX + sh, 114);
    p.quadraticCurveTo(CX + sh, 100, CX + sh * 0.68, 98);
    p.quadraticCurveTo(CX + neck, 95, CX + neck, 84);
    p.closePath();
    return p;
  }

  function legsPath(b) {
    const p = new Path2D();
    for (const s of [-1, 1]) {
      p.moveTo(CX + s * b.hip, 212);
      p.bezierCurveTo(CX + s * (b.hip + 3), 250, CX + s * (b.hip * 0.78), 290, CX + s * (b.hip * 0.62), 336);
      p.lineTo(CX + s * 5, 336);
      p.bezierCurveTo(CX + s * 4, 290, CX + s * 2, 262, CX, 244);
      p.lineTo(CX, 212);
      p.closePath();
    }
    return p;
  }

  /** Arm joints for one side (s = -1 viewer's left, +1 viewer's right). */
  function armJoints(b, s) {
    const sx = CX + s * (b.sh - b.arm * 0.55);
    return {
      sh: [sx, 112],
      el: [CX + s * (b.sh + 3 + b.arm * 0.2), 172],
      wr: [CX + s * (b.sh - 1 + b.arm * 0.1), 226],
    };
  }
  function strokeArm(ctx, b, s, color, from = 0, to = 1, widen = 0) {
    const j = armJoints(b, s);
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // clip vertically so sleeves can stop at the elbow etc.
    ctx.beginPath(); ctx.rect(0, U.lerp(96, 246, from), PW, U.lerp(96, 246, to) - U.lerp(96, 246, from)); ctx.clip();
    ctx.lineWidth = b.arm * 2 + widen;
    ctx.beginPath(); ctx.moveTo(j.sh[0], j.sh[1]); ctx.lineTo(j.el[0], j.el[1]); ctx.stroke();
    ctx.lineWidth = b.arm * 1.65 + widen;
    ctx.beginPath(); ctx.moveTo(j.el[0], j.el[1]); ctx.lineTo(j.wr[0], j.wr[1]); ctx.stroke();
    ctx.restore();
  }

  function drawPortrait(ctx, charId, skinId) {
    const b = BUILDS[charId] || BUILDS.mara, L = LOOKS[charId] || LOOKS.mara, k = skinOf(charId, skinId);
    const torso = torsoPath(ctx, b), legs = legsPath(b);
    const skinLit = (x0, x1) => lit(ctx, L.skin, x0, x1, 0.32);

    ctx.save();
    // floor glow
    const fg = ctx.createRadialGradient(CX, 330, 10, CX, 330, 130);
    fg.addColorStop(0, alpha(k.accent, 0.22)); fg.addColorStop(1, alpha(k.accent, 0));
    ctx.fillStyle = fg; ctx.fillRect(0, 200, PW, 140);

    // ---- behind the body
    if (k.hair === 'down') {
      ctx.fillStyle = lit(ctx, L.hair, CX - 40, CX + 40, 0.25);
      ctx.beginPath();
      ctx.moveTo(CX - b.headRx - 3, b.headY - 6);
      ctx.bezierCurveTo(CX - b.headRx - 12, b.headY + 40, CX - b.sh + 6, 110, CX - b.sh + 10, 132);
      ctx.lineTo(CX + b.sh - 10, 132);
      ctx.bezierCurveTo(CX + b.sh - 6, 110, CX + b.headRx + 12, b.headY + 40, CX + b.headRx + 3, b.headY - 6);
      ctx.closePath(); ctx.fill();
    }
    if (k.pack === 'shotgun') drawSlungShotgun(ctx, b);
    if (k.pack === 'tank') {
      for (const s of [-1, 1]) {
        ctx.fillStyle = lit(ctx, '#8a949a', CX + s * 30 - 10, CX + s * 30 + 10, 0.4);
        rr(ctx, CX + s * 24 - 9, 74, 18, 40, 8); ctx.fill();
        ctx.fillStyle = '#2b3236'; rr(ctx, CX + s * 24 - 5, 70, 10, 7, 2); ctx.fill();
      }
    }
    if (k.topKind === 'hoodie') {
      ctx.fillStyle = shade(k.top, -0.25);
      ctx.beginPath(); ctx.ellipse(CX, 92, b.neck + 22, 14, 0, 0, TAU); ctx.fill();
    }

    // ---- legs
    ctx.fillStyle = skinLit(CX - 60, CX + 60); ctx.fill(legs);
    if (k.legKind === 'pants' || k.legKind === 'jeans' || k.legKind === 'suit') {
      ctx.fillStyle = lit(ctx, k.legs, CX - 60, CX + 60, 0.35); ctx.fill(legs);
      ctx.save(); ctx.clip(legs);
      if (k.legKind === 'jeans') {
        ctx.strokeStyle = shade(k.legs, 0.25); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * (b.hip - 6), 220); ctx.lineTo(CX + s * (b.hip * 0.62 - 2), 336); ctx.stroke(); }
        ctx.setLineDash([]);
        ctx.fillStyle = alpha('#ffffff', 0.08);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * 22, 296, 8, 14, 0, 0, TAU); ctx.fill(); }
      }
      if ((k.legKind === 'suit' && k.panel) || k.kneepads) {
        ctx.fillStyle = k.kneepads || k.panel;
        for (const s of [-1, 1]) { rr(ctx, CX + s * 22 - 11, 286, 22, 20, 6); ctx.fill(); }
      }
      // knee/fold shadow
      ctx.strokeStyle = alpha('#000000', 0.25); ctx.lineWidth = 1.5;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 12, 262); ctx.quadraticCurveTo(CX + s * 22, 268, CX + s * 30, 262); ctx.stroke(); }
      ctx.restore();
    } else if (k.legKind === 'shorts') {
      ctx.save(); ctx.clip(legs);
      ctx.fillStyle = lit(ctx, k.legs, CX - 60, CX + 60, 0.3); ctx.fillRect(0, 205, PW, 70);
      ctx.fillStyle = k.stripe || '#fff';
      for (const s of [-1, 1]) ctx.fillRect(CX + s * (b.hip - 3) - 2.5, 214, 5, 62);
      ctx.strokeStyle = alpha('#000000', 0.3); ctx.lineWidth = 1;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 6, 244); ctx.lineTo(CX + s * 8, 274); ctx.stroke(); }
      ctx.restore();
      // quads
      ctx.save(); ctx.clip(legs);
      ctx.strokeStyle = alpha('#000000', 0.28); ctx.lineWidth = 1.6;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 30, 284); ctx.quadraticCurveTo(CX + s * 20, 300, CX + s * 22, 324); ctx.stroke(); }
      ctx.restore();
    }
    if (k.holster === 'pouch') {
      ctx.fillStyle = '#20282d'; rr(ctx, CX + 18, 230, 20, 26, 4); ctx.fill();
      ctx.fillStyle = '#2c363c'; rr(ctx, CX + 18, 230, 20, 8, 3); ctx.fill();
      ctx.strokeStyle = '#14181b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(CX + 14, 246); ctx.lineTo(CX + 42, 246); ctx.stroke();
    }
    if (k.holster === 'thigh') {
      const hx = CX - 26;
      ctx.fillStyle = '#121214'; rr(ctx, hx - 9, 236, 18, 34, 4); ctx.fill();
      ctx.fillStyle = '#26282c'; rr(ctx, hx - 6, 228, 12, 12, 2); ctx.fill();
      ctx.strokeStyle = '#121214'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 13, 250); ctx.lineTo(hx + 13, 250); ctx.moveTo(hx - 13, 262); ctx.lineTo(hx + 13, 262); ctx.stroke();
    }

    // ---- torso skin + anatomy
    ctx.fillStyle = skinLit(CX - b.sh, CX + b.sh); ctx.fill(torso);
    ctx.save(); ctx.clip(torso);
    if (b.bust) drawBust(ctx, b, L, k.topKind === 'bikini');
    else drawPhysique(ctx, b, L);
    ctx.restore();

    // ---- trousers carry on up to the waist (under the top, so shirts can hang over them)
    if (k.legKind !== 'bikini') {
      ctx.save(); ctx.clip(torso);
      ctx.fillStyle = lit(ctx, k.legs, CX - 60, CX + 60, 0.35); ctx.fillRect(0, 206, PW, 40);
      if (k.legKind === 'shorts') { ctx.fillStyle = k.stripe || '#fff'; for (const s of [-1, 1]) ctx.fillRect(CX + s * (b.hip - 3) - 2.5, 210, 5, 30); }
      ctx.restore();
    }

    // ---- top garment
    drawTop(ctx, b, L, k, torso);
    if (k.legKind === 'bikini') drawBikiniBottom(ctx, b, k);

    // ---- arms (skin, then sleeves, gloves)
    for (const s of [-1, 1]) {
      strokeArm(ctx, b, s, skinLit(CX - b.sh - 20, CX + b.sh + 20));
      if (!b.bust) {
        // muscle definition on Dex's arms
        const j = armJoints(b, s);
        ctx.fillStyle = alpha('#000000', 0.18);
        ctx.beginPath(); ctx.ellipse(j.sh[0] - s * 4, 140, b.arm * 0.55, 15, s * -0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = alpha('#ffffff', 0.12);
        ctx.beginPath(); ctx.ellipse(j.sh[0] + s * 3, 116, b.arm * 0.75, 10, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(j.el[0] - s * 2, 194, b.arm * 0.45, 12, s * 0.1, 0, TAU); ctx.fill();
      }
      if (k.sleeves === 'long') strokeArm(ctx, b, s, lit(ctx, k.top, CX - b.sh - 20, CX + b.sh + 20, 0.35), 0, 0.84, 1.5);
      else if (k.sleeves === 'short') strokeArm(ctx, b, s, lit(ctx, k.top, CX - b.sh - 20, CX + b.sh + 20, 0.35), 0, 0.3, 2);
      if (k.topKind === 'jacket' || k.topKind === 'coat' || k.topKind === 'hoodie') {
        // cuff line
        const j = armJoints(b, s);
        ctx.strokeStyle = alpha('#000000', 0.35); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(j.wr[0] - b.arm, 220); ctx.lineTo(j.wr[0] + b.arm, 220); ctx.stroke();
      }
      const j = armJoints(b, s);
      ctx.fillStyle = k.gloves ? lit(ctx, k.gloves, j.wr[0] - 10, j.wr[0] + 10, 0.3) : skinLit(j.wr[0] - 12, j.wr[0] + 12);
      ctx.beginPath(); ctx.ellipse(j.wr[0], j.wr[1] + b.arm * 0.6, b.arm * 0.95, b.arm * 1.15, 0, 0, TAU); ctx.fill();
    }
    if (charId === 'rin') drawGauntlet(ctx, b, k);
    if (k.whistle) {
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(CX - 10, 88); ctx.quadraticCurveTo(CX, 128, CX + 10, 88); ctx.stroke();
      ctx.fillStyle = k.whistle; rr(ctx, CX - 4, 120, 8, 12, 3); ctx.fill();
    }

    // ---- vest, belt, holster
    if (k.vest) drawVest(ctx, b, k);
    if (k.belt) {
      ctx.save(); ctx.clip(torso);
      ctx.fillStyle = k.belt; ctx.fillRect(0, 205, PW, 10);
      ctx.fillStyle = '#8b8f94'; rr(ctx, CX - 6, 206, 12, 8, 1.5); ctx.fill();
      ctx.restore();
    }
    if (k.holster === 'shoulder') {
      ctx.strokeStyle = '#1f1410'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(CX - b.sh + 10, 104); ctx.quadraticCurveTo(CX - 18, 150, CX - b.chest + 2, 160); ctx.stroke();
      ctx.fillStyle = '#1f1410'; rr(ctx, CX - b.chest - 2, 148, 12, 24, 3); ctx.fill();
    }
    if (k.pack === 'radio') {
      ctx.fillStyle = '#0d0f12'; rr(ctx, CX + b.sh - 22, 102, 10, 18, 2); ctx.fill();
      ctx.strokeStyle = '#0d0f12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CX + b.sh - 15, 102); ctx.lineTo(CX + b.sh - 13, 86); ctx.stroke();
      ctx.fillStyle = k.accent; circle(ctx, CX + b.sh - 17, 107, 1.4);
    }
    if (k.pack === 'tank') {
      ctx.strokeStyle = '#2b3236'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(CX + 24, 92); ctx.quadraticCurveTo(CX + b.sh + 4, 96, CX + b.headRx - 2, b.headY + 20); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // ---- neck + head
    ctx.fillStyle = skinLit(CX - b.neck - 4, CX + b.neck + 4);
    ctx.beginPath();
    ctx.moveTo(CX - b.neck, b.headY + b.headRy * 0.55); ctx.lineTo(CX - b.neck, 92);
    ctx.quadraticCurveTo(CX, 98, CX + b.neck, 92); ctx.lineTo(CX + b.neck, b.headY + b.headRy * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = alpha('#000000', 0.18);
    ctx.beginPath(); ctx.ellipse(CX, b.headY + b.headRy * 0.98, b.neck * 0.95, 5, 0, 0, TAU); ctx.fill();
    if (k.topKind === 'techjacket') {
      // high stand collar, slightly open at the zip
      ctx.fillStyle = lit(ctx, k.top, CX - 30, CX + 30, 0.3);
      ctx.beginPath();
      ctx.moveTo(CX - b.neck - 5, 94); ctx.lineTo(CX - b.neck - 3, b.headY + b.headRy * 0.9);
      ctx.quadraticCurveTo(CX, b.headY + b.headRy * 1.08, CX + b.neck + 3, b.headY + b.headRy * 0.9);
      ctx.lineTo(CX + b.neck + 5, 94); ctx.quadraticCurveTo(CX, 100, CX - b.neck - 5, 94); ctx.fill();
      ctx.strokeStyle = alpha(k.accent, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CX - b.neck - 3, b.headY + b.headRy * 0.9); ctx.quadraticCurveTo(CX, b.headY + b.headRy * 1.08, CX + b.neck + 3, b.headY + b.headRy * 0.9); ctx.stroke();
    }
    if (k.topKind === 'suit' || k.topKind === 'hoodie') {
      // collar ring
      ctx.fillStyle = lit(ctx, k.topKind === 'suit' && k.panel ? k.panel : shade(k.top, -0.15), CX - 30, CX + 30, 0.3);
      ctx.beginPath(); ctx.ellipse(CX, 90, b.neck + 6, 7, 0, 0, TAU); ctx.fill();
    }

    drawHead(ctx, b, L, k, charId);
    ctx.restore();

    // rim light: teal from the left, warm key from the right, only on what we drew
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const rim = ctx.createLinearGradient(0, 0, PW, 0);
    rim.addColorStop(0, 'rgba(80,230,200,0.22)'); rim.addColorStop(0.32, 'rgba(80,230,200,0)');
    rim.addColorStop(0.75, 'rgba(255,190,120,0)'); rim.addColorStop(1, 'rgba(255,190,120,0.16)');
    ctx.fillStyle = rim; ctx.fillRect(0, 0, PW, PH);
    ctx.restore();
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  /** Female chest shape: soft volume and shading. With a bikini, the cleavage reads between the cups. */
  function drawBust(ctx, b, L, bare) {
    const y = 134, dx = 13.5, rx = 14.5, ry = 13;
    for (const s of [-1, 1]) {
      const g = ctx.createRadialGradient(CX + s * dx + 4, y - 5, 2, CX + s * dx, y, rx + 3);
      g.addColorStop(0, shade(L.skin, 0.12)); g.addColorStop(0.7, L.skin); g.addColorStop(1, shade(L.skin, -0.22));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(CX + s * dx, y, rx, ry, s * 0.12, 0, TAU); ctx.fill();
      // underside shadow
      ctx.strokeStyle = alpha('#000000', bare ? 0.28 : 0.2); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(CX + s * dx, y + 1, rx - 1, ry - 1, s * 0.12, 0.25 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    // cleavage line
    ctx.strokeStyle = alpha('#3a1a10', bare ? 0.45 : 0.25); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(CX - 1, 124); ctx.quadraticCurveTo(CX + 1.5, 133, CX, 142); ctx.stroke();
    // collarbones and waist shading
    ctx.strokeStyle = alpha('#000000', 0.16); ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 4, 100); ctx.quadraticCurveTo(CX + s * 14, 103, CX + s * 26, 101); ctx.stroke(); }
    ctx.fillStyle = alpha('#000000', 0.07);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * (b.waist - 3), 180, 6, 22, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = alpha('#3a1a10', 0.35); circle(ctx, CX, 188, 1.4);
  }

  /** Dex: pecs, a six-pack, obliques. Visible when he's shirtless, implied under fitted tops. */
  function drawPhysique(ctx, b, L) {
    const dark = alpha('#000000', 0.26), lightc = alpha('#ffffff', 0.1);
    // pecs
    for (const s of [-1, 1]) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(CX + s * 2, 142);
      ctx.bezierCurveTo(CX + s * 20, 150, CX + s * 38, 146, CX + s * (b.chest - 2), 134);
      ctx.lineTo(CX + s * (b.chest - 2), 138);
      ctx.bezierCurveTo(CX + s * 36, 152, CX + s * 18, 156, CX + s * 2, 146);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = lightc;
      ctx.beginPath(); ctx.ellipse(CX + s * 22, 124, 16, 8, s * -0.2, 0, TAU); ctx.fill();
    }
    // sternum and linea alba
    ctx.strokeStyle = alpha('#000000', 0.3); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(CX, 112); ctx.lineTo(CX, 214); ctx.stroke();
    // six pads
    for (let r = 0; r < 3; r++) {
      for (const s of [-1, 1]) {
        const x = CX + s * 11.5, y = 166 + r * 17;
        const g = ctx.createLinearGradient(x, y - 8, x, y + 8);
        g.addColorStop(0, alpha('#ffffff', 0.12)); g.addColorStop(1, alpha('#000000', 0.22));
        ctx.fillStyle = g; rr(ctx, x - 9, y - 7.5, 18, 15, 6); ctx.fill();
        ctx.strokeStyle = alpha('#000000', 0.28); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 8, y + 8); ctx.lineTo(x + 8, y + 8); ctx.stroke();
      }
    }
    // obliques and serratus
    ctx.strokeStyle = dark; ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(CX + s * (b.waist - 4), 188); ctx.quadraticCurveTo(CX + s * 26, 214, CX + s * 9, 236); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(CX + s * (b.chest - 4), 150 + i * 8); ctx.lineTo(CX + s * (b.chest - 12), 154 + i * 8); ctx.stroke(); }
      // traps
      ctx.fillStyle = lightc; ctx.beginPath(); ctx.ellipse(CX + s * (b.neck + 12), 98, 13, 5, s * 0.25, 0, TAU); ctx.fill();
    }
  }

  function drawTop(ctx, b, L, k, torso) {
    if (k.topKind === 'bare') return;
    if (k.topKind === 'bikini') { drawBikiniTop(ctx, b, k); return; }
    ctx.save(); ctx.clip(torso);
    const bottom = k.topKind === 'shirt' || k.topKind === 'tee' ? 212 : k.topKind === 'coat' ? 330 : k.topKind === 'suit' ? 340 : k.topKind === 'techjacket' ? 222 : 226;
    if (k.topKind === 'jacket' || k.topKind === 'coat') {
      // inner layer first, then two open panels
      ctx.fillStyle = lit(ctx, k.inner, CX - 40, CX + 40, 0.25); ctx.fillRect(0, 84, PW, bottom - 84);
      if (b.bust) drawFabricBust(ctx, k.inner);
      ctx.fillStyle = lit(ctx, k.top, CX - b.sh, CX + b.sh, 0.32);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(CX + s * (b.neck + 1), 86);
        ctx.lineTo(CX + s * 7, 150);
        ctx.lineTo(CX + s * 9, bottom);
        ctx.lineTo(CX + s * 90, bottom); ctx.lineTo(CX + s * 90, 84); ctx.closePath(); ctx.fill();
      }
      // lapels
      ctx.fillStyle = shade(k.top, -0.2);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(CX + s * (b.neck + 1), 86); ctx.lineTo(CX + s * 7, 150); ctx.lineTo(CX + s * 20, 112); ctx.closePath(); ctx.fill();
      }
      if (k.topKind === 'coat') {
        ctx.fillStyle = shade(k.top, -0.12); rr(ctx, CX + 18, 150, 16, 14, 2); ctx.fill();
        ctx.fillStyle = '#2f6fa8'; rr(ctx, CX + 21, 140, 10, 15, 1.5); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(CX + 22.5, 143, 7, 3);
      }
    } else {
      ctx.fillStyle = lit(ctx, k.top, CX - b.sh, CX + b.sh, 0.32);
      ctx.fillRect(0, k.topKind === 'tee' ? 92 : 84, PW, bottom - 84);
      if (b.bust) drawFabricBust(ctx, k.top);
      else if (k.topKind === 'tee' || k.topKind === 'suit') {
        // fitted fabric still shows Dex's chest
        ctx.fillStyle = alpha('#000000', 0.16);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * 21, 146, 19, 4, s * -0.1, 0, TAU); ctx.fill(); }
      }
      if (k.topKind === 'techjacket') {
        // shoulder yoke panels
        ctx.fillStyle = lit(ctx, k.panel, CX - b.sh, CX + b.sh, 0.3);
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(CX + s * (b.neck + 2), 88); ctx.lineTo(CX + s * 90, 96); ctx.lineTo(CX + s * 90, 120);
          ctx.lineTo(CX + s * (b.chest - 2), 118); ctx.quadraticCurveTo(CX + s * 20, 112, CX + s * (b.neck + 6), 104); ctx.closePath(); ctx.fill();
        }
        // side panels from the ribs to the hem
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(CX + s * b.chest, 140); ctx.lineTo(CX + s * (b.waist - 5), 222); ctx.lineTo(CX + s * 90, 222); ctx.lineTo(CX + s * 90, 140); ctx.closePath(); ctx.fill();
        }
        // asymmetric zip, collar side to opposite hip
        ctx.strokeStyle = shade(k.top, -0.45); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(CX - 4, 88); ctx.quadraticCurveTo(CX + 2, 150, CX + 12, 222); ctx.stroke();
        ctx.fillStyle = '#9aa4aa'; rr(ctx, CX - 6, 96, 4, 7, 1); ctx.fill();
        // sensor piping
        ctx.save();
        ctx.shadowColor = k.accent; ctx.shadowBlur = 6;
        ctx.strokeStyle = alpha(k.accent, 0.9); ctx.lineWidth = 1.3;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(CX + s * (b.neck + 6), 104); ctx.quadraticCurveTo(CX + s * 20, 112, CX + s * (b.chest - 2), 118); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(CX + s * (b.chest - 1), 142); ctx.lineTo(CX + s * (b.waist - 4), 220); ctx.stroke();
        }
        ctx.restore();
        // hem band
        ctx.fillStyle = shade(k.top, -0.25); ctx.fillRect(0, 216, PW, 6);
      }
      if (k.topKind === 'tee') {
        ctx.strokeStyle = shade(k.top, -0.35); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(CX, 90, b.neck + 2, 6, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      }
      if (k.topKind === 'shirt') {
        // collar points and button placket
        ctx.fillStyle = shade(k.top, -0.18);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * (b.neck + 1), 84); ctx.lineTo(CX + s * 1, 102); ctx.lineTo(CX + s * (b.neck + 9), 96); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = shade(k.top, -0.3); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(CX, 102); ctx.lineTo(CX, 212); ctx.stroke();
        // shoulder patch (generic unit flash, no lettering)
        ctx.fillStyle = shade(k.top, 0.2);
        for (const s of [-1, 1]) { rr(ctx, CX + s * (b.sh - 7) - 5, 112, 10, 12, 3); ctx.fill(); }
      }
      if (k.topKind === 'hoodie') {
        ctx.fillStyle = shade(k.top, -0.12); rr(ctx, CX - 24, 178, 48, 22, 6); ctx.fill();
        ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.5;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 6, 94); ctx.lineTo(CX + s * 7, 128); ctx.stroke(); }
      }
      if (k.topKind === 'suit') {
        if (k.panel) {
          ctx.fillStyle = lit(ctx, k.panel, CX - b.sh, CX + b.sh, 0.3);
          for (const s of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(CX + s * b.chest, 120); ctx.lineTo(CX + s * (b.waist - 9), 210); ctx.lineTo(CX + s * 90, 210); ctx.lineTo(CX + s * 90, 120); ctx.closePath(); ctx.fill();
          }
        }
        // zip and seams
        ctx.strokeStyle = shade(k.top, -0.35); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(CX, 96); ctx.lineTo(CX, 236); ctx.stroke();
        if (k.glow) {
          ctx.save();
          ctx.shadowColor = k.accent; ctx.shadowBlur = 8;
          ctx.strokeStyle = k.accent; ctx.lineWidth = 1.6;
          for (const s of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(CX + s * 6, 100); ctx.lineTo(CX + s * 10, 160); ctx.lineTo(CX + s * 6, 214); ctx.stroke();
          }
          ctx.fillStyle = k.accent; rr(ctx, CX - 9, 146, 18, 8, 3); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  function drawFabricBust(ctx, color) {
    for (const s of [-1, 1]) {
      const g = ctx.createRadialGradient(CX + s * 13 + 4, 128, 2, CX + s * 13, 134, 18);
      g.addColorStop(0, alpha('#ffffff', 0.12)); g.addColorStop(1, alpha('#ffffff', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(CX + s * 13.5, 134, 15, 13, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = alpha('#000000', 0.22); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(CX + s * 13.5, 135, 14, 12, s * 0.12, 0.25 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  function drawBikiniTop(ctx, b, k) {
    const trim = k.trim || shade(k.top, 0.35);
    // halter strings
    ctx.strokeStyle = shade(k.top, -0.1); ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(CX + s * 12, 124); ctx.lineTo(CX + s * (b.neck - 1), 88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX + s * 26, 140); ctx.quadraticCurveTo(CX + s * (b.chest + 2), 142, CX + s * (b.chest + 4), 138); ctx.stroke();
    }
    // cups, set apart so the cleavage shows
    for (const s of [-1, 1]) {
      const g = ctx.createLinearGradient(CX + s * 2, 120, CX + s * 28, 146);
      g.addColorStop(0, shade(k.top, 0.18)); g.addColorStop(1, shade(k.top, -0.25));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(CX + s * 12, 121);
      ctx.quadraticCurveTo(CX + s * 28, 128, CX + s * 28, 141);
      ctx.quadraticCurveTo(CX + s * 15, 148, CX + s * 3, 143);
      ctx.quadraticCurveTo(CX + s * 4, 130, CX + s * 12, 121);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = trim; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(CX + s * 3, 143); ctx.quadraticCurveTo(CX + s * 15, 148, CX + s * 28, 141); ctx.stroke();
    }
    // centre tie
    ctx.fillStyle = shade(k.top, -0.15); circle(ctx, CX, 142, 2);
  }

  function drawBikiniBottom(ctx, b, k) {
    const trim = k.trim || shade(k.legs, 0.35);
    const g = ctx.createLinearGradient(CX - b.hip, 0, CX + b.hip, 0);
    g.addColorStop(0, shade(k.legs, -0.28)); g.addColorStop(0.6, k.legs); g.addColorStop(1, shade(k.legs, 0.1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(CX - b.hip + 2, 214);
    ctx.quadraticCurveTo(CX, 220, CX + b.hip - 2, 214);
    ctx.lineTo(CX + b.hip - 4, 222);
    ctx.quadraticCurveTo(CX + 10, 230, CX + 5, 248);
    ctx.lineTo(CX - 5, 248);
    ctx.quadraticCurveTo(CX - 10, 230, CX - b.hip + 4, 222);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(CX - b.hip + 2, 214); ctx.quadraticCurveTo(CX, 220, CX + b.hip - 2, 214); ctx.stroke();
    for (const s of [-1, 1]) { ctx.fillStyle = shade(k.legs, -0.1); circle(ctx, CX + s * (b.hip - 3), 217, 2.2); }
  }

  function drawVest(ctx, b, k) {
    const v = k.vest, col = v.color;
    if (v.kind === 'harness') {
      ctx.strokeStyle = lit(ctx, col, CX - 50, CX + 50, 0.3); ctx.lineWidth = 6;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * (b.neck + 10), 96); ctx.lineTo(CX + s * 14, 176); ctx.stroke(); }
      ctx.fillStyle = lit(ctx, col, CX - 40, CX + 40, 0.3);
      rr(ctx, CX - b.chest + 6, 168, (b.chest - 6) * 2, 22, 4); ctx.fill();
      ctx.fillStyle = shade(col, -0.25);
      for (let i = 0; i < 3; i++) { rr(ctx, CX - 22 + i * 16, 170, 12, 18, 2); ctx.fill(); }
      return;
    }
    const top = v.kind === 'plate' ? 104 : 106, bot = v.kind === 'plate' ? 200 : 198;
    const half = v.kind === 'plate' ? b.chest - 2 : b.chest - 3;
    ctx.fillStyle = lit(ctx, col, CX - half, CX + half, 0.35);
    // shoulder straps
    for (const s of [-1, 1]) { rr(ctx, CX + s * (b.neck + 4) - (s < 0 ? 12 : 0), 92, 12, 22, 3); ctx.fill(); }
    rr(ctx, CX - half, top, half * 2, bot - top, v.kind === 'plate' ? 8 : 12); ctx.fill();
    // neckline cut
    ctx.fillStyle = shade(col, -0.35);
    ctx.beginPath(); ctx.ellipse(CX, top, b.neck + 3, 6, 0, 0, Math.PI); ctx.fill();
    if (v.kind === 'plate') {
      // MOLLE webbing + three mag pouches
      ctx.fillStyle = shade(col, -0.2);
      for (let y = top + 18; y < bot - 30; y += 9) ctx.fillRect(CX - half + 6, y, half * 2 - 12, 2.5);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = lit(ctx, shade(col, 0.06), CX - 40, CX + 40, 0.3);
        rr(ctx, CX - 31 + i * 22, bot - 34, 18, 30, 3); ctx.fill();
        ctx.fillStyle = shade(col, -0.3); ctx.fillRect(CX - 31 + i * 22, bot - 34, 18, 5);
      }
    } else {
      // police vest: radio pouch, generic chest panel, cuffs pouch
      ctx.fillStyle = shade(col, -0.28); rr(ctx, CX - half + 6, 120, 16, 24, 3); ctx.fill();
      ctx.fillStyle = shade('#c7d3df', -0.1); rr(ctx, CX + 8, 118, 22, 10, 2); ctx.fill();
      ctx.fillStyle = shade(col, -0.2);
      for (let i = 0; i < 3; i++) { rr(ctx, CX - 24 + i * 17, 176, 13, 18, 2); ctx.fill(); }
      ctx.fillStyle = alpha('#ffffff', 0.08);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(CX + s * 13, 136, 13, 10, 0, 0, TAU); ctx.fill(); }
    }
  }

  function drawSlungShotgun(ctx, b) {
    ctx.save();
    ctx.translate(CX + b.sh * 0.55, 96);
    ctx.rotate(-0.95);
    ctx.fillStyle = '#1b1c1e'; rr(ctx, 0, -3.5, 92, 7, 2); ctx.fill();
    ctx.fillStyle = '#5b3a24'; rr(ctx, 40, -5, 22, 10, 2); ctx.fill();
    ctx.fillStyle = '#2d2f33'; ctx.fillRect(86, -4, 6, 8);
    ctx.restore();
  }

  function drawGauntlet(ctx, b, k) {
    const j = armJoints(b, 1);
    const x = U.lerp(j.el[0], j.wr[0], 0.55), y = U.lerp(j.el[1], j.wr[1], 0.55);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(j.wr[1] - j.el[1], j.wr[0] - j.el[0]) - Math.PI / 2);
    ctx.fillStyle = '#2b3338'; rr(ctx, -b.arm - 3, -16, (b.arm + 3) * 2, 30, 4); ctx.fill();
    ctx.shadowColor = '#5ff5d8'; ctx.shadowBlur = 10;
    ctx.strokeStyle = '#5ff5d8'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-b.arm - 2, -10 + i * 7); ctx.lineTo(b.arm + 2, -10 + i * 7); ctx.stroke(); }
    ctx.restore();
  }

  /** Glossy strands over a hairstyle: a soft sheen band plus a few light and dark strokes. */
  function hairShine(ctx, hair, hx, hy, rx, ry, style) {
    ctx.save();
    ctx.lineCap = 'round';
    const top = hy - ry * (style === 'bob' ? 1.02 : 0.98);
    ctx.strokeStyle = alpha('#ffffff', 0.16); ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(hx + 2, hy - 2, rx * 0.95, -2.35, -1.05); ctx.stroke();
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 6; i++) {
      const o = -rx * 0.7 + i * rx * 0.28;
      ctx.strokeStyle = i % 2 ? alpha('#ffffff', 0.14) : alpha('#000000', 0.25);
      ctx.beginPath();
      ctx.moveTo(hx + o * 0.4, top + 2);
      ctx.quadraticCurveTo(hx + o * 1.1, hy - ry * 0.55, hx + o * 1.25, hy - ry * (style === 'bob' ? 0.05 : 0.35));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Illustrated face: almond eyes with a gradient iris and catchlights, lined lids (with lashes
   * and a wing for Mara and Rin), shaped brows, a shaded nose, full lips with a highlight and a
   * slight confident smirk, cheek colour. Dex gets a heavier brow and a broader nose.
   */
  function drawFace(ctx, b, L, hx, ey, ex, rx, masked) {
    if (masked) return;
    const fem = !!b.bust;
    for (const s of [-1, 1]) {
      const cx = hx + s * ex, ew = fem ? 5.3 : 5, eh = fem ? 3 : 2.4;
      const inner = [cx - s * ew, ey + 0.4], outer = [cx + s * ew, ey - (fem ? 1.1 : 0.3)];
      // socket shade and upper-lid crease
      ctx.fillStyle = alpha('#3a1a10', fem ? 0.12 : 0.18);
      ctx.beginPath(); ctx.ellipse(cx, ey - 1.6, ew + 2.2, eh + 2.8, 0, 0, TAU); ctx.fill();
      const eye = new Path2D();
      eye.moveTo(inner[0], inner[1]);
      eye.quadraticCurveTo(cx, ey - eh * 1.7, outer[0], outer[1]);
      eye.quadraticCurveTo(cx, ey + eh * 1.15, inner[0], inner[1]);
      ctx.fillStyle = '#f3eee8'; ctx.fill(eye);
      ctx.save(); ctx.clip(eye);
      const ig = ctx.createRadialGradient(cx + 0.3, ey - 0.6, 0.3, cx + 0.3, ey - 0.4, eh * 1.15);
      ig.addColorStop(0, shade(L.iris, 0.35)); ig.addColorStop(0.65, L.iris); ig.addColorStop(1, shade(L.iris, -0.55));
      ctx.fillStyle = ig; circle(ctx, cx + 0.3, ey - 0.4, eh * 1.12);
      ctx.fillStyle = '#0b0807'; circle(ctx, cx + 0.3, ey - 0.4, eh * 0.48);
      ctx.fillStyle = alpha('#000000', 0.3); ctx.fillRect(cx - ew - 1, ey - eh * 2, ew * 2 + 2, eh * 0.9);   // lid shadow
      ctx.restore();
      ctx.fillStyle = '#ffffff'; circle(ctx, cx + 1.3, ey - 1.5, 0.95); circle(ctx, cx - 0.9, ey + 0.5, 0.45);
      // upper lid line, lashes and wing
      ctx.strokeStyle = '#140c0a'; ctx.lineCap = 'round';
      ctx.lineWidth = fem ? 1.7 : 1.2;
      ctx.beginPath(); ctx.moveTo(inner[0], inner[1]); ctx.quadraticCurveTo(cx, ey - eh * 1.7, outer[0], outer[1]); ctx.stroke();
      if (fem) {
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(outer[0], outer[1]); ctx.lineTo(outer[0] + s * 2.4, outer[1] - 1.6); ctx.stroke();
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 3; i++) {
          const t = 0.55 + i * 0.17, lx = U.lerp(inner[0], outer[0], t), ly = ey - eh * (1.15 - i * 0.12);
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + s * 1.4, ly - 1.8); ctx.stroke();
        }
      }
      // lower lid
      ctx.strokeStyle = alpha('#3a1a10', 0.35); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(inner[0] + s * 1, inner[1] + 0.6); ctx.quadraticCurveTo(cx, ey + eh * 1.25, outer[0], outer[1] + 0.8); ctx.stroke();
      // brow: a tapered filled stroke, arched for Mara and Rin, straight and heavy for Dex
      const by = ey - eh - (fem ? 5 : 4);
      ctx.fillStyle = L.brow;
      ctx.beginPath();
      if (fem) {
        ctx.moveTo(cx - s * (ew - 0.5), by + 1.8);
        ctx.quadraticCurveTo(cx + s * 1.5, by - 2.6, cx + s * (ew + 2.4), by + 0.8);
        ctx.quadraticCurveTo(cx + s * 1.5, by - 1.2, cx - s * (ew - 0.5), by + 3.4);
      } else {
        ctx.moveTo(cx - s * (ew - 0.5), by + 2.4);
        ctx.quadraticCurveTo(cx + s * 1.5, by - 1.2, cx + s * (ew + 2.6), by + 0.6);
        ctx.lineTo(cx + s * (ew + 2.2), by + 2.2);
        ctx.quadraticCurveTo(cx + s * 1.5, by + 1.6, cx - s * (ew - 0.5), by + 5.2);
      }
      ctx.closePath(); ctx.fill();
    }
    // nose: bridge shadow, tip highlight, nostrils
    const nw = fem ? 2.4 : 3.5;
    ctx.fillStyle = alpha('#3a1a10', 0.14);
    ctx.beginPath(); ctx.ellipse(hx - 1.8, ey + 6, 1.4, 6, 0.05, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, ey + 11.2, nw + 1.5, 2, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = alpha('#ffffff', 0.22); circle(ctx, hx + 0.8, ey + 9, 1.4);
    ctx.fillStyle = alpha('#2a120c', 0.55);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * nw, ey + 11.4, 1.2, 0.7, s * 0.4, 0, TAU); ctx.fill(); }
    // cheeks
    if (fem) {
      for (const s of [-1, 1]) {
        const g = ctx.createRadialGradient(hx + s * rx * 0.55, ey + 9, 0, hx + s * rx * 0.55, ey + 9, 6);
        g.addColorStop(0, 'rgba(235,110,120,0.28)'); g.addColorStop(1, 'rgba(235,110,120,0)');
        ctx.fillStyle = g; circle(ctx, hx + s * rx * 0.55, ey + 9, 6);
      }
    }
    ctx.fillStyle = alpha('#ffffff', 0.1); ctx.beginPath(); ctx.ellipse(hx + rx * 0.52, ey + 5, 3.5, 2, -0.4, 0, TAU); ctx.fill();
    // lips, corners slightly lifted on one side
    const my = ey + (fem ? 17 : 16.5), mw = fem ? 5.6 : 6.2, lipC = L.lips;
    const lc = [hx - mw, my + 0.2], rc = [hx + mw, my - 0.7];
    ctx.fillStyle = shade(lipC, -0.18);
    ctx.beginPath();
    ctx.moveTo(lc[0], lc[1]);
    ctx.quadraticCurveTo(hx - 2.6, my - (fem ? 2.6 : 1.6), hx - 1.2, my - (fem ? 2.3 : 1.4));
    ctx.quadraticCurveTo(hx, my - 1.3, hx + 1.2, my - (fem ? 2.3 : 1.4));
    ctx.quadraticCurveTo(hx + 2.6, my - (fem ? 2.6 : 1.6), rc[0], rc[1]);
    ctx.quadraticCurveTo(hx, my + 0.4, lc[0], lc[1]);
    ctx.fill();
    const lg = ctx.createLinearGradient(0, my, 0, my + 4);
    lg.addColorStop(0, lipC); lg.addColorStop(1, shade(lipC, -0.2));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(lc[0], lc[1]); ctx.quadraticCurveTo(hx, my + 0.4, rc[0], rc[1]);
    ctx.quadraticCurveTo(hx + 1, my + (fem ? 4.2 : 3.4), lc[0], lc[1]); ctx.fill();
    ctx.fillStyle = alpha('#ffffff', fem ? 0.38 : 0.18); ctx.beginPath(); ctx.ellipse(hx + 1, my + 1.7, 2.2, 0.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = alpha('#2a100c', 0.6); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(lc[0], lc[1]); ctx.quadraticCurveTo(hx, my + 0.4, rc[0], rc[1]); ctx.stroke();
    ctx.fillStyle = alpha('#3a1a10', 0.15); ctx.beginPath(); ctx.ellipse(hx, my + 6, 3, 1.2, 0, 0, TAU); ctx.fill();
  }

  function drawHead(ctx, b, L, k, charId) {
    const hx = CX, hy = b.headY, rx = b.headRx, ry = b.headRy;
    const headgear = k.head;
    if (headgear === 'helmet' || headgear === 'hood' || headgear === 'mask') {
      // shell behind the face
      const cr = headgear === 'helmet' ? 1.42 : 1.32;
      ctx.fillStyle = lit(ctx, k.headColor, hx - rx * cr, hx + rx * cr, 0.3);
      ctx.beginPath(); ctx.ellipse(hx, hy + 2, rx * cr, ry * (headgear === 'helmet' ? 1.28 : 1.22), 0, 0, TAU); ctx.fill();
      if (headgear !== 'helmet') {
        ctx.beginPath(); ctx.moveTo(hx - rx * 1.3, hy + 10); ctx.quadraticCurveTo(hx - b.sh * 0.7, 92, hx - b.sh * 0.75, 104);
        ctx.lineTo(hx + b.sh * 0.75, 104); ctx.quadraticCurveTo(hx + b.sh * 0.7, 92, hx + rx * 1.3, hy + 10); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = k.accent; ctx.fillRect(hx - 3, hy - ry * 1.26, 6, 16);
      }
    }
    if (k.hair === 'bun' && !headgear) {
      ctx.fillStyle = lit(ctx, L.hair, hx - 14, hx + 14, 0.25); circle(ctx, hx + 4, hy - ry - 4, 10);
    }
    if (k.hair === 'ponytail') {
      ctx.fillStyle = lit(ctx, L.hair, hx, hx + 50, 0.25);
      ctx.beginPath(); ctx.moveTo(hx + rx - 4, hy - 8); ctx.bezierCurveTo(hx + rx + 18, hy + 4, hx + rx + 14, hy + 50, hx + rx + 4, hy + 68);
      ctx.bezierCurveTo(hx + rx + 2, hy + 44, hx + rx, hy + 18, hx + rx - 6, hy + 4); ctx.closePath(); ctx.fill();
    }
    if (k.hair === 'bob') {
      ctx.fillStyle = lit(ctx, L.hair, hx - rx - 6, hx + rx + 6, 0.2);
      ctx.beginPath(); ctx.ellipse(hx, hy + 2, rx + 5, ry + 3, 0, Math.PI, TAU); ctx.fill();
      ctx.fillRect(hx - rx - 5, hy + 1, (rx + 5) * 2, ry * 0.75);
    }

    // ears + face
    ctx.fillStyle = shade(L.skin, -0.12);
    if (!headgear || headgear === 'beanie' || headgear === 'glasses' || headgear === 'goggles' || headgear === 'shades' || headgear === 'visor' || headgear === 'earpiece') {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * rx, hy + 3, 4, 7, 0, 0, TAU); ctx.fill(); }
    }
    const face = new Path2D();
    face.moveTo(hx - rx, hy - 4);
    face.bezierCurveTo(hx - rx, hy - ry * 1.15, hx + rx, hy - ry * 1.15, hx + rx, hy - 4);
    face.bezierCurveTo(hx + rx, hy + ry * 0.55, hx + rx * (0.45 + b.jaw * 0.25), hy + ry * 0.98, hx, hy + ry);
    face.bezierCurveTo(hx - rx * (0.45 + b.jaw * 0.25), hy + ry * 0.98, hx - rx, hy + ry * 0.55, hx - rx, hy - 4);
    ctx.fillStyle = lit(ctx, L.skin, hx - rx, hx + rx, 0.28); ctx.fill(face);
    ctx.save(); ctx.clip(face);
    ctx.fillStyle = alpha('#000000', 0.12); ctx.beginPath(); ctx.ellipse(hx - rx * 0.9, hy + 8, 8, 20, 0, 0, TAU); ctx.fill();
    if (charId === 'dex') {
      // stubble beard
      ctx.fillStyle = alpha(L.hair, 0.55);
      ctx.beginPath(); ctx.moveTo(hx - rx, hy + 2); ctx.quadraticCurveTo(hx - rx * 0.8, hy + ry * 1.05, hx, hy + ry + 2);
      ctx.quadraticCurveTo(hx + rx * 0.8, hy + ry * 1.05, hx + rx, hy + 2); ctx.lineTo(hx + rx * 0.62, hy + 6);
      ctx.quadraticCurveTo(hx, hy + 22, hx - rx * 0.62, hy + 6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // features: illustrated eyes, brows, nose and lips
    const ey = hy + 1, ex = rx * 0.43;
    drawFace(ctx, b, L, hx, ey, ex, rx, headgear === 'mask');

    // hair on top
    if (k.hair === 'bun' || k.hair === 'down' || k.hair === 'ponytail') {
      if (headgear !== 'beanie') {
        ctx.fillStyle = lit(ctx, L.hair, hx - rx, hx + rx, 0.22);
        ctx.beginPath();
        ctx.moveTo(hx - rx - 2, hy + (k.hair === 'down' ? 18 : 2));
        ctx.bezierCurveTo(hx - rx - 4, hy - ry * 1.3, hx + rx + 4, hy - ry * 1.3, hx + rx + 2, hy + (k.hair === 'down' ? 18 : 0));
        ctx.quadraticCurveTo(hx + rx - 2, hy - 12, hx + 4, hy - ry * 0.6);
        ctx.quadraticCurveTo(hx - 8, hy - 10, hx - rx + 2, hy - 2);
        ctx.closePath(); ctx.fill();
        hairShine(ctx, L.hair, hx, hy, rx, ry, 'up');
      }
    } else if (k.hair === 'bob') {
      // sleek bob, side part, fringe swept across the forehead
      ctx.fillStyle = lit(ctx, L.hair, hx - rx, hx + rx, 0.2);
      ctx.beginPath();
      ctx.moveTo(hx - rx - 4, hy + ry * 0.72);
      ctx.bezierCurveTo(hx - rx - 8, hy - ry * 1.4, hx + rx + 8, hy - ry * 1.4, hx + rx + 5, hy + ry * 0.82);
      ctx.lineTo(hx + rx - 2, hy + ry * 0.82);
      ctx.quadraticCurveTo(hx + rx - 1, hy - 2, hx + rx * 0.35, hy - ry * 0.45);
      ctx.quadraticCurveTo(hx - rx * 0.1, hy - ry * 0.25, hx - rx * 0.75, hy - ry * 0.5);
      ctx.quadraticCurveTo(hx - rx + 2, hy - ry * 0.2, hx - rx + 2.5, hy + ry * 0.72);
      ctx.closePath(); ctx.fill();
      hairShine(ctx, L.hair, hx, hy, rx, ry, 'bob');
    } else if (k.hair === 'shaved') {
      ctx.fillStyle = alpha(L.hair, 0.55);
      ctx.beginPath(); ctx.ellipse(hx, hy - ry * 0.55, rx * 0.98, ry * 0.5, 0, Math.PI, TAU); ctx.fill();
    }

    // headgear in front
    if (headgear === 'beanie') {
      ctx.fillStyle = lit(ctx, k.headColor, hx - rx, hx + rx, 0.3);
      ctx.beginPath(); ctx.ellipse(hx, hy - ry * 0.45, rx + 3, ry * 0.85, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = shade(k.headColor, 0.08); ctx.fillRect(hx - rx - 3, hy - ry * 0.5, (rx + 3) * 2, 8);
    } else if (headgear === 'helmet' || headgear === 'hood') {
      const vw = rx * (headgear === 'helmet' ? 1.18 : 1.08), vt = hy - ry * 0.75, vb = hy + ry * 1.0;
      ctx.fillStyle = alpha(k.visor, 0.22); rr(ctx, hx - vw, vt, vw * 2, vb - vt, headgear === 'helmet' ? 18 : 10); ctx.fill();
      ctx.strokeStyle = headgear === 'helmet' ? shade(k.headColor, -0.4) : shade(k.headColor, -0.3); ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = alpha('#ffffff', 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx + vw * 0.35, vt + 5); ctx.quadraticCurveTo(hx + vw * 0.8, vt + 7, hx + vw * 0.8, vt + 18); ctx.stroke();
      if (headgear === 'helmet') {
        ctx.save(); ctx.shadowColor = k.accent; ctx.shadowBlur = 8; ctx.fillStyle = k.accent;
        for (const s of [-1, 1]) circle(ctx, hx + s * rx * 1.25, hy + 6, 2.2);
        ctx.restore();
      }
    } else if (headgear === 'mask') {
      ctx.fillStyle = '#1b1c1e';
      ctx.beginPath(); ctx.ellipse(hx, hy + 6, rx * 1.02, ry * 0.95, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) {
        ctx.fillStyle = alpha(k.visor, 0.5); circle(ctx, hx + s * rx * 0.45, hy - 1, 6.5);
        ctx.strokeStyle = '#3a3c40'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx + s * rx * 0.45, hy - 1, 6.5, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#2d2f33'; rr(ctx, hx - 8, hy + 12, 16, 14, 4); ctx.fill();
      ctx.fillStyle = '#4b4e53'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - 6, hy + 15 + i * 3.5, 12, 1.5);
    } else if (headgear === 'visor') {
      ctx.save(); ctx.shadowColor = k.visor; ctx.shadowBlur = 10;
      ctx.fillStyle = alpha(k.visor, 0.75); rr(ctx, hx - rx - 2, ey - 4.5, (rx + 2) * 2, 8, 4); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#20262a'; ctx.fillRect(hx - rx - 4, ey - 2, 4, 4); ctx.fillRect(hx + rx, ey - 2, 4, 4);
    } else if (headgear === 'earpiece') {
      // comms earpiece with a mic boom, LED on
      ctx.fillStyle = '#20282d';
      ctx.beginPath(); ctx.ellipse(hx - rx - 1, hy + 3, 4.5, 6.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#20282d'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx - rx - 1, hy + 7); ctx.quadraticCurveTo(hx - rx + 2, hy + 18, hx - 8, hy + 19); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.save(); ctx.shadowColor = k.accent; ctx.shadowBlur = 6; ctx.fillStyle = k.accent; circle(ctx, hx - rx - 1, hy + 1.5, 1.6); ctx.restore();
    } else if (headgear === 'glasses') {
      ctx.strokeStyle = k.headColor; ctx.lineWidth = 1.4;
      for (const s of [-1, 1]) { rr(ctx, hx + s * ex - 6, ey - 4, 12, 8, 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(hx - ex + 6, ey - 1); ctx.lineTo(hx + ex - 6, ey - 1); ctx.stroke();
    } else if (headgear === 'goggles') {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx - rx - 1, hy - 14); ctx.lineTo(hx + rx + 1, hy - 14); ctx.stroke();
      for (const s of [-1, 1]) { ctx.fillStyle = alpha(k.headColor, 0.9); rr(ctx, hx + s * 8 - 6, hy - 19, 12, 9, 4); ctx.fill(); }
    } else if (headgear === 'shades') {
      ctx.fillStyle = k.headColor;
      for (const s of [-1, 1]) { rr(ctx, hx + s * 8 - 6.5, hy - ry * 0.78, 13, 7, 3); ctx.fill(); }
      ctx.fillRect(hx - 2, hy - ry * 0.75, 4, 2);
    }
  }

  // ================================================================ top-down sprite (in the field)
  /**
   * Draw an operative seen from above at (p.x, p.y). Facing +x after rotation by aim angle.
   * Called every frame for each player (there are at most two), so no caching is needed.
   */
  function drawTopDown(ctx, p, t) {
    const k = skinOf(p.charId, p.skin), L = LOOKS[p.charId] || LOOKS.mara, b = BUILDS[p.charId] || BUILDS.mara;
    const r = p.r, bulk = b.bulk;
    const skin = L.skin;
    const torsoCol = k.topKind === 'bare' || k.topKind === 'bikini' ? skin : k.top;
    const legCol = k.legKind === 'bikini' ? skin : k.legs;
    const sleeveCol = k.sleeves === 'none' ? skin : k.top;

    // legs (walk cycle, facing direction)
    ctx.save();
    ctx.rotate(p.faceAngle);
    const step = p.moving ? Math.sin(p.walk) * 6 : 0;
    ctx.fillStyle = shade(legCol, -0.15);
    rr(ctx, -6 + step, -7.5 * bulk, 13, 5.5, 2.5); ctx.fill();
    rr(ctx, -6 - step, 2 * bulk, 13, 5.5, 2.5); ctx.fill();
    ctx.fillStyle = k.legKind === 'bikini' || k.legKind === 'shorts' ? shade(L.skin, -0.2) : '#141518';
    rr(ctx, 4 + step, -7.5 * bulk, 4, 5.5, 1.5); ctx.fill(); rr(ctx, 4 - step, 2 * bulk, 4, 5.5, 1.5); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.rotate(p.aimAngle);
    const ry = r * bulk, rx = r * 0.62;

    // behind: air tank or slung shotgun
    if (k.pack === 'tank') {
      ctx.fillStyle = '#7d878d'; rr(ctx, -rx - 6, -ry * 0.55, 7, ry * 1.1, 3); ctx.fill();
      ctx.fillStyle = '#2b3236'; ctx.fillRect(-rx - 6, -1.5, 7, 3);
    }
    if (k.pack === 'shotgun') {
      ctx.save(); ctx.rotate(0.75);
      ctx.fillStyle = '#1b1c1e'; ctx.fillRect(-rx - 4, -2, r * 1.9, 3.5);
      ctx.restore();
    }
    // ponytail swings behind the head
    if (k.hair === 'ponytail' || (k.hair === 'down' && !k.head)) {
      const sw = Math.sin(p.walk * 0.5) * (p.moving ? 0.35 : 0.08);
      ctx.save(); ctx.translate(-r * 0.3, 0); ctx.rotate(Math.PI + sw);
      ctx.fillStyle = shade(L.hair, 0.05);
      ctx.beginPath(); ctx.ellipse(r * 0.45, 0, r * (k.hair === 'down' ? 0.55 : 0.6), r * (k.hair === 'down' ? 0.55 : 0.22), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // arms out to the weapon
    ctx.strokeStyle = sleeveCol; ctx.lineCap = 'round';
    ctx.lineWidth = 3.6 * bulk;
    ctx.beginPath(); ctx.moveTo(1, -ry * 0.78); ctx.lineTo(r * 0.75, -2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, ry * 0.78); ctx.lineTo(r * 0.7, 3.5); ctx.stroke();
    if (k.sleeves === 'short') {
      ctx.strokeStyle = skin; ctx.lineWidth = 3.3 * bulk;
      ctx.beginPath(); ctx.moveTo(r * 0.35, -ry * 0.45); ctx.lineTo(r * 0.75, -2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.33, ry * 0.45); ctx.lineTo(r * 0.7, 3.5); ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // weapon by operative
    if (p.charId === 'dex') {
      ctx.fillStyle = '#5b3a24'; ctx.fillRect(r * 0.2, 0, 9, 4.5);
      ctx.fillStyle = '#1d1e20'; ctx.fillRect(r * 0.6, 0.4, r * 1.35, 3.6);
      ctx.fillStyle = '#3a3c40'; ctx.fillRect(r * 1.05, -0.4, 7, 5.2);
    } else if (p.charId === 'rin') {
      ctx.fillStyle = '#2b3338'; rr(ctx, r * 0.55, -1, 12, 7, 2); ctx.fill();
      ctx.fillStyle = alpha('#5ff5d8', 0.6 + 0.4 * Math.sin(t * 9)); ctx.fillRect(r * 0.6, 1, 10, 1.6); ctx.fillRect(r * 0.6, 3.8, 10, 1.2);
    } else {
      ctx.fillStyle = '#1d1e20'; ctx.fillRect(r * 0.7, 0, r * 0.8, 4);
    }
    // hands
    ctx.fillStyle = k.gloves || skin;
    circle(ctx, r * 0.78, -2, 2.6); circle(ctx, r * 0.72, 3.8, 2.6);

    // torso (shoulders seen from above): a body ellipse plus two shoulder caps, outlined so the
    // silhouette reads against the ground
    const body = new Path2D();
    body.ellipse(-1, 0, rx, ry * 0.86, 0, 0, TAU);
    body.ellipse(-0.5, -ry * 0.62, rx * 0.62, ry * 0.36, 0, 0, TAU);
    body.ellipse(-0.5, ry * 0.62, rx * 0.62, ry * 0.36, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.stroke(body);
    ctx.fillStyle = torsoCol; ctx.fill(body);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(-rx * 0.45, 0, rx * 0.5, ry * 0.8, 0, 0, TAU); ctx.fill();
    if (k.topKind === 'bare' && b.bust === 0) {
      // shoulder blades and spine on Dex's back
      ctx.strokeStyle = alpha('#000000', 0.3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-rx + 2, 0); ctx.lineTo(rx * 0.3, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-2, -ry * 0.45, 3.5, 0.5 * Math.PI, 1.5 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(-2, ry * 0.45, 3.5, 0.5 * Math.PI, 1.5 * Math.PI); ctx.stroke();
    }
    if (k.topKind === 'bikini') {
      ctx.strokeStyle = k.top; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-rx + 1, -ry * 0.75); ctx.lineTo(-rx + 1, ry * 0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -ry * 0.3); ctx.lineTo(rx * 0.5, -ry * 0.55); ctx.moveTo(-2, ry * 0.3); ctx.lineTo(rx * 0.5, ry * 0.55); ctx.stroke();
    }
    if (k.topKind === 'jacket' || k.topKind === 'coat' || k.topKind === 'hoodie') {
      ctx.fillStyle = shade(k.top, -0.18);
      ctx.beginPath(); ctx.ellipse(-1, 0, rx * 0.55, ry * 0.92, 0, 0, TAU); ctx.fill();
    }
    // vest
    if (k.vest) {
      ctx.fillStyle = k.vest.color;
      rr(ctx, -rx + 1.5, -ry * 0.72, rx * 1.65, ry * 1.44, k.vest.kind === 'plate' ? 2 : 4); ctx.fill();
      ctx.fillStyle = shade(k.vest.color, k.vest.kind === 'plate' ? 0.15 : 0.1);
      for (let i = -1; i <= 1; i++) ctx.fillRect(rx * 0.35, i * ry * 0.38 - 2, 3.5, 4);
    }
    if (k.pack === 'radio') { ctx.fillStyle = '#0d0f12'; ctx.fillRect(-2, -ry * 0.82, 4, 4); ctx.fillStyle = k.accent; ctx.fillRect(-1, -ry * 0.82 + 1, 1.5, 1.5); }
    if (k.glow) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = alpha(k.accent, 0.75); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-rx + 2, 0); ctx.lineTo(rx - 3, 0); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-1, 0, rx - 1.5, ry - 1.5, 0, 0.6 * Math.PI, 1.4 * Math.PI); ctx.stroke();
      ctx.restore();
    }
    if (k.whistle) { ctx.fillStyle = k.whistle; ctx.fillRect(rx * 0.4, -1, 3, 2.5); }

    // head
    const hr = r * (b.bust ? 0.42 : 0.47), hx = 1.5;
    const g = k.head;
    if (g === 'helmet' || g === 'hood' || g === 'mask') {
      ctx.fillStyle = k.headColor; circle(ctx, hx - 0.5, 0, hr * (g === 'helmet' ? 1.3 : 1.18));
      ctx.fillStyle = g === 'mask' ? '#1b1c1e' : alpha(k.visor, 0.85);
      ctx.beginPath(); ctx.arc(hx, 0, hr * (g === 'helmet' ? 1.18 : 1.05), -0.85, 0.85); ctx.lineTo(hx + hr * 0.2, 0); ctx.closePath(); ctx.fill();
      if (g === 'helmet') { ctx.fillStyle = k.accent; ctx.fillRect(hx - hr * 1.2, -1, hr * 1.1, 2); }
    } else {
      // hair (or hat) covers the crown; the face shows as a crescent toward the front
      let crown = L.hair;
      if (g === 'beanie') crown = k.headColor;
      else if (k.hair === 'shaved') crown = shade(L.skin, -0.28);
      const hrr = hr * (k.hair === 'bob' && !g ? 1.08 : 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(hx, 0, hrr, 0, TAU); ctx.stroke();
      ctx.fillStyle = crown; circle(ctx, hx, 0, hrr);
      ctx.save(); ctx.beginPath(); ctx.arc(hx, 0, hrr, 0, TAU); ctx.clip();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(hx + hrr * 0.95, 0, hrr * 0.55, hrr * 0.72, 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (k.hair === 'bun' && g !== 'beanie') { ctx.fillStyle = shade(L.hair, -0.12); circle(ctx, hx - hrr * 0.95, 0, hr * 0.42); }
      if (g === 'beanie') { ctx.strokeStyle = shade(k.headColor, 0.2); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx, 0, hrr * 0.82, -1.2, 1.2); ctx.stroke(); }
      if (g === 'visor') { ctx.fillStyle = k.visor; ctx.fillRect(hx + hrr * 0.55, -hrr * 0.8, 2, hrr * 1.6); }
      if (g === 'goggles') { ctx.fillStyle = k.headColor; ctx.fillRect(hx - hrr * 0.05, -hrr * 0.85, 2.6, hrr * 1.7); }
      if (g === 'shades') { ctx.fillStyle = k.headColor; ctx.fillRect(hx - hrr * 0.25, -hrr * 0.75, 2.4, hrr * 1.5); }
      if (g === 'glasses') { ctx.fillStyle = '#222'; ctx.fillRect(hx + hrr * 0.62, -hrr * 0.6, 1.4, hrr * 1.2); }
      if (g === 'earpiece') { ctx.fillStyle = k.accent; ctx.fillRect(hx - 1, -hrr - 1.2, 2.2, 2.2); }
    }
    ctx.restore();
  }

  // ================================================================ cached portraits for the DOM
  const portraitCache = new Map();
  /** A canvas with the portrait at the given CSS size (rendered at device pixel ratio). */
  function portraitCanvas(charId, skinId, cssW) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = charId + ':' + skinId + ':' + cssW + ':' + dpr;
    let c = portraitCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const cssH = Math.round(cssW * PH / PW);
    c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(c.width / PW, c.height / PH);
    drawPortrait(ctx, charId, skinId);
    portraitCache.set(key, c);
    return c;
  }
  /** A fresh <canvas> element showing the portrait (DOM nodes can't share one canvas). */
  function portraitElement(charId, skinId, cssW, className) {
    const src = portraitCanvas(charId, skinId, cssW);
    const el = document.createElement('canvas');
    el.width = src.width; el.height = src.height;
    el.style.width = cssW + 'px'; el.style.height = Math.round(cssW * PH / PW) + 'px';
    el.className = className || '';
    el.setAttribute('role', 'img');
    const s = skinOf(charId, skinId);
    el.setAttribute('aria-label', (OO.CHARACTERS[charId] ? OO.CHARACTERS[charId].name : '') + ', ' + s.name);
    el.getContext('2d').drawImage(src, 0, 0);
    return el;
  }

  OO.SKINS = SKINS;
  OO.SKIN_COST = SKIN_COST;
  OO.Characters = { BUILDS, LOOKS, skinOf, drawPortrait, drawTopDown, portraitCanvas, portraitElement, PW, PH };
})(window.OO = window.OO || {});
