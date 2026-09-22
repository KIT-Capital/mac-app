#!/usr/bin/env python3
"""Refresh app icons from the sharp Logo-FF mark already in public/brand.

The lockup SVG and gear PNGs are the source. Do not rebuild them from the
official PDF: that trace is blurry, and the largest jewel is now blue.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"
UPLOADS = Path("/home/ubuntu/.cursor/projects/workspace/uploads")
OFFICIAL_PDF = UPLOADS / "Logo-FF_2ca7.pdf"
OFFICIAL_PSD = UPLOADS / "Logo-FF_0713.psd"
SRC_PDF = ROOT / "brand-src" / "Logo-FF.pdf"
SRC_PSD = ROOT / "brand-src" / "Logo-FF.psd"
FALLBACK_PNG = OUT / "brand" / "logo-ff-export.png"
FALLBACK_JPG = OUT / "brand" / "logo-ff.jpg"

BLACK_FILL = "rgb(0%, 0%, 0%)"
WHITE_FILL = "rgb(100%, 100%, 100%)"


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def load_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def raster_from_pdf(pdf: Path, dest: Path, dpi: int = 300) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "gs",
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-sDEVICE=pngalpha",
            f"-r{dpi}",
            f"-sOutputFile={dest}",
            str(pdf),
        ]
    )
    return dest


def svg_from_pdf(pdf: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["pdftocairo", "-svg", str(pdf), str(dest)])
    return dest


def trim_alpha(arr: np.ndarray, pad: int = 12) -> np.ndarray:
    a = arr[:, :, 3]
    rows = np.where(a > 8)[0]
    cols = np.where((a > 8).any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        return arr
    y0, y1 = max(0, int(rows[0]) - pad), min(arr.shape[0], int(rows[-1]) + pad + 1)
    x0, x1 = max(0, int(cols[0]) - pad), min(arr.shape[1], int(cols[-1]) + pad + 1)
    return arr[y0:y1, x0:x1]


def content_viewbox(arr: np.ndarray, page_w: float, page_h: float, pad: float = 8.0) -> str:
    a = arr[:, :, 3]
    rows = np.where(a > 8)[0]
    cols = np.where((a > 8).any(axis=0))[0]
    h, w = arr.shape[:2]
    x0 = cols[0] / w * page_w
    x1 = (cols[-1] + 1) / w * page_w
    y0 = rows[0] / h * page_h
    y1 = (rows[-1] + 1) / h * page_h
    return f"{x0 - pad:.3f} {y0 - pad:.3f} {x1 - x0 + pad * 2:.3f} {y1 - y0 + pad * 2:.3f}"


def simplify_gradients(svg: str) -> str:
    def shrink(match: re.Match[str]) -> str:
        block = match.group(0)
        stops = list(re.finditer(r"<stop\b[^/]*/>", block))
        if len(stops) <= 6:
            return block
        keep_idx = {0, len(stops) // 4, len(stops) // 2, (3 * len(stops)) // 4, len(stops) - 1}
        kept = [stops[i].group(0) for i in sorted(keep_idx)]
        inner = "\n".join(kept)
        return re.sub(r"(<linearGradient\b[^>]*>).*(</linearGradient>)", rf"\1{inner}\2", block, flags=re.S)

    return re.sub(r"<linearGradient\b.*?</linearGradient>", shrink, svg, flags=re.S)


def tight_svg(svg: str, viewbox: str) -> str:
    svg = re.sub(r'width="[^"]+"', 'width="1200"', svg, count=1)
    svg = re.sub(r'height="[^"]+"', 'height="730"', svg, count=1)
    svg = re.sub(r'viewBox="[^"]+"', f'viewBox="{viewbox}"', svg, count=1)
    return simplify_gradients(svg)


def on_dark_svg(svg: str) -> str:
    return svg.replace(f'fill="{BLACK_FILL}"', f'fill="{WHITE_FILL}"')


def on_dark_raster(lockup: np.ndarray) -> np.ndarray:
    """Solid white gear + MECHANICAL ART. Gray CAPITAL, arc, and jewels stay."""
    out = lockup.copy()
    rgb = out[:, :, :3].astype(np.int16)
    a = out[:, :, 3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = mx - mn
    ink = (a > 8) & (sat < 28) & (mx < 80)
    out[ink, 0] = 255
    out[ink, 1] = 255
    out[ink, 2] = 255
    return out


def gear_crop(arr: np.ndarray) -> np.ndarray:
    a = arr[:, :, 3]
    row_counts = (a > 8).sum(axis=1)
    active = np.where(row_counts > 8)[0]
    if len(active) == 0:
        return arr
    gap = None
    for i in range(len(active) - 1):
        if active[i + 1] - active[i] > 10:
            gap = int(active[i])
            break
    y1 = (gap + 10) if gap is not None else int(arr.shape[0] * 0.62)
    return trim_alpha(arr[:y1], pad=10)


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
    icon.thumbnail((size - pad * 2, size - pad * 2), Image.Resampling.LANCZOS)
    x = (size - icon.width) // 2
    y = (size - icon.height) // 2
    canvas.paste(icon, (x, y), icon)
    return canvas


def resolve_source() -> tuple[np.ndarray, str | None]:
    pdf = SRC_PDF if SRC_PDF.exists() else OFFICIAL_PDF
    if pdf.exists() and shutil.which("gs"):
        raster = Path("/tmp/logo-ff-official.png")
        raster_from_pdf(pdf, raster)
        svg_text = None
        if shutil.which("pdftocairo"):
            raw_svg = Path("/tmp/logo-ff-official.svg")
            svg_from_pdf(pdf, raw_svg)
            svg_text = raw_svg.read_text()
        return load_rgba(raster), svg_text

    psd = SRC_PSD if SRC_PSD.exists() else OFFICIAL_PSD
    if psd.exists():
        return load_rgba(psd), None
    if FALLBACK_PNG.exists():
        return load_rgba(FALLBACK_PNG), None
    return load_rgba(FALLBACK_JPG), None


def main() -> None:
    # The sharp drawing in public/brand is the logo. Rebuilding it from the
    # official PDF would put back the blurry trace and the red largest jewel.
    mark_path = OUT / "brand/logo-ff-mark.png"
    print(f"keeping sharp Logo-FF; largest jewel is blue ({mark_path})")
    mark = load_rgba(mark_path)

    square_icon(mark, 192, (255, 255, 255, 255)).convert("RGB").save(OUT / "icon.png", "PNG", optimize=True)
    square_icon(mark, 180, (255, 255, 255, 255)).convert("RGB").save(
        OUT / "apple-touch-icon.png", "PNG", optimize=True
    )
    ico = square_icon(mark, 64, (255, 255, 255, 255))
    ico.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    ico.save(ROOT / "app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote icons")


if __name__ == "__main__":
    main()
