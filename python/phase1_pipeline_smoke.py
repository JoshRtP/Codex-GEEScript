#!/usr/bin/env python3
"""Phase 1 smoke checks for local pipeline + GEE script contract."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List


REQUIRED_PATHS = [
    "gee/field_analytics_v1_reference.js",
    "gee/field_analytics_v2.js",
    "outputs/metrics",
    "outputs/figures",
    "outputs/rasters",
    "outputs/tables",
]

REQUIRED_GEE_TOKENS = [
    "function addIndices",
    "NDTI",
    "NDMI",
    "brightness",
    "function addBareMask",
    "function seasonalComposite",
    "function annualMgmtForYear",
    "function buildAnnualMgmtBandImage",
    "function buildMgmtProxyImage",
    "cover_crop_freq_proxy",
    "reduced_till_likelihood_proxy",
    "intensive_till_likelihood_proxy",
    "Cover Crop Analysis",
    "Tillage Detection",
    "coverCropBtn.onClick",
    "tillageBtn.onClick",
    "toggleCoverLayerBtn.onClick",
    "toggleTillageLayerBtn.onClick",
]


@dataclass
class CheckResult:
    name: str
    status: str
    detail: str


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def check_required_paths(root: Path) -> CheckResult:
    missing = [str(root / p) for p in REQUIRED_PATHS if not (root / p).exists()]
    if missing:
        return CheckResult(
            name="required_paths",
            status="fail",
            detail="Missing required path(s): " + ", ".join(missing),
        )
    return CheckResult(
        name="required_paths",
        status="pass",
        detail=f"All {len(REQUIRED_PATHS)} required paths exist.",
    )


def check_gee_tokens(gee_script: Path) -> CheckResult:
    if not gee_script.exists():
        return CheckResult(
            name="gee_contract_tokens",
            status="fail",
            detail=f"GEE script not found: {gee_script}",
        )
    text = gee_script.read_text(encoding="utf-8", errors="replace")
    missing = [token for token in REQUIRED_GEE_TOKENS if token not in text]
    if missing:
        return CheckResult(
            name="gee_contract_tokens",
            status="fail",
            detail="Missing token(s): " + ", ".join(missing),
        )
    return CheckResult(
        name="gee_contract_tokens",
        status="pass",
        detail=f"All {len(REQUIRED_GEE_TOKENS)} required tokens were found.",
    )


def check_gee_js_parse(gee_script: Path) -> CheckResult:
    node = shutil.which("node")
    if not node:
        return CheckResult(
            name="gee_js_parse",
            status="skip",
            detail="Node.js not available; skipped JavaScript parse check.",
        )

    completed = subprocess.run(
        [node, "--check", str(gee_script)],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "node --check failed"
        return CheckResult(name="gee_js_parse", status="fail", detail=detail)
    return CheckResult(name="gee_js_parse", status="pass", detail="node --check passed.")


def summarize(results: List[CheckResult]) -> dict:
    summary = {"pass": 0, "fail": 0, "skip": 0}
    for result in results:
        summary[result.status] = summary.get(result.status, 0) + 1
    summary["total"] = len(results)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 1 local smoke test runner.")
    parser.add_argument(
        "--gee-script",
        default="gee/field_analytics_v2.js",
        help="Path to the Phase 1 GEE script (relative to repo root by default).",
    )
    parser.add_argument(
        "--report",
        default="outputs/metrics/phase1_smoke_report.json",
        help="Where to write the JSON report.",
    )
    args = parser.parse_args()

    root = _repo_root()
    gee_script = (root / args.gee_script).resolve()
    report_path = (root / args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)

    results = [
        check_required_paths(root),
        check_gee_tokens(gee_script),
        check_gee_js_parse(gee_script),
    ]
    summary = summarize(results)

    payload = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "repo_root": str(root),
        "gee_script": str(gee_script),
        "summary": summary,
        "results": [asdict(result) for result in results],
    }
    report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(json.dumps(payload, indent=2))
    return 1 if summary.get("fail", 0) else 0


if __name__ == "__main__":
    sys.exit(main())
