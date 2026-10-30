# Spider-Man Incident Priority Classification System
## 2nd-Year Machine Learning Coursework Project Report

---

### Project Metadata
* **Student Name / Repository**: [selotechaitanya-svg / tcb_ml](https://github.com/selotechaitanya-svg/tcb_ml)
* **Live Interactive Application**: [https://tcb-ml-task.streamlit.app/](https://tcb-ml-task.streamlit.app/)
* **Target Feature**: `response_priority` (`Low < Medium < High`)
* **Champion Model**: Tuned Multinomial Logistic Regression ($C \approx 63.95$)
* **Final Test Macro-F1**: **`0.8356`** (95% CI: `[0.7851, 0.8801]`)
* **Final Test Accuracy**: **`87.81%`** (95% CI: `[0.8438, 0.9125]`)

---

## 1. Problem Statement & Domain Context

In metropolitan emergency dispatch, response operators receive continuous incident reports involving super-villain confrontations, civil hostage emergencies, lab break-ins, and infrastructure sabotage across New York City. Because superhero response capacity is finite and costly, incidents must be accurately and instantly prioritized:

* **Low Priority**: Minor skirmishes, localized property damage, zero civilian casualties, NYPD maintaining perimeter.
* **Medium Priority**: Armed robberies, localized villain skirmishes, vehicle pursuits requiring rapid containment.
* **High Priority**: Catastrophic emergencies (reactor sabotage, biohazard threats, multiple civilians in jeopardy) demanding immediate Spider-Man intervention.

### Dataset Overview & Imbalance
* **Dataset**: `spiderman_incident_priority_dataset.csv` (1,600 verified incidents, 12 operational features).
* **Severe 5:1 Class Imbalance**:
  * `Medium`: 1,125 incidents (**70.31%**)
  * `High`: 250 incidents (**15.63%**)
  * `Low`: 225 incidents (**14.06%**)

Evaluating models solely on standard accuracy is dangerous because a trivial majority-class model achieves 70.31% accuracy while completely missing 100% of life-threatening emergencies (0% recall). Therefore, models must be optimized and evaluated on **Macro-Averaged F1-Score**, **Balanced Accuracy**, and **Quadratic Weighted Kappa**.

---

## 2. Data Preparation & Leakage Prevention Protocol

To guarantee absolute real-world validity and eliminate data leakage, the engineering workflow adhered to four strict architectural constraints:

1. **Stateless Structural Pre-Split Cleaning** (`src/cleaning.py`):
   Whitespace trimming, casing standardization, datetime decomposition, and mapping sentinel missing tokens (`"?"`, `"N/A"`) to `NaN`. No statistical parameters (medians, modes, scaling factors) were computed before data splitting.
2. **Encapsulated Scikit-Learn Pipeline** (`src/preprocessing.py`):
   All value-dependent transformations (median imputation and `StandardScaler` for 5 numerical features; constant imputation and `OneHotEncoder(handle_unknown='infrequent_if_exist')` for 7 categorical features) were encapsulated in a `ColumnTransformer` fit strictly on training splits only.
3. **Cryptographic Holdout Lock**:
   A 20% holdout test partition (320 incidents) was isolated using stratified sampling (`SEED=42`), hashed via SHA-256 (`a44578e1...`), and remained untouched until all tuning and model selection decisions were finalized in `reports/selection_locked.json`.
4. **Handling Imbalance Without Artificial Resampling**:
   Resampling techniques like SMOTE were rejected to avoid distorting high-dimensional categorical manifolds. Class imbalance was addressed algorithmically using cost-sensitive learning (`class_weight='balanced'`) and macro-averaged metrics.

---

## 3. Model Benchmarking & Experimental Results

We tuned four distinct candidate architectures alongside two reference baselines across 15 repeated cross-validation folds (`RepeatedStratifiedKFold`, 5 splits × 3 repeats). Performance was evaluated on the locked holdout test set:

| Model Architecture | Accuracy | Balanced Accuracy | Macro-F1 | Weighted-F1 | ROC-AUC (OvR) | Quadratic Weighted Kappa |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **DummyClassifier (Most Frequent Baseline)** | 0.7031 | 0.3333 | 0.2752 | 0.5806 | 0.5000 | 0.0000 |
| **Logistic Regression (Default Baseline)** | 0.8688 | 0.7785 | 0.8101 | 0.8649 | 0.9606 | 0.7585 |
| **Tuned Logistic Regression ⭐ (Selected)** | **0.8781** | **0.8385** | **0.8356** | **0.8782** | **0.9607** | **0.7957** |
| **HistGradientBoosting** | 0.8063 | 0.7704 | 0.7490 | 0.8094 | 0.9265 | 0.6927 |
| **Random Forest** | 0.7906 | 0.7111 | 0.7129 | 0.7905 | 0.8917 | 0.6454 |
| **K-Nearest Neighbors (KNN)** | 0.7250 | 0.4807 | 0.5140 | 0.6869 | 0.7191 | 0.3610 |

### 95% Bootstrap Confidence Intervals (1,000 Resamples):
* **Test Macro-F1**: `0.8356` [`0.7851`, `0.8801`]
* **Test Accuracy**: `0.8781` [`0.8438`, `0.9125`]
* **Test Balanced Accuracy**: `0.8385` [`0.7849`, `0.8901`]

---

## 4. Model Justification: Why Logistic Regression Won

The selection of Tuned Multinomial Logistic Regression is justified by empirical diagnostics:

1. **Additive Physical Problem Dynamics**:
   Emergency threat level is fundamentally an additive function of cumulative risk indicators: property damage magnitude, villain escape risk, civilian population in danger, and biological spider-sense warnings. A regularized linear decision boundary models this additive compounding naturally without forcing artificial decision splits.
2. **Resistance to Overfitting**:
   On 1,280 training samples, Random Forest and HistGradientBoosting exhibited massive generalization gaps: achieving `~0.95` Macro-F1 on training folds but collapsing to `~0.71–0.75` on validation folds due to memorizing the 70% majority class. Logistic Regression showed virtually zero gap (Train F1 = `0.880` vs CV F1 = `0.833` vs Test F1 = `0.835`).
3. **Curse of Dimensionality in KNN**:
   One-hot encoding 7 categorical features expanded the feature space to over 35 dimensions, rendering Euclidean distances equidistant and causing KNN to degrade to `0.5140` Macro-F1.
4. **Calibrated Posterior Probabilities**:
   Logistic regression outputs smooth, well-calibrated class probabilities, which are essential for human dispatchers when triaging borderline cases.
5. **Model Limitations**:
   Logistic Regression assumes monotonic linearity in transformed feature space and cannot discover complex, non-linear multi-way feature interactions if threat mechanics change drastically in the future.

---

## 5. Error Analysis & Ordinal Guarantees

In emergency operations, confusing High with Medium is manageable through dispatch review, whereas confusing High with Low is catastrophic. Our model provides the following verified error guarantees:

* **Adjacent Error Share = 1.0000 (100.0%)**:
  Across all 39 test errors (out of 320 cases), 100% occurred strictly between adjacent priority ranks (`High` $\leftrightarrow$ `Medium` or `Medium` $\leftrightarrow$ `Low`). Zero catastrophic non-adjacent errors occurred.
* **Primary Confusion Pair**:
  `High` $\rightarrow$ `Medium` accounted for 12 instances (24.0% of true High cases). Inspection reveals these cases involved severe villains (e.g., Doctor Octopus, Green Goblin) located in commercial areas where civilian count and property damage were low.
* **Confidence Calibrations**:
  Mean confidence on correct predictions was **`0.9284`** compared to **`0.7595`** on misclassifications. This enables an automated triage rule: tickets with confidence under 80% are automatically routed to human dispatchers for confirmation.

---

## 6. Key Feature Importance (Permutation Impact)

Permutation feature importance measured on the locked test set (quantifying average drop in Macro-F1 upon feature shuffling):

1. **`incident_type` (Drop: 0.2694)**: The single most predictive feature (Reactor Sabotage vs Robbery).
2. **`location` (Drop: 0.1235)**: Borough population density directly scales incident severity.
3. **`property_damage_level` (Drop: 0.1169)**: Direct physical proxy for structural destruction.
4. **`villain_escape_risk` (Drop: 0.1113)**: Compounding flight urgency.
5. **`villain` (Drop: 0.1020)**: Specific threat capability of the perpetrator.
6. **`web_trap_strength` (Drop: 0.0922)**: Measure of initial containment viability.
7. **`spider_sense_alert` (Drop: 0.0800)**: Biological early warning signal.

---

## 7. Production Web Deployment on Streamlit

The model was serialized (`models/best_model.joblib`, 3.8 KB) and deployed as an interactive emergency response web portal on Streamlit Community Cloud:

* **Live URL**: [https://tcb-ml-task.streamlit.app/](https://tcb-ml-task.streamlit.app/)
* **Performance**: Sub-15ms inference latency powered by `@st.cache_resource` model caching.
* **Safety Features**: Input validation, high-contrast priority badges, and interactive multi-class probability bar charts for operational triage.

---

## 8. Summary of Submission Deliverables

* **GitHub Code Repository**: [https://github.com/selotechaitanya-svg/tcb_ml](https://github.com/selotechaitanya-svg/tcb_ml)
* **Live Web App Demo**: [https://tcb-ml-task.streamlit.app/](https://tcb-ml-task.streamlit.app/)
* **Word Document Report**: `PROJECT_REPORT.docx` (available in repository root)
* **Main Executable Notebook**: `spiderman_incident_priority.ipynb` (all outputs & visualizations executed)
* **Verification Command**: `python scripts/verify_results.py` (All 12 checks PASS)
