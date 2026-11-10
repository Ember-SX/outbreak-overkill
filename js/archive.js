/*
 * Archive data for the Dossier screen: achievements (one-off and ranked) and the bestiary.
 * Pure data; js/progress.js tracks and saves them, js/dossier.js draws them.
 */
(function (OO) {
  'use strict';

  // ---------------------------------------------------------------- COMMENDATIONS
  // tier: bronze | silver | gold. cat: milestones | combat | operatives | tactics | secrets.
  // goal + track: shows a progress bar (track names are read by Progress.progressOf).
  // hidden: name and text stay classified until unlocked; `hint` is shown instead.
  //
  // Ranked (multi-tier) achievements have `ranks: [[goal, tier], ...]` instead of `tier`/`goal`:
  // one achievement, several ranks (I, II, III...), each its own unlock with its own metal, all
  // on the same lifetime (or best-run) counter. `{n}` in the text is the rank's goal; fmt 'time'
  // shows it as m:ss, 'hours' as hours. Each rank counts as one unlock toward the total and is
  // saved as "<id>.<rank>" in oo.achievements.
  OO.ACH_CATS = [
    ['milestones', 'Milestones'],
    ['combat', 'Combat mastery'],
    ['operatives', 'Operative specializations'],
    ['tactics', 'Tactics and teamwork'],
    ['career', 'Career ranks'],
    ['infinite', 'Infinite Mode'],
    ['secrets', 'Classified'],
  ];

  // Signature-weapon ranks (shared by the three operative masteries).
  const SIG = [[500, 'bronze'], [2500, 'silver'], [5000, 'gold'], [15000, 'platinum'], [30000, 'diamond']];

  OO.ACHIEVEMENTS = [
    // Milestones
    { id: 'first_blood', cat: 'milestones', tier: 'bronze', icon: 'skull', name: 'First Blood', text: 'Put down your first infected.' },
    { id: 'extraction', cat: 'milestones', tier: 'silver', icon: 'heli', name: 'Extraction', text: 'Survive until the evac helicopter lands at 15:00.' },
    { id: 'full_roster', cat: 'milestones', tier: 'gold', icon: 'heli', name: 'Full Roster', text: 'Evacuate with all three operatives.', goal: 3, track: 'roster' },
    { id: 'body_count', cat: 'milestones', tier: 'silver', icon: 'skull', name: 'Body Count', text: 'Kill 3,000 infected in a single run.', goal: 3000, track: 'bestKills' },
    { id: 'dressed', cat: 'milestones', tier: 'bronze', icon: 'credits', name: 'Dressed to Kill', text: 'Buy an outfit in the Armory wardrobe.' },

    // Combat mastery
    { id: 'stalker_down', cat: 'combat', tier: 'bronze', icon: 'stalker', name: 'Stalker Down', text: 'Kill the Stalker.' },
    { id: 'restraining', cat: 'combat', tier: 'gold', icon: 'stalker', name: 'Restraining Order', text: 'Kill all four Stalkers in a single run, the 10:00 pair included.', goal: 4, track: 'bestStalkers' },
    { id: 'scrap_metal', cat: 'combat', tier: 'gold', icon: 'mech', name: 'Scrap Metal', text: 'Destroy the Hare Trigger.' },
    { id: 'mutation', cat: 'combat', tier: 'bronze', icon: 'dna', name: 'Mutation Protocol', text: 'Evolve a weapon.' },
    { id: 'duck_cover', cat: 'combat', tier: 'silver', icon: 'armor', name: 'Duck and Cover', text: 'Get through five stampedes in one run without a single Burster hit.' },
    { id: 'untouchable', cat: 'combat', tier: 'silver', icon: 'speed', name: 'Untouchable', text: 'Reach 3:00 without taking any damage.' },
    { id: 'powder_keg', cat: 'combat', tier: 'silver', icon: 'barrel', name: 'Powder Keg', text: 'Kill 30 infected with volatile drums in a single run.', goal: 30, track: 'bestBarrelKills' },
    { id: 'flatline', cat: 'combat', tier: 'silver', icon: 'maxhp', name: 'Flatline Averted', text: 'Drop below 10% health and still make the evac.' },

    // Operative specializations
    { id: 'evac_mara', cat: 'operatives', tier: 'bronze', icon: 'pistol', name: 'Voss Protocol', text: 'Evacuate as Mara Voss.' },
    { id: 'evac_dex', cat: 'operatives', tier: 'bronze', icon: 'shotgun', name: 'Contract Fulfilled', text: 'Evacuate as Dex Okafor.' },
    { id: 'evac_rin', cat: 'operatives', tier: 'bronze', icon: 'tesla', name: 'Lab Rat Escapes', text: 'Evacuate as Rin Sato.' },
    { id: 'master_mara', cat: 'operatives', icon: 'pistol', name: 'Marksman', text: 'As Mara, kill {n} infected with her sidearm (or its evolution).', track: 'sig:mara', ranks: SIG },
    { id: 'master_dex', cat: 'operatives', icon: 'shotgun', name: 'Breach and Clear', text: "As Dex, kill {n} infected with his shotgun (or Dragon's Breath).", track: 'sig:dex', ranks: SIG },
    { id: 'master_rin', cat: 'operatives', icon: 'tesla', name: 'Live Wire', text: 'As Rin, kill {n} infected with her tesla coil (or Arc Storm).', track: 'sig:rin', ranks: SIG },

    // Tactics and teamwork
    { id: 'buddy', cat: 'tactics', tier: 'silver', icon: 'herb', name: 'Buddy System', text: 'Revive your partner in a co-op run.' },
    { id: 'danger_close', cat: 'tactics', tier: 'bronze', icon: 'beacon', name: 'Danger Close', text: 'Use three tactical call-downs in a single run.' },
    { id: 'researcher', cat: 'tactics', tier: 'silver', icon: 'dna', name: 'Field Researcher', text: 'File a bestiary report on every specimen.', goal: 9, track: 'codex' },

    // Career ranks (lifetime counters, several ranks each)
    { id: 'pest_control', cat: 'career', icon: 'skull', name: 'Pest Control', text: 'Kill {n} infected across all runs.', track: 'kills',
      ranks: [[1000, 'bronze'], [5000, 'silver'], [15000, 'gold'], [30000, 'platinum'], [60000, 'diamond'], [100000, 'biohazard']] },
    { id: 'boss_hunter', cat: 'career', icon: 'stalker', name: 'Boss Hunter', text: 'Take down {n} bosses (Stalkers and Hare Triggers) across all runs.', track: 'bosses',
      ranks: [[5, 'bronze'], [15, 'silver'], [40, 'gold'], [100, 'platinum'], [250, 'diamond']] },
    { id: 'trigger', cat: 'career', icon: 'amount', name: 'Trigger Discipline', text: 'Fire {n} shots across all runs.', track: 'shots',
      ranks: [[10000, 'bronze'], [50000, 'silver'], [150000, 'gold'], [500000, 'platinum'], [1000000, 'diamond']] },
    { id: 'demolitions', cat: 'career', icon: 'barrel', name: 'Demolitions', text: 'Kill {n} infected with volatile drums across all runs.', track: 'barrelKills',
      ranks: [[100, 'bronze'], [500, 'silver'], [1500, 'gold'], [5000, 'platinum']] },
    { id: 'veteran', cat: 'career', icon: 'heli', name: 'Veteran', text: 'Evacuate {n} times.', track: 'evacs',
      ranks: [[3, 'bronze'], [10, 'silver'], [25, 'gold'], [50, 'platinum'], [100, 'diamond']] },
    { id: 'zone_time', cat: 'career', icon: 'speed', name: 'Time in the Zone', text: 'Spend {n} in the quarantine zone.', track: 'playtime', fmt: 'hours',
      ranks: [[3600, 'bronze'], [5 * 3600, 'silver'], [12 * 3600, 'gold'], [24 * 3600, 'platinum'], [48 * 3600, 'diamond']] },

    // Infinite Mode
    { id: 'no_return', cat: 'infinite', tier: 'silver', icon: 'heli', name: 'Point of No Return', text: 'Stay past the extraction mark in Infinite Mode.' },
    { id: 'into_dark', cat: 'infinite', icon: 'stalker', name: 'Into the Dark', text: 'Survive to {n} in Infinite Mode.', track: 'bestInfinite', fmt: 'time',
      ranks: [[20 * 60, 'bronze'], [25 * 60, 'silver'], [30 * 60, 'gold'], [40 * 60, 'platinum'], [50 * 60, 'diamond'], [60 * 60, 'biohazard']] },
    { id: 'apex', cat: 'infinite', icon: 'apex', name: 'Apex Predator', text: 'Take {n} Apex mutations in a single run.', track: 'bestApex',
      ranks: [[1, 'bronze'], [10, 'silver'], [25, 'gold'], [50, 'platinum'], [100, 'diamond']] },
    { id: 'ascension', cat: 'infinite', icon: 'dna', name: 'Ascension', text: 'Reach level {n} in a single run.', track: 'bestLevel',
      ranks: [[50, 'bronze'], [75, 'silver'], [100, 'gold'], [150, 'platinum'], [200, 'diamond']] },

    // Classified
    { id: 'bunny', cat: 'secrets', tier: 'bronze', icon: 'bunny', name: 'Bunny Business', text: 'Found the BISCUIT code.', hidden: true, hint: 'Somebody in the lab had a favourite. Type their name.' },
    { id: 'footage', cat: 'secrets', tier: 'bronze', icon: 'tape', name: 'Recovered Footage', text: 'Found the tape code.', hidden: true, hint: 'An old cheat from an older console. Up, up...' },
  ];

  OO.TIERS = {
    bronze:    { name: 'Bronze',    color: '#c98a4e', points: 10 },
    silver:    { name: 'Silver',    color: '#c9d6d3', points: 25 },
    gold:      { name: 'Gold',      color: '#f2c14a', points: 50 },
    platinum:  { name: 'Platinum',  color: '#dff3f0', points: 75 },
    diamond:   { name: 'Diamond',   color: '#7fd8ff', points: 100 },
    biohazard: { name: 'Biohazard', color: '#ff3b4e', points: 150 },
  };
  OO.TIER_ORDER = Object.keys(OO.TIERS);

  /**
   * Every unlockable unit: one per one-off achievement, one per rank of a ranked one.
   * { key, a, rank (1-based, 0 for one-offs), tier, goal }
   */
  OO.ACH_UNITS = [];
  for (const a of OO.ACHIEVEMENTS) {
    if (a.ranks) a.ranks.forEach(([goal, tier], i) => OO.ACH_UNITS.push({ key: a.id + '.' + (i + 1), a, rank: i + 1, tier, goal }));
    else OO.ACH_UNITS.push({ key: a.id, a, rank: 0, tier: a.tier, goal: a.goal });
  }
  OO.achUnit = (key) => OO.ACH_UNITS.find((u) => u.key === key) || null;

  // ---------------------------------------------------------------- BESTIARY
  // One entry per specimen, unlocked the first time it comes into view. Stats come from OO.ENEMIES.
  OO.CODEX = {
    shambler: {
      cls: 'Stage I host', threat: 1,
      lore: [
        'Most of Cold Harbor\'s night shift. The Lazarus strain keeps the brainstem and the motor cortex running long after everything that made a person is gone, and it keeps them walking toward warmth and noise.',
        'Slow and clumsy on its own. The danger is arithmetic: by the time you hear one, there are thirty more behind it.',
      ],
      traits: ['Walks in a slow weave', 'Comes in numbers'],
    },
    hound: {
      cls: 'Stage I canine', threat: 2,
      lore: [
        'Harbor PD\'s K-9 kennel and Helix\'s own test animals, in roughly equal parts. Infected dogs lose their fur in clumps and gain an appalling turn of speed.',
        'They hunt by scent in loose packs and arrive all at once. Keep your back to something solid when the howling starts.',
      ],
      traits: ['Fastest regular infected', 'Arrives in packs'],
    },
    skinner: {
      cls: 'Stage II host', threat: 3,
      lore: [
        'A host that has been infected for more than six hours. The skin sloughs away and the strain rebuilds the muscle underneath, denser and faster than it was.',
        'Field teams report Skinners ignoring injuries that should have dropped them. They do drop. It just takes more rounds than you think.',
      ],
      traits: ['Tough and quick', 'Late-game backbone of the horde'],
    },
    spitter: {
      cls: 'Stage II variant', threat: 3,
      lore: [
        'The salivary glands swell into acid sacs. A Spitter keeps its distance, swells up, and lobs a mouthful of corrosive bile where it thinks you are about to be.',
        'The pool keeps burning after the splash. Never stand in green, and never stop moving in a straight line.',
      ],
      traits: ['Ranged, leads its shots', 'Acid pools linger'],
    },
    bloater: {
      cls: 'Stage II variant', threat: 3,
      lore: [
        'A host whose gut flora went to war with the strain and lost. The body fills with pressurised gas and bile until something, usually a bullet, lets it out.',
        'The blast hurts everything near it, infected included. Pop them at range, or near a crowd you want thinned.',
      ],
      traits: ['Explodes on death', 'Blast hurts the horde too'],
    },
    burster: {
      cls: 'Stage III swarm', threat: 4,
      lore: [
        'Helix catalogued these as "chitin runners". The strain grows a plated shell over a host\'s back and drives it forward at full sprint until it hits something and ruptures.',
        'Bullets glance off. Once a stampede is launched, the runners hold a dead-straight line, so the only answer is to put a wreck, a wall or a drum between you and them.',
      ],
      traits: ['Invulnerable', 'Charges in a straight line', 'Explodes against cover'],
    },
    brute: {
      cls: 'Stage III host', threat: 4,
      lore: [
        'One host in a few thousand reacts to the strain with runaway muscle growth. The skeleton cracks and re-sets under the weight. They shoulder through the horde like it isn\'t there.',
        'A Brute always carries something worth taking: Helix couriers were issued supply cases, and a lot of them turned.',
      ],
      traits: ['Elite: heavy armor', 'Drops a supply case'],
    },
    stalker: {
      cls: 'Helix asset HX-9 "Warden"', threat: 5,
      lore: [
        'Not an accident. The Warden programme bred a pursuit organism to retrieve escaped subjects, and somebody opened its tank when Sub-Level 4 lost power.',
        'It follows a scent trail for kilometres, winds up, and lunges. When the red ring flashes, move sideways, not back. Helix built more than one.',
      ],
      traits: ['Boss: hunts at 5:00, 7:00 and in a pair at 10:00', 'Telegraphed lunge'],
    },
    mecha: {
      cls: 'Combat frame HT-1, pilot B-0 "Biscuit"', threat: 5,
      lore: [
        'Lab subject B-0 was a rabbit from the cognition wing, the only animal in the building the strain made smarter instead of hungrier. Biscuit escaped on the first night and found the hangar.',
        'The HARE TRIGGER rocket-jumps onto marked ground, fires carrot missiles at your path and, when it\'s losing, sweeps a visor laser. Cover stops missiles and the beam. Nothing stops the landing.',
      ],
      traits: ['Final boss at 13:00', 'Leap, missiles, overdrive laser'],
    },
  };
  OO.CODEX_ORDER = Object.keys(OO.CODEX);
})(window.OO = window.OO || {});
