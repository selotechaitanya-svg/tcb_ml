"""
Feature engineering: stateless, row-wise functions.
Each function takes a DataFrame and returns it with new column(s).
Kept only if they improve CV macro-F1 by >= 0.005.
"""
from __future__ import annotations

import pandas as pd


def passthrough_features(df: pd.DataFrame) -> pd.DataFrame:
    """Identity feature step when no engineered features are kept."""
    return df.copy()


def add_risk_score(df: pd.DataFrame) -> pd.DataFrame:
    """
    Interaction feature: civilians_at_risk * villain_escape_risk / 100.
    Rationale: high civilian risk combined with high escape risk should
    amplify urgency.
    """
    df = df.copy()
    if "civilians_at_risk" in df.columns and "villain_escape_risk" in df.columns:
        df["risk_score"] = (
            df["civilians_at_risk"] * df["villain_escape_risk"] / 100.0
        )
    return df


def add_damage_vs_trap(df: pd.DataFrame) -> pd.DataFrame:
    """
    Difference feature: property_damage_level - web_trap_strength.
    Rationale: when damage is high but trap strength is low, the situation
    is harder to contain, which may drive higher priority.
    """
    df = df.copy()
    if "property_damage_level" in df.columns and "web_trap_strength" in df.columns:
        df["damage_vs_trap"] = (
            df["property_damage_level"] - df["web_trap_strength"]
        )
    return df


def add_all_features(df: pd.DataFrame) -> pd.DataFrame:
    """Apply all feature-engineering functions (in order)."""
    df = add_risk_score(df)
    df = add_damage_vs_trap(df)
    return df
