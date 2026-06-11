"""Tank registry. Each tank exposes a launcher function and metadata."""

TANKS = [
    {
        "id": "amx_10rc",
        "name": "AMX-10RC",
        "description": "SACLOS predictor + ML auto-correction (default).",
        "module": "tanks.amx_10rc",
        "config_file": "saclos_config.json",
    },
    {
        "id": "xm1_90",
        "name": "XM1 90",
        "description": "Custom energy scale overlay (centered) + OCR-driven progress.",
        "module": "tanks.xm1_90",
        "config_file": "saclos_config_xm1_90.json",
    },
]


def get_tank(tank_id):
    for t in TANKS:
        if t["id"] == tank_id:
            return t
    return None
