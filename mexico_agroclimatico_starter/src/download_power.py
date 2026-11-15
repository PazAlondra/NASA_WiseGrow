import argparse
import time
from datetime import datetime
from pathlib import Path

import requests

from src.config import (
    CORE_PARAMETERS,
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    POWER_BASE_URL, POWER_COMMUNITY, POWER_TIME_STANDARD,
    RAW_POWER_DIR,
)

def validate_date(value: str) -> str:
    try:
        datetime.strptime(value, "%Y%m%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Fecha inválida: {value}. Usa YYYYMMDD."
        ) from exc
    return value

def download_parameter(parameter: str, start: str, end: str, timeout: int = 180) -> Path:
    if parameter not in CORE_PARAMETERS:
        raise ValueError(
            f"Parámetro no configurado: {parameter}. "
            f"Opciones: {', '.join(CORE_PARAMETERS)}"
        )
    if start > end:
        raise ValueError("La fecha inicial no puede ser posterior a la fecha final.")

    params = {
        "parameters": parameter,
        "community": POWER_COMMUNITY,
        "longitude-min": LON_MIN,
        "longitude-max": LON_MAX,
        "latitude-min": LAT_MIN,
        "latitude-max": LAT_MAX,
        "start": start,
        "end": end,
        "format": "NETCDF",
        "time-standard": POWER_TIME_STANDARD,
    }

    response = requests.get(POWER_BASE_URL, params=params, timeout=timeout)
    response.raise_for_status()

    # Verificación básica: NetCDF clásico empieza por CDF; NetCDF4/HDF5 por la firma HDF.
    content = response.content
    if not (content.startswith(b"CDF") or content.startswith(b"\x89HDF")):
        preview = content[:300].decode("utf-8", errors="replace")
        raise RuntimeError(
            "La respuesta no parece ser un archivo NetCDF. "
            f"Respuesta inicial: {preview}"
        )

    RAW_POWER_DIR.mkdir(parents=True, exist_ok=True)
    output = RAW_POWER_DIR / f"power_daily_{parameter}_{start}_{end}.nc"
    output.write_bytes(content)
    return output

def main():
    parser = argparse.ArgumentParser(
        description="Descarga datos diarios regionales de NASA POWER en NetCDF."
    )
    parser.add_argument("--start", type=validate_date, default="20240101")
    parser.add_argument("--end", type=validate_date, default="20240107")
    parser.add_argument(
        "--parameter",
        choices=list(CORE_PARAMETERS),
        help="Descarga un solo parámetro."
    )
    parser.add_argument(
        "--all-core",
        action="store_true",
        help="Descarga los cuatro parámetros meteorológicos principales."
    )
    parser.add_argument("--pause", type=float, default=2.0)
    args = parser.parse_args()

    if not args.parameter and not args.all_core:
        parser.error("Indica --parameter o --all-core.")

    parameters = list(CORE_PARAMETERS) if args.all_core else [args.parameter]

    for index, parameter in enumerate(parameters):
        print(f"[{index + 1}/{len(parameters)}] Descargando {parameter}...")
        path = download_parameter(parameter, args.start, args.end)
        print(f"  Guardado: {path}")
        if index < len(parameters) - 1:
            time.sleep(max(0, args.pause))

if __name__ == "__main__":
    main()
