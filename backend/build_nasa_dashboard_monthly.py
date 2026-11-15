"""Create the compact per-state monthly NASA POWER series used by the dashboard."""

from __future__ import annotations

import csv
import math
import shutil
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "frontend" / "src" / "data" / "nasa_datos" / "nasa_diario_por_estado.csv"
HISTORICAL_SOURCE = ROOT / "frontend" / "src" / "data" / "nasa_datos" / "nasa_diario_por_estado_2023_2024.csv"
OUTPUT = ROOT / "backend" / "data" / "nasa_dashboard_mensual.csv"
FRONTEND_OUTPUT = ROOT / "frontend" / "src" / "data" / "nasa_datos" / "nasa_dashboard_mensual.csv"
VARIABLES = {"T2M", "RH2M", "PRECTOTCORR", "GWETPROF"}
ALIASES = {"michoacan de ocampo": "michoacan", "veracruz de ignacio de la llave": "veracruz", "coahuila de zaragoza": "coahuila"}


def state_key(value: str) -> str:
    normalized = " ".join("".join(char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn").lower().split())
    return ALIASES.get(normalized, normalized)


def main() -> None:
    daily: dict[tuple[str, str, str], list[float | int]] = {}
    for source_path in (HISTORICAL_SOURCE, SOURCE):
        with source_path.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                variable = str(row.get("variable", "")).upper()
                if variable not in VARIABLES:
                    continue
                entity_code = str(row.get("cve_ent", "")).zfill(2)
                state = {"09": "ciudad de mexico", "15": "estado de mexico"}.get(entity_code, state_key(str(row.get("estado", ""))))
                date = str(row.get("fecha", ""))
                try:
                    value = float(row.get("valor", ""))
                except (TypeError, ValueError):
                    continue
                if not state or len(date) != 10 or not math.isfinite(value) or value == -999:
                    continue
                slot = daily.setdefault((state, date, variable), [0.0, 0])
                slot[0] += value
                slot[1] += 1

    monthly: dict[tuple[str, int, int, str], list[float | int]] = defaultdict(lambda: [0.0, 0])
    for (state, date, variable), (total, count) in daily.items():
        year, month = int(date[:4]), int(date[5:7])
        bucket = monthly[(state, year, month, variable)]
        bucket[0] += total / count
        bucket[1] += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(["estado", "anio", "mes", "variable", "valor", "dias"])
        for (state, year, month, variable), (total, days) in sorted(monthly.items()):
            value = total if variable == "PRECTOTCORR" else total / days
            writer.writerow([state, year, month, variable, round(value, 6), days])
    FRONTEND_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUTPUT, FRONTEND_OUTPUT)
    print(f"Wrote {len(monthly)} monthly records from {HISTORICAL_SOURCE.name} + {SOURCE.name} to {OUTPUT}")


if __name__ == "__main__":
    main()
