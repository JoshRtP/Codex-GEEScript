# QA/QC Checklist

## Sample data
- [ ] Coordinates are valid and inside project extent
- [ ] Depth units are standardized to cm
- [ ] SOC is in percent by mass
- [ ] Bulk density is in g/cm3
- [ ] Rock fragment fraction is complete or justified if defaulted
- [ ] Duplicate sample IDs removed

## Predictors
- [ ] Band names documented
- [ ] CRS and resolution recorded
- [ ] Temporal window documented
- [ ] Potential leakage predictors reviewed
- [ ] No target-derived predictors included without justification

## Modeling
- [ ] Response variable formula documented
- [ ] Spatial CV used instead of random CV
- [ ] Fold assignments preserved
- [ ] Diagnostics exported
- [ ] Uncertainty workflow documented

## Mapping
- [ ] Prediction domain defined
- [ ] Extrapolation risk reviewed
- [ ] Pixel output units checked
- [ ] Field aggregation rules documented
