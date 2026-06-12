import os
import json

from loguru import logger

from fuse.utils.paths import resolve_config


class ConfigManager:
    """Manages loading and saving application configuration.

    Bare filenames are resolved under ``data/configs/``. Paths containing a
    separator (or absolute paths) are used verbatim so callers may opt out
    of the convention.
    """

    def __init__(self, filename="heat_ailos_torc.json"):
        self.config_path = resolve_config(filename)
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

    def load(self, defaults=None):
        """Load configuration from JSON file. Returns dictionary."""
        config = defaults.copy() if defaults else {}
        if not os.path.exists(self.config_path):
            return config

        try:
            with open(self.config_path, 'r') as f:
                loaded = json.load(f)
                config.update(loaded)
        except Exception as e:
            logger.warning(f"Could not load config: {e}")

        return config

    def save(self, config_dict):
        """Save dictionary of configuration to JSON file."""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(config_dict, f, indent=2)
            logger.info(f"Config saved to {self.config_path}")
        except Exception as e:
            logger.warning(f"Could not save config: {e}")