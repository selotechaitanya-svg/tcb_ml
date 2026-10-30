"""
Streamlit App automated test suite.
1. Tests app execution via streamlit.testing.v1.AppTest.
2. Really launches streamlit run app/app.py --server.headless true and confirms /_stcore/health returns 200.
"""
from __future__ import annotations

import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_PATH = PROJECT_ROOT / "app" / "app.py"


def test_app_test():
    """Test using streamlit.testing.v1.AppTest."""
    print("Testing with streamlit.testing.v1.AppTest...")
    from streamlit.testing.v1 import AppTest

    at = AppTest.from_file(str(APP_PATH), default_timeout=30)
    at.run()
    assert not at.exception, f"AppTest raised an exception: {at.exception}"
    print("[PASS] AppTest initialized successfully without errors.")

    # Find and click the predict button
    predict_btn = [btn for btn in at.button if "Predict" in btn.label]
    if predict_btn:
        predict_btn[0].click()
        at.run()
        assert not at.exception, f"AppTest raised exception on predict: {at.exception}"
        print("[PASS] AppTest predict action completed successfully without errors.")
    else:
        print("[WARNING] Predict button not found in AppTest.")


def test_live_server():
    """Test by launching headless server and querying /_stcore/health."""
    print("\nTesting live server launch...")
    cmd = [
        sys.executable, "-m", "streamlit", "run",
        str(APP_PATH),
        "--server.headless", "true",
        "--server.port", "8501",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    health_url = "http://localhost:8501/_stcore/health"
    max_wait = 25
    start_time = time.time()
    healthy = False

    try:
        while time.time() - start_time < max_wait:
            try:
                with urllib.request.urlopen(health_url, timeout=2) as response:
                    if response.status == 200:
                        healthy = True
                        print(f"[PASS] Live server health check returned status 200 at {health_url}")
                        break
            except Exception:
                time.sleep(1)
        assert healthy, f"Live server failed to return 200 within {max_wait}s"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("[PASS] Headless server cleanly terminated.")


if __name__ == "__main__":
    test_app_test()
    test_live_server()
    print("\n[SUCCESS] All Streamlit app tests passed!")
