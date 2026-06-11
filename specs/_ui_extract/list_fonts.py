"""List every font shipped in WoT HEAT, grouped by usage role.

Reads each TTF's `name` table to extract Family (nameID 1) and Full Name (nameID 4),
then groups by the engine's logical-path prefix (`/fonts/ui/`, `/system/fonts/`,
`/plugins/.../fonts/`).
"""
from __future__ import annotations
import json
import os
import re
import struct
import tempfile
import zipfile
from pathlib import Path

import zstandard as zstd

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"

GAME_OUTPUT = Path(r"D:\SteamLibrary\steamapps\common\WoT HEAT\.assets\output")
HASH_RE = re.compile(r"^(.+?)([0-9a-f]{32})(\.ttf)$")


def read_name_table(data: bytes) -> tuple[str | None, str | None]:
    n_tables = struct.unpack(">H", data[4:6])[0]
    tables: dict[str, tuple[int, int]] = {}
    pos = 12
    for _ in range(n_tables):
        tag = data[pos:pos + 4].decode("latin1")
        _, off, ln = struct.unpack(">III", data[pos + 4:pos + 16])
        tables[tag] = (off, ln)
        pos += 16
    if "name" not in tables:
        return None, None
    off, _ = tables["name"]
    _fmt, count, str_off = struct.unpack(">HHH", data[off:off + 6])
    storage = off + str_off
    fam = full = None
    for i in range(count):
        rec = data[off + 6 + i * 12:off + 6 + (i + 1) * 12]
        plat, _enc, _lang, nid, length, str_off_r = struct.unpack(">HHHHHH", rec)
        s = data[storage + str_off_r:storage + str_off_r + length]
        try:
            txt = s.decode("utf-16-be") if plat == 3 else s.decode("latin1")
        except Exception:
            txt = ""
        if nid == 1 and not fam:
            fam = txt
        if nid == 4 and not full:
            full = txt
        if fam and full:
            break
    return fam, full


def main() -> None:
    # logical paths from dep DB
    dep_zip = zipfile.ZipFile(GAME_OUTPUT / "dependencies_db.zip")
    j = json.loads(dep_zip.read(".assets/output/client_dependencies_db.json"))
    logical = {os.path.basename(a["asset"]): a["asset"] for a in j["assets"] if a["asset"].endswith(".ttf")}

    # blobs
    blobs: dict[str, bytes] = {}
    for zip_path in sorted(GAME_OUTPUT.glob("*.zip")):
        if zip_path.name == "dependencies_db.zip":
            continue
        with zipfile.ZipFile(zip_path) as z:
            for n in z.namelist():
                m = HASH_RE.match(os.path.basename(n))
                if m:
                    stem = m.group(1) + ".ttf"
                    if stem not in blobs:
                        raw = z.read(n)
                        if raw.startswith(ZSTD_MAGIC):
                            raw = zstd.ZstdDecompressor().decompress(raw)
                        blobs[stem] = raw

    rows = []
    for stem, data in blobs.items():
        try:
            fam, full = read_name_table(data)
        except Exception as e:
            fam, full = None, f"<error: {e}>"
        path = logical.get(stem, "(unmapped)")
        rows.append((path, stem, fam, full))

    # group by category
    def cat(p: str) -> str:
        if p.startswith("/fonts/ui/"):
            return "UI (game-facing)"
        if p.startswith("/system/fonts/"):
            return "System / engine UI"
        if p.startswith("/plugins/"):
            return "Editor / dev tool icons (COLR)"
        if p.startswith("/fonts/"):
            return "Other"
        return "Unmapped"

    groups: dict[str, list] = {}
    for r in rows:
        groups.setdefault(cat(r[0]), []).append(r)

    for cat_name in ["UI (game-facing)", "System / engine UI", "Editor / dev tool icons (COLR)", "Other", "Unmapped"]:
        if cat_name not in groups:
            continue
        items = sorted(groups[cat_name], key=lambda r: r[0])
        print(f"\n=== {cat_name} ({len(items)}) ===")
        for path, _stem, fam, full in items:
            print(f"  {path}")
            print(f"      family: {fam or '?'}    full: {full or '?'}")


if __name__ == "__main__":
    main()
