# Backward-compat shim — utils has moved to fuse.utils.
# Third-party plugins can still import from utils.* without changes.
from fuse.utils import *  # noqa: F401, F403