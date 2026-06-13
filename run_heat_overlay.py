#!/usr/bin/env python
"""HEAT overlay launcher — boots FUSE with the heat plugin bundle."""
from fuse.runner import run

if __name__ == "__main__":
    run()  # plugins/ at repo root is auto-scanned by discovery