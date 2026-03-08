"""Create explicit spatial blocks for SOC model cross-validation.

Usage:
    python 02a_make_spatial_blocks.py --input outputs/tables/soc_training_table.csv --output outputs/tables/soc_training_table_blocked.csv --method grid --grid_deg 0.25
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans


def infer_lat_lon(df: pd.DataFrame) -> tuple[str, str]:
    lat_candidates = ['latitude', 'lat', 'Latitude']
    lon_candidates = ['longitude', 'lon', 'lng', 'Longitude']
    lat_col = next((c for c in lat_candidates if c in df.columns), None)
    lon_col = next((c for c in lon_candidates if c in df.columns), None)
    if lat_col is None or lon_col is None:
        raise ValueError('Could not infer latitude/longitude columns.')
    return lat_col, lon_col


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--method', choices=['grid', 'kmeans'], default='grid')
    parser.add_argument('--grid_deg', type=float, default=0.25)
    parser.add_argument('--n_clusters', type=int, default=25)
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    lat_col, lon_col = infer_lat_lon(df)

    if args.method == 'grid':
        lat_block = np.floor(df[lat_col] / args.grid_deg) * args.grid_deg
        lon_block = np.floor(df[lon_col] / args.grid_deg) * args.grid_deg
        df['spatial_block_id'] = lat_block.round(6).astype(str) + '_' + lon_block.round(6).astype(str)
    else:
        coords = df[[lat_col, lon_col]].to_numpy()
        km = KMeans(n_clusters=args.n_clusters, random_state=42, n_init=10)
        df['spatial_block_id'] = km.fit_predict(coords).astype(str)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f'Wrote blocked training table to {out}')
    print(df['spatial_block_id'].value_counts().head())


if __name__ == '__main__':
    main()
