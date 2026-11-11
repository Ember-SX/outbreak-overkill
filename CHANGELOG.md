# Changelog

All notable changes to Outbreak Overkill. Versions follow `MAJOR.MINOR.PATCH`.

## [0.11.0] - 2026-11-11

Branch `feature/v0.11-crates-cleanup`.

### Changed
- **Supply cases apply instantly on contact.** There's no case screen or co-op toast any more: the pause screen, the `chest` state and the `chest` message are all gone.
  - A ready evolution comes first, then each roll levels up something you own.
  - When nothing is left to level, a roll becomes an Apex mutation plus 30% of a level in XP. This works in Standard as well as Infinite Mode.
  - Floating text and a one-line banner report the haul.
  - Cases are pulled in by pickup range and despawn after 20 s, blinking for the last 5.
- **Supply crates** (the wooden boxes) are pass-through: they no longer push infected around or stop bullets, and nothing can damage them.
  - Walking over one opens it and its contents go straight to you.
  - They despawn after 20 s and blink first. The time left rides in the co-op snapshot, so the partner sees the blink too.
- **Body Count** is now a single-run ranked achievement: 1,000 / 3,000 / 7,500 / 15,000 / 30,000 / 50,000 kills.
  - The Sentry Turret now unlocks at Body Count II, the old 3,000-kill goal.
  - A save with the old one-off Body Count (or the v0.9 Pest Control or masteries) gets every rank up to its old goal, so nothing already earned is lost.
  - That makes 88 unlocks in all.
- **Achievements no longer show unlock dates.** A maxed ranked achievement just says "Max rank".
- **Outfit descriptions** (all 15, in `js/characters.js`) now describe what the portraits actually show. For example, Dex's street-clothes shotgun is slung on his back, not in a gym bag, and Rin's Ghost protocol lines glow.
- **Removed text:** the wardrobe line "Each one costs 1,800 credits, about three full evacuations. Your partner sees your outfit in co-op." and "Evacuated N of M runs" from the main-menu records line.
- **Stampede warnings show exactly the charge.**
  - A single solid band the full width of the row, with edge lines and chevrons along the line of travel.
  - The row no longer has a two-slot gap.
  - The lane is fixed when the warning appears, aimed where the anchor player stood. It no longer tracks anyone; the last 0.8 s only change the pulse and the shriek.

## [0.10.0] - 2026-11-10

Branch `feature/v0.10-infinite-mode`.

### Added
- **Ranked achievements.** An achievement can now have up to six ranks on one counter: Bronze, Silver, Gold, Platinum, Diamond and Biohazard.
  - Each rank is its own unlock with its own notice ("Rank up · Diamond") and points. Ranks are saved as `<id>.<rank>`.
  - Pest Control now runs 1,000 / 5,000 / 15,000 / 30,000 / 60,000 / 100,000 lifetime kills. Marksman, Breach and Clear and Live Wire run 500 to 30,000 signature kills.
  - New ranked achievements: Boss Hunter, Trigger Discipline, Demolitions, Veteran, Time in the Zone, Into the Dark, Apex Predator, Ascension.
  - New one-off: Point of No Return. That makes 34 achievements and 83 unlocks.
  - Dossier cards show the current rank's metal, a pip per rank and progress to the next rank. The summary shows all six tiers and the points total.
- **Infinite Mode** (menu > Mode; in co-op the host's choice counts).
  - The run carries on past the 15:00 extraction mark into overtime.
  - Every overtime minute compounds enemy HP (×1.16), damage (×1.09) and speed (+2%, up to +50%).
  - The director refills faster, mixes Brutes in (capped at ~15% of spawns; their cases drop 20% of the time) and repeats stampedes, rings, Stalker hunts and the Hare Trigger.
  - Necrosis weakens all healing, down to 30%.
  - Horde-scaled damage (drums, Sentry, Necrotic Pulse, Volatile Blood) ignores the overtime HP multiplier, so it falls behind.
  - The per-hit ceiling still holds.
  - "Call extraction" on the pause screen ends an overtime run as an evacuation (host only in co-op).
  - Payout: the run to 15:00 pays as normal. Overtime adds 15 credits a minute, 1 per 200 kills and 10% of pickups. Without this, the bot test's best 28-minute run banked ~19,500 credits.
  - Overtime has a red HUD clock and a multiplier readout. The results screen and Dossier statistics have Infinite sections.
- **Apex mutations:** 13 stackable, game-breaking upgrades.
  - Overclock (weapons past max level), Berserker Gene, Adrenal Overdrive, Hive Swarm, Blast Radius, Titan Frame, Regenerator Cells, Hemophage, Hyperstride, Phase Skin, Necrotic Pulse, Volatile Blood, Hot Mic.
  - Offered on every card once an operative hits max rank, and at least once per level-up in overtime.
  - Shown in pink on the cards, the HUD ("APEX n", "+n" overclock badges) and the pause screen.
- **120 FPS render cap** (`CONFIG.MAX_FPS`). Frames that arrive faster are skipped, with drift correction, so 144 Hz still draws close to 120. The simulation stays on fixed 1/60 s steps. The menu ECG animation is capped the same way.
- `npm run sim -- standard 1 god infinite:30` runs bots through Infinite Mode.

### Changed
- Removed the "Outfits are cosmetic" line from the wardrobe and the README.
- Co-op: the start message carries the mode. Player state carries Apex stacks, weapon overclocks, the call-down recharge rate and phase. Each side earns its own Point of No Return and Infinite ranks.

## [0.9.0] - 2026-11-09

Branch `feature/v0.9-dossier`.

### Added
- **Dossier screen** (main menu > Dossier) in the terminal style, with four tabs.
  - **Achievements:** 25 in five groups (milestones, combat mastery, operative specializations, tactics and teamwork, classified), tiered Bronze, Silver and Gold, with progress bars on counters and unlock dates. A trophy summary shows the count and tiers.
  - **Bestiary:** nine specimen reports with original lore, base stats, a threat rating, traits and your lifetime kills. An entry is filed the first time that infected comes into view; unseen ones are silhouettes. Pictures come from the game's own sprites.
  - **Call-downs:** pick the one you take into a run.
  - **Statistics:** lifetime playtime, runs, evacuations, deaths, kills, shots fired, damage dealt and taken, boss takedowns, drums detonated, call-downs, revives, distance, credits, and a per-operative table.
- **Slide-down notices** at the top of the screen for achievements (tier colour and a chime), new bestiary entries and call-down unlocks, queued one at a time. The results screen lists the achievements earned that run.
- **Tactical call-downs** (key Q or the on-screen button; one per run, 20 s first charge): Flashbang (stun, 30 s), Sentry Turret (50 s), Med Drone (heal 35% over 4 s, 70 s), Airstrike Beacon (90 s). The last three unlock through achievements. The menu dossier shows the equipped one.
- **Volatile drums:** most barrels are now red fuel drums. Shooting one, a fire pool or a blast lights the fuse; the explosion kills regular infected (scaled to the horde), hurts elites and bosses, chains into other drums and destroys the drum for the rest of the run. Players in the blast take a capped hit like any other. A banner at 0:25 introduces them.
- **Saves:** `oo.achievements`, `oo.stats`, `oo.codex`, and `meta.calldown`. Older saves load unchanged; on first load the lifetime stats start from the service record and already-earned achievements are backdated with a single notice. Corrupted entries fall back to defaults.
- **Co-op:** each operative brings their own call-down (sent with `hello` and `start`); the client asks with `{t:'cd'}` and the host runs it. Snapshots now carry per-player run stats, cooldowns and drone time, team tallies, sentry turrets and a stun flag; drum fuses and destruction travel as events. Each machine checks its own achievements and banks its own stats.
- New icons (call-downs, drum, helicopter, Stalker, mech, bunny, tape, trophy) and synthesized sounds (achievement chime, bestiary blip, radio, flashbang, turret, drone, fuse).

### Changed
- The co-op screen now says infected have 50% more health with a partner (the multiplier has been 1.5 since 0.8.0; the text still said double).
- The last in-run banner no longer lingers over the main menu.

### Unchanged on purpose
- Co-op enemy health stays at x1.5. Straight-line stampedes, the locked leap ring, the health and armor upgrades and the per-hit ceiling are untouched; drum blasts go through the same ceiling (32,580-hit fuzz check: no one-shots, worst hit 68% of max HP).

## 0.7 follow-ups (merged with PR #6, before 0.8.0)

Branch `feature/v0.8-cover-armor`. Some numbers here were changed again in 0.8.0.

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

## [0.8.0] - 2026-11-09

Branch `feature/v0.8-threat-ceiling`.

### Changed
- **Enemies hit harder across the whole run, with a steady climb.**
  - New `CONFIG.THREAT` (base x1.3, +6% per minute) replaces the old +5% per minute.
  - The damage surge (`SURGE.dmgCurve`) climbs evenly from 6:00 to 13:00 instead of tapering and then jumping.
  - Stalkers take 3/4 of the damage surge (was 1/2).
  - Burster blasts are 50 base (was 42).
  - The Hare Trigger's shockwave is 0.8x contact (was 0.6x).
- Per-hit damage on a fresh 100 HP operative:

  | Enemy | 0:00 | 10:00 | 15:00 |
  |---|---|---|---|
  | Shambler | 10 -> 13 | 20 -> 31 | 43 -> 61 |
  | Brute | 23 -> 29 | 45 -> 57 | |
  | Bloater blast | | 40 -> 57 | |
  | Spitter impact | | 25 -> 38 | |

  On a 255 HP Dex with maxed Vitality Serum and Trauma Plates:

  | Enemy | Before | After |
  |---|---|---|
  | Stalker at 10:00 | 46 | 79 |
  | Burster blast at 10:00 | 58 | 100 |
  | Hare Trigger contact at 15:00 | 98 | 135 |
- **Co-op enemy health is 1.5x** (was 2.0x in the repo), the value set by the owner.

### Added
- **Per-hit ceiling** (`CONFIG.HIT_CEILING`): no single hit from any source can kill a healthy operative.
  - Every hit is capped at a share of the target's max HP before armor: 45% at the start, 55% at 8:00, 62% at 13:00, 68% at 15:00.
  - It covers contact, Stalkers, Spitter impact and acid, Bloater and Burster blasts, and the Hare Trigger's slam, contact, missiles and laser.
  - Bloater blasts now respect i-frames like everything else, so two hits can't land as one.
  - The pause screen shows the current **Max hit**.
  - It replaces the pre-13:00 contact cap (`SURGE.hitCap`). The mech's contact and slam caps now defer to the ceiling; missiles stay at 50% and laser ticks at 35%.
  - Verified across 32,580 checks: every 5 s of a run, every operative, five builds, every attack. The worst single hit was 68% of max HP, with no deaths. Four of the biggest hits in the same frame cost one hit.

### Unchanged
- Straight-line stampedes, the locked leap ring, and the v0.7 health and armor upgrades.

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
