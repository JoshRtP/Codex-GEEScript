# Management detection notes: cover crop and tillage

This repo now includes **proxy layers** for cover crop and tillage detection.

## What is included
- `gee/01_build_feature_stack_v3.js`
  - adds `cover_crop_freq_proxy`
  - adds spring/fall greenness metrics for off-season living cover
  - adds `reduced_till_likelihood_proxy`
  - adds `intensive_till_likelihood_proxy`
- `python/06_management_detection.py`
  - converts field-level predictor summaries into proxy scores, classes, and confidence values

## Important limitation
These are **remote-sensing proxies**, not definitive proof of practice implementation.

### Cover crops
Remote sensing can often identify likely off-season green cover, but it may confuse:
- volunteer growth
- weeds
- perennial vegetation on field edges
- winter wheat or double-crop systems
- timing artifacts from cloud gaps

### Tillage
Optical imagery alone does **not reliably observe implement passes, speed, or depth**.
It can sometimes infer likely residue retention or spring bare-soil exposure, which is useful for:
- screening
- prioritizing inspections
- model covariates
- risk flags

It is **not enough by itself** for an audit-grade determination of reduced till versus conventional till.

## Recommended MRV posture
Use these layers as one component in a hierarchy:

1. **Primary evidence**
   - farmer-reported practice records
   - contracts / attestations
   - seed receipts for cover crops
   - implement logs or machine telemetry where available
   - photos or geotagged evidence
2. **Secondary evidence**
   - remote-sensing proxy scores from this repo
3. **QA / risk review**
   - flag fields where remote sensing materially disagrees with reported practice

## Suggested field outputs
For each field, store:
- `cover_crop_proxy_class`
- `cover_crop_proxy_score`
- `cover_crop_proxy_confidence`
- `tillage_proxy_class`
- `tillage_proxy_margin`
- `tillage_proxy_confidence`
- `management_evidence_source` (reported / remote_sensed / mixed / inspected)
- `management_review_flag`

## Recommended use in the SOC model
These management proxies can be used as:
- predictors in the SOC DSM model
- stratification variables for sampling
- QA layers for portfolio review
- candidate priors for a later fused management model

## Recommended use for VT0014 / Verra-style work
Do **not** treat these proxies alone as final practice evidence. Treat them as:
- covariates
- plausibility checks
- uncertainty or risk inputs
