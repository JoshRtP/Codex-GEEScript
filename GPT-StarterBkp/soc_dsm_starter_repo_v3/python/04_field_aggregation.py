"""Aggregate point or pixel prediction summaries to fields.

This starter script expects a CSV with at least:
- field_id
- pred_mean
- pred_p10
- pred_p50
- pred_p90

Usage:
    python 04_field_aggregation.py --input outputs/tables/pixel_predictions.csv --output outputs/tables/field_summary.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    required = {'field_id', 'pred_mean', 'pred_p10', 'pred_p50', 'pred_p90'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f'Missing required columns: {sorted(missing)}')

    summary = df.groupby('field_id', dropna=False).agg(
        n_pixels=('field_id', 'size'),
        field_pred_mean=('pred_mean', 'mean'),
        field_pred_p10=('pred_p10', 'mean'),
        field_pred_p50=('pred_p50', 'mean'),
        field_pred_p90=('pred_p90', 'mean'),
    ).reset_index()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary.to_csv(output_path, index=False)
    print(f'Wrote field summary to {output_path}')


if __name__ == '__main__':
    main()
