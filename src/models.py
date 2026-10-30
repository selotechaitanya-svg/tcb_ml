"""
Model definitions and hyperparameter search spaces.
Every model receives random_state=SEED where applicable.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import loguniform
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier

from src.config import SEED


# ── Baselines ──────────────────────────────────────────────────────────
def get_baselines() -> dict:
    """Return a dict of baseline name -> estimator."""
    return {
        "DummyMostFrequent": DummyClassifier(
            strategy="most_frequent", random_state=SEED
        ),
        "LogisticRegression_default": LogisticRegression(
            max_iter=2000, random_state=SEED
        ),
    }


# ── Candidate models + param distributions ─────────────────────────────
def get_candidates() -> dict:
    """
    Return dict of model_name -> (estimator, param_dist, search_type).
    search_type is 'random' for RandomizedSearchCV or 'grid' for GridSearchCV.
    Param keys are prefixed with 'model__' for use inside a Pipeline.
    """
    return {
        "LogisticRegression": (
            LogisticRegression(max_iter=3000, random_state=SEED),
            {
                "model__C": loguniform(1e-3, 1e2),
                "model__class_weight": [None, "balanced"],
            },
            "random",
        ),
        "RandomForest": (
            RandomForestClassifier(random_state=SEED),
            {
                "model__n_estimators": [200, 400, 600],
                "model__max_depth": [None, 8, 12, 16, 24],
                "model__min_samples_split": [2, 5, 10],
                "model__min_samples_leaf": [1, 2, 4],
                "model__max_features": ["sqrt", "log2", 0.5],
                "model__class_weight": [
                    None,
                    "balanced",
                    "balanced_subsample",
                ],
            },
            "random",
        ),
        "HistGradientBoosting": (
            HistGradientBoostingClassifier(
                random_state=SEED,
                early_stopping=True,
                validation_fraction=0.1,
                n_iter_no_change=20,
            ),
            {
                "model__learning_rate": loguniform(0.01, 0.3),
                "model__max_iter": [200, 400, 600],
                "model__max_depth": [None, 3, 5, 8],
                "model__max_leaf_nodes": [15, 31, 63],
                "model__min_samples_leaf": [10, 20, 40],
                "model__l2_regularization": loguniform(1e-4, 10),
                "model__class_weight": [None, "balanced"],
            },
            "random",
        ),
        "KNN": (
            KNeighborsClassifier(),
            {
                "model__n_neighbors": list(range(3, 32, 2)),
                "model__weights": ["uniform", "distance"],
                "model__p": [1, 2],
            },
            "grid",
        ),
    }
