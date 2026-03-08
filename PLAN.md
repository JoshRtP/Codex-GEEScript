# Codex-GEEScript: Build Plan
**Project:** Tillage + Cover Crop Detection → Full SOC Mapping Pipeline  
**Region:** US Midwest — Corn / Soy / Winter Wheat rotation  
**GEE Project:** `gen-lang-client-0499108456`  
**Field Asset:** `projects/gen-lang-client-0499108456/assets/FieldMask_5070`  
**Status:** Approved — ready for implementation  
**Last updated:** March 8, 2026

---

## Root Cause: Why Current Detection Is Broken

| Issue | Detail |
|---|---|
| Missing NDTI + NDMI indices | `addIndices()` only computes NDVI, EVI, BSI — no residue or moisture index |
| No seasonal windowing | Only global date-range composites; no per-year fall/spring windows |
| No bare-soil mask | No `bare_mask` band → no spring bare frequency metric |
| Detection buttons unwired | "Cover Crop Analysis" and "Tillage Detection" are UI comment stubs, not functional `onClick` handlers |
| No management proxy computation | No annual proxy computation anywhere in the script |

---

## Confirmed Design Decisions

| Topic | Decision |
|---|---|
| Soil samples | None yet → proxy/covariate-only approach; scripts ship with hooks ready for when samples arrive |
| CDL ceiling | `CDL_LAST = 2025` (auto-fallback to 2024 if 2025 not yet published) |
| CDL history span | 2020–2025 |
| Seasonal windows | Fall: **Sep 1 – Nov 30** / Spring: **Feb 1 – May 15** (Midwest corn/soy/wheat) |
| S1 SAR | When SAR toggle on: add VV, VH, VH/VV ratio + GLCM texture (contrast, entropy from VV) to tillage proxy stack |
| GEE architecture | **Both**: enhanced interactive UI script + standalone batch pipeline export script |
| Python pipeline | Full pipeline — GEE + Python notebooks + all scripts |
| MRV posture | Management layers are **proxies**, not audit-grade direct observation; caveat language throughout |

---

## Repository Structure (Target)

```
Codex-GEEScript/
├── PLAN.md                          ← This file
├── README.md
├── configs/
│   └── config.yaml                  ← Pre-filled with your GEE assets, windows, crop codes
├── data_examples/
│   ├── field_boundaries_schema.geojson
│   └── soil_samples_schema.csv
├── docs/
│   ├── management_detection_notes.md
│   ├── model_card_template.md
│   ├── qaqc_checklist.md
│   └── sampling_protocol_template.md
├── gee/
│   ├── field_analytics_v1_reference.js   ← Current script (reference / baseline)
│   ├── field_analytics_v2.js             ← Phase 1: Enhanced UI script
│   ├── 01_build_feature_stack_v3.js      ← Phase 2: Standalone pipeline export
│   ├── 02_sample_training_points.js      ← Phase 3: Sample at soil points
│   ├── 03_score_map.js                   ← Phase 3: RF scoring (stub until samples ready)
│   └── 04_extract_pixels_to_fields.js    ← Phase 3: Pixel → field extraction
├── notebooks/
│   ├── 00_pipeline_overview.ipynb
│   ├── 01_clean_samples.ipynb
│   ├── 02_gee_workflow_guide.ipynb
│   ├── 03_make_spatial_blocks.ipynb
│   ├── 04_train_spatial_cv_v2.ipynb
│   ├── 05_bootstrap_uncertainty.ipynb
│   ├── 06_field_aggregation_v2.ipynb
│   ├── 07_management_detection.ipynb
│   └── 08_crediting_layer.ipynb
├── outputs/
│   ├── figures/
│   ├── metrics/
│   ├── rasters/
│   └── tables/
└── python/
    ├── 01_clean_samples.py
    ├── 02_train_spatial_cv_v2.py
    ├── 02a_make_spatial_blocks.py
    ├── 03_bootstrap_uncertainty.py
    ├── 04_field_aggregation_v2.py
    ├── 05_crediting_layer.py
    ├── 06_management_detection.py         ← Midwest-tuned thresholds
    └── utils/
        └── io_helpers.py
```

---

## Phase 1 — Enhanced Field Analytics Script
**File:** `gee/field_analytics_v2.js`  
**Base:** `gee/field_analytics_v1_reference.js` (current working script)  
**Goal:** Fix broken detection; wire up Cover Crop and Tillage Analysis buttons

### Tasks
1. **Extend `addIndices()`** — add:
   - `NDTI = (B11 − B12) / (B11 + B12)` — residue/tillage index
   - `NDMI = (B8 − B11) / (B8 + B11)` — moisture index
   - `brightness` — mean of B2/B3/B4/B8/B11/B12

2. **Add `addBareMask(img)`** — binary band: `NDVI < 0.25 AND NDMI < 0.1`

3. **Add `seasonalComposite(year, mmddStart, mmddEnd, bands)`** helper — filters S2 by season, applies cloud mask, returns median composite

4. **Build `annualMgmtImages` (2020–CDL_LAST)**:
   - Per year: fall composite (Sep 1–Nov 30) + spring composite (Feb 1–May 15)
   - Per year: `cover_crop_likely_YYYY` = fall NDVI > 0.30 OR spring NDVI > 0.35
   - Per year: `fall_ndvi_YYYY`, `spring_ndvi_YYYY`, `spring_residue_contrast_YYYY`

5. **Compute multi-year proxy bands**:
   - `cover_crop_freq_proxy` — mean of annual `cover_crop_likely` flags
   - `fall_ndvi_mean`, `spring_ndvi_mean`, `fall_spring_ndvi_sum_mean`
   - `spring_bare_freq` — mean bare_mask in spring months across all years
   - `spring_ndti_med`, `spring_bsi_med`
   - `reduced_till_likelihood_proxy = spring_ndti_med − spring_bare_freq`
   - `intensive_till_likelihood_proxy = spring_bare_freq + spring_bsi_med − spring_ndti_med`

6. **S1 SAR enhancement** (when `sarToggle` is on):
   - Add `VV_dB`, `VH_dB`, `VHVV_ratio` to spring-season composite
   - Add GLCM texture bands (`glcm_contrast_VV`, `glcm_entropy_VV`) via `.glcmTexture()`
   - Blend SAR features into `reduced_till_likelihood_proxy` with configurable weight

7. **Wire "Cover Crop Analysis" button** — on `onClick`:
   - Reduce `cover_crop_freq_proxy`, `fall_ndvi_mean`, `spring_ndvi_mean`, `fall_spring_ndvi_sum_mean` over clicked field geometry
   - Compute weighted composite score (0.45 / 0.20 / 0.20 / 0.15)
   - Show formatted panel: class (unlikely / possible / likely), score, confidence, year trend sparkline

8. **Wire "Tillage Detection" button** — on `onClick`:
   - Reduce `reduced_till_likelihood_proxy`, `intensive_till_likelihood_proxy`, `spring_bare_freq`, `spring_ndti_med` over field
   - Compute tillage margin and confidence
   - Show formatted panel: class (likely_reduced / uncertain / likely_intensive), margin, confidence, S1 note if SAR enabled

9. **Add proxy map overlay toggles** — buttons to add/remove cover-crop-freq and tillage-likelihood visualized layers

10. **Preserve all existing functionality**: weekly composites, MODIS chart, static covariate popup, field search, contact sheet, photo overlay, basemap dimmer

---

## Phase 2 — SOC Feature Stack (Standalone Export)
**File:** `gee/01_build_feature_stack_v3.js`  
**Goal:** Export a multi-band feature image for downstream SOC modeling

### Tasks
11. Set `aoi` from `FieldMask_5070` asset, set `assetId` in export to `gen-lang-client-0499108456`
12. Match Midwest seasonal windows to Phase 1 exactly
13. CDL crop history 2020–2025: corn (1), soy (5), winter wheat (24), spring wheat (23), alfalfa (36), pasture (176), double crop (26, 225, 236)
14. Full covariate merge (same sources already working in current script):
    - 3DEP 10m terrain (DEM, slope, aspect, hillshade)
    - DAYMET_V4 (tmin, tmax, prcp — annual means + sums)
    - POLARIS (bd, clay, ksat, n, om, ph, sand, silt, theta_r, theta_s for user-selected depth)
    - SoilGrids ISRIC (bdod, soc, ocs with unit conversions)
    - gNATSGO SOC 0–30
15. All v3 management proxy bands from Phase 1 logic
16. Optional S1 SAR texture section (flag: `var INCLUDE_SAR = false;` at top)
17. Export as `soc_feature_stack_v3` asset; print `bandNames()` to console for verification

---

## Phase 3 — GEE Sampling & Scoring Scripts
**Files:** `gee/02_sample_training_points.js`, `gee/03_score_map.js`, `gee/04_extract_pixels_to_fields.js`

### Tasks
18. **`02_sample_training_points.js`**: Point at `soc_feature_stack_v3` asset; `soilPts` asset reference marked as placeholder; sample + export CSV when samples arrive
19. **`03_score_map.js`**: Full RF scaffold present; top-of-file banner: `⚠️ NOT RUNNABLE UNTIL SOIL SAMPLES UPLOADED`; all code intact so it runs immediately once `soilPts` asset is populated
20. **`04_extract_pixels_to_fields.js`**: Point at `FieldMask_5070`; extract pixel-level predictions to field polygons; export CSV for Python aggregation

---

## Phase 4 — Python Pipeline
**Files:** `python/01–06_*.py`, `python/utils/io_helpers.py`, `configs/config.yaml`

### Tasks
21. `01_clean_samples.py` — standardize soil sample CSVs (column names, unit checks, depth harmonization, duplicate removal)
22. `02a_make_spatial_blocks.py` — generate spatial CV blocks from point coordinates (grid or k-means clustering)
23. `02_train_spatial_cv_v2.py` — spatial k-fold CV, Random Forest, feature importance output, model metadata JSON
24. `03_bootstrap_uncertainty.py` — bootstrap ensemble uncertainty bounds on predictions
25. `04_field_aggregation_v2.py` — conservative field summaries: `mean_pred_mean`, `mean_pred_p10`, `p10_of_pred_mean`
26. `05_crediting_layer.py` — baseline vs. monitoring delta, conservative field reporting
27. `06_management_detection.py` — **Midwest-tuned thresholds**:
    - Cover crop: likely ≥ 0.60, possible ≥ 0.35 (slightly higher than generic defaults due to volunteer growth risk in corn/soy)
    - Tillage: reduced_till margin > 0.15, intensive_till margin < −0.15
28. `configs/config.yaml` — pre-filled: your GEE asset paths, `cdl_years: [2020,2021,2022,2023,2024,2025]`, seasonal windows, crop code lists, model hyperparameters

### Notebooks (00–08)
29. `notebooks/00_pipeline_overview.ipynb` — end-to-end narrative, no execution required
30. `notebooks/01–08_*.ipynb` — each calls the corresponding Python script via `subprocess`; includes markdown cells explaining inputs/outputs and validation checks

---

## Phase 5 — Documentation & Repo Finalization

31. `docs/management_detection_notes.md` — Midwest-context adaptation of starter repo notes; covers corn/soy/wheat timing caveats, winter wheat confusion risk, double-crop false positives
32. `docs/model_card_template.md`, `docs/qaqc_checklist.md`, `docs/sampling_protocol_template.md` — from starter repo, updated with your project context
33. Update `README.md` — actual build sequence with your asset IDs, proxy caveats, link to this PLAN.md

---

## Verification Checklist

- [ ] Paste `gee/field_analytics_v2.js` → click a field → "Cover Crop Analysis" button shows score popup
- [ ] Click "Tillage Detection" → shows tillage class, margin, confidence in popup
- [ ] Enable SAR toggle → Tillage Detection popup includes S1 SAR metrics note
- [ ] `gee/01_build_feature_stack_v3.js` → Export task runs → `bandNames()` includes all proxy bands
- [ ] `python/06_management_detection.py --input sample.csv --output out.csv` → runs cleanly
- [ ] `notebooks/00_pipeline_overview.ipynb` → renders without errors in VS Code
- [ ] All files committed and pushed to `main`

---

## Implementation Order (Recommended)

```
Phase 1  →  Phase 2  →  Phase 3 (stubs)  →  Phase 4  →  Phase 5
   ↓              ↓
Field analytics    Feature stack export
(immediate use)    (when ready to model)
```

Phases 1 and 2 can be worked on in parallel. Phase 3 scripts are short. Phase 4 Python scripts can be scaffolded quickly from the starter repo. Phase 5 is polish.
