import argparse
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr
from shapely.geometry import box

from src.config import PROCESSED_DIR

LAT_NAMES = ("lat", "latitude", "LAT", "Latitude")
LON_NAMES = ("lon", "longitude", "LON", "Longitude")

def find_coordinate(ds, candidates):
    for name in candidates:
        if name in ds.coords:
            return name
        if name in ds.variables and ds[name].ndim == 1:
            return name
    raise KeyError(f"No se encontró una coordenada entre: {candidates}")

def build_grid(netcdf_path: Path):
    ds = xr.open_dataset(netcdf_path)
    try:
        lat_name = find_coordinate(ds, LAT_NAMES)
        lon_name = find_coordinate(ds, LON_NAMES)

        latitudes = np.asarray(ds[lat_name].values, dtype=float)
        longitudes = np.asarray(ds[lon_name].values, dtype=float)

        if latitudes.size < 2 or longitudes.size < 2:
            raise ValueError("El NetCDF no contiene suficientes coordenadas para inferir la cuadrícula.")

        lat_step = float(np.median(np.abs(np.diff(np.sort(np.unique(latitudes))))))
        lon_step = float(np.median(np.abs(np.diff(np.sort(np.unique(longitudes))))))

        records = []
        for row, lat in enumerate(latitudes):
            for col, lon in enumerate(longitudes):
                cell_id = f"POWER_{lat:+07.3f}_{lon:+08.3f}".replace("+", "P").replace("-", "M")
                geometry = box(
                    lon - lon_step / 2,
                    lat - lat_step / 2,
                    lon + lon_step / 2,
                    lat + lat_step / 2,
                )
                records.append({
                    "cell_id": cell_id,
                    "row_index": row,
                    "col_index": col,
                    "latitude_center": float(lat),
                    "longitude_center": float(lon),
                    "lat_step_deg": lat_step,
                    "lon_step_deg": lon_step,
                    "geometry": geometry,
                })

        grid = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

        gpkg_path = PROCESSED_DIR / "power_grid_candidate.gpkg"
        csv_path = PROCESSED_DIR / "power_grid_candidate.csv"

        grid.to_file(gpkg_path, layer="power_grid", driver="GPKG")
        grid.drop(columns="geometry").to_csv(csv_path, index=False)

        print(f"Celdas generadas: {len(grid):,}")
        print(f"Resolución inferida: {lat_step:.6f}° lat × {lon_step:.6f}° lon")
        print(f"GeoPackage: {gpkg_path}")
        print(f"CSV: {csv_path}")
        print(
            "IMPORTANTE: esta es la cuadrícula de la extensión rectangular de consulta. "
            "Aún no está recortada al límite político de México."
        )
    finally:
        ds.close()

def main():
    parser = argparse.ArgumentParser(
        description="Construye la cuadrícula desde las coordenadas reales del NetCDF POWER."
    )
    parser.add_argument("netcdf", type=Path, help="Ruta al NetCDF regional descargado.")
    args = parser.parse_args()

    if not args.netcdf.exists():
        parser.error(f"No existe el archivo: {args.netcdf}")

    build_grid(args.netcdf)

if __name__ == "__main__":
    main()
