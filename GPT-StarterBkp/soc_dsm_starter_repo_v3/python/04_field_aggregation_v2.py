"""Aggregate pixel predictions to fields with conservative summary options.

Expected columns:
- field_id
- pred_mean
Optional conservative columns:
- pred_p10
- pred_p50
- pred_p90

Usage:
    python 04_field_aggregation_v2.py --input outputs/tables/pixel_predictions.csv --output outputs/tables/field_summary_v2.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def q10(series: pd.Series) -> float:
    return float(np.nanpercentile(series.to_numpy(), 10))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    if 'field_id' not in df.columns:
        raise ValueError('Missing required column: field_id')

    required_base = {'field_id', 'pred_mean'}
    missing = required_base - set(df.columns)
    if missing:
        raise ValueError(f'Missing required columns: {sorted(missing)}')

    has_p10 = 'pred_p10' in df.columns
    has_p50 = 'pred_p50' in df.columns
    has_p90 = 'pred_p90' in df.columns

    agg = {
        'n_pixels': ('field_id', 'size'),
        'mean_pred_mean': ('pred_mean', 'mean'),
        'median_pred_mean': ('pred_mean', 'median'),
        'p10_of_pred_mean': ('pred_mean', q10),
    }
    if has_p10:
        agg['mean_pred_p10'] = ('pred_p10', 'mean')
    if has_p50:
        agg['mean_pred_p50'] = ('pred_p50', 'mean')
    if has_p90:
        agg['mean_pred_p90'] = ('pred_p90', 'mean')

    summary = df.groupby('field_id', dropna=False).agg(**agg).reset_index()

    if has_p10:
        summary['conservative_field_value'] = summary['mean_pred_p10']
    else:
        summary['conservative_field_value'] = summary['p10_of_pred_mean']

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary.to_csv(output_path, index=False)
    print(f'Wrote field summary to {output_path}')
    print(summary.head())


if __name__ == '__main__':
    main()
