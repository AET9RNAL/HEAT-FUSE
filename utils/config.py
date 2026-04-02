import os
import json

from loguru import logger

class ConfigManager:
    """Manages loading and saving application configuration."""
    
    def __init__(self, filename="saclos_config.json"):
        self.config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), filename)
    
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
