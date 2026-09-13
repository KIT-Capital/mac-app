#!/usr/bin/env python3
"""Build web assets from official Logo-FF (Final Logo 2 Gold). Never invert."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC_JPG = Path("/workspace/public/brand/logo-ff.jpg")
SRC_PNG = Path("/workspace/public/brand/logo-ff-export.png")
OUT = Path("/workspace/public")


def load_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def background_mask(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    paper = rgb.min(axis=2) > 246
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


def trim(arr: np.ndarray, pad: int = 16) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    content = (a > 8) & (rgb.min(axis=2) < 248)
    rows = np.where(content.any(axis=1))[0]
    cols = np.where(content.any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        return arr
    y0, y1 = max(0, rows[0] - pad), min(arr.shape[0], rows[-1] + pad + 1)
    x0, x1 = max(0, cols[0] - pad), min(arr.shape[1], cols[-1] + pad + 1)
    return arr[y0:y1, x0:x1]


def knock_out_paper(arr: np.ndarray) -> np.ndarray:
    out = arr.copy()
    out[background_mask(arr), 3] = 0
    return trim(out)


def gear_crop(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    content = (a > 8) & (rgb.min(axis=2) < 248)
    row_counts = content.sum(axis=1)
    # Wordmark is a wide band under a gap. Keep the gear + gray arc above that gap.
    active = np.where(row_counts > 8)[0]
    if len(active) == 0:
        return arr
    gap = None
    for i in range(len(active) - 1):
        if active[i + 1] - active[i] > 8:
            gap = active[i]
            break
    y1 = (gap + 8) if gap is not None else int(arr.shape[0] * 0.58)
    slice_ = arr[:y1]
    return trim(slice_, pad=12)


def save_png(arr: np.ndarray, path: Path, width: int) -> None:
    img = Image.fromarray(arr, "RGBA")
    if img.width > width:
        height = max(1, round(img.height * (width / img.width)))
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"wrote {path} {img.size}")


def square_icon(mark: np.ndarray, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    icon = Image.fromarray(mark, "RGBA")
    pad = int(size * 0.14)
    icon = icon.resize((size - pad * 2, size - pad * 2), Image.Resampling.LANCZOS)
    canvas.paste(icon, (pad, pad), icon)
    return canvas


def main() -> None:
    src = load_rgba(SRC_JPG if SRC_JPG.exists() else SRC_PNG)
    lockup = knock_out_paper(src)
    save_png(lockup, OUT / "brand/logo-ff.png", 1200)

    mark = gear_crop(lockup)
    save_png(mark, OUT / "brand/logo-ff-mark.png", 640)

    # Favicon keeps the official black mark on white — do not invert.
    square_icon(mark, 192, (255, 255, 255, 255)).convert("RGB").save(
        OUT / "icon.png", "PNG", optimize=True
    )
    square_icon(mark, 180, (255, 255, 255, 255)).convert("RGB").save(
        OUT / "apple-touch-icon.png", "PNG", optimize=True
    )
    ico = square_icon(mark, 64, (255, 255, 255, 255))
    ico.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    ico.save(OUT.parent / "app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote icons")


if __name__ == "__main__":
    main()
