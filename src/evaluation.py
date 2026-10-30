"""
Evaluation helpers: metrics computation, bootstrap CIs, plots.
"""
from __future__ import annotations

from typing import Callable

import matplotlib
matplotlib.use("Agg")  # non-interactive backend for scripts
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

from src.config import SEED, TARGET_ORDER


# ── Metric computation ─────────────────────────────────────────────────
def compute_all_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray | None = None,
    classes: list[str] | np.ndarray | None = None,
    labels: list[str] | None = None,
) -> dict:
    """
    Compute a comprehensive dict of classification metrics.
    Works for both multiclass and binary targets.
    """
    if labels is None:
        labels = TARGET_ORDER
    if classes is None:
        classes = sorted(np.unique(y_true))

    metrics: dict = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "precision_macro": float(
            precision_score(y_true, y_pred, average="macro", zero_division=0)
        ),
        "recall_macro": float(
            recall_score(y_true, y_pred, average="macro", zero_division=0)
        ),
        "f1_macro": float(
            f1_score(y_true, y_pred, average="macro", zero_division=0)
        ),
        "f1_weighted": float(
            f1_score(y_true, y_pred, average="weighted", zero_division=0)
        ),
        "mcc": float(matthews_corrcoef(y_true, y_pred)),
        "quadratic_weighted_kappa": float(
            cohen_kappa_score(
                y_true,
                y_pred,
                labels=labels,
                weights="quadratic",
            )
        ),
    }

    # ROC-AUC and log-loss (need probabilities)
    if y_proba is not None:
        try:
            metrics["roc_auc_ovr_macro"] = float(
                roc_auc_score(
                    y_true,
                    y_proba,
                    multi_class="ovr",
                    average="macro",
                    labels=classes,
                )
            )
        except ValueError:
            metrics["roc_auc_ovr_macro"] = float("nan")

        try:
            metrics["log_loss"] = float(
                log_loss(y_true, y_proba, labels=classes)
            )
        except ValueError:
            metrics["log_loss"] = float("nan")

    return metrics


# ── Bootstrap CIs ──────────────────────────────────────────────────────
def bootstrap_ci(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    metric_fn: Callable,
    n_boot: int = 1000,
    seed: int = SEED,
    alpha: float = 0.05,
) -> tuple[float, float]:
    """
    Compute bootstrap (1-alpha) confidence interval for a metric.
    Returns (lower, upper).
    """
    rng = np.random.RandomState(seed)
    n = len(y_true)
    scores = np.empty(n_boot)
    for i in range(n_boot):
        idx = rng.randint(0, n, size=n)
        try:
            scores[i] = metric_fn(y_true[idx], y_pred[idx])
        except ValueError:
            scores[i] = np.nan
    lo = float(np.nanpercentile(scores, 100 * alpha / 2))
    hi = float(np.nanpercentile(scores, 100 * (1 - alpha / 2)))
    return lo, hi


# ── Adjacency error share (ordinal targets) ────────────────────────────
def adjacent_error_share(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    order: list[str] | None = None,
) -> float:
    """
    Fraction of mis-predictions that are exactly one ordinal step away.
    """
    if order is None:
        order = TARGET_ORDER
    rank = {c: i for i, c in enumerate(order)}
    wrong_mask = y_true != y_pred
    if wrong_mask.sum() == 0:
        return 1.0  # no errors
    diffs = np.abs(
        np.array([rank.get(v, -1) for v in y_true[wrong_mask]])
        - np.array([rank.get(v, -1) for v in y_pred[wrong_mask]])
    )
    return float((diffs == 1).sum() / wrong_mask.sum())


# ── Plotting helpers ───────────────────────────────────────────────────
def plot_confusion_matrices(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: list[str] | None = None,
    save_path: str | None = None,
) -> plt.Figure:
    """
    Plot raw-count and row-normalised confusion matrices side by side.
    """
    if labels is None:
        labels = TARGET_ORDER
    cm_raw = confusion_matrix(y_true, y_pred, labels=labels)
    cm_norm = confusion_matrix(y_true, y_pred, labels=labels, normalize="true")

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    sns.heatmap(
        cm_raw,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        ax=axes[0],
    )
    axes[0].set_title("Confusion Matrix (counts)")
    axes[0].set_ylabel("True")
    axes[0].set_xlabel("Predicted")

    sns.heatmap(
        cm_norm,
        annot=True,
        fmt=".2%",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        ax=axes[1],
    )
    axes[1].set_title("Confusion Matrix (row-normalised)")
    axes[1].set_ylabel("True")
    axes[1].set_xlabel("Predicted")

    plt.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight")
    return fig


def plot_roc_curves(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    classes: list[str] | np.ndarray | None = None,
    labels: list[str] | None = None,
    save_path: str | None = None,
) -> plt.Figure:
    """Per-class One-vs-Rest ROC curves."""
    if classes is None:
        classes = sorted(np.unique(y_true))
    if labels is None:
        labels = TARGET_ORDER
    fig, ax = plt.subplots(figsize=(8, 6))
    class_list = list(classes)
    for cls in labels:
        if cls in class_list:
            col_idx = class_list.index(cls)
            y_bin = (np.array(y_true) == cls).astype(int)
            fpr, tpr, _ = roc_curve(y_bin, y_proba[:, col_idx])
            auc_val = roc_auc_score(y_bin, y_proba[:, col_idx])
            ax.plot(fpr, tpr, label=f"{cls} (AUC={auc_val:.3f})")
    ax.plot([0, 1], [0, 1], "k--", alpha=0.4)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("Per-class OvR ROC Curves")
    ax.legend()
    plt.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches="tight")
    return fig
