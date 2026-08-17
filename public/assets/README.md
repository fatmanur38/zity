# ZITY asset drop zone

Final PNG files can be placed here without changing game logic. The centralized
manifest is `src/game/assets/manifest.ts`. Every manifest entry is attempted at
startup; if a file is absent or invalid, Phaser generates a crisp placeholder.

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
- `effects/proof.png`
- `props/tree.png`
- `props/street-lamp.png`
- `props/bench.png`
- `props/trash-bin.png`
- `props/bicycle.png`
- `props/planter-long.png`
- `props/hydrant.png`
- `props/traffic-light.png`

Transparent PNGs work best. Source dimensions are flexible because the scene
normalizes display sizes.

## Processed sprite sheets and atlases

The original uploads are kept beside the runtime cuts with a `-sheet.png`
suffix. `props/props.png` and `props/props2.png` also remain untouched. Prepare
the small asset-tool environment once, then run the processor after replacing
either source atlas or character sheet:

```sh
python3 -m venv .asset-tools
.asset-tools/bin/pip install -r scripts/requirements-assets.txt
.asset-tools/bin/python scripts/process_assets.py
```

The script makes lossless alpha-aware crops, adds a small transparent margin,
and writes individual files with stable names. The clinic and club uploads are
full facades despite their original `terminal.png` and `entrance.png` names, so
runtime aliases are written as `clinic/facade.png` and `club/facade.png`.

Player direction files are `idle-{down,up,left,right}.png` and
`walk-{up,left,right}.png`. The source does not contain a down-walk row, so the
game intentionally keeps the down-facing idle frame instead of inventing one.
