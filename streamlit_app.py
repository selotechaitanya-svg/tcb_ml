"""
Default entry point for Streamlit Community Cloud.
Routes directly to app/app.py.
"""
from pathlib import Path
import runpy
import sys

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Run the main application
target_app = REPO_ROOT / "app" / "app.py"
runpy.run_path(str(target_app), run_name="__main__")
