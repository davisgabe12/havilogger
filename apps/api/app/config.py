"""Application configuration utilities."""
from __future__ import annotations

import json
import os
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
    if config_file.exists():
        contents: Dict[str, Any] = json.loads(config_file.read_text())
        return AppConfig(**contents)

    # Cloud hosts should pass secrets through environment variables instead of files.
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if openai_api_key:
        return AppConfig(
            openai_api_key=openai_api_key,
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            database_path=os.getenv("DATABASE_PATH", "./data/havilogger.db"),
        )

    example = config_file.with_name("config.example.json")
    raise FileNotFoundError(
        "Missing config.json and OPENAI_API_KEY. Provide apps/api/config.json for local "
        f"dev or set OPENAI_API_KEY in environment. Expected config path: {config_file}. "
        f"Example file: {example}"
    )


CONFIG = load_config()
