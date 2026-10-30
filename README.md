# 🕷️ Spider-Man Incident Priority Classification & Dispatch System

[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://tcb-ml-task.streamlit.app/)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.9.1-orange.svg)](https://scikit-learn.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An end-to-end, leak-free, reproducible machine learning system designed to predict emergency dispatch priority (`Low`, `Medium`, or `High`) for Spider-Man incidents across New York City. The project features modular data pipelines, rigorous cross-validation, hyperparameter tuning across multiple model architectures, permutation feature importance, ordinal error analysis, and an interactive production web demo on Streamlit Community Cloud.

🔗 **Live Interactive Application**: **[https://tcb-ml-task.streamlit.app/](https://tcb-ml-task.streamlit.app/)**

---

## 📋 Table of Contents
1. [What is This Project?](#-what-is-this-project)
2. [Live Interactive Demo](#-live-interactive-demo)
3. [Final Verified Test-Set Metrics](#-final-verified-test-set-metrics)
4. [How It Works (System Architecture)](#-how-it-works-system-architecture)
5. [Models Explored & Evaluated](#-models-explored--evaluated)
6. [Why Tuned Logistic Regression Was Selected](#-why-tuned-logistic-regression-was-selected)
7. [Feature Importance & Key Predictors](#-feature-importance--key-predictors)
8. [Error Analysis & Reliability Guarantees](#-error-analysis--reliability-guarantees)
9. [Repository Structure](#-repository-structure)
10. [Local Setup & Quickstart](#-local-setup--quickstart)
11. [Reproducibility & Verification](#-reproducibility--verification)

---

## 🎯 What is This Project?

In a high-density metropolitan area like New York City, emergency dispatchers receive continuous streams of incident reports involving super-villain activity, infrastructure sabotage, armed heists, and civil disruptions. Because hero response resources are finite, incidents must be accurately and instantly prioritized:

* **`Low` Priority**: Minor disruptions, property damage contained, zero civilians in immediate danger, NYPD holding perimeter.
* **`Medium` Priority**: Armed robberies, localized villain skirmishes, vehicle pursuits requiring rapid containment.
* **`High` Priority**: Catastrophic threats (e.g., reactor sabotage, major villain escapes, mass civilian jeopardy) demanding immediate Spider-Man intervention.

### Dataset Overview
* **Source**: `spiderman_incident_priority_dataset.csv` (1,600 verified incidents, 12 operational features).
* **Target Feature**: `response_priority` (Ordinal multi-class: `Low < Medium < High`).
* **Severe Class Imbalance (5:1 Ratio)**:
  * `Medium`: 1,125 incidents (**70.3%**)
  * `High`: 250 incidents (**15.6%**)
  * `Low`: 225 incidents (**14.1%**)

Because a naive dummy model predicting only `Medium` achieves **70.31% Accuracy** while completely missing every critical `High` emergency (0% recall), standard accuracy is a dangerous metric. We evaluate and optimize all models on **Macro-Averaged F1-Score** and **Quadratic Weighted Kappa**.

---

## 🌐 Live Interactive Demo

Test the model in real time using the deployed Streamlit web application:

👉 **[https://tcb-ml-task.streamlit.app/](https://tcb-ml-task.streamlit.app/)**

### Web App Capabilities:
* **Interactive Dispatch Panel**: Sliders and dropdowns for villain, location, incident type, civilian count, property damage, escape risk, and environmental factors.
* **Instant Inference (< 15 ms)**: Pipeline cached with `@st.cache_resource` for zero-latency execution.
* **Visual Confidence Distribution**: Real-time probability bar chart breaking down model confidence across `Low`, `Medium`, and `High` priority tiers.
* **High-Contrast Safety Badges**: Clear visual status indicator for dispatch operations.

---

## 📊 Final Verified Test-Set Metrics

The holdout test partition (20%, 320 unseen incidents) remained **cryptographically locked** (`SHA-256: a44578e1...`) and untouched until model selection was finalized in `reports/selection_locked.json`.

<!-- METRICS:START -->
### Final Test-Set Metrics

| Model | Accuracy | Bal. Acc. | Macro-F1 | Weighted-F1 | ROC-AUC | MCC |
|-------|----------|-----------|----------|-------------|---------|-----|
| DummyMostFrequent | 0.7031 | 0.3333 | 0.2752 | 0.5806 | 0.5000 | 0.0000 |
| LogisticRegression_default | 0.8688 | 0.7785 | 0.8101 | 0.8649 | 0.9606 | 0.7021 |
| LogisticRegression ⭐ | 0.8781 | 0.8385 | 0.8356 | 0.8782 | 0.9607 | 0.7370 |
| RandomForest | 0.7906 | 0.7111 | 0.7129 | 0.7905 | 0.8917 | 0.5446 |
| HistGradientBoosting | 0.8063 | 0.7704 | 0.7490 | 0.8094 | 0.9265 | 0.6000 |
| KNN | 0.7250 | 0.4807 | 0.5140 | 0.6869 | 0.7191 | 0.2883 |

**Chosen model**: LogisticRegression

**95% Bootstrap Confidence Intervals:**

| Metric | Point Estimate | 95% CI |
|--------|---------------|--------|
| f1_macro | 0.8356 | [0.7851, 0.8801] |
| accuracy | 0.8781 | [0.8438, 0.9125] |
| balanced_accuracy | 0.8385 | [0.7849, 0.8901] |
<!-- METRICS:END -->

### Ordinal Metrics of Selected Model:
* **Quadratic Weighted Kappa**: **`0.7957`** (Substantial agreement across ordinal tiers).
* **Adjacent Error Share**: **`1.0000`** (**100% of errors were off by only one tier**; 0 catastrophic errors between `Low` and `High`).
* **Multi-Class ROC-AUC (OvR Macro)**: **`0.9607`**.

---

## ⚙️ How It Works (System Architecture)

The system enforces strict data boundaries to eliminate data leakage and guarantee reproducibility:

```
[ Raw Incident Intake / JSON Payload ]
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│  Stateless Structural Cleaner (src/cleaning.py)        │
│  • Strip whitespace, standardize category casing       │
│  • Standardize sentinel missing values ("", "?", "NA") │
│  • Enforce schema constraints (no value estimation)    │
└────────────────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│  Scikit-Learn ColumnTransformer (src/preprocessing.py) │
│  • Numeric (5 cols): SimpleImputer(median) + Scaler    │
│  • Categorical (7 cols): Imputer + OneHotEncoder       │
│    (handle_unknown='infrequent_if_exist')              │
│  • Fit strictly on training folds only (zero leakage)  │
└────────────────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│  Tuned Multinomial Logistic Regression (src/models.py) │
│  • C = 63.95, L2 Regularization, lbfgs solver          │
│  • Calibrated Multi-Class Probability Output           │
└────────────────────────────────────────────────────────┘
                  │
                  ▼
[ Output: Priority Tier (Low/Med/High) + Confidence Distribution ]
```

---

## 🔬 Models Explored & Evaluated

We conducted a disciplined comparison across six model candidates using 5-fold cross-validation repeated across 3 seeds (15 validation sets total), scored on `f1_macro`:

1. **DummyClassifier (Most Frequent Baseline)**:
   * Strategy: Always predicts majority class (`Medium`).
   * CV Macro-F1: `0.2752` | Test Accuracy: `70.31%`.
   * Serves as the minimal performance threshold.
2. **LogisticRegression (Default Baseline)**:
   * Untuned parameters ($C=1.0$).
   * CV Macro-F1: `0.8185 ± 0.0192` | Test Macro-F1: `0.8101`.
3. **Tuned Logistic Regression ⭐ (Selected Winner)**:
   * Hyperparameters tuned via `RandomizedSearchCV`: $C \approx 63.95$, L2 penalty.
   * CV Macro-F1: **`0.8334 ± 0.0176`** | Test Macro-F1: **`0.8356`** | Test Accuracy: **`87.81%`**.
4. **HistGradientBoostingClassifier**:
   * Tuned learning rate, max leaves, and minimum samples per leaf.
   * CV Macro-F1: `0.7522 ± 0.0379` | Test Macro-F1: `0.7490`.
5. **RandomForestClassifier**:
   * Tuned 200–600 trees, max depth (8 to 24), and split criteria.
   * CV Macro-F1: `0.7151 ± 0.0290` | Test Macro-F1: `0.7129`.
6. **K-Nearest Neighbors (KNN)**:
   * Tuned via `GridSearchCV` over $k \in [3..31]$, distance weighting, and metric.
   * CV Macro-F1: `0.5223 ± 0.0404` | Test Macro-F1: `0.5140`.

---

## 🏆 Why Tuned Logistic Regression Was Selected

1. **Additive Operational Dynamics**: Emergency response priority is fundamentally an additive function of cumulative threat levels (`property_damage_level`, `villain_escape_risk`, `civilians_at_risk`, `spider_sense_alert`). A regularized linear decision boundary captures this monotonic additive behavior naturally.
2. **Overfitting in Non-Linear Ensembles**: On this sample size (1,280 training samples), tree ensembles (Random Forest and Gradient Boosting) suffered from severe train-validation gaps: they achieved **~0.95 Macro-F1 on training sets but dropped to ~0.71–0.75 on validation sets**, overfitting to the 70% majority class. Logistic Regression exhibited virtually zero generalization gap (Train F1 `0.880` vs CV F1 `0.833` vs Test F1 `0.835`).
3. **Curse of Dimensionality in KNN**: After one-hot encoding 7 categorical features, the feature space expanded to 35+ dimensions, diluting Euclidean distances and causing KNN to perform poorly.
4. **Well-Calibrated Probabilities**: Logistic regression outputs smooth, calibrated posterior probabilities, which are essential for human dispatchers when triaging borderline cases.

---

## 🔍 Feature Importance & Key Predictors

Permutation importance analysis on the locked test set (measuring drop in Macro-F1 when a feature is randomly shuffled) revealed the core drivers of priority:

| Rank | Feature | Mean Macro-F1 Drop | Standard Deviation | Key Insight |
|:---:|:---|:---:|:---:|:---|
| 1 | `incident_type` | **0.2694** | 0.0268 | Primary indicator (e.g. Reactor Sabotage vs Robbery) |
| 2 | `location` | **0.1235** | 0.0198 | High-density boroughs drastically elevate response |
| 3 | `property_damage_level` | **0.1169** | 0.0071 | Direct proxy for physical destruction magnitude |
| 4 | `villain_escape_risk` | **0.1113** | 0.0199 | Flight risk compounds urgency |
| 5 | `villain` | **0.1020** | 0.0247 | High-threat adversaries (Green Goblin, Doc Ock) |
| 6 | `web_trap_strength` | **0.0922** | 0.0229 | Measure of initial containment viability |
| 7 | `spider_sense_alert` | **0.0800** | 0.0167 | Biological early warning signal |
| 8 | `backup_status` | **0.0371** | 0.0176 | Availability of local law enforcement |
| 9 | `weather` | **0.0328** | 0.0094 | Environmental swinging / mobility penalty |
| 10 | `civilians_at_risk` | **0.0227** | 0.0111 | Number of innocents in blast radius |
| 11 | `response_delay_minutes` | **0.0177** | 0.0137 | Estimated intake queue delay |
| 12 | `time_of_day` | **0.0123** | 0.0095 | Diurnal traffic and patrol cycles |

---

## 🛡️ Error Analysis & Reliability Guarantees

In real-world emergency dispatching, not all classification errors carry equal penalty:
* **Adjacent Error** (e.g., predicting `Medium` for a `High` incident): Suboptimal, but manageable through triage flags.
* **Catastrophic Error** (predicting `Low` for a `High` incident): Critical safety failure.

### Verified Error Properties on 320 Test Cases:
* **Total Errors**: 39 out of 320 cases (**12.19% error rate / 87.81% accuracy**).
* **Adjacent Error Share**: **`1.0000` (100.0%)** — **Zero catastrophic non-adjacent errors occurred.**
* **Primary Confusion Pair**: `High` $\rightarrow$ `Medium` (12 instances, 24% of true Highs). These cases featured lower civilian counts where physical damage indicators were borderline.
* **Confidence on Correct vs Errors**:
  * Mean model confidence on **correct** predictions: **`0.9284`**
  * Mean model confidence on **errors**: **`0.7595`**
  * *Operational Policy*: Tickets with confidence below 80% can be automatically routed to human dispatchers for secondary verification.

---

## 📂 Repository Structure

```
tcb_ml/
├── app/
│   └── app.py                                   # Streamlit interactive dispatch application
├── streamlit_app.py                             # Root entrypoint for Streamlit Community Cloud
├── data/
│   ├── spiderman_incident_priority_dataset.csv  # Cleaned dataset copy (1600 rows × 14 cols)
│   └── spiderman_incident_priority_dataset.xlsx # Original source dataset (pristine)
├── models/
│   ├── best_model.joblib                        # Serialized scikit-learn Pipeline (3.8 KB)
│   └── model_metadata.json                      # Schemas, training specs & package versions
├── reports/
│   ├── figures/                                 # 13 high-resolution diagnostic plots (150 DPI)
│   │   ├── cat_incident_type_vs_target.png
│   │   ├── confusion_matrix.png
│   │   ├── correlation_heatmap.png
│   │   ├── learning_curve.png
│   │   ├── model_comparison_bar.png
│   │   ├── permutation_importance.png
│   │   ├── roc_curves.png
│   │   └── target_distribution.png
│   ├── best_params.json                         # Tuned model hyperparameters
│   ├── cleaning_log.csv                         # Pre-split cleaning audit log
│   ├── error_analysis_facts.md                  # Confusion pairs & confidence breakdown
│   ├── facts_for_justification.md               # Pre-computed facts for written justification
│   ├── final_test_metrics.json                  # Final holdout test metrics & 95% CIs
│   ├── leakage_audit.csv                        # Feature leakage audit diagnostics
│   ├── model_comparison_cv.csv                  # 15-fold cross-validation scores
│   ├── model_comparison_test.csv                # Held-out test set comparison across 6 models
│   ├── selection_locked.json                    # Immutable pre-evaluation selection lock
│   ├── split_indices.json                       # Train/test split indices & test SHA-256
│   └── test_predictions.csv                     # Predictions & probabilities on test set
├── scripts/
│   ├── test_app.py                              # Streamlit AppTest & live health check validator
│   ├── update_readme_metrics.py                 # Syncs test metrics from JSON into README
│   └── verify_results.py                        # Automated audit suite (all 12 checks pass)
├── src/
│   ├── __init__.py
│   ├── cleaning.py                              # Stateless, idempotent data cleaner
│   ├── config.py                                # SEED=42, paths, ordinal target definition
│   ├── evaluation.py                            # Multi-class & ordinal evaluation routines
│   ├── features.py                              # Feature transforms & ablation logic
│   ├── models.py                                # Baselines, candidates & hyperparameter grids
│   └── preprocessing.py                         # Leakage-free ColumnTransformer & Pipeline
├── spiderman_incident_priority.ipynb            # Fully executed notebook with all outputs & plots
├── requirements.txt                             # Pinned direct dependencies
├── README.md                                    # Comprehensive project documentation
├── DEPLOY.md                                    # Streamlit Community Cloud deployment guide
└── .gitignore                                   # Standard exclusions
```

---

## 💻 Local Setup & Quickstart

### Prerequisites
* Python 3.10, 3.11, 3.12, 3.13, or 3.14
* Git

### Installation

#### Windows (PowerShell)
```powershell
# Clone repository
git clone https://github.com/selotechaitanya-svg/tcb_ml.git
cd tcb_ml

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install exact dependencies
pip install -r requirements.txt
```

#### macOS / Linux (bash)
```bash
# Clone repository
git clone https://github.com/selotechaitanya-svg/tcb_ml.git
cd tcb_ml

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install exact dependencies
pip install -r requirements.txt
```

### Launch the Interactive Web App Locally
```bash
streamlit run app/app.py
```
Open your browser at `http://localhost:8501`.

---

## 🔁 Reproducibility & Verification

Every result reported in this repository is deterministic and programmatically verifiable.

### 1. Execute the Automated Verification Suite
Run the compliance verification script to validate all 12 system invariants:
```bash
python scripts/verify_results.py
```
**Observed Execution Output**:
```text
[PASS]: Train/test indices disjoint -- 1280 train, 320 test
[PASS]: No identical feature rows shared between train and test -- shared hashes: 0
[PASS]: Test-set SHA-256 hash matches stored hash -- computed=a44578e1c62448a4... stored=a44578e1c62448a4...
[PASS]: selection_locked.json exists
[PASS]: final_test_metrics.json exists
[PASS]: Lock file timestamp is earlier than or equal to final metrics file -- lock_mtime=1793298878.64, final_mtime=1793298884.89
[PASS]: Reloaded model accuracy matches JSON (tol=1e-9) -- reloaded=0.878125, json=0.878125
[PASS]: Reloaded model F1-macro matches JSON (tol=1e-9) -- reloaded=0.835635, json=0.835635
[PASS]: README accuracy matches reloaded model (tol=1e-4) -- reloaded=0.8781, readme=0.8781
[PASS]: README F1-macro matches reloaded model (tol=1e-4) -- reloaded=0.8356, readme=0.8356
[PASS]: Class order in metadata matches TARGET_ORDER -- metadata=['Low', 'Medium', 'High'], config=['Low', 'Medium', 'High']
[PASS]: X_test/y_test referenced only in split and post-lock cells -- clean
[PASS]: No TODO/TBD/lorem text in code files -- clean
SUCCESS: All verification checks passed!
```

### 2. Verify Streamlit Application End-to-End
Run the headless component and server integration tests:
```bash
python scripts/test_app.py
```
**Observed Execution Output**:
```text
Testing with streamlit.testing.v1.AppTest...
[PASS] AppTest initialized successfully without errors.
[PASS] AppTest predict action completed successfully without errors.

Testing live server launch...
[PASS] Live server health check returned status 200 at http://localhost:8501/_stcore/health
[PASS] Headless server cleanly terminated.

[SUCCESS] All Streamlit app tests passed!
```

### 3. Re-Execute Notebook End-to-End
To re-run the complete training, cross-validation, and holdout evaluation pipeline:
```bash
jupyter nbconvert --to notebook --execute --inplace spiderman_incident_priority.ipynb --ExecutePreprocessor.timeout=3600
```
Total notebook execution time: **~1.5 minutes** on CPU.
