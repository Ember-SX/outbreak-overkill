/*
 * Outbreak Overkill — game data.
 * Everything tunable lives here: enemies, weapons, passives, operatives and the wave script.
 * Balance changes should almost always be edits to this file only.
 */
(function (OO) {
  'use strict';

  OO.VERSION = '0.1.0';

  OO.CONFIG = {
    RUN_LENGTH: 15 * 60,          // seconds until evac arrives (victory)
    MAX_ENEMIES: 450,
    MAX_GEMS: 320,                // past this, new XP merges into one overflow gem
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    LIGHT_RADIUS: 330,            // flashlight radius in world units
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
    shambler: { name: 'Shambler',    hp: 12,   speed: 36, dmg: 8,  r: 13, xp: 1,   mass: 1,   body: '#56613f', skin: '#7f8b61', eye: '#ffd24a', blood: 'red' },
    hound:    { name: 'Rot Hound',   hp: 8,    speed: 96, dmg: 6,  r: 11, xp: 1,   mass: 0.6, body: '#4d2a22', skin: '#8b4b3a', eye: '#ff5a2a', blood: 'red' },
    skinner:  { name: 'Skinner',     hp: 32,   speed: 70, dmg: 12, r: 13, xp: 3,   mass: 1.2, body: '#7a211d', skin: '#b8473d', eye: '#fff0e8', blood: 'red' },
    bloater:  { name: 'Bloater',     hp: 70,   speed: 25, dmg: 14, r: 22, xp: 5,   mass: 3,   body: '#666e2c', skin: '#a2ad48', eye: '#eaff7a', blood: 'bile',
                explode: { r: 78, dmg: 16, enemyDmg: 45 } },
    brute:    { name: 'Brute',       hp: 450,  speed: 42, dmg: 22, r: 26, xp: 25,  mass: 10,  body: '#3c3e46', skin: '#6c707c', eye: '#ff3a30', blood: 'red', elite: true },
    stalker:  { name: 'The Stalker', hp: 4000, speed: 56, dmg: 30, r: 32, xp: 120, mass: 40,  body: '#1b1620', skin: '#3b2d45', eye: '#ff2444', blood: 'red', boss: true },
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
  OO.WAVES = [
    { pool: [['shambler', 1]],                                                   target: 18,  interval: 1.2, batch: 2 },
    { pool: [['shambler', 7], ['hound', 3]],                                     target: 40,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 6], ['hound', 4]],                                     target: 60,  interval: 1.0, batch: 3 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3]],                     target: 80,  interval: 0.9, batch: 3 },
    { pool: [['shambler', 5], ['hound', 2], ['skinner', 3], ['bloater', 1]],     target: 100, interval: 0.9, batch: 4 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 1]],                   target: 110, interval: 0.9, batch: 4 },
    { pool: [['skinner', 6], ['hound', 3], ['bloater', 1]],                      target: 140, interval: 0.8, batch: 4 },
    { pool: [['shambler', 4], ['bloater', 3], ['skinner', 3]],                   target: 160, interval: 0.8, batch: 5 },
    { pool: [['hound', 6], ['skinner', 3], ['bloater', 1]],                      target: 200, interval: 0.7, batch: 5 },
    { pool: [['shambler', 3], ['hound', 3], ['skinner', 3], ['bloater', 1]],     target: 230, interval: 0.7, batch: 6 },
    { pool: [['skinner', 5], ['bloater', 2], ['hound', 3]],                      target: 260, interval: 0.6, batch: 6 },
    { pool: [['shambler', 4], ['skinner', 4], ['bloater', 2]],                   target: 290, interval: 0.6, batch: 7 },
    { pool: [['hound', 4], ['skinner', 4], ['bloater', 2]],                      target: 320, interval: 0.5, batch: 7 },
    { pool: [['skinner', 5], ['bloater', 3], ['hound', 2]],                      target: 350, interval: 0.5, batch: 8 },
    { pool: [['shambler', 2], ['hound', 3], ['skinner', 4], ['bloater', 3]],     target: 400, interval: 0.4, batch: 9 },
  ];

  // Scripted moments. kinds: pack (clustered rush), ring (encirclement), elite, boss, banner.
  OO.EVENTS = [
    { t: 60,  kind: 'banner', text: 'Rot Hounds are on your scent' },
    { t: 90,  kind: 'pack',  enemy: 'hound',    count: 20 },
    { t: 150, kind: 'elite', enemy: 'brute',    count: 1, text: 'Brute sighted' },
    { t: 210, kind: 'ring',  enemy: 'shambler', count: 40, text: 'They have you surrounded' },
    { t: 240, kind: 'elite', enemy: 'brute',    count: 1 },
    { t: 300, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'Warning: The Stalker is hunting you' },
    { t: 390, kind: 'pack',  enemy: 'hound',    count: 35 },
    { t: 420, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 480, kind: 'ring',  enemy: 'bloater',  count: 18, text: 'Bloaters closing in. Keep your distance' },
    { t: 540, kind: 'elite', enemy: 'brute',    count: 2 },
    { t: 600, kind: 'boss',  enemy: 'stalker',  count: 1, text: 'The Stalker is back, and angrier' },
    { t: 660, kind: 'pack',  enemy: 'hound',    count: 50 },
    { t: 720, kind: 'ring',  enemy: 'skinner',  count: 70, text: 'Skinners in the walls' },
    { t: 780, kind: 'elite', enemy: 'brute',    count: 3 },
    { t: 840, kind: 'boss',  enemy: 'stalker',  count: 2, text: 'Two Stalkers. Evac is one minute out' },
    { t: 870, kind: 'banner', text: 'Evac helicopter inbound. Hold on' },
  ];
})(window.OO = window.OO || {});
