# ZITY asset drop zone

Final PNG files live here. The centralized manifest is
`src/game/assets/manifest.ts`. Every manifest entry is attempted at startup;
if a file is absent or invalid, Phaser generates a crisp code-drawn
placeholder, so the game never breaks on missing art.

Runtime paths currently used by the game:

- `player/idle.png`
- `metro/kiosk.png`
- `metro/gate-closed.png`
- `metro/gate-open.png`
- `metro/gate-denied.png`
- `cafe/counter.png`
- `clinic/facade.png`
- `club/facade.png`
- `npc/barista.png`
- `npc/clinic-receptionist.png`
- `npc/club-security.png`
- `npc/office-worker.png`
- `watcher/idle.png`
- `ui/destination-marker.png`
- `props/tree.png`
- `props/street-lamp.png`
- `props/bench.png`
- `props/trash-bin.png`
- `props/bicycle.png`
- `props/planter-long.png`
- `props/hydrant.png`
- `props/traffic-light.png`

Every file here is sized to twice its on-screen draw size (retina headroom)
and keeps its alpha channel. Transparent PNGs work best; source dimensions
beyond that are flexible because the scene normalizes display sizes with
`setDisplaySize()`.

To replace an asset, drop a new file at the same path — no manifest or game
code changes are needed. To add one, add an entry to
`src/game/assets/manifest.ts` first.
