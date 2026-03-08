# Codex-GEEScript

Google Earth Engine scripts for soil organic carbon (SOC) modeling, leveraging tillage detection and cover crop detection as input layers.

## Project Goals

- Upgrade tillage detection scripts using Google Earth Engine
- Upgrade cover crop detection scripts using Google Earth Engine
- Integrate both detection layers into a full SOC (Soil Organic Carbon) model

## Structure

```
/tillage-detection/     # Scripts for detecting tillage events from satellite imagery
/cover-crop-detection/  # Scripts for detecting cover crop presence and type
/soc-model/             # Full SOC model integrating tillage and cover crop layers
/utils/                 # Shared utility functions and helpers
```

## Workflow

This project is developed with [GitHub Copilot / Codex](https://github.com/features/copilot) to iteratively improve and integrate GEE scripts into a comprehensive SOC modeling pipeline.

## Requirements

- Google Earth Engine account
- Access to relevant satellite datasets (e.g., Sentinel-2, Landsat)

## Phase 1 Scripts (First Round)

- `gee/field_analytics_v1_reference.js`: baseline reference script.
- `gee/field_analytics_v2.js`: Phase 1 script with cover-crop and tillage proxy logic, button handlers, and proxy overlay toggles.
- `python/phase1_pipeline_smoke.py`: local smoke test for pipeline wiring + GEE script contract checks.

## Test Scripts

- `tests/test_phase1_gee_contract.py`: validates required Phase 1 GEE logic markers and JavaScript parse validity.
- `tests/test_phase1_pipeline_smoke.py`: runs the smoke pipeline script and checks report output.
- `scripts/run_phase1_tests.ps1`: convenience runner for all Phase 1 tests.

Run all tests:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run_phase1_tests.ps1
```
