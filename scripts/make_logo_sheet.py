#!/usr/bin/env python3
"""Gera o sprite sheet do Papinho pra animar na saudação/titlebar via CSS
`steps()`.

O Papinho é um robozinho — então em vez do tremor caótico do demoninho do
DevTerm, a animação é de robô flutuando: sobe-desce lento, uma inclinação
pequena e um chacoalhar curto (a anteninha balança junto porque faz parte
da arte).

- Chroma-key: a arte vem com fundo preto sólido; vira transparente por flood
  fill a partir dos 4 cantos (threshold global apagaria o preto dos olhos e
  da boca, que é parte do personagem).
- Nearest-neighbor no resize e sem rotação por padrão: é pixel-art, filtro
  suave borra os quadradinhos.

Uso: python3 scripts/make_logo_sheet.py src/assets/logo-papinho.png
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "src/assets/logo-papinho.png")
OUT = ROOT / "src/assets/logo-sheet.png"

FRAMES = 24
FRAME = 64  # px por frame (margem pro deslocamento não cortar)
MARKER = (0, 255, 0)  # sentinela — não existe na arte


def chroma_key(art: Image.Image) -> Image.Image:
    """Só o FUNDO preto contínuo vira transparente (flood fill dos cantos)."""
    rgb = art.convert("RGB")
    w, h = rgb.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, corner, MARKER, thresh=40)

    orig_px = art.convert("RGB").load()
    marked_px = rgb.load()
    out = Image.new("RGBA", (w, h))
    out_px = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = orig_px[x, y]
            out_px[x, y] = (r, g, b, 0 if marked_px[x, y] == MARKER else 255)
    return out


def trim(art: Image.Image) -> Image.Image:
    """Corta a moldura transparente — a arte tem muita margem vazia."""
    box = art.getbbox()
    return art.crop(box) if box else art


def square(art: Image.Image) -> Image.Image:
    w, h = art.size
    s = max(w, h)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(art, ((s - w) // 2, (s - h) // 2), art)
    return out


def main() -> None:
    art = square(trim(chroma_key(Image.open(SRC))))
    art_size = round(FRAME * 0.80)
    # NEAREST: é pixel-art, LANCZOS borraria os quadradinhos
    art = art.resize((art_size, art_size), Image.NEAREST)

    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))

    for i in range(FRAMES):
        p = 2 * math.pi * i / FRAMES
        # flutuação lenta (1 ciclo por loop) + um chacoalhar curto por cima
        float_y = -2.6 * math.sin(p)
        dx = round(1.2 * math.sin(p * 3) + 0.6 * math.sin(p * 7 + 1.1))
        dy = round(float_y + 0.9 * math.sin(p * 5 + 0.6))

        canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
        cx = (FRAME - art.width) // 2 + dx
        cy = (FRAME - art.height) // 2 + dy
        canvas.paste(art, (cx, cy), art)
        sheet.paste(canvas, (i * FRAME, 0), canvas)

    sheet.save(OUT)
    print("ok", OUT, f"{FRAMES} frames de {FRAME}px")


if __name__ == "__main__":
    main()
