"""
Streamlit app for Spider-Man Incident Priority prediction.
Loads the saved pipeline and metadata, presents input widgets,
and shows the predicted priority with probability bar chart.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import streamlit as st

# ── Paths ──────────────────────────────────────────────────────────────
APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parent
MODELS_DIR = PROJECT_ROOT / "models"

# Add project root to sys.path so src/ modules can be imported
sys.path.insert(0, str(PROJECT_ROOT))


@st.cache_resource
def load_model():
    """Load the trained pipeline and metadata."""
    model = joblib.load(MODELS_DIR / "best_model.joblib")
    with open(MODELS_DIR / "model_metadata.json") as f:
        metadata = json.load(f)
    return model, metadata


def check_sklearn_version(metadata: dict) -> None:
    """Warn if the current scikit-learn version differs from training."""
    import sklearn
    trained_version = metadata.get("sklearn_version", "unknown")
    if sklearn.__version__ != trained_version:
        st.warning(
            f"⚠️ scikit-learn version mismatch: trained with {trained_version}, "
            f"running with {sklearn.__version__}. Predictions may differ."
        )


def build_input_widgets(metadata: dict) -> dict:
    """Build Streamlit input widgets from the model metadata schema."""
    schema = metadata.get("input_schema", {})
    inputs = {}

    st.sidebar.header("🕷️ Incident Details")

    for col, info in schema.items():
        kind = info.get("kind", "numeric")

        if kind == "numeric":
            min_val = float(info.get("min", 0))
            max_val = float(info.get("max", 100))
            median_val = float(info.get("median", (min_val + max_val) / 2))
            # Use integer inputs for columns that are clearly integers
            if min_val == int(min_val) and max_val == int(max_val):
                inputs[col] = st.sidebar.number_input(
                    col.replace("_", " ").title(),
                    min_value=int(min_val),
                    max_value=int(max_val),
                    value=int(median_val),
                    step=1,
                )
            else:
                inputs[col] = st.sidebar.number_input(
                    col.replace("_", " ").title(),
                    min_value=min_val,
                    max_value=max_val,
                    value=median_val,
                    step=0.1,
                )

        elif kind == "categorical":
            categories = info.get("categories", ["Unknown"])
            inputs[col] = st.sidebar.selectbox(
                col.replace("_", " ").title(),
                options=categories,
            )

    return inputs


def main():
    st.set_page_config(
        page_title="🕷️ Spider-Man Incident Priority Predictor",
        page_icon="🕷️",
        layout="wide",
    )

    st.title("🕷️ Spider-Man Incident Priority Predictor")
    st.markdown(
        "Predict the **response priority** (Low / Medium / High) for a "
        "Spider-Man incident based on its characteristics."
    )

    # Load model
    try:
        model, metadata = load_model()
    except FileNotFoundError:
        st.error(
            "Model files not found! Run the notebook first to train and save the model."
        )
        return

    check_sklearn_version(metadata)

    # Build input widgets
    inputs = build_input_widgets(metadata)

    # Main area
    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Input Summary")
        input_df = pd.DataFrame([inputs])
        st.dataframe(input_df.astype(str).T.rename(columns={0: "Value"}))

    # Predict button
    if st.button("🔮 Predict Priority", type="primary", use_container_width=True):
        input_df = pd.DataFrame([inputs])

        try:
            prediction = model.predict(input_df)[0]
            probabilities = model.predict_proba(input_df)[0]
        except Exception as e:
            st.error(f"Prediction failed: {e}")
            return

        class_labels = metadata.get("class_labels", ["Low", "Medium", "High"])

        with col2:
            # Priority badge
            color_map = {"Low": "🟢", "Medium": "🟡", "High": "🔴"}
            badge = color_map.get(prediction, "⚪")
            st.subheader("Prediction")
            st.markdown(f"## {badge} {prediction}")

            # Probability bar chart
            st.subheader("Class Probabilities")
            prob_df = pd.DataFrame(
                {"Priority": class_labels, "Probability": probabilities}
            )
            st.bar_chart(prob_df.set_index("Priority"))

        # Model info
        with st.expander("ℹ️ Model Information"):
            test_metrics = metadata.get("final_test_metrics", {})
            st.markdown(f"**Model**: {metadata.get('model_name', 'Unknown')}")
            st.markdown(f"**Test Macro-F1**: {test_metrics.get('f1_macro', 'N/A'):.4f}" if isinstance(test_metrics.get('f1_macro'), (int, float)) else "**Test Macro-F1**: N/A")
            st.markdown(f"**Trained with**: scikit-learn {metadata.get('sklearn_version', 'Unknown')}")
            st.markdown(f"**Seed**: {metadata.get('seed', 'Unknown')}")


if __name__ == "__main__":
    main()
