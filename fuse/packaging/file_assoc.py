"""Windows file-type association for .fuse plugin archives.

Registers the .fuse extension under HKCU (no admin rights required) and
assigns a custom icon derived from the project logo.  Called once on first
run; subsequent runs check the registry and skip if already registered.
"""
from __future__ import annotations

import sys
from pathlib import Path

from loguru import logger

_PROG_ID   = "FusePlugin"
_EXT       = ".fuse"
_REG_PROBE = f"Software\\Classes\\{_EXT}"
_ICO_NAME  = "fuse_filetype.ico"


def _ico_path() -> Path:
    from fuse.utils.paths import DATA_DIR
    return DATA_DIR / _ICO_NAME


def _make_ico(logo_src: Path, ico_dst: Path) -> bool:
    """Convert *logo_src* PNG to a multi-size .ico at *ico_dst*."""
    try:
        from PIL import Image
        img = Image.open(logo_src).convert("RGBA")
        sizes = [256, 128, 64, 48, 32, 16]
        frames = [img.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
        ico_dst.parent.mkdir(parents=True, exist_ok=True)
        frames[0].save(
            ico_dst,
            format="ICO",
            sizes=[(s, s) for s in sizes],
            append_images=frames[1:],
        )
        logger.debug(f"file_assoc: created icon {ico_dst}")
        return True
    except Exception as e:
        logger.warning(f"file_assoc: could not create icon: {e}")
        return False


def is_registered() -> bool:
    """Return True if the .fuse association is already present in HKCU."""
    if sys.platform != "win32":
        return True  # nothing to do on non-Windows
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_PROBE):
            return True
    except OSError:
        return False


def register(logo_src: Path) -> bool:
    """Register .fuse with Windows using *logo_src* as the file icon.

    Writes to HKCU — no admin rights required.
    Calls SHChangeNotify so Explorer picks up the new icon immediately.
    Returns True on success.
    """
    if sys.platform != "win32":
        return False

    ico = _ico_path()
    if not ico.exists():
        if not _make_ico(logo_src, ico):
            return False

    try:
        import winreg

        def _set(subkey: str, value: str) -> None:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, subkey) as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, value)

        _set(f"Software\\Classes\\{_EXT}",                          _PROG_ID)
        _set(f"Software\\Classes\\{_PROG_ID}",                      "FUSE Plugin Archive")
        _set(f"Software\\Classes\\{_PROG_ID}\\DefaultIcon",         f"{ico},0")

        # Notify Explorer to refresh file-type icons immediately.
        import ctypes
        SHCNE_ASSOCCHANGED = 0x08000000
        SHCNF_IDLIST       = 0x0000
        ctypes.windll.shell32.SHChangeNotify(
            SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None
        )

        logger.info(f"file_assoc: registered {_EXT} → {_PROG_ID} (icon: {ico.name})")
        return True

    except Exception as e:
        logger.warning(f"file_assoc: registration failed: {e}")
        return False


def ensure_registered(logo_src: Path) -> None:
    """Register .fuse on first run; no-op if already registered."""
    if not is_registered():
        register(logo_src)


__all__ = ["ensure_registered", "register", "is_registered"]
