# 🕷️ Spider-Man Incident Priority Classification

A complete, reproducible supervised-classification project that predicts **response priority** (Low / Medium / High) for Spider-Man incidents based on features like villain type, incident severity, location, and environmental conditions.

## Final Test-Set Metrics

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

## Problem & Dataset

- **Task**: Multi-class classification (3 classes: Low, Medium, High)
- **Dataset**: `spiderman_incident_priority_dataset.csv` — 1600 incidents with 12 features
- **Target**: `response_priority` (ordinal: Low < Medium < High)
- **Imbalance**: Medium (70.3%) dominates; High (15.6%) and Low (14.1%) are minority classes

## Repository Structure

```
spiderman-incident-priority/
├── data/                          # Dataset (CSV)
├── src/                           # Python modules
│   ├── config.py                  # SEED, constants, paths
│   ├── cleaning.py                # Stateless data cleaning
│   ├── features.py                # Feature engineering
│   ├── preprocessing.py           # sklearn Pipeline builder
│   ├── models.py                  # Model definitions & param grids
│   └── evaluation.py              # Metrics, CIs, plots
├── app/app.py                     # Streamlit demo app
├── scripts/
│   ├── verify_results.py          # Automated verification
│   └── update_readme_metrics.py   # Update README metrics
├── models/                        # Saved model & metadata
├── reports/                       # Figures, CSVs, JSONs
│   └── figures/                   # EDA and evaluation plots
├── spiderman_incident_priority.ipynb  # Main notebook
├── requirements.txt
├── README.md
├── DEPLOY.md
└── .gitignore
```

## Setup

**Python version**: Python 3.10+ (tested on 3.14.7)

### Windows (PowerShell)
```powershell
cd spiderman-incident-priority
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### macOS / Linux
```bash
cd spiderman-incident-priority
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Reproduce

```bash
# Execute the notebook (restart-and-run-all equivalent)
jupyter nbconvert --to notebook --execute --inplace spiderman_incident_priority.ipynb --ExecutePreprocessor.timeout=3600

# Update README metrics from generated JSON
python scripts/update_readme_metrics.py

# Run verification checks
python scripts/verify_results.py
```

**Expected runtime**: ~3–5 minutes on a laptop CPU.

**Expected outputs**: All files in `reports/`, `models/`, and the notebook with executed outputs.

## Run the App

```bash
streamlit run app/app.py
```

The app loads the saved model and lets you input incident details to predict priority with a probability chart.

## Methodology

1. **Cleaning**: Stateless structural cleaning (whitespace, case, placeholders, type validation). No data-dependent operations before the split.
2. **Split**: 80/20 stratified train/test split (seed=42). Test set locked until final evaluation.
3. **CV**: StratifiedKFold(5) for tuning; RepeatedStratifiedKFold(5,3) for fair comparison.
4. **Baselines**: DummyClassifier (most frequent), LogisticRegression (default).
5. **Models**: Tuned LogisticRegression, RandomForest, HistGradientBoosting, KNN.
6. **Tuning**: RandomizedSearchCV (n_iter=40) for all except KNN (GridSearchCV). Scoring: macro-F1.
7. **Metrics**: Accuracy, balanced accuracy, macro/weighted F1, ROC-AUC OvR, MCC, quadratic-weighted kappa.
8. **Leakage audit**: All features checked via single-feature decision tree and mutual information. `response_delay_minutes` flagged as NEEDS HUMAN REVIEW.
9. **Imbalance**: Handled with `class_weight` parameter and macro-averaged metrics (no SMOTE).

## Reproducibility

- **Seed**: `SEED = 42` used everywhere (random, numpy, all splitters and models)
- **PYTHONHASHSEED**: set to "42"
- **Pinned versions**: `requirements.txt` lists exact versions
- **Deterministic**: running the notebook twice produces identical `final_test_metrics.json`

## Model Justification

See the notebook section **"✍️ Model justification: WRITE THIS YOURSELF"** — this is for the reviewer to fill in.

## Live Demo

*[Placeholder: add your Streamlit Community Cloud URL here after deployment]*
