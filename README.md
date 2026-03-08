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
