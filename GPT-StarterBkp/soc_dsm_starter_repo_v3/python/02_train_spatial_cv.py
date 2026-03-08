"""Train a Random Forest SOC model with spatial cross-validation.

Usage:
    python 02_train_spatial_cv.py --input outputs/tables/soc_training_table.csv --outdir outputs/metrics
"""

from __future__ import annotations

import argparse
from pathlib import Path
import json

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline


def infer_lat_lon(df: pd.DataFrame) -> tuple[str, str]:
    lat_candidates = ['latitude', 'lat', 'Latitude']
    lon_candidates = ['longitude', 'lon', 'lng', 'Longitude']
    lat_col = next((c for c in lat_candidates if c in df.columns), None)
    lon_col = next((c for c in lon_candidates if c in df.columns), None)
    if lat_col is None or lon_col is None:
        raise ValueError('Could not infer latitude/longitude columns. Add them before training.')
    return lat_col, lon_col


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--outdir', required=True)
    parser.add_argument('--target', default='soc_stock_tCha')
    parser.add_argument('--n_splits', type=int, default=5)
    parser.add_argument('--bin_deg', type=float, default=0.5)
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.input)
    lat_col, lon_col = infer_lat_lon(df)

    drop_cols = {args.target, 'system:index', '.geo', 'sample_id'}
    feature_cols = [c for c in df.columns if c not in drop_cols and pd.api.types.is_numeric_dtype(df[c])]

    if args.target not in df.columns:
        raise ValueError(f'Target column not found: {args.target}')

    X = df[feature_cols].copy()
    y = df[args.target].copy()

    df['lat_bin'] = (df[lat_col] / args.bin_deg).round(0) * args.bin_deg
    df['lon_bin'] = (df[lon_col] / args.bin_deg).round(0) * args.bin_deg
    df['spatial_block'] = df['lat_bin'].astype(str) + '_' + df['lon_bin'].astype(str)
    groups = df['spatial_block']

    model = Pipeline([
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

    cv = GroupKFold(n_splits=args.n_splits)
    oof_pred = np.zeros(len(df))
    fold_rows: list[dict] = []

    for fold, (tr_idx, va_idx) in enumerate(cv.split(X, y, groups=groups), start=1):
        X_tr, X_va = X.iloc[tr_idx], X.iloc[va_idx]
        y_tr, y_va = y.iloc[tr_idx], y.iloc[va_idx]

        model.fit(X_tr, y_tr)
        pred = model.predict(X_va)
        oof_pred[va_idx] = pred

        rmse = mean_squared_error(y_va, pred, squared=False)
        row = {
            'fold': fold,
            'n_train': int(len(tr_idx)),
            'n_valid': int(len(va_idx)),
            'r2': float(r2_score(y_va, pred)),
            'mae': float(mean_absolute_error(y_va, pred)),
            'rmse': float(rmse),
        }
        fold_rows.append(row)
        print(row)

    overall = {
        'r2': float(r2_score(y, oof_pred)),
        'mae': float(mean_absolute_error(y, oof_pred)),
        'rmse': float(mean_squared_error(y, oof_pred, squared=False)),
        'n_rows': int(len(df)),
        'n_features': int(len(feature_cols)),
    }

    pd.DataFrame(fold_rows).to_csv(outdir / 'spatial_cv_fold_metrics.csv', index=False)
    df_out = df.copy()
    df_out['oof_pred'] = oof_pred
    df_out.to_csv(outdir / 'spatial_cv_predictions.csv', index=False)
    with open(outdir / 'spatial_cv_summary.json', 'w', encoding='utf-8') as f:
        json.dump(overall, f, indent=2)

    print('Overall metrics:')
    print(json.dumps(overall, indent=2))


if __name__ == '__main__':
    main()
