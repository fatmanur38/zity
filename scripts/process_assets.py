"""Prepare user-generated ZITY atlases for Phaser without redrawing pixels.

Requires Pillow. The script is intentionally deterministic and preserves every
source sheet beside the runtime-ready output.
"""

from __future__ import annotations

from pathlib import Path
from shutil import copy2

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
PADDING = 8


def alpha_trim(image: Image.Image, threshold: int = 4, padding: int = PADDING) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    bounds = mask.getbbox()
    if bounds is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    cropped = rgba.crop(bounds)
    output = Image.new(
        "RGBA",
        (cropped.width + padding * 2, cropped.height + padding * 2),
        (0, 0, 0, 0),
    )
    output.alpha_composite(cropped, (padding, padding))
    return output


def save(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "PNG", optimize=True)


def preserve_source(runtime_path: Path, source_name: str) -> Path:
    source_path = runtime_path.with_name(source_name)
    if not source_path.exists():
        copy2(runtime_path, source_path)
    return source_path


def cut(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return alpha_trim(image.crop(box))


def normalized_sheet(
    source: Image.Image,
    columns: list[tuple[int, int]],
    rows: list[tuple[int, int]],
) -> Image.Image:
    frames = [
        cut(source, (left, top, right, bottom))
        for top, bottom in rows
        for left, right in columns
    ]
    cell_width = max(frame.width for frame in frames)
    cell_height = max(frame.height for frame in frames)
    sheet = Image.new(
        "RGBA",
        (cell_width * len(columns), cell_height * len(rows)),
        (0, 0, 0, 0),
    )
    for index, frame in enumerate(frames):
        column = index % len(columns)
        row = index // len(columns)
        x = column * cell_width + (cell_width - frame.width) // 2
        y = row * cell_height + cell_height - frame.height
        sheet.alpha_composite(frame, (x, y))
    return sheet


def process_player() -> None:
    runtime = ASSETS / "player" / "idle.png"
    source_path = preserve_source(runtime, "player-sheet.png")
    source = Image.open(source_path).convert("RGBA")

    columns = [(0, 325), (325, 620), (620, 930), (930, 1254)]
    rows = [(0, 380), (380, 700), (700, 987), (987, 1254)]
    direction_names = ["down", "up", "left", "right"]

    idle_frames = []
    for direction, (left, right) in zip(direction_names, columns, strict=True):
        frame = cut(source, (left, rows[0][0], right, rows[0][1]))
        save(frame, runtime.with_name(f"idle-{direction}.png"))
        idle_frames.append(frame)
    save(idle_frames[0], runtime)

    # The supplied player sheet contains walking rows for up, left and right.
    for row_index, direction in enumerate(["up", "left", "right"], start=1):
        strip = normalized_sheet(source, columns, [rows[row_index]])
        save(strip, runtime.with_name(f"walk-{direction}.png"))


def process_four_by_four_npc(
    name: str,
    columns: list[tuple[int, int]],
    rows: list[tuple[int, int]],
) -> None:
    runtime = ASSETS / "npc" / f"{name}.png"
    source_path = preserve_source(runtime, f"{name}-sheet.png")
    source = Image.open(source_path).convert("RGBA")
    sheet = normalized_sheet(source, columns, rows)
    save(sheet, runtime.with_name(f"{name}-walk.png"))
    save(cut(source, (columns[0][0], rows[0][0], columns[0][1], rows[0][1])), runtime)


def process_club_security() -> None:
    runtime = ASSETS / "npc" / "club-security.png"
    source_path = preserve_source(runtime, "club-security-sheet.png")
    source = Image.open(source_path).convert("RGBA")
    columns = [(0, 330), (330, 645), (645, 950), (950, 1254)]
    directions = ["down", "up", "left", "right"]
    frames = []
    for direction, (left, right) in zip(directions, columns, strict=True):
        frame = cut(source, (left, 0, right, 820))
        save(frame, runtime.with_name(f"club-security-{direction}.png"))
        frames.append(frame)
    save(frames[0], runtime)


def process_characters() -> None:
    process_player()
    process_four_by_four_npc(
        "barista",
        [(0, 325), (325, 610), (610, 910), (910, 1254)],
        [(0, 330), (330, 640), (640, 930), (930, 1254)],
    )
    process_four_by_four_npc(
        "clinic-receptionist",
        [(0, 330), (330, 620), (620, 925), (925, 1254)],
        [(0, 340), (340, 650), (650, 940), (940, 1254)],
    )
    process_four_by_four_npc(
        "office-worker",
        [(0, 330), (330, 620), (620, 925), (925, 1254)],
        [(0, 330), (330, 650), (650, 930), (930, 1254)],
    )
    process_club_security()


PROP_ATLASES: dict[str, dict[str, tuple[int, int, int, int]]] = {
    "props.png": {
        "street-lamp-warm.png": (260, 35, 405, 530),
        "bench-modern.png": (435, 60, 775, 330),
        "trash-bin.png": (780, 75, 970, 330),
        "bicycle.png": (1000, 55, 1370, 330),
        "planter-long.png": (420, 320, 790, 570),
        "hydrant-orange.png": (795, 320, 980, 570),
        "van-white-a.png": (980, 315, 1410, 625),
        "vending-machine-dark.png": (115, 565, 320, 965),
        "car-blue.png": (290, 660, 705, 975),
        "taxi-yellow.png": (650, 650, 1070, 975),
        "van-white-b.png": (1020, 670, 1480, 985),
    },
    "props2.png": {
        "bus-shelter.png": (5, 0, 475, 450),
        "vending-machine-red.png": (455, 45, 750, 455),
        "public-kiosk-blue.png": (725, 25, 1000, 455),
        "street-food-cart.png": (985, 20, 1350, 455),
        "digital-billboard.png": (1315, 0, 1536, 455),
        "bench-classic.png": (55, 465, 460, 745),
        "planter-flowers.png": (465, 470, 785, 745),
        "tree.png": (790, 420, 1110, 815),
        "street-lamp-classic.png": (1100, 405, 1245, 825),
        "traffic-light.png": (1280, 445, 1420, 830),
        "traffic-cone.png": (55, 745, 285, 1010),
        "street-barrier.png": (310, 745, 630, 1010),
        "hydrant-red.png": (640, 745, 830, 1010),
        "manhole.png": (845, 820, 1135, 1010),
        "storm-drain.png": (1135, 830, 1460, 1010),
    },
}


def process_props() -> None:
    props_dir = ASSETS / "props"
    for atlas_name, outputs in PROP_ATLASES.items():
        source = Image.open(props_dir / atlas_name).convert("RGBA")
        for output_name, box in outputs.items():
            save(cut(source, box), props_dir / output_name)

    copy2(props_dir / "bench-classic.png", props_dir / "bench.png")
    copy2(props_dir / "hydrant-red.png", props_dir / "hydrant.png")


def classify_facades() -> None:
    # These uploaded images depict complete buildings rather than terminals.
    clinic = ASSETS / "clinic" / "terminal.png"
    club = ASSETS / "club" / "entrance.png"
    if clinic.exists():
        copy2(clinic, clinic.with_name("facade.png"))
    if club.exists():
        copy2(club, club.with_name("facade.png"))


if __name__ == "__main__":
    process_characters()
    process_props()
    classify_facades()
    print("ZITY assets prepared in", ASSETS)
