"""Create a conservative crediting delta from baseline and monitoring field summaries.

Usage:
    python 05_crediting_layer.py --baseline outputs/tables/field_summary_baseline.csv --monitoring outputs/tables/field_summary_monitoring.csv --output outputs/tables/field_crediting_delta.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def choose_column(df: pd.DataFrame) -> str:
    for col in ['conservative_field_value', 'mean_pred_p10', 'p10_of_pred_mean', 'mean_pred_mean']:
        if col in df.columns:
            return col
    raise ValueError('Could not find a usable field summary column.')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--monitoring', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--field_id_col', default='field_id')
    parser.add_argument('--floor_negative_to_zero', action='store_true')
    args = parser.parse_args()

    base = pd.read_csv(args.baseline)
    mon = pd.read_csv(args.monitoring)

    base_col = choose_column(base)
    mon_col = choose_column(mon)

    keep_base = [args.field_id_col, base_col]
    keep_mon = [args.field_id_col, mon_col]

    merged = base[keep_base].rename(columns={base_col: 'baseline_value'}).merge(
        mon[keep_mon].rename(columns={mon_col: 'monitoring_value'}),
        on=args.field_id_col,
        how='outer',
        validate='one_to_one'
    )

    merged['delta_tCha'] = merged['monitoring_value'] - merged['baseline_value']
    if args.floor_negative_to_zero:
        merged['credited_delta_tCha'] = merged['delta_tCha'].clip(lower=0)
    else:
        merged['credited_delta_tCha'] = merged['delta_tCha']

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output_path, index=False)
    print(f'Wrote crediting deltas to {output_path}')
    print(merged.head())


if __name__ == '__main__':
    main()
