/*
 * Outbreak Overkill — game data.
 * Everything tunable lives here: enemies, weapons, passives, operatives and the wave script.
 * Balance changes should almost always be edits to this file only.
 */
(function (OO) {
  'use strict';

  OO.VERSION = '0.3.0';

  OO.CONFIG = {
    RUN_LENGTH: 15 * 60,          // seconds until evac arrives (victory)
    MAX_ENEMIES: 500,
    MAX_GEMS: 320,                // past this, new XP merges into one overflow gem
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    LIGHT_RADIUS: 330,            // flashlight radius in world units
    // Enemy leveling ("strain level"). Every infected spawns at the current strain level, and its
    // HP is multiplied by (1 + hpGrowth)^level on top of the threat level's HP multiplier.
    // level = floor(minutes * perMinute + adapt). `adapt` is the dynamic part: it climbs while too
    // many kills are one-hit kills (one-hit share above `target`) and slowly falls back when the
    // infected start soaking hits again. It never goes below 0 or above `max`.
    LEVELING: {
      perMinute: 1,
      hpGrowth: { normal: 0.14, elite: 0.12, boss: 0.10 },
      adapt: {
        target: 0.4,     // aim for at most ~40% of regular kills being one-hit kills
        gain: 0.06,      // levels per second per unit of one-hit share above target
        decay: 0.02,     // levels per second lost while one-hit share is well under target
        max: 10,
        smoothing: 0.03, // weight of each new kill in the rolling one-hit share
        grace: 60,       // seconds before adaptation starts
        minSamples: 20,
      },
      announceEvery: 5,  // banner at strain level 5, 10, 15...
    },
    // Burster stampede: warning time, when the lane locks (seconds before launch), row spacing.
    STAMPEDE: { warn: 3.0, lockAt: 0.8, spacing: 44, homing: 0.12 },
    // Spitters hang back and are easy to ignore, so cap how many can be alive: 1 + 0.5/min, max 7.
    spitterCap(minute) { return Math.min(7, 1 + Math.floor(minute * 0.5)); },
    PLAYER: { radius: 14, speed: 140, maxHp: 100, pickupRange: 80, iframes: 0.45 },
    xpToNext(level) {
      if (level < 20) return 5 + (level - 1) * 8;
      if (level < 40) return 157 + (level - 20) * 12;
      return 397 + (level - 40) * 16;
    },
  };

  // ---------------------------------------------------------------- ENEMIES
  // hp/dmg scale with time in game.spawnEnemy(). r = collision radius. mass = knockback resistance.
  OO.ENEMIES = {
    shambler: { name: 'Shambler',    hp: 12,   speed: 40, dmg: 8,  r: 13, xp: 1,   mass: 1,   body: '#56613f', skin: '#7f8b61', eye: '#ffd24a', blood: 'red' },
    hound:    { name: 'Rot Hound',   hp: 9,    speed: 100, dmg: 7,  r: 11, xp: 1,   mass: 0.6, body: '#4d2a22', skin: '#8b4b3a', eye: '#ff5a2a', blood: 'red' },
    skinner:  { name: 'Skinner',     hp: 36,   speed: 72, dmg: 12, r: 13, xp: 3,   mass: 1.2, body: '#7a211d', skin: '#b8473d', eye: '#fff0e8', blood: 'red' },
    bloater:  { name: 'Bloater',     hp: 70,   speed: 25, dmg: 14, r: 22, xp: 5,   mass: 3,   body: '#666e2c', skin: '#a2ad48', eye: '#eaff7a', blood: 'bile',
                explode: { r: 78, dmg: 16, enemyDmg: 45 } },
    spitter:  { name: 'Spitter',     hp: 28,   speed: 52, dmg: 6,  r: 13, xp: 3,   mass: 1,   body: '#33502a', skin: '#86b542', eye: '#e2ff6a', blood: 'bile',
                // Keeps its distance, swells up, then lobs acid where you're heading. The pool lingers.
                ranged: { min: 150, max: 240, cd: [3.0, 4.2], windup: 0.6, flight: 0.85, splash: 34, impact: 10,
                          pool: { r: 40, life: 3.6, tick: 0.35, dmg: 5 } } },
    burster:  { name: 'Burster',     hp: 6,    speed: 430, dmg: 0, r: 10, xp: 0,   mass: 0.5, body: '#6a1830', skin: '#c94f6c', eye: '#ffe6e6', blood: 'red',
                // Only arrive in stampedes (see OO.EVENTS kind 'stampede'). Explode on contact with you or cover.
                // Invulnerable: nothing damages them, auto-aim ignores them, bullets glance off. Cover is the answer.
                invulnerable: true,
                burster: { r: 64, dmg: 42, enemyDmg: 90 } },
    brute:    { name: 'Brute',       hp: 450,  speed: 42, dmg: 18, r: 26, xp: 25,  mass: 10,  body: '#3c3e46', skin: '#6c707c', eye: '#ff3a30', blood: 'red', elite: true },
    stalker:  { name: 'The Stalker', hp: 4800, speed: 58, dmg: 30, r: 32, xp: 120, mass: 40,  body: '#1b1620', skin: '#3b2d45', eye: '#ff2444', blood: 'red', boss: true },
    crate:    { name: 'Supply Crate', hp: 1,   speed: 0,  dmg: 0,  r: 15, xp: 0,   mass: 999, crate: true },
  };

  // ---------------------------------------------------------------- WEAPONS
  // Stats at level N = base + sum(levels[0 .. N-2]). Max level = levels.length + 1.
  // Player passives then multiply dmg / cd / area and add to amount (see Weapon.getStats).
  OO.WEAPONS = {
    pistol: {
      name: 'Service Pistol', icon: 'pistol', desc: 'Fires at the nearest infected.',
      base: { dmg: 10, cd: 0.9, amount: 1, speed: 520, pierce: 1, duration: 1.1, kb: 40 },
      levels: [
        { amount: 1, text: 'Fires 1 more round per volley.' },
        { dmg: 5, text: 'Base damage up by 5.' },
        { amount: 1, cd: -0.1, text: '1 more round. Fires a little faster.' },
        { pierce: 1, text: 'Rounds pass through 1 more target.' },
        { dmg: 5, text: 'Base damage up by 5.' },
        { amount: 1, text: 'Fires 1 more round per volley.' },
        { dmg: 10, pierce: 1, text: 'Base damage up by 10. Rounds pierce 1 more.' },
      ],
    },
    knife: {
      name: 'Combat Knife', icon: 'knife', desc: 'Slashes the way you face and hits everything in the arc.',
      base: { dmg: 14, cd: 1.15, amount: 1, area: 1, kb: 130 },
      levels: [
        { amount: 1, text: 'Adds a backhand slash behind you.' },
        { dmg: 6, text: 'Base damage up by 6.' },
        { area: 0.15, text: 'Slash reach up by 15%.' },
        { dmg: 6, cd: -0.1, text: 'Damage up by 6. Slashes faster.' },
        { area: 0.15, text: 'Slash reach up by 15%.' },
        { dmg: 8, text: 'Base damage up by 8.' },
        { amount: 1, dmg: 6, text: 'Adds a third slash. Damage up by 6.' },
      ],
    },
    shotgun: {
      name: 'Pump Shotgun', icon: 'shotgun', desc: 'Short-range spread with heavy knockback.',
      base: { dmg: 9, cd: 1.4, amount: 5, speed: 640, pierce: 1, duration: 0.33, spread: 0.55, kb: 230 },
      levels: [
        { amount: 2, text: '2 more pellets per shell.' },
        { dmg: 3, text: 'Pellet damage up by 3.' },
        { cd: -0.2, text: 'Racks faster.' },
        { pierce: 1, duration: 0.07, text: 'Pellets pierce 1 more and fly further.' },
        { amount: 2, text: '2 more pellets per shell.' },
        { dmg: 4, text: 'Pellet damage up by 4.' },
        { cd: -0.25, dmg: 3, text: 'Racks faster. Pellet damage up by 3.' },
      ],
    },
    grenade: {
      name: 'Incendiary Grenade', icon: 'grenade', desc: 'Lobs a grenade that leaves a burning pool.',
      base: { dmg: 7, cd: 3.2, amount: 1, area: 1, duration: 2.4, tick: 0.3 },
      levels: [
        { amount: 1, text: 'Throws 1 more grenade.' },
        { area: 0.2, text: 'Fire pools 20% larger.' },
        { dmg: 3, text: 'Burn damage up by 3.' },
        { duration: 0.8, text: 'Pools burn 0.8s longer.' },
        { amount: 1, text: 'Throws 1 more grenade.' },
        { area: 0.2, text: 'Fire pools 20% larger.' },
        { dmg: 5, cd: -0.4, text: 'Burn damage up by 5. Throws faster.' },
      ],
    },
    saw: {
      name: 'Sawblade Drones', icon: 'saw', desc: 'Blades orbit you for a few seconds, then recharge.',
      base: { dmg: 9, cd: 4.2, amount: 1, area: 1, speed: 3.4, duration: 3.2, hitCd: 0.45, kb: 90 },
      levels: [
        { amount: 1, text: 'Adds a drone.' },
        { speed: 0.8, area: 0.1, text: 'Spins faster. Orbit 10% wider.' },
        { dmg: 4, text: 'Blade damage up by 4.' },
        { duration: 0.8, text: 'Drones run 0.8s longer.' },
        { amount: 1, text: 'Adds a drone.' },
        { dmg: 5, text: 'Blade damage up by 5.' },
        { amount: 1, duration: 0.8, text: 'Adds a drone. Runs 0.8s longer.' },
      ],
    },
    tesla: {
      name: 'Tesla Coil', icon: 'tesla', desc: 'Arcs lightning into a random infected, then chains.',
      base: { dmg: 15, cd: 1.9, amount: 1, area: 1, chains: 3 },
      levels: [
        { chains: 1, text: 'Chains to 1 more target.' },
        { dmg: 6, text: 'Bolt damage up by 6.' },
        { amount: 1, text: 'Fires 1 more bolt.' },
        { cd: -0.3, text: 'Recharges faster.' },
        { chains: 2, text: 'Chains to 2 more targets.' },
        { dmg: 8, text: 'Bolt damage up by 8.' },
        { amount: 1, chains: 1, text: '1 more bolt. Chains 1 further.' },
      ],
    },
  };

  // ---------------------------------------------------------------- EVOLUTIONS
  // A max-level weapon + the listed gear (any level) evolves when you open a supply case.
  // Evolved forms reuse the base weapon's behaviour with much stronger stats and one twist.
  const EVOLVED = {
    twinpistols: {
      from: 'pistol', name: 'Twin Auto Pistols', icon: 'pistol',
      desc: 'Two guns, armour-piercing rounds, barely any reload.',
      base: { dmg: 22, cd: 0.5, amount: 4, speed: 680, pierce: 3, duration: 1.2, kb: 50 },
    },
    dragonsbreath: {
      from: 'shotgun', name: "Dragon's Breath", icon: 'shotgun',
      desc: 'Incendiary shells. Pellets that hit can set the ground alight.',
      base: { dmg: 16, cd: 1.0, amount: 11, speed: 700, pierce: 3, duration: 0.42, spread: 0.85, kb: 260, ignite: 0.25 },
    },
    bloodletter: {
      from: 'knife', name: 'Bloodletter', icon: 'knife',
      desc: 'Slashes in every direction at once. Heals 1 HP per kill.',
      base: { dmg: 34, cd: 0.8, amount: 4, area: 1.45, kb: 170, omni: 1, lifesteal: 1 },
    },
    napalm: {
      from: 'grenade', name: 'Napalm Canister', icon: 'grenade',
      desc: 'Four canisters, huge pools, long burn.',
      base: { dmg: 13, cd: 2.4, amount: 4, area: 1.9, duration: 4.5, tick: 0.25 },
    },
    buzzhalo: {
      from: 'saw', name: 'Buzzsaw Halo', icon: 'saw',
      desc: 'Six blades that never stop spinning.',
      base: { dmg: 20, cd: 0.05, amount: 6, area: 1.35, speed: 4.6, duration: 1e9, hitCd: 0.3, kb: 120 },
    },
    arcstorm: {
      from: 'tesla', name: 'Arc Storm', icon: 'tesla',
      desc: 'Near-constant chain lightning across the horde.',
      base: { dmg: 30, cd: 0.75, amount: 3, area: 1.4, chains: 6 },
    },
  };
  for (const id in EVOLVED) {
    OO.WEAPONS[id] = Object.assign({ evolved: true, behaviour: EVOLVED[id].from, levels: [] }, EVOLVED[id]);
  }
  OO.EVOLUTIONS = {
    pistol:  { into: 'twinpistols',   needs: 'amount' },
    shotgun: { into: 'dragonsbreath', needs: 'might' },
    knife:   { into: 'bloodletter',   needs: 'speed' },
    grenade: { into: 'napalm',        needs: 'area' },
    saw:     { into: 'buzzhalo',      needs: 'cooldown' },
    tesla:   { into: 'arcstorm',      needs: 'magnet' },
  };

  // ---------------------------------------------------------------- PASSIVES
  OO.PASSIVES = {
    might:    { name: 'Hollow Points',  icon: 'might',    max: 5, text: '+10% damage for all weapons.' },
    armor:    { name: 'Kevlar Vest',    icon: 'armor',    max: 5, text: '+1 armor. Every hit you take is reduced.' },
    speed:    { name: 'Adrenaline',     icon: 'speed',    max: 5, text: '+8% move speed.' },
    area:     { name: 'Thermite Mix',   icon: 'area',     max: 5, text: '+10% weapon area.' },
    cooldown: { name: 'Speed Loader',   icon: 'cooldown', max: 5, text: '-8% weapon cooldown.' },
    magnet:   { name: 'Scavenger Pack', icon: 'magnet',   max: 5, text: '+30% pickup range.' },
    maxhp:    { name: 'Field Medkit',   icon: 'maxhp',    max: 5, text: '+20 max HP and slow regeneration.' },
    amount:   { name: 'Extended Mag',   icon: 'amount',   max: 2, text: '+1 projectile, blade or bolt for every weapon.' },
  };

  // ---------------------------------------------------------------- THREAT LEVELS
  // v0.3: what used to be Nightmare (x1.35 HP, x1.25 damage, x1.25 horde size) is now the
  // Standard baseline. Nightmare is locked until it gets its own, harder tuning; its numbers
  // below are placeholders and are never applied while `locked` is true.
  OO.DIFFICULTY = {
    standard:  { name: 'Standard',  hp: 1.35, dmg: 1.25, count: 1.25, credits: 1,   text: 'The intended experience.' },
    nightmare: { name: 'Nightmare', hp: 1.35, dmg: 1.25, count: 1.25, credits: 1.6, locked: true,
                 text: 'Locked. Coming in a future update.' },
  };

  // ---------------------------------------------------------------- ARMORY (meta progression)
  // Permanent upgrades bought between runs with banked credits. cost[i] = price of rank i+1.
  OO.ARMORY = [
    { id: 'vitality', name: 'Vitality Serum',      icon: 'maxhp',    max: 5, cost: [60, 100, 150, 220, 300], text: '+10 max HP per rank.' },
    { id: 'power',    name: 'Hollow-Point Stock',  icon: 'might',    max: 5, cost: [80, 130, 190, 260, 350], text: '+5% damage per rank.' },
    { id: 'plating',  name: 'Trauma Plates',       icon: 'armor',    max: 3, cost: [150, 260, 400],          text: '+1 armor per rank.' },
    { id: 'stride',   name: 'Field Training',      icon: 'speed',    max: 3, cost: [70, 130, 200],           text: '+5% move speed per rank.' },
    { id: 'collector',name: 'Sample Collector',    icon: 'magnet',   max: 3, cost: [50, 90, 140],            text: '+15% pickup range per rank.' },
    { id: 'growth',   name: 'Lab Notes',           icon: 'dna',      max: 3, cost: [90, 160, 250],           text: '+8% XP from DNA samples per rank.' },
    { id: 'reroll',   name: 'Requisition Forms',   icon: 'reroll',   max: 3, cost: [100, 180, 280],          text: '+1 level-up reroll per run.' },
    { id: 'greed',    name: 'Black Market Contact', icon: 'credits', max: 3, cost: [60, 120, 200],           text: '+10% credits banked per rank.' },
    { id: 'revive',   name: 'Second Wind',         icon: 'herb',     max: 1, cost: [500],                    text: 'Once per run, get back up at 50% HP.' },
  ];

  // ---------------------------------------------------------------- OPERATIVES
  OO.CHARACTERS = {
    mara: {
      name: 'Mara Voss', role: 'R.U.S.T. Unit officer', weapon: 'pistol',
      bonus: { might: 0.1 }, bonusText: '+10% damage', vest: '#2f4a5c',
    },
    dex: {
      name: 'Dex Okafor', role: 'Contractor, ex-infantry', weapon: 'shotgun',
      bonus: { maxHp: 30, armor: 1 }, bonusText: '+30 max HP, +1 armor', vest: '#4a4a2c',
    },
    rin: {
      name: 'Rin Sato', role: 'Helix lab technician', weapon: 'tesla',
      bonus: { speed: 0.1, magnet: 0.3 }, bonusText: '+10% speed, +30% pickup range', vest: '#5a5f66',
    },
  };

  // ---------------------------------------------------------------- WAVES
  // One entry per minute. pool = weighted enemy types. target = on-field count the
  // director tops up to. interval/batch = steady trickle on top of that.
  // v0.2: minutes 0-2 match v0.1; the horde then grows to +10% (3-5), +20% (6-9) and +30% (10+).
  OO.WAVES = [
    { pool: [['shambler', 1]],                                                   target: 18,  interval: 1.2, batch: 2 },
    { pool: [['shambler', 7], ['hound', 3]],                                     target: 40,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 6], ['hound', 4], ['spitter', 1]],                     target: 60,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3], ['spitter', 1]],     target: 88,  interval: 0.86, batch: 4 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3], ['bloater', 1], ['spitter', 1]], target: 110, interval: 0.86, batch: 5 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 1], ['spitter', 1.5]], target: 121, interval: 0.86, batch: 5 },
    { pool: [['skinner', 6], ['hound', 3], ['bloater', 1], ['spitter', 1.5]],    target: 168, interval: 0.73, batch: 5 },
    { pool: [['shambler', 4], ['bloater', 3], ['skinner', 3], ['spitter', 2]],   target: 192, interval: 0.73, batch: 6 },
    { pool: [['hound', 6], ['skinner', 3], ['bloater', 1], ['spitter', 1.5]],    target: 240, interval: 0.64, batch: 6 },
    { pool: [['shambler', 3], ['hound', 3], ['skinner', 3], ['bloater', 1], ['spitter', 2]], target: 276, interval: 0.64, batch: 7 },
    { pool: [['skinner', 5], ['bloater', 2], ['hound', 3], ['spitter', 2]],      target: 338, interval: 0.53, batch: 7 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 2], ['spitter', 2.5]], target: 377, interval: 0.53, batch: 8 },
    { pool: [['hound', 4], ['skinner', 4], ['bloater', 2], ['spitter', 2.5]],    target: 416, interval: 0.44, batch: 8 },
    { pool: [['skinner', 5], ['bloater', 3], ['hound', 2], ['spitter', 3]],      target: 455, interval: 0.44, batch: 9 },
    { pool: [['shambler', 2], ['hound', 3], ['skinner', 4], ['bloater', 3], ['spitter', 3]], target: 520, interval: 0.35, batch: 10 },
  ];

  // Scripted moments. kinds: pack (clustered rush), ring (encirclement), elite, boss, banner.
  OO.EVENTS = [
    { t: 60,  kind: 'banner', text: 'Rot Hounds are on your scent' },
    { t: 90,  kind: 'pack',  enemy: 'hound',    count: 20 },
    { t: 150, kind: 'elite', enemy: 'brute',    count: 1, text: 'Brute sighted' },
    { t: 135, kind: 'banner', text: 'Spitters: keep moving, the acid lingers' },
    { t: 165, kind: 'stampede', count: 7,  text: "Stampede! Bursters can't be stopped. Get behind cover" },
    { t: 210, kind: 'ring',  enemy: 'shambler', count: 40, text: 'They have you surrounded' },
    { t: 240, kind: 'elite', enemy: 'brute',    count: 1 },
    { t: 300, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'Warning: The Stalker is hunting you' },
    { t: 285, kind: 'stampede', count: 9,  text: 'Bursters again. Find cover' },
    { t: 330, kind: 'elite', enemy: 'brute',    count: 1 },
    { t: 360, kind: 'pack',  enemy: 'spitter',  count: 5, text: 'A nest of Spitters' },
    { t: 390, kind: 'pack',  enemy: 'hound',    count: 40 },
    { t: 405, kind: 'stampede', count: 11 },
    { t: 420, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 480, kind: 'ring',  enemy: 'bloater',  count: 18, text: 'Bloaters closing in. Keep your distance' },
    { t: 510, kind: 'stampede', count: 11, ranks: 2, text: 'Double stampede' },
    { t: 540, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 600, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'The Stalker is back, and angrier' },
    { t: 645, kind: 'stampede', count: 13, ranks: 2 },
    { t: 660, kind: 'pack',  enemy: 'hound',    count: 60 },
    { t: 690, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 720, kind: 'ring',  enemy: 'skinner',  count: 70, text: 'Skinners in the walls' },
    { t: 735, kind: 'stampede', count: 13, ranks: 2 },
    { t: 780, kind: 'elite', enemy: 'brute',    count: 3 },
    { t: 815, kind: 'stampede', count: 15, ranks: 2 },
    { t: 840, kind: 'boss',  enemy: 'stalker',  count: 2, text: 'Two Stalkers. Evac is one minute out' },
    { t: 870, kind: 'banner', text: 'Evac helicopter inbound. Hold on' },
    { t: 880, kind: 'stampede', count: 15, ranks: 2, text: 'One last stampede' },
  ];
})(window.OO = window.OO || {});
