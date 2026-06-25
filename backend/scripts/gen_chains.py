#!/usr/bin/env python3
"""Generate native/game_memory/generated_chains.h from assets/pointer_chains.json.

Run before building game_memory.dll:
    python scripts/gen_chains.py
"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = REPO_ROOT / "assets" / "pointer_chains.json"
OUT_PATH  = REPO_ROOT / "native" / "game_memory" / "generated_chains.h"

_DTYPE_MAP = {
    "uint8":  "GM_UINT8",  "int8":   "GM_INT8",
    "uint16": "GM_UINT16", "int16":  "GM_INT16",
    "uint32": "GM_UINT32", "int32":  "GM_INT32",
    "uint64": "GM_UINT64", "int64":  "GM_INT64",
    "float":  "GM_FLOAT",  "double": "GM_DOUBLE",
}

_MAX_OFFSETS = 16


def _parse_offset(v: object) -> int:
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    if isinstance(v, str):
        return int(v, 0)
    raise ValueError(f"bad offset: {v!r}")


def main() -> None:
    data   = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    chains = [(k, v) for k, v in data.items() if not k.startswith("_")]

    lines = [
        "/* AUTO-GENERATED — do not edit. Run scripts/gen_chains.py to regenerate. */",
        '#include "game_memory.h"',
        "",
        f"#define GM_MAX_OFFSETS {_MAX_OFFSETS}",
        "",
        "typedef struct {",
        "    const char* name;",
        "    const char* module;",
        f"    uintptr_t   offsets[{_MAX_OFFSETS}];",
        "    int         offset_count;",
        "    gm_dtype_t  dtype;",
        "} gm_chain_def_t;",
        "",
        "static const gm_chain_def_t GM_CHAINS[] = {",
    ]

    for name, val in chains:
        offsets = [_parse_offset(o) for o in val["offsets"]]
        dtype   = _DTYPE_MAP.get(val.get("dtype", "uint32"), "GM_UINT32")
        module  = val["module"]
        count   = len(offsets)

        # Pad to _MAX_OFFSETS
        padded = offsets + [0] * (_MAX_OFFSETS - count)
        offset_str = ", ".join(f"0x{o:X}" if o else "0" for o in padded)

        lines.append(
            f'    {{ "{name}", "{module}", {{{offset_str}}}, {count}, {dtype} }},'
        )

    lines += [
        "    { NULL, NULL, {0}, 0, (gm_dtype_t)0 }",
        "};",
        "",
        f"/* {len(chains)} chains */",
    ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated {OUT_PATH} ({len(chains)} chains)")


if __name__ == "__main__":
    main()
