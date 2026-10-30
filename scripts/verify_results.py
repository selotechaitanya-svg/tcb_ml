"""
Verification script: runs all checks from section 16.
Exit code 0 = all checks pass, 1 = some failed.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
MODELS_DIR = PROJECT_ROOT / "models"
DATA_DIR = PROJECT_ROOT / "data"
README_PATH = PROJECT_ROOT / "README.md"

sys.path.insert(0, str(PROJECT_ROOT))
from src.config import SEED, TARGET_NAME, TARGET_ORDER

failures = []


def check(name: str, condition: bool, detail: str = ""):
    status = "[PASS]" if condition else "[FAIL]"
    msg = f"{status}: {name}"
    if detail:
        msg += f" -- {detail}"
    print(msg)
    if not condition:
        failures.append(name)


# ── 1. Train/test indices disjoint ─────────────────────────────────────
with open(REPORTS_DIR / "split_indices.json", encoding="utf-8") as f:
    split = json.load(f)

train_idx = set(split["train_indices"])
test_idx = set(split["test_indices"])
check("Train/test indices disjoint", len(train_idx & test_idx) == 0, f"{len(train_idx)} train, {len(test_idx)} test")

# ── 2. No duplicate rows across train/test ─────────────────────────────
df = pd.read_csv(DATA_DIR / "spiderman_incident_priority_dataset.csv", encoding="utf-8")
from src.cleaning import clean_dataframe
df_cleaned = clean_dataframe(df)
if "incident_id" in df_cleaned.columns:
    df_cleaned = df_cleaned.drop(columns=["incident_id"])

X = df_cleaned.drop(columns=[TARGET_NAME])
train_hashes = set(pd.util.hash_pandas_object(X.iloc[split["train_indices"]]).values)
test_hashes = set(pd.util.hash_pandas_object(X.iloc[split["test_indices"]]).values)
shared = train_hashes & test_hashes
check("No identical feature rows shared between train and test", len(shared) == 0, f"shared hashes: {len(shared)}")

# ── 3. Test-set hash unchanged ─────────────────────────────────────────
y = df_cleaned[TARGET_NAME]
test_df = pd.concat([X.iloc[split["test_indices"]], y.iloc[split["test_indices"]]], axis=1)
test_bytes = pd.util.hash_pandas_object(test_df).values.tobytes()
computed_hash = hashlib.sha256(test_bytes).hexdigest()
check("Test-set SHA-256 hash matches stored hash", computed_hash == split["test_hash_sha256"],
      f"computed={computed_hash[:16]}... stored={split['test_hash_sha256'][:16]}...")

# ── 4. selection_locked.json timestamp is earlier than final_test_metrics.json ───
lock_file = REPORTS_DIR / "selection_locked.json"
final_file = REPORTS_DIR / "final_test_metrics.json"
check("selection_locked.json exists", lock_file.exists())
check("final_test_metrics.json exists", final_file.exists())

with open(lock_file, encoding="utf-8") as f:
    lock_data = json.load(f)
with open(final_file, encoding="utf-8") as f:
    final_data = json.load(f)

lock_mtime = lock_file.stat().st_mtime
final_mtime = final_file.stat().st_mtime
check("Lock file timestamp is earlier than or equal to final metrics file",
      lock_mtime <= final_mtime,
      f"lock_mtime={lock_mtime:.2f}, final_mtime={final_mtime:.2f}")

# ── 5. Reloaded model reproduces test metrics in JSON and README ─────────
model = joblib.load(MODELS_DIR / "best_model.joblib")
X_test = X.iloc[split["test_indices"]]
y_test = y.iloc[split["test_indices"]]

y_pred = model.predict(X_test)
acc = float(accuracy_score(y_test, y_pred))
f1 = float(f1_score(y_test, y_pred, average="macro", zero_division=0))

stored_acc = float(final_data["chosen_model"]["metrics"]["accuracy"])
stored_f1 = float(final_data["chosen_model"]["metrics"]["f1_macro"])

check("Reloaded model accuracy matches JSON (tol=1e-9)",
      abs(acc - stored_acc) < 1e-9,
      f"reloaded={acc:.6f}, json={stored_acc:.6f}")
check("Reloaded model F1-macro matches JSON (tol=1e-9)",
      abs(f1 - stored_f1) < 1e-9,
      f"reloaded={f1:.6f}, json={stored_f1:.6f}")

# Check README table numbers match
readme_text = README_PATH.read_text(encoding="utf-8")
chosen_name = final_data["chosen_model"]["name"]
# Find row in README matching chosen model (marked with ⭐)
match = re.search(rf"\|\s*{re.escape(chosen_name)}\s*⭐\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)\s*\|", readme_text)
if not match:
    # Fallback to exact column match without star
    match = re.search(rf"\|\s*{re.escape(chosen_name)}\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)\s*\|\s*([\d\.]+)\s*\|", readme_text)
if match:
    readme_acc = float(match.group(1))
    readme_f1 = float(match.group(3))
    check("README accuracy matches reloaded model (tol=1e-4)",
          abs(acc - readme_acc) < 1e-4,
          f"reloaded={acc:.4f}, readme={readme_acc:.4f}")
    check("README F1-macro matches reloaded model (tol=1e-4)",
          abs(f1 - readme_f1) < 1e-4,
          f"reloaded={f1:.4f}, readme={readme_f1:.4f}")
else:
    check("README contains chosen model row", False, f"Could not find row for {chosen_name} in README table")

# ── 6. Class order consistency ─────────────────────────────────────────
with open(MODELS_DIR / "model_metadata.json", encoding="utf-8") as f:
    meta = json.load(f)
check("Class order in metadata matches TARGET_ORDER",
      meta["class_labels"] == TARGET_ORDER,
      f"metadata={meta['class_labels']}, config={TARGET_ORDER}")

# ── 7. Notebook scan: X_test/y_test only in split cell and post-lock ─────
nb_path = PROJECT_ROOT / "spiderman_incident_priority.ipynb"
with open(nb_path, encoding="utf-8") as f:
    nb_json = json.load(f)

split_cell_idx = None
lock_cell_idx = None
for i, cell in enumerate(nb_json["cells"]):
    src = "".join(cell.get("source", []))
    if "train_test_split" in src:
        split_cell_idx = i
    if "selection_locked.json" in src and "json.dump" in src:
        lock_cell_idx = i

bad_cells = []
for i, cell in enumerate(nb_json["cells"]):
    if cell.get("cell_type") != "code":
        continue
    src = "".join(cell.get("source", []))
    if "X_test" in src or "y_test" in src:
        if split_cell_idx is not None and i in [split_cell_idx, split_cell_idx + 2]:
            continue
        if lock_cell_idx is not None and i > lock_cell_idx:
            continue
        bad_cells.append(i)

check("X_test/y_test referenced only in split and post-lock cells",
      len(bad_cells) == 0,
      f"violating cells: {bad_cells}" if bad_cells else "clean")

# ── 8. No TODO/TBD/lorem in source files ────────────────────────────────
forbidden = ["TODO", "TBD", "lorem"]
allowed_markers = ["WRITE THIS YOURSELF", "✍️"]
source_files = list((PROJECT_ROOT / "src").glob("*.py"))
source_files += [PROJECT_ROOT / "app" / "app.py"]
source_files += list((PROJECT_ROOT / "scripts").glob("*.py"))

flagged_items = []
for fpath in source_files:
    if fpath.exists():
        content = fpath.read_text(encoding="utf-8", errors="ignore")
        for word in forbidden:
            if word.lower() in content.lower():
                if not any(marker in content for marker in allowed_markers):
                    flagged_items.append(f"{fpath.name}: contains '{word}'")

check("No TODO/TBD/lorem text in code files", len(flagged_items) == 0,
      "; ".join(flagged_items) if flagged_items else "clean")

# ── Summary ────────────────────────────────────────────────────────────
print(f"\n{'='*55}")
if failures:
    print(f"FAILED: {len(failures)} verification checks failed: {failures}")
    sys.exit(1)
else:
    print("SUCCESS: All verification checks passed!")
    sys.exit(0)
