"""
06_management_detection.py

Post-processes field-level predictor summaries into management proxy outputs for:
- cover crop likelihood / class
- reduced till likelihood / class
- intensive till likelihood / class

This script is intentionally conservative about naming: it produces 'proxy' outputs
and confidence scores, not definitive compliance determinations.

Expected input CSV: one row per field with aggregated bands exported from Earth Engine.
Example columns:
    field_id
    cover_crop_freq_proxy
    fall_ndvi_mean
    spring_ndvi_mean
    fall_spring_ndvi_sum_mean
    spring_bare_freq
    spring_ndti_med
    spring_bsi_med
    reduced_till_likelihood_proxy
    intensive_till_likelihood_proxy

Usage:
    python python/06_management_detection.py \
        --input outputs/tables/field_predictors.csv \
        --output outputs/tables/field_management_proxies.csv
"""

from __future__ import annotations

import argparse
import numpy as np
import pandas as pd


def logistic(x: pd.Series | np.ndarray, center: float = 0.0, scale: float = 1.0) -> np.ndarray:
    z = (np.asarray(x, dtype=float) - center) / max(scale, 1e-9)
    return 1.0 / (1.0 + np.exp(-z))


def normalize_01(s: pd.Series) -> pd.Series:
    lo, hi = s.min(), s.max()
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


def add_cover_crop_proxy(df: pd.DataFrame) -> pd.DataFrame:
    req = ['cover_crop_freq_proxy', 'fall_ndvi_mean', 'spring_ndvi_mean', 'fall_spring_ndvi_sum_mean']
    missing = [c for c in req if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns for cover crop proxy: {missing}")

    score = (
        0.45 * normalize_01(df['cover_crop_freq_proxy']) +
        0.20 * normalize_01(df['fall_ndvi_mean']) +
        0.20 * normalize_01(df['spring_ndvi_mean']) +
        0.15 * normalize_01(df['fall_spring_ndvi_sum_mean'])
    )

    df['cover_crop_proxy_score'] = score
    df['cover_crop_proxy_confidence'] = np.abs(score - 0.5) * 2.0
    df['cover_crop_proxy_class'] = pd.cut(
        score,
        bins=[-np.inf, 0.35, 0.60, np.inf],
        labels=['unlikely', 'possible', 'likely']
    ).astype(str)
    return df


def add_tillage_proxy(df: pd.DataFrame) -> pd.DataFrame:
    req = ['spring_bare_freq', 'spring_ndti_med', 'spring_bsi_med',
           'reduced_till_likelihood_proxy', 'intensive_till_likelihood_proxy']
    missing = [c for c in req if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns for tillage proxy: {missing}")

    reduced_score = (
        0.50 * normalize_01(df['reduced_till_likelihood_proxy']) +
        0.30 * normalize_01(df['spring_ndti_med']) +
        0.20 * (1 - normalize_01(df['spring_bare_freq']))
    )
    intensive_score = (
        0.50 * normalize_01(df['intensive_till_likelihood_proxy']) +
        0.30 * normalize_01(df['spring_bsi_med']) +
        0.20 * normalize_01(df['spring_bare_freq'])
    )

    df['reduced_till_proxy_score'] = reduced_score
    df['intensive_till_proxy_score'] = intensive_score

    margin = reduced_score - intensive_score
    df['tillage_proxy_margin'] = margin
    df['tillage_proxy_confidence'] = np.abs(margin)
    df['tillage_proxy_class'] = pd.cut(
        margin,
        bins=[-np.inf, -0.15, 0.15, np.inf],
        labels=['likely_intensive_till', 'uncertain_mixed', 'likely_reduced_till']
    ).astype(str)
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='CSV with field-level predictor summaries')
    parser.add_argument('--output', required=True, help='Output CSV path')
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    df = add_cover_crop_proxy(df)
    df = add_tillage_proxy(df)
    df.to_csv(args.output, index=False)
    print(f"Wrote {args.output}")


if __name__ == '__main__':
    main()
