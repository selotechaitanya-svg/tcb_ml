"""
Central configuration for the Spider-Man Incident Priority project.
All constants are defined here so every module and the notebook share
the same values. Changing SEED here changes it everywhere.
"""
from pathlib import Path
import random
import os
import numpy as np

# ── Reproducibility ────────────────────────────────────────────────────
SEED: int = 42


def seed_everything(seed: int = SEED) -> None:
    """Set seeds for Python, NumPy and the PYTHONHASHSEED env var."""
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)


# ── Target ─────────────────────────────────────────────────────────────
TARGET_NAME: str = "response_priority"
# Natural ordinal order used for plots, confusion-matrix axes, etc.
TARGET_ORDER: list[str] = ["Low", "Medium", "High"]

# ── Columns ────────────────────────────────────────────────────────────
ID_COLS: list[str] = ["incident_id"]

NUMERIC_COLS: list[str] = [
    "civilians_at_risk",
    "property_damage_level",
    "web_trap_strength",
    "villain_escape_risk",
    "response_delay_minutes",
]

CATEGORICAL_COLS: list[str] = [
    "villain",
    "incident_type",
    "location",
    "weather",
    "time_of_day",
    "spider_sense_alert",
    "backup_status",
]

# ── Splitting ──────────────────────────────────────────────────────────
TEST_SIZE: float = 0.20
N_SPLITS: int = 5
N_ITER_SEARCH: int = 40

# ── Paths (relative to project root) ──────────────────────────────────
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = PROJECT_ROOT / "data"
REPORTS_DIR: Path = PROJECT_ROOT / "reports"
FIGURES_DIR: Path = REPORTS_DIR / "figures"
MODELS_DIR: Path = PROJECT_ROOT / "models"
