# Changelog

All notable changes to Outbreak Overkill. Versions follow `MAJOR.MINOR.PATCH`.

## [Unreleased]

Branch `feature/v0.8-cover-armor`.

### Changed
- **Stampedes run dead straight.** Once launched, Bursters never turn toward you and can't be knocked off their line, so cover between you and the lane always holds. (Removed `STAMPEDE.homing`.)
- **Hare Trigger leap.**
  - The red landing ring locks the moment the leap starts and no longer follows you.
  - The shockwave does 0.6x contact damage (was 1.25x) and throws you clear of the mech's feet.
- **No Hare Trigger one-shots.** Each hit is capped at a share of the target's max HP before armor (`mech.hitCaps`): slam 45%, contact 50%, missile 40%, laser tick 30%. At 14:40 a 100 HP operative standing in the ring takes 45 instead of 207.
- **Health and armor upgrades buffed:**

  | Upgrade | Before | Now |
  |---|---|---|
  | Kevlar Vest (gear) | +1 armor | +1 armor and 7% damage reduction per rank (35% at rank 5) |
  | Field Medkit (gear) | +20 max HP, 0.25 HP/s | +35 max HP, 0.6 HP/s per rank, and a 25 HP heal when taken |
  | Vitality Serum (Armory) | +10 max HP | +25 max HP and 0.3 HP/s per rank |
  | Trauma Plates (Armory) | +1 armor | +2 armor and 6% damage reduction per rank |

  Percentage reduction applies before flat armor and is capped at 50% (`CONFIG.MITIGATION`). The pause screen shows armor with its reduction. A fully protected operative takes 17 from a 10:00 Stalker hit instead of 55.

## [0.7.0] - 2026-11-09

Branch `feature/v0.7-portraits-pacing`.

### Added
- **Portrait image pipeline** (`js/portraits.js`, `assets/portraits/`). The menu dossier, operative tabs and wardrobe load image files listed in `assets/portraits/manifest.js`.
  - Missing files fall back to the procedural portrait.
  - Images are preloaded at boot with a 2.5 s cap.
  - `npm run portraits` renders the baseline set (15 WebP files at 768 x 1024). `--keep` preserves commissioned art.
  - The bundle inlines the images. GitHub Pages deploys `assets/`.
- **Secret codes** (`js/secrets.js`), cosmetic only:
  - `BISCUIT` (or seven taps on the wordmark) gives the infected bunny ears.
  - The Konami code turns on a found-footage VHS overlay.
  - Found codes get switches on the pause screen.

### Changed
- **Rin's default outfit is now "Field agent"**: a fitted charcoal tech jacket with a stand collar, asymmetric zip and teal sensor piping, a comms earpiece, fingerless gloves, a utility belt and pouch, knee-padded trousers and the coil gauntlet. No helmet, air tank or glasses. The sealed containment suit is retired; Level A remains her hazmat option.
- **Portrait illustration pass:**
  - Almond eyes with gradient irises and catchlights.
  - Lined lids with lashes and a wing on Mara and Rin.
  - Shaped brows, a shaded nose, full lips with a highlight and a slight smirk, cheek colour.
  - Hair sheen; Rin's bob now has a side-swept fringe.
  - Slimmer waists and longer necks for Mara and Rin.
- **Encounter pacing:**
  - Second Stalker at 7:00 (was 10:00).
  - New twin-Stalker wave at 10:00.
  - The Hare Trigger at 13:00 (was 14:00), so you have two minutes to take it down.
  - The brutes that shared those moments moved to 7:30 and 12:45.
- The boss bar tracks only the Hare Trigger while it's up, even if Stalkers are still alive.
- **Mid-game damage taper** (`SURGE.dmgCurve`, `bossDmgScale`, `hitCap`):
  - The damage surge keeps its +12%/min rate from 6:00 to 8:00, slows to about +3%/min from 8:00 to 12:00, catches up to the old 12:00 level by 13:00, then climbs at +12%/min again.
  - Stalkers take half the damage surge. The Hare Trigger takes all of it.
  - Until 13:00, a single contact hit is capped at 55% of the operative's max HP.

  Per-hit damage, old -> new:

  | Enemy | 10:00 | 12:00 | 13:00 / 15:00 |
  |---|---|---|---|
  | Stalker | 89 -> 55 (65 uncapped) | 118 -> 55 | |
  | Brute | 53 -> 45 | 71 -> 51 | |
  | Shambler | 24 -> 20 | | 36 -> 33 / 49 -> 43 |
  | Hare Trigger | | | 146 -> 130 contact at 13:00 |
- The balance sim (god mode) prints average damage taken and the largest single hit for each minute.

### Fixed
- Scripted events listed out of order (the 2:15 Spitter banner, the 4:45 stampede) fired late. The event list is now sorted by time at load.

## [0.6.0] - 2026-11-08

Branch `feature/v0.6-presentation-skins`.

### Added
- **Wardrobe** in the Armory: five outfits per operative (tactical default, covert ops, undercover, hazmat, swimwear).
  - Each non-default outfit costs 1,800 credits, about three successful 15:00 runs (`OO.SKIN_COST`).
  - Buying equips it. Outfits are saved with the Armory and survive an upgrade refund.
  - They show in co-op: the outfit travels in `hello` and the `start` message.
  - The results screen says how far you are from the next one.
- **Operative art** (`js/characters.js`):
  - Distinct top-down silhouettes: Mara's patrol uniform and vest, Dex's broad build with a plate carrier and slung shotgun, Rin's helmeted containment suit with an air unit.
  - Front-facing portraits for the menu dossier and the wardrobe. Outfits are data, and one description drives both views.
- **ECG vitals monitor** replacing the HP bar:
  - The trace speeds up as health drops. It reads STABLE, STRAINED or CRITICAL and flatlines when you're down.
  - Partners get a compact monitor. The menu header has its own heartbeat line.
- **Scenery** (`js/scenery.js`):
  - Ground detail baked per chunk: roads with markings, crossings and drains; puddles, oil, skid marks and litter; glass, casings and hazard tape; old blood pools, drag trails, footprints and handprints; quarantine stencils.
  - Lights: sodium street lamps (some flicker or are dead) and rotating red beacons that cut through the darkness.
  - Atmosphere: drifting haze, dust in the flashlight beam, vignette and film grain.
- **Atmosphere** setting on the pause screen (auto / high / low). Auto drops the full-screen passes when the frame rate sags.

### Changed
- **Interface redesign:** a containment-terminal look with glass panels, bracketed corners and teal/amber/red signal colours.
  - Two-column main menu with an operative dossier and portrait tabs.
  - Tabbed Armory (Upgrades / Wardrobe); restyled level-up cards, pause, results, co-op and banners.
  - Mobile layout: wordmark, then operative, then briefing and buttons.
- **HUD:** a thin XP strip, mission clock plate, segmented boss bar, and teal/amber gear and weapon slots.
- **Kill decals** have a pool, a directional spray and a sheen, in 8 variants.
- Darkness and ground re-tinted cooler.
- **Fonts are self-hosted** (Chakra Petch, IBM Plex Mono, Big Shoulders Stencil Display; SIL OFL).
  - The game makes no third-party requests and looks right offline.
  - The single-file bundle embeds them.
  - Special Elite is gone with the case-file look.
- `npm run sim` prints each run's payout.

## [0.5.0] - 2026-11-08

Branch `feature/v0.5-final-boss`.

### Fixed
- **Co-op across networks: the joiner saw the host, but the host never saw the joiner and couldn't deploy.**
  - When a strict firewall or NAT blocked the direct WebRTC link, the data channel never opened. The joiner's lobby still listed a placeholder "Host" row, which looked like a connection.
  - The host kept that dead connection as its partner slot, so every retry was turned away as "room full".
  - Now:
    - Unopened links are dropped and replaced.
    - The host shows **Joining…** as soon as someone dials in, and explains when their connection couldn't get through. The room stays open.
    - The joiner only lists the host once the host has actually answered.
- **"Room not found" and failed links behind strict firewalls.**
  - Peers now get TURN relays:
    - your own relay (Co-op > Connection settings, saved in the browser, or `?turn=`);
    - the free Open Relay servers on ports 80/443 over UDP, TCP and TLS (time-limited credentials computed in the browser);
    - the PeerJS relays, plus two STUN servers.
  - The joiner retries over relays only if the first attempt doesn't open in 10s.
  - A "peer unavailable" answer is retried twice before "There is no room" is shown.
  - The host reconnects to the signalling server under the same room code if it drops. A running game no longer ends because the signalling server hiccuped.
  - `hello` is re-sent until the host's `welcome` arrives.
  - The lobby shows whether the link is direct or relayed.
- Text fields no longer lose arrow and space keys to the game's movement controls.

### Changed
- **Enemy HP stops scaling at 13:00** (`OO.CONFIG.LEVELING.hpCapTime = 780`):
  - The clock part of the strain level, the surge HP multiplier and the adaptive bonus all freeze there.
  - A Standard shambler tops out at x26.6 base HP instead of about x50 at 15:00.
  - Enemy damage keeps rising. The HUD marks the capped HP multiplier with (MAX).

### Added
- **Final boss: the HARE TRIGGER**, a combat mech piloted by lab subject B-0, "Biscuit" (a small, cross rabbit). It replaces the twin Stalkers at 14:00.
  - Rocket-jump entrance, stomp-walk hunting with a turn rate, and a telegraphed rocket leap with a landing shockwave (it can't be hit in the air; it staggers after landing). It leaps after you if you run far away.
  - Carrot-missile volleys onto marked ground (cover blocks them; they hurt the horde too).
  - Overdrive below half HP: faster, bigger volleys, and a tracking visor laser that locks before it sweeps; obstacles stop the beam.
  - Its own sprite (Biscuit visible in the cockpit), sounds, boss bar with pilot name, and a parachute ejection on defeat with a big supply case and herbs.
  - Fully mirrored in co-op, including missile reticles and laser state. Its HP is doubled in co-op like everything else.
  - Code in `js/boss.js`, tuning in `OO.ENEMIES.mecha.mech`. Debug key **N** spawns it.
- `npm run sim -- standard 1 god`: unkillable bots for checking the late game (HP-multiplier curve per minute, boss damage taken). The bots also dodge the boss's reticles.

## [0.4.0] - 2026-10-13

Branch `feature/v0.4-coop`.

### Added
- **2-player online co-op.** The Co-op screen has Host/Join with a 3-digit room code, using PeerJS signalling plus a WebRTC data channel (PeerJS 1.5.5 vendored).
  - The host simulates the run and streams snapshots at 15 Hz. The client predicts its own movement.
  - Pooled XP with per-player level-up picks, nearest-player targeting, x2 enemy HP while a partner is connected.
  - Down and revive (3s next to your partner), supply-case toasts, shared pause, per-player payouts, back-to-lobby between runs.
  - Disconnect handling with an 8s keepalive. Set `?peer=host:port` to use a self-hosted signalling server.
- **Late-game surge.** From 6:00, enemy HP +20% and damage +12% per minute, compounding (`OO.CONFIG.SURGE`). The Stalker gets half the HP rate; Burster blasts are exempt from the damage surge. HUD readout and a 5:58 banner.

### Fixed
- **Pickups stopped dropping mid-run.** After 320 uncollected DNA samples, every new drop was merged into one far-away overflow gem. Ground items now despawn (samples 60s, other items 45s, supply cases never) and blink before they go. Caps recycle the oldest item instead: an old gem's XP moves into the new drop, so no XP is lost.

### Changed
- The simulation now runs over a list of players, and weapons belong to an owner. Solo play is unchanged.
- `tools/balance-sim.mjs` is updated to the new API.

## [0.3.0] - 2026-10-13

Branch `feature/enemy-leveling`.

### Added
- **Strain level (enemy leveling).** Infected spawn at the current strain level; HP grows 14% per level (12% elites, 10% The Stalker), compounding. Strain = minutes survived + an adaptive bonus that climbs while more than 40% of kills are one-hit kills (cap +10) and eases off when they aren't. HUD readout with an ADAPTING indicator, banners every 5 levels, elite level tags, peak level on the results screen, debug overlay breakdown and a J debug key.
- Locked Nightmare button on the menu.

### Changed
- **Standard now uses v0.2's Nightmare numbers**: x1.35 enemy HP, x1.25 enemy damage, x1.25 horde size. Credits stay x1.
- Enemy HP no longer scales linearly with time; the strain level replaces it.
- **Bursters are invincible**: no source of damage affects them, auto-aim skips them, projectiles glance off with an IMMUNE tag, and they give no XP. They carry visible bone plates. Cover is the way through a stampede.
- Nightmare is locked; v0.2 saves with Nightmare selected fall back to Standard.

## [0.2.0] - 2026-10-10

Branch `feature/v0.2-escalation`.

### Added
- **Cover.** Procedural obstacles (cars, bus, barriers, dumpsters, pillars, hazmat barrels) generated per chunk from a seed. Collision for player and infected, enemy steering around obstacles, bullets stop on cover, line-of-sight aiming for the pistol and shotgun, faint rims so cover reads in the dark.
- **Spitter**, a ranged infected: holds distance, strafes, telegraphs with a swelling throat sac and a gurgle, lobs acid with a landing reticle, leaves a damaging pool. Alive count is capped.
- **Burster stampedes**: 3s warning (rumble, shake, shrieks, red lane, edge arrow), lane locks 0.8s before launch, then a row of Bursters charges and explodes on impact for heavy damage. Obstacles stop them and block all blasts. Eight scripted stampedes from 2:45.
- **Weapon evolutions** for all six weapons, with a field manual on the pause screen.
- **Armory**: permanent upgrades bought with banked credits, run payout on the results screen, Second Wind revive, refunds.
- Level-up **reroll** (R) and **skip** (X).
- **Nightmare** threat level.
- Off-screen markers for bosses, elites and supply cases.
- Pause-screen toggles for screen shake and damage numbers.
- `tools/balance-sim.mjs` headless balance runner.

### Changed
- Harder baseline: the horde grows to +10% / +20% / +30% from minutes 3 / 6 / 10, enemy HP scales 15%/min (was 12%), enemy damage 5%/min (was 4%), quicker shamblers and hounds, tougher Stalker, extra elite drops.
- Bloater blasts scale with time and are blocked by cover.
- Green Herb drop chance from kills 0.4% -> 0.7%.

## [0.1.0] - 2026-09-27

First playable prototype.

### Added
- Core survivors loop: move-only control, auto-firing weapons, DNA sample XP, three-choice level-ups, 6 weapon and 6 gear slots.
- 3 operatives: Mara Voss (pistol), Dex Okafor (shotgun), Rin Sato (tesla coil).
- 6 weapons with 8 levels each: Service Pistol, Combat Knife, Pump Shotgun, Incendiary Grenade, Sawblade Drones, Tesla Coil.
- 8 gear passives: Hollow Points, Kevlar Vest, Adrenaline, Thermite Mix, Speed Loader, Scavenger Pack, Field Medkit, Extended Mag.
- 5 infected types plus The Stalker boss with a telegraphed charge; exploding Bloaters; Brute elites drop supply cases.
- 15-minute wave script with hound packs, encirclements, elites and boss spawns; evac victory at 15:00.
- Supply crates with herbs, scanner, airstrike flare and credits.
- Flashlight darkness pass, glowing eyes, blood decals, particles, screen shake, damage numbers.
- Synthesized sound effects and ambient drone; low-HP heartbeat.
- Keyboard, touch joystick and gamepad input; pause screen with build and stats; results screen with per-weapon damage.
- Local records (best time, most kills, runs, evacuations).
- GitHub Pages deploy workflow and single-file bundle script.
