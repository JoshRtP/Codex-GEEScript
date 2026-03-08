# SOC DSM Starter Repo v2

This v2 repo extends the MVP scaffold with:

- multi-year crop-history features from USDA CDL in Google Earth Engine
- explicit hooks for SoilGrids covariates and local SSURGO rasters
- reproducible spatial block generation in Python
- a conservative pixel-to-field aggregation and crediting layer
- a slightly more structured config file for model and feature settings

## What changed from v1

### New / expanded capabilities
- `gee/01_build_feature_stack_v2.js`
  - adds a 5-year CDL crop-frequency feature block
  - adds optional SoilGrids hooks
  - adds optional local SSURGO raster hooks
  - adds bare-soil frequency and richer remote-sensing summaries
- `python/02a_make_spatial_blocks.py`
  - generates reproducible spatial blocks from point coordinates using either grid cells or clustering
- `python/02_train_spatial_cv_v2.py`
  - trains with explicit spatial block IDs instead of ad hoc coordinate rounding
  - writes feature importance and richer model metadata
- `python/04_field_aggregation_v2.py`
  - computes field-level summaries with conservative options such as mean-of-p10 and p10-of-pixel-means
- `python/05_crediting_layer.py`
  - combines baseline and monitoring summaries into conservative field deltas

## Repository structure

```text
soc_dsm_starter_repo_v2/
├── configs/
│   └── config.example.yaml
├── data_examples/
│   ├── soil_samples_schema.csv
│   └── field_boundaries_schema.geojson
├── docs/
│   ├── model_card_template.md
│   ├── sampling_protocol_template.md
│   └── qaqc_checklist.md
├── gee/
│   ├── 01_build_feature_stack.js
│   ├── 01_build_feature_stack_v2.js
│   ├── 02_sample_training_points.js
│   ├── 03_score_map.js
│   └── 04_extract_pixels_to_fields.js
├── python/
│   ├── 01_clean_samples.py
│   ├── 02_train_spatial_cv.py
│   ├── 02a_make_spatial_blocks.py
│   ├── 02_train_spatial_cv_v2.py
│   ├── 03_bootstrap_uncertainty.py
│   ├── 04_field_aggregation.py
│   ├── 04_field_aggregation_v2.py
│   ├── 05_crediting_layer.py
│   └── utils/
│       └── io_helpers.py
└── outputs/
    ├── figures/
    ├── metrics/
    ├── rasters/
    └── tables/
```

## Recommended v2 build sequence

1. Clean and standardize soil samples with `python/01_clean_samples.py`.
2. Upload the cleaned points and field boundaries to Earth Engine.
3. Build the v2 feature stack with `gee/01_build_feature_stack_v2.js`.
4. Sample predictors at soil points using `gee/02_sample_training_points.js`.
5. Generate explicit spatial blocks with `python/02a_make_spatial_blocks.py`.
6. Train the model using `python/02_train_spatial_cv_v2.py`.
7. Estimate uncertainty using `python/03_bootstrap_uncertainty.py` or your preferred ensemble routine.
8. Score the AOI in GEE and extract pixel predictions to fields using `gee/04_extract_pixels_to_fields.js`.
9. Aggregate to fields using `python/04_field_aggregation_v2.py`.
10. Run `python/06_management_detection.py` on field-level predictor summaries to produce management proxy classes.
11. Compare baseline and monitoring vintages with `python/05_crediting_layer.py`.


## v3 additions for management detection

This v3 package adds **cover crop and tillage proxy detection**.

### New files
- `gee/01_build_feature_stack_v3.js`
  - adds off-season greenness and spring residue / bare-soil timing proxies
  - outputs `cover_crop_freq_proxy`, `reduced_till_likelihood_proxy`, and `intensive_till_likelihood_proxy`
- `python/06_management_detection.py`
  - converts field-level aggregated predictors into proxy classes and confidence scores
- `docs/management_detection_notes.md`
  - explains how to use the proxy layers and where they are not strong enough on their own

### Important caveat
The repo now includes **detection proxies**, not guaranteed direct observation of cover crop establishment or tillage passes. For MRV use, these should be fused with farmer-reported and operational evidence.

## Notes on SoilGrids and SSURGO

This repo includes hooks rather than full packaged soil-map downloads.

- **SoilGrids**: use your preferred tiled assets or exported rasters. The script shows where to inject texture, pH, or bulk-density layers.
- **SSURGO**: for production work, pre-build harmonized rasters outside GEE or upload project-specific rasters as assets. The hook expects rasters such as clay, sand, drainage class, or available water capacity.

## Conservative field reporting options

The v2 aggregation layer supports three common conservative summaries:

- `mean_pred_mean`: average of pixel-level mean predictions
- `mean_pred_p10`: average of pixel-level p10 predictions
- `p10_of_pred_mean`: field-level 10th percentile of pixel mean predictions

For early MRV prototyping, `mean_pred_p10` is often a practical conservative summary.


## Jupyter notebooks for VS Code / local IDE use

This package now includes a `notebooks/` folder so you can execute the Python-side workflow step by step from VS Code or another local IDE.

Included notebooks:
- `00_pipeline_overview.ipynb`
- `01_clean_samples.ipynb`
- `02_gee_workflow_guide.ipynb`
- `03_make_spatial_blocks.ipynb`
- `04_train_spatial_cv_v2.ipynb`
- `05_bootstrap_uncertainty.ipynb`
- `06_field_aggregation_v2.ipynb`
- `07_management_detection.ipynb`
- `08_crediting_layer.ipynb`

Notes:
- The Python notebooks are executable as-is once you point them to your real input files.
- The GEE step is still based on the JavaScript files in `gee/`, so the notebook for that step is a guided checklist and script launcher rather than a fully in-notebook Earth Engine runner.
- The notebooks call the existing Python scripts with `subprocess`, which keeps the notebook workflow aligned with the CLI workflow.
