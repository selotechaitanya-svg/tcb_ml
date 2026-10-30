"""
Structural cleaning: stateless, idempotent, applied before the split
AND as the first step of the saved pipeline (via FunctionTransformer).
No data-dependent operations (no imputation stats, no scaling params).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# Placeholder strings that should become NaN
_PLACEHOLDERS = {"", "na", "n/a", "null", "none", "?", "-"}


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all structural cleaning steps to *df* (returns a copy).

    Steps
    -----
    1. Strip whitespace from column names.
    2. Strip whitespace from string values.
    3. Convert placeholder strings to NaN.
    4. Unify case in categorical string columns (title-case).
    5. Validate numeric ranges (set impossible values to NaN).
    """
    df = df.copy()

    # 1. Column-name whitespace
    df.columns = df.columns.str.strip()

    # 2 & 3. String columns: strip + placeholders -> NaN
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].astype(str).str.strip()
        df[col] = df[col].where(
            ~df[col].str.lower().isin(_PLACEHOLDERS), other=np.nan
        )

    # 4. Unify case for known categorical columns
    _cat_cols = [
        "villain", "incident_type", "location", "weather",
        "time_of_day", "spider_sense_alert", "backup_status",
        "response_priority",
    ]
    for col in _cat_cols:
        if col in df.columns:
            df[col] = df[col].str.strip().str.title()

    # 5. Numeric validation (set impossible values to NaN)
    _range_rules: dict[str, tuple[float, float]] = {
        "civilians_at_risk": (0, np.inf),
        "property_damage_level": (0, np.inf),
        "web_trap_strength": (0, np.inf),
        "villain_escape_risk": (0, np.inf),
        "response_delay_minutes": (0, np.inf),
    }
    for col, (lo, hi) in _range_rules.items():
        if col in df.columns:
            numeric_col = pd.to_numeric(df[col], errors="coerce")
            numeric_col[(numeric_col < lo) | (numeric_col > hi)] = np.nan
            df[col] = numeric_col

    return df


def clean_for_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    """
    Wrapper suitable for sklearn FunctionTransformer.
    Applies the same cleaning but only on feature columns
    (target column may not be present at prediction time).
    """
    df = df.copy()

    # Strip whitespace from column names
    df.columns = df.columns.str.strip()

    # String columns: strip + placeholders -> NaN
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].astype(str).str.strip()
        df[col] = df[col].where(
            ~df[col].str.lower().isin(_PLACEHOLDERS), other=np.nan
        )

    # Unify case for categorical feature columns (no target here)
    _cat_cols = [
        "villain", "incident_type", "location", "weather",
        "time_of_day", "spider_sense_alert", "backup_status",
    ]
    for col in _cat_cols:
        if col in df.columns:
            df[col] = df[col].str.strip().str.title()

    # Numeric validation
    _range_rules: dict[str, tuple[float, float]] = {
        "civilians_at_risk": (0, np.inf),
        "property_damage_level": (0, np.inf),
        "web_trap_strength": (0, np.inf),
        "villain_escape_risk": (0, np.inf),
        "response_delay_minutes": (0, np.inf),
    }
    for col, (lo, hi) in _range_rules.items():
        if col in df.columns:
            numeric_col = pd.to_numeric(df[col], errors="coerce")
            numeric_col[(numeric_col < lo) | (numeric_col > hi)] = np.nan
            df[col] = numeric_col

    return df
