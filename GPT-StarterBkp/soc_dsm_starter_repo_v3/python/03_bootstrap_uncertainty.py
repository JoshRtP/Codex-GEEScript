"""Estimate uncertainty using a bootstrap ensemble.

Usage:
    python 03_bootstrap_uncertainty.py --input outputs/tables/soc_training_table.csv --output outputs/tables/bootstrap_uncertainty.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--target', default='soc_stock_tCha')
    parser.add_argument('--n_boot', type=int, default=100)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    drop_cols = {args.target, 'system:index', '.geo', 'sample_id'}
    feature_cols = [c for c in df.columns if c not in drop_cols and pd.api.types.is_numeric_dtype(df[c])]

    X = df[feature_cols]
    y = df[args.target]

    base_model = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('rf', RandomForestRegressor(
            n_estimators=500,
            max_depth=None,
            min_samples_leaf=3,
            max_features='sqrt',
            random_state=42,
            n_jobs=-1,
        )),
    ])

    preds = np.zeros((len(df), args.n_boot), dtype=float)
    rng = np.random.default_rng(42)

    for b in range(args.n_boot):
        boot_idx = rng.choice(len(df), size=len(df), replace=True)
        model_b = clone(base_model)
        model_b.fit(X.iloc[boot_idx], y.iloc[boot_idx])
        preds[:, b] = model_b.predict(X)
        if (b + 1) % 10 == 0:
            print(f'Finished bootstrap {b + 1}/{args.n_boot}')

    out = df.copy()
    out['pred_mean'] = preds.mean(axis=1)
    out['pred_p10'] = np.percentile(preds, 10, axis=1)
    out['pred_p50'] = np.percentile(preds, 50, axis=1)
    out['pred_p90'] = np.percentile(preds, 90, axis=1)
    out['pred_sd'] = preds.std(axis=1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(output_path, index=False)
    print(f'Wrote bootstrap uncertainty table to {output_path}')


if __name__ == '__main__':
    main()
