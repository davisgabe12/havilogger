from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import config as config_module


def test_load_config_uses_file_when_present(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "openai_api_key": "file-key",
                "openai_model": "gpt-4o-mini",
                "database_path": "./data/test.db",
            }
        )
    )
    monkeypatch.setattr(config_module, "_config_path", lambda: config_path)
    monkeypatch.setenv("OPENAI_API_KEY", "env-key-ignored")

    loaded = config_module.load_config()

    assert loaded.openai_api_key == "file-key"
    assert loaded.database_path == "./data/test.db"


def test_load_config_falls_back_to_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing_path = tmp_path / "missing-config.json"
    monkeypatch.setattr(config_module, "_config_path", lambda: missing_path)
    monkeypatch.setenv("OPENAI_API_KEY", "env-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o-mini")
    monkeypatch.setenv("DATABASE_PATH", "./data/env.db")

    loaded = config_module.load_config()

    assert loaded.openai_api_key == "env-key"
    assert loaded.openai_model == "gpt-4o-mini"
    assert loaded.database_path == "./data/env.db"


def test_load_config_raises_when_config_and_env_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing_path = tmp_path / "missing-config.json"
    monkeypatch.setattr(config_module, "_config_path", lambda: missing_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(FileNotFoundError) as error:
        config_module.load_config()

    assert "OPENAI_API_KEY" in str(error.value)
