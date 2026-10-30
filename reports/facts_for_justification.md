# Dataset and Modelling Facts for Justification

- Total Dataset Size (Cleaned): `1600` rows × `13` columns
- Active Predictors: `5` numeric, `7` categorical
- Class Frequencies: `{'Medium': np.int64(1125), 'High': np.int64(250), 'Low': np.int64(225)}`
- Class Imbalance Ratio: `5.00`
- Baseline CV Macro-F1: `0.8065`
- Selected Architecture: `LogisticRegression`
- Chosen Model CV Macro-F1: `0.8334 ± 0.0176`
- Chosen Model Test Macro-F1: `0.8356`
- Chosen Model Test Accuracy: `0.8781`
- Leakage Decisions: `response_delay_minutes` retained as plausible dispatch estimate, pending operational signoff.