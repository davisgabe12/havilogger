"""Application configuration utilities."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from pydantic import BaseModel, Field


class AppConfig(BaseModel):
    """Strongly typed configuration loaded from config.json."""

    openai_api_key: str = Field(..., alias="openai_api_key")
    openai_model: str = Field(default="gpt-4o-mini")
    database_path: str = Field(default="./data/havilogger.db")

    @property
    def resolved_database_path(self) -> Path:
        """Return the absolute path for the SQLite database file."""
        return (Path(__file__).resolve().parents[1] / self.database_path).resolve()


def _config_path() -> Path:
    return Path(__file__).resolve().parents[1] / "config.json"


def load_config() -> AppConfig:
    """Load configuration from config.json, raising helpful errors if missing."""

    config_file = _config_path()
    if not config_file.exists():
        example = config_file.with_name("config.example.json")
        raise FileNotFoundError(
            "Missing config.json. Copy config.example.json and update your OpenAI key."
            f" Expected at {config_file}. Example file: {example}"
        )

    contents: Dict[str, Any] = json.loads(config_file.read_text())
    return AppConfig(**contents)


CONFIG = load_config()
