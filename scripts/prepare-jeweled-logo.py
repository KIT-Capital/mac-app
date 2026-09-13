#!/usr/bin/env python3
"""Build app assets from the official Logo-FF (jeweled center gears)."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path("/workspace/public/brand/mac-logo-light.jpg")
OUT = Path("/workspace/public")


def load_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def trim(arr: np.ndarray, pad: int = 24) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    white = (rgb.min(axis=2) > 248) & (a > 0)
    content = ~white & (a > 8)
    rows = np.where(content.any(axis=1))[0]
    cols = np.where(content.any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        return arr
    y0, y1 = max(0, rows[0] - pad), min(arr.shape[0], rows[-1] + pad + 1)
    x0, x1 = max(0, cols[0] - pad), min(arr.shape[1], cols[-1] + pad + 1)
    return arr[y0:y1, x0:x1]


def background_mask(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    paper = rgb.min(axis=2) > 246
    # Close anti-aliased gaps in the gear so flood-fill cannot leak into the jewel field.
    ink = Image.fromarray((~paper * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    sealed = np.array(ink) > 0
    walk = paper & ~sealed
    h, w = walk.shape
    seen = np.zeros((h, w), dtype=bool)
    stack = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not walk[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    return seen


def split_layers(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rgb = arr[:, :, :3].astype(np.int16)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    is_bg = background_mask(arr)
    is_jewel = (sat > 28) & ~is_bg
    is_neutral = ~is_bg & ~is_jewel
    return is_bg, is_jewel, is_neutral


def save(arr: np.ndarray, path: Path, width: int) -> None:
    img = Image.fromarray(arr, "RGBA")
    if img.width > width:
        height = max(1, round(img.height * (width / img.width)))
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"wrote {path} {img.size}")


def on_light(src: np.ndarray) -> np.ndarray:
    out = src.copy()
    is_bg, _, _ = split_layers(src)
    out[is_bg, 3] = 0
    return trim(out)


def on_dark(src: np.ndarray) -> np.ndarray:
    out = src.copy()
    is_bg, is_jewel, is_neutral = split_layers(src)
    out[is_bg, 3] = 0
    # Invert ink and gray so the official mark reads on black. Keep the white
    # jewel field and the colored stones.
    invert = is_neutral & ~is_jewel
    paper = (out[:, :, :3].min(axis=2) > 246) & ~is_bg
    invert = invert & ~paper
    out[invert, :3] = 255 - out[invert, :3]
    return trim(out)


def gear_crop(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    side = int(min(w, h) * 0.62)
    cx, cy = w // 2, int(h * 0.36)
    x0, y0 = max(0, cx - side // 2), max(0, cy - side // 2)
    return arr[y0 : y0 + side, x0 : x0 + side]


def square_icon(mark: np.ndarray, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    icon = Image.fromarray(mark, "RGBA")
    pad = int(size * 0.12)
    icon = icon.resize((size - pad * 2, size - pad * 2), Image.Resampling.LANCZOS)
    canvas.paste(icon, (pad, pad), icon)
    return canvas


def main() -> None:
    src = load_rgba(SRC)
    light = on_light(src)
    dark = on_dark(src)
    save(light, OUT / "brand/mac-logo-jeweled.png", 900)
    save(dark, OUT / "brand/mac-logo-jeweled-on-dark.png", 900)

    mark = gear_crop(light)
    save(mark, OUT / "brand/mac-logo-jeweled-mark.png", 512)
    dark_mark = gear_crop(dark)
    save(dark_mark, OUT / "brand/mac-logo-jeweled-mark-on-dark.png", 512)

    square_icon(dark_mark, 192, (14, 42, 68, 255)).convert("RGB").save(OUT / "icon.png", "PNG", optimize=True)
    square_icon(dark_mark, 180, (14, 42, 68, 255)).convert("RGB").save(OUT / "apple-touch-icon.png", "PNG", optimize=True)
    ico = square_icon(dark_mark, 64, (14, 42, 68, 255))
    ico.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    ico.save(OUT.parent / "app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote icons")


if __name__ == "__main__":
    main()
