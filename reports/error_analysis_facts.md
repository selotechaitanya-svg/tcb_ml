# Error Analysis Factual Summary

## Top Confusion Pairs

- **High -> Medium**: 12 instances (24.0% of true High)
- **Medium -> High**: 11 instances (4.9% of true Medium)
- **Medium -> Low**: 9 instances (4.0% of true Medium)
- **Low -> Medium**: 7 instances (15.6% of true Low)

## Recall Per Class (Ranked)

- **Medium**: 0.9111
- **Low**: 0.8444
- **High**: 0.7600

## Prediction Confidence
- Mean Confidence (Correct Predictions): `0.9284`
- Mean Confidence (Errors): `0.7595`


## Permutation Feature Importance (Top Features)

| Feature | Mean Macro-F1 Drop | Std |
|---|---|---|
| incident_type | 0.2694 | 0.0268 |
| location | 0.1235 | 0.0198 |
| property_damage_level | 0.1169 | 0.0071 |
| villain_escape_risk | 0.1113 | 0.0199 |
| villain | 0.1020 | 0.0247 |
| web_trap_strength | 0.0922 | 0.0229 |
| spider_sense_alert | 0.0800 | 0.0167 |
| backup_status | 0.0371 | 0.0176 |
| weather | 0.0328 | 0.0094 |
| civilians_at_risk | 0.0227 | 0.0111 |
| response_delay_minutes | 0.0177 | 0.0137 |
| time_of_day | 0.0123 | 0.0095 |