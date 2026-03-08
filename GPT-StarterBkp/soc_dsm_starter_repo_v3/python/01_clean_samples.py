"""Clean and standardize soil samples for SOC DSM modeling.

Usage:
    python 01_clean_samples.py --input data_examples/soil_samples_schema.csv --output outputs/tables/soil_samples_clean.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd


def compute_soc_stock_tcha(df: pd.DataFrame) -> pd.DataFrame:
    required = [
        'sample_id', 'latitude', 'longitude', 'depth_top_cm', 'depth_bottom_cm',
        'soc_pct', 'bulk_density_g_cm3', 'rock_fragment_pct'
    ]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f'Missing required columns: {missing}')

    out = df.copy()
    out['depth_cm'] = out['depth_bottom_cm'] - out['depth_top_cm']
    out['soc_fraction'] = out['soc_pct'] / 100.0
    out['rock_fraction'] = out['rock_fragment_pct'] / 100.0
    out['soc_stock_tCha'] = (
        out['soc_fraction']
        * out['bulk_density_g_cm3']
        * out['depth_cm']
        * (1.0 - out['rock_fraction'])
        * 100.0
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    clean = compute_soc_stock_tcha(df)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    clean.to_csv(output_path, index=False)
    print(f'Wrote cleaned samples to {output_path}')
    print(clean[['sample_id', 'soc_stock_tCha']].head())


if __name__ == '__main__':
    main()
