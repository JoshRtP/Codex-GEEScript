"""Train a Random Forest SOC model with explicit spatial blocks and richer outputs.

Usage:
    python 02_train_spatial_cv_v2.py --input outputs/tables/soc_training_table_blocked.csv --outdir outputs/metrics
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--outdir', required=True)
    parser.add_argument('--target', default='soc_stock_tCha')
    parser.add_argument('--group_col', default='spatial_block_id')
    parser.add_argument('--n_splits', type=int, default=5)
    args = parser.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.input)
    if args.group_col not in df.columns:
        raise ValueError(f'Missing group column: {args.group_col}')
    if args.target not in df.columns:
        raise ValueError(f'Missing target column: {args.target}')

    drop_cols = {
        args.target, args.group_col, 'system:index', '.geo', 'sample_id',
        'latitude', 'longitude', 'lat', 'lon', 'lng', 'Latitude', 'Longitude'
    }
    feature_cols = [c for c in df.columns if c not in drop_cols and pd.api.types.is_numeric_dtype(df[c])]

    X = df[feature_cols].copy()
    y = df[args.target].copy()
    groups = df[args.group_col].astype(str)

    model = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('rf', RandomForestRegressor(
            n_estimators=700,
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
    feature_importance = np.zeros(len(feature_cols), dtype=float)

    for fold, (tr_idx, va_idx) in enumerate(cv.split(X, y, groups=groups), start=1):
        X_tr, X_va = X.iloc[tr_idx], X.iloc[va_idx]
        y_tr, y_va = y.iloc[tr_idx], y.iloc[va_idx]

        model.fit(X_tr, y_tr)
        pred = model.predict(X_va)
        oof_pred[va_idx] = pred
        feature_importance += model.named_steps['rf'].feature_importances_

        row = {
            'fold': fold,
            'n_train': int(len(tr_idx)),
            'n_valid': int(len(va_idx)),
            'n_groups_train': int(groups.iloc[tr_idx].nunique()),
            'n_groups_valid': int(groups.iloc[va_idx].nunique()),
            'r2': float(r2_score(y_va, pred)),
            'mae': float(mean_absolute_error(y_va, pred)),
            'rmse': float(mean_squared_error(y_va, pred, squared=False)),
            'bias': float((pred - y_va).mean()),
        }
        fold_rows.append(row)
        print(row)

    feature_importance = feature_importance / args.n_splits

    overall = {
        'r2': float(r2_score(y, oof_pred)),
        'mae': float(mean_absolute_error(y, oof_pred)),
        'rmse': float(mean_squared_error(y, oof_pred, squared=False)),
        'bias': float((oof_pred - y).mean()),
        'n_rows': int(len(df)),
        'n_features': int(len(feature_cols)),
        'n_groups': int(groups.nunique()),
        'group_col': args.group_col,
    }

    pd.DataFrame(fold_rows).to_csv(outdir / 'spatial_cv_v2_fold_metrics.csv', index=False)
    pred_df = df.copy()
    pred_df['oof_pred'] = oof_pred
    pred_df['residual'] = pred_df['oof_pred'] - pred_df[args.target]
    pred_df.to_csv(outdir / 'spatial_cv_v2_predictions.csv', index=False)

    fi_df = pd.DataFrame({
        'feature': feature_cols,
        'importance_mean': feature_importance,
    }).sort_values('importance_mean', ascending=False)
    fi_df.to_csv(outdir / 'feature_importance_v2.csv', index=False)

    with open(outdir / 'spatial_cv_v2_summary.json', 'w', encoding='utf-8') as f:
        json.dump(overall, f, indent=2)

    print('Overall metrics:')
    print(json.dumps(overall, indent=2))


if __name__ == '__main__':
    main()
