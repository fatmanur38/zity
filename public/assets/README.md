# ZITY asset drop zone

Final PNG files can be placed here without changing game logic. The centralized
manifest is `src/game/assets/manifest.ts`. Every manifest entry is attempted at
startup; if a file is absent or invalid, Phaser generates a crisp placeholder.

Expected paths:

- `player/idle.png`
- `metro/kiosk.png`
- `metro/gate.png`
- `cafe/counter.png`
- `clinic/terminal.png`
- `club/entrance.png`
- `watcher/idle.png`
- `ui/destination-marker.png`
- `effects/proof.png`
- `props/tree.png`
- `props/street-lamp.png`

Transparent PNGs work best. Source dimensions are flexible because the scene
normalizes display sizes.
