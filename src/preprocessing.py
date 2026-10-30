"""
Preprocessing: build a reusable ColumnTransformer + full pipeline.
Everything learned from data (imputer stats, scaler params, encoder
categories) is fitted inside the pipeline on training data only.
"""
from __future__ import annotations

from typing import Callable
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    OneHotEncoder,
    StandardScaler,
)

from src.cleaning import clean_for_pipeline
from src.features import passthrough_features


def build_preprocessor(
    numeric_cols: list[str],
    categorical_cols: list[str],
) -> ColumnTransformer:
    """
    Return a ColumnTransformer with separate numeric and categorical branches.

    Numeric : median impute (+ indicator) -> standard-scale.
    Categorical : constant-fill 'missing' -> one-hot encode.
    """
    numeric_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(strategy="constant", fill_value="missing"),
            ),
            (
                "encoder",
                OneHotEncoder(
                    handle_unknown="infrequent_if_exist",
                    min_frequency=0.01,
                    sparse_output=False,
                ),
            ),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, numeric_cols),
            ("cat", categorical_pipe, categorical_cols),
        ],
        remainder="drop",
    )


def build_full_pipeline(
    numeric_cols: list[str],
    categorical_cols: list[str],
    model,
    feature_fn: Callable[[pd.DataFrame], pd.DataFrame] | None = None,
) -> Pipeline:
    """
    Full pipeline: clean -> feature-engineer -> preprocess -> model.

    The cleaning and feature steps are stateless FunctionTransformers
    so the pipeline works identically at train and predict time.
    """
    if feature_fn is None:
        feature_fn = passthrough_features

    preprocessor = build_preprocessor(numeric_cols, categorical_cols)
    return Pipeline(
        steps=[
            (
                "clean",
                FunctionTransformer(clean_for_pipeline, validate=False),
            ),
            (
                "features",
                FunctionTransformer(feature_fn, validate=False),
            ),
            ("prep", preprocessor),
            ("model", model),
        ]
    )
