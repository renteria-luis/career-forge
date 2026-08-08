#!/usr/bin/env python3
"""Produce the static font files the PDF compiler embeds.

Run this only when adding or changing a font. The output is committed, so
builds, CI and Docker never need Python, network access or this script.

Why static instances rather than the variable fonts Google ships: Typst does
not instantiate the weight axis of a variable font. It renders every weight at
the file's default instance, so bold silently comes out the same weight as
regular. Pinning each weight to its own file is the only thing that produces
real bold in the PDF. Verified by rendering, not assumed.

Requires: python3 -m pip install fonttools
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

GF = "https://raw.githubusercontent.com/google/fonts/main/ofl"
OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Every face is OFL. Do not add one without confirming that — we embed these in
# PDFs we hand to users, which is redistribution.
#
# `axes` pins the non-weight axes. Optical size is pinned to a text-appropriate
# value because Typst will not vary it either.
FAMILIES = {
    "source-sans": {
        "dir": "sourcesans3",
        "family": "Source Sans 3",
        "upright": "SourceSans3[wght].ttf",
        "italic": "SourceSans3-Italic[wght].ttf",
        "axes": {},
    },
    "source-serif": {
        "dir": "sourceserif4",
        "family": "Source Serif 4",
        "upright": "SourceSerif4[opsz,wght].ttf",
        "italic": "SourceSerif4-Italic[opsz,wght].ttf",
        "axes": {"opsz": 11},
    },
    "eb-garamond": {
        "dir": "ebgaramond",
        "family": "EB Garamond",
        "upright": "EBGaramond[wght].ttf",
        "italic": "EBGaramond-Italic[wght].ttf",
        "axes": {},
    },
    "inter": {
        "dir": "inter",
        "family": "Inter",
        "upright": "Inter[opsz,wght].ttf",
        "italic": "Inter-Italic[opsz,wght].ttf",
        "axes": {"opsz": 14},
    },
    # Lato predates variable fonts upstream and already ships as statics.
    "lato": {
        "dir": "lato",
        "family": "Lato",
        "static": {
            "Regular": "Lato-Regular.ttf",
            "Bold": "Lato-Bold.ttf",
            "Italic": "Lato-Italic.ttf",
            "BoldItalic": "Lato-BoldItalic.ttf",
        },
    },
}

WEIGHTS = {"Regular": 400, "Bold": 700}


def fetch(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f)


SUBFAMILY = {
    "Regular": "Regular",
    "Bold": "Bold",
    "Italic": "Italic",
    "BoldItalic": "Bold Italic",
}


def rename(path: Path, family: str, style: str) -> None:
    """Force the family name back to the canonical one.

    Pinning a non-weight axis makes fontTools fold that value into the family
    name, so pinning optical size turns "Source Serif 4" into "Source Serif 4
    11pt". Typst looks the family up by name, fails to find it, and silently
    substitutes another face — a wrong-looking PDF with no error anywhere.
    """
    from fontTools.ttLib import TTFont

    subfamily = SUBFAMILY[style]
    ps = f"{family.replace(' ', '')}-{style}"
    full = family if style == "Regular" else f"{family} {subfamily}"

    font = TTFont(path)
    table = font["name"]
    for name_id, value in ((1, family), (2, subfamily), (4, full), (6, ps)):
        table.setName(value, name_id, 3, 1, 0x409)
        table.setName(value, name_id, 1, 0, 0)
    # Typographic family/subfamily would otherwise still carry the axis value.
    for name_id in (16, 17):
        table.removeNames(nameID=name_id)
    font.save(path)


def instance(src: Path, dest: Path, axes: dict[str, float]) -> None:
    args = [f"{k}={v}" for k, v in axes.items()]
    subprocess.run(
        [sys.executable, "-m", "fontTools.varLib.instancer",
         "-o", str(dest), str(src), *args, "--update-name-table"],
        check=True, capture_output=True,
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    work = OUT / ".src"
    work.mkdir(exist_ok=True)

    for key, spec in FAMILIES.items():
        base = f"{GF}/{spec['dir']}"
        fetch(f"{base}/OFL.txt", OUT / f"{key}-OFL.txt")

        if "static" in spec:
            for style, name in spec["static"].items():
                fetch(f"{base}/{name}", OUT / f"{key}-{style}.ttf")
                print(f"  {key}-{style}.ttf (upstream static)")
            continue

        for source_key, italic in (("upright", False), ("italic", True)):
            src = work / spec[source_key]
            fetch(f"{base}/{spec[source_key]}", src)
            for style, wght in WEIGHTS.items():
                name = f"{style}Italic" if italic and style == "Bold" else (
                    "Italic" if italic else style
                )
                dest = OUT / f"{key}-{name}.ttf"
                instance(src, dest, {**spec["axes"], "wght": wght})
                rename(dest, spec["family"], name)
                print(f"  {key}-{name}.ttf ({spec['family']} {SUBFAMILY[name]})")

    shutil.rmtree(work)
    total = sum(f.stat().st_size for f in OUT.glob("*.ttf"))
    print(f"\n{len(list(OUT.glob('*.ttf')))} files, {total / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
