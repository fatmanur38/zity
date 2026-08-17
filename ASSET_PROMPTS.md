# ZITY — Görsel Asset Üretim Prompt'ları

Bu dosya, görsel üretecek agent'a/modele **doğrudan kopyalanabilir** prompt'lar içerir.

## Neden bu dosya var

İki ayrı problem tespit edildi:

1. **Eksik asset (1 adet):** `public/assets/effects/proof.png` manifestte tanımlı
   ama dosya yok. Oyunu bozmuyor (Phaser placeholder çiziyor, ayrıca sahne şu an
   bu key'i kullanmıyor) — ama görsel efekt için üretilmeli.
2. **Aşırı çözünürlük (75 dosya / 41 MB):** Mevcut PNG'ler oyunda çizildikleri
   boyutun 15-25 katı çözünürlükte. Örnek: `watcher/idle.png` 1254×1254 px
   ama ekranda **34×24** px çiziliyor. Bu, production build'i dakikalarca
   sürdürüyor ve ilk yükleme süresini gereksiz şişiriyor.

---

## Ortak sanat yönü (HER prompt'a ekleyin)

```
STYLE GUIDE — ZITY (privacy-themed pixel-art city game)

- Top-down / slight 3-quarter view, 2D game sprite, orthographic.
- Clean pixel-art with crisp edges. No anti-aliased blur, no soft glow bleed.
- FULLY TRANSPARENT background (alpha channel PNG). No checkerboard, no white box.
- Single centered object, tightly cropped with ~2px transparent margin.
- No text, no letters, no numbers, no logos, no watermark, no UI frame.
- No drop shadow baked into the sprite (the engine draws its own shadow).
- Flat shading with 2-3 tone steps. Dark, moody night-city palette.

PALETTE (use these exact hex values):
  Background/dark:  #080b10, #151922, #253547
  Structure grey:   #303945, #35434b, #53616a
  Cyan  (metro):    #57d6ff
  Lime  (accent):   #d6ff3f
  Mint  (privacy):  #79f2d0
  Amber (cafe):     #ffb36b
  Red   (warning):  #ff695e
  Pink  (club):     #f56ddd
  Cream (player):   #f4f0e5
```

---

## BÖLÜM 1 — Eksik asset: proof efekti

### `public/assets/effects/proof.png`

**Hedef boyut: 128×128 px** (ekranda 32×32 çiziliyor, 4× retina payı)

```
[STYLE GUIDE buraya yapıştırın]

SUBJECT: A "zero-knowledge proof accepted" burst effect icon.
A radiant hexagonal shield outline made of thin mint (#79f2d0) lines,
with a lime (#d6ff3f) checkmark glyph inside it. Around the hexagon,
6 short tapered light shards radiate outward symmetrically, fading from
mint to transparent at the tips. The center is semi-transparent, not solid.

Reads clearly at 32x32 pixels. Symmetrical. Energetic but clean.
Transparent PNG, 128x128.
```

---

## BÖLÜM 2 — Yeniden boyutlandırma (asıl performans işi)

**Önemli:** Bu iş için görsel üretmeye gerek YOK. Mevcut dosyalar zaten doğru
görünüyor, sadece çok büyükler. Aşağıdaki script yeterli ve **kayıpsız
görünümle** ~41 MB → ~2 MB düşürür.

### Otomatik çözüm (önerilen — agent'a bunu verin)

```
TASK: Downscale ZITY game assets to their real render size.

The repo is at the project root. Game sprites live in public/assets/.
Every sprite is currently 15-25x larger than the size it is drawn at,
totaling 41 MB across 75 PNGs. This makes `vite build` take many minutes.

Rules:
- Target = 2x the on-screen display size (retina headroom), from the table below.
- Preserve the alpha channel. Never flatten onto white.
- Use high-quality Lanczos resampling.
- Overwrite in place, keeping the exact same filenames and paths.
- Do NOT touch the *-sheet.png source files or props/props.png, props/props2.png
  (they are kept intentionally as originals; instead, exclude them from the
  build by moving them to a non-served folder such as art-src/).
- After resizing, run `npm run build` and report the new dist size and build time.

DISPLAY SIZES (from src/game/assets/manifest.ts and MainScene.ts):
  player/idle.png ............... 26x38   -> resize to 52x76
  player/idle-{down,up,left,right}.png .. same -> 52x76
  player/walk-{up,left,right}.png ....... same -> 52x76
  metro/kiosk.png ............... 62x84   -> 124x168
  metro/gate-closed.png ......... 92x92   -> 184x184
  metro/gate-open.png ........... 92x92   -> 184x184
  metro/gate-denied.png ......... 92x92   -> 184x184
  cafe/counter.png .............. 200x150 -> 400x300
  clinic/facade.png ............. 190x190 -> 380x380
  club/facade.png ............... 188x188 -> 376x376
  npc/barista.png ............... 27x42   -> 54x84
  npc/clinic-receptionist.png ... 27x42   -> 54x84
  npc/club-security.png ......... 29x44   -> 58x88
  npc/office-worker.png ......... 27x42   -> 54x84
  watcher/idle.png .............. 34x24   -> 68x48
  ui/destination-marker.png ..... 24x32   -> 48x64
  effects/proof.png ............. 32x32   -> 64x64
  props/tree.png ................ 38x58   -> 76x116
  props/street-lamp.png ......... 20x52   -> 40x104
  props/bench.png ............... 68x40   -> 136x80
  props/trash-bin.png ........... 24x34   -> 48x68
  props/bicycle.png ............. 58x36   -> 116x72
  props/planter-long.png ........ 72x34   -> 144x68
  props/hydrant.png ............. 22x34   -> 44x68
  props/traffic-light.png ....... 24x58   -> 48x116

Aspect ratio note: resize to FIT inside the target box, preserving the
source aspect ratio. The engine calls setDisplaySize() anyway, so exact
pixel match is not required — only the file size reduction matters.
```

### Manuel alternatif (macOS, hazır komut)

```sh
# Önce yedek alın
cp -R public/assets public/assets.backup

# ImageMagick ile (brew install imagemagick)
cd public/assets
magick mogrify -resize 68x48   -filter Lanczos watcher/idle.png
magick mogrify -resize 48x64   -filter Lanczos ui/destination-marker.png
magick mogrify -resize 124x168 -filter Lanczos metro/kiosk.png
magick mogrify -resize 184x184 -filter Lanczos metro/gate-*.png
magick mogrify -resize 400x300 -filter Lanczos cafe/counter.png
magick mogrify -resize 380x380 -filter Lanczos clinic/facade.png
magick mogrify -resize 376x376 -filter Lanczos club/facade.png
magick mogrify -resize 52x76   -filter Lanczos player/idle*.png player/walk-*.png
magick mogrify -resize 58x88   -filter Lanczos npc/*.png
magick mogrify -resize 144x116 -filter Lanczos props/*.png
```

Ardından build'den hariç tutulacak orijinaller:

```sh
mkdir -p art-src
mv public/assets/**/*-sheet.png art-src/ 2>/dev/null
mv public/assets/props/props.png public/assets/props/props2.png art-src/ 2>/dev/null
```

---

## BÖLÜM 3 — İsteğe bağlı yeni assetler

Aşağıdakiler manifestte YOK; eklemek isterseniz önce
`src/game/assets/manifest.ts` içine yeni bir `AssetKey` girin.

### Watcher (gözetim) durum ikonları — 64×64 px

`watcher/idle.png`, `match.png`, `failed.png` zaten var. Eksik varyant isterseniz:

```
[STYLE GUIDE]
SUBJECT: A surveillance "watcher" eye icon in three states, as separate images:
 (a) IDLE — a horizontal lens slit in cool grey (#53616a) on a dark
     rounded plate (#151922), dim and passive.
 (b) TRACKING — the same lens now amber (#ffb36b), with two thin concentric
     scan arcs sweeping to the right.
 (c) LINKED — the lens red (#ff695e), with three short connection lines
     radiating to small dots, implying data correlation.
Flat, iconic, no gradients. Reads at 34x24 px. Transparent PNG 64x64.
```

### Metro bilet/geçiş kartı ikonu — 64×64 px

```
[STYLE GUIDE]
SUBJECT: A transit pass card icon, angled slightly, in deep navy (#253547)
with a cyan (#57d6ff) chip rectangle in the upper-left and two thin cyan
stripes on the right edge. No text or numbers on the card. Clean and iconic.
Transparent PNG 64x64.
```

### Zcash ödeme/shielded ikonu — 64×64 px

```
[STYLE GUIDE]
SUBJECT: A shielded-payment icon: a rounded shield silhouette in dark navy
(#253547) outlined in mint (#79f2d0), containing a simple coin circle with a
subtle diagonal cut suggesting privacy shielding. Absolutely no letters,
no "Z", no currency symbols, no branding. Transparent PNG 64x64.
```

---

## Doğrulama

Asset'leri değiştirdikten sonra:

```sh
npm run build          # süre belirgin şekilde kısalmalı
du -sh dist            # hedef: 5 MB altı
npm run dev            # /demo açıp görsellerin bozulmadığını kontrol edin
```

Manifest yolu değişmediği sürece **hiçbir kod değişikliği gerekmez** —
`AssetLoader` dosyayı bulursa kullanır, bulamazsa placeholder çizer.
