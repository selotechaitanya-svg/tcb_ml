"""
Update the README.md metrics section from final_test_metrics.json.
Replaces content between <!-- METRICS:START --> and <!-- METRICS:END -->.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
README_PATH = PROJECT_ROOT / "README.md"

sys.path.insert(0, str(PROJECT_ROOT))
from src.config import TARGET_ORDER


def generate_metrics_table(final: dict) -> str:
    """Generate a markdown metrics table from final_test_metrics.json."""
    lines = []
    lines.append("### Final Test-Set Metrics\n")

    # All models comparison
    lines.append("| Model | Accuracy | Bal. Acc. | Macro-F1 | Weighted-F1 | ROC-AUC | MCC |")
    lines.append("|-------|----------|-----------|----------|-------------|---------|-----|")

    chosen_name = final["chosen_model"]["name"]
    for model_name, metrics in final["all_models"].items():
        marker = " ⭐" if model_name == chosen_name else ""
        roc = metrics.get("roc_auc_ovr_macro", "N/A")
        roc_str = f"{roc:.4f}" if isinstance(roc, (int, float)) else roc
        lines.append(
            f"| {model_name}{marker} | {metrics['accuracy']:.4f} | "
            f"{metrics['balanced_accuracy']:.4f} | {metrics['f1_macro']:.4f} | "
            f"{metrics['f1_weighted']:.4f} | {roc_str} | {metrics['mcc']:.4f} |"
        )

    # Confidence intervals
    lines.append(f"\n**Chosen model**: {chosen_name}")
    lines.append("\n**95% Bootstrap Confidence Intervals:**\n")
    lines.append("| Metric | Point Estimate | 95% CI |")
    lines.append("|--------|---------------|--------|")
    for metric, ci in final["chosen_model"]["confidence_intervals"].items():
        lines.append(
            f"| {metric} | {ci['point']:.4f} | [{ci['ci_lower']:.4f}, {ci['ci_upper']:.4f}] |"
        )

    return "\n".join(lines)


def main():
    # Read final metrics
    with open(REPORTS_DIR / "final_test_metrics.json") as f:
        final = json.load(f)

    metrics_md = generate_metrics_table(final)

    # Read README
    if not README_PATH.exists():
        print("README.md not found, skipping update")
        return

    readme = README_PATH.read_text(encoding="utf-8")

    start_marker = "<!-- METRICS:START -->"
    end_marker = "<!-- METRICS:END -->"

    if start_marker in readme and end_marker in readme:
        before = readme[: readme.index(start_marker) + len(start_marker)]
        after = readme[readme.index(end_marker):]
        readme = before + "\n" + metrics_md + "\n" + after
    else:
        print("WARNING: Metrics markers not found in README.md")
        return

    README_PATH.write_text(readme, encoding="utf-8")
    print("[SUCCESS] README.md metrics updated from final_test_metrics.json")


if __name__ == "__main__":
    main()
