from __future__ import annotations

from pathlib import Path
import json
from typing import Any

import pandas as pd


def ensure_parent(path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def write_json(data: dict[str, Any], path: str | Path) -> None:
    p = ensure_parent(path)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def numeric_feature_columns(df: pd.DataFrame, exclude: set[str]) -> list[str]:
    return [c for c in df.columns if c not in exclude and pd.api.types.is_numeric_dtype(df[c])]
