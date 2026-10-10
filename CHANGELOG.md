# Changelog

All notable changes to Outbreak Overkill. Versions follow `MAJOR.MINOR.PATCH`.

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
