$ErrorActionPreference = "Stop"

Write-Host "Running Phase 1 unit tests..."
python -m unittest discover -s tests -v

Write-Host "Running Phase 1 smoke pipeline check..."
python python/phase1_pipeline_smoke.py --report outputs/metrics/phase1_smoke_report.json

Write-Host "Phase 1 tests completed."
