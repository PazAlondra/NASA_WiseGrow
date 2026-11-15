"""Download the missing Nov 2023–Oct 2024 NASA POWER daily grid series for Mexico."""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

from shapely.geometry import Point
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.main import PARAMETERS, dashboard_state_key, fetch_nasa_grid, load_state_geometries, valid_value


OUTPUT = ROOT / "frontend" / "src" / "data" / "nasa_datos" / "nasa_diario_por_estado_2023_2024.csv"
TEMP = OUTPUT.with_suffix(".csv.tmp")
START = "20231101"
END = "20241031"
STATE_CODES = {
    "aguascalientes": "01", "baja california": "02", "baja california sur": "03",
    "campeche": "04", "coahuila": "05", "colima": "06", "chiapas": "07",
    "chihuahua": "08", "ciudad de mexico": "09", "durango": "10",
    "guanajuato": "11", "guerrero": "12", "hidalgo": "13", "jalisco": "14",
    "mexico": "15", "michoacan": "16", "morelos": "17", "nayarit": "18",
    "nuevo leon": "19", "oaxaca": "20", "puebla": "21", "queretaro": "22",
    "quintana roo": "23", "san luis potosi": "24", "sinaloa": "25", "sonora": "26",
    "tabasco": "27", "tamaulipas": "28", "tlaxcala": "29", "veracruz": "30",
    "yucatan": "31", "zacatecas": "32",
}


def main() -> None:
    states = load_state_geometries()
    prepared_states = []
    for key, (name, geometry) in states.items():
        normalized = dashboard_state_key(name)
        if normalized not in STATE_CODES:
            raise RuntimeError(f"No official state code mapping found for {name!r} ({key!r}).")
        prepared_states.append((STATE_CODES[normalized], name, geometry, prep(geometry)))

    total_rows = 0
    points_by_variable: dict[str, int] = {}
    try:
        with TEMP.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            writer.writerow(["latitud", "longitud", "cve_ent", "estado", "fecha", "variable", "valor", "unidad"])
            for variable, details in PARAMETERS.items():
                cells, block_count, _ = fetch_nasa_grid(variable, START, END, states)
                matching_points = 0
                for cell in cells:
                    point = Point(cell["lon"], cell["lat"])
                    owner = next((
                        (code, name) for code, name, geometry, prepared in prepared_states
                        if prepared.covers(point)
                    ), None)
                    if owner is None:
                        continue
                    code, name = owner
                    values = cell["values"]
                    for date, raw_value in values.items():
                        value = valid_value(raw_value, variable)
                        if value is None:
                            continue
                        iso_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}" if len(date) == 8 else date
                        writer.writerow([cell["lat"], cell["lon"], code, name, iso_date, variable, value, details["unit"]])
                        total_rows += 1
                    matching_points += 1
                points_by_variable[variable] = matching_points
                print(f"{variable}: {matching_points} Mexican grid cells from {block_count} NASA regional blocks.", flush=True)
                if not matching_points:
                    raise RuntimeError(f"NASA returned no Mexican grid cells for {variable}.")

        if total_rows == 0:
            raise RuntimeError("NASA POWER returned no valid observations for the requested historical period.")
        os.replace(TEMP, OUTPUT)
    except Exception:
        if TEMP.exists():
            TEMP.unlink()
        raise

    print(f"Saved {total_rows:,} daily NASA records to {OUTPUT}")
    print(f"Date range: {START[:4]}-{START[4:6]}-{START[6:]} to {END[:4]}-{END[4:6]}-{END[6:]}")
    print(f"Grid cells by variable: {points_by_variable}")


if __name__ == "__main__":
    main()
