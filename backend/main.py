"""State-level NASA POWER summaries using area-weighted grid intersections."""

from __future__ import annotations

import math
import os
import threading
import csv
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pyproj import Transformer
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import transform as transform_geometry, unary_union
from shapely.validation import make_valid


NASA_REGIONAL_URL = "https://power.larc.nasa.gov/api/temporal/daily/regional"
NASA_POINT_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
INEGI_STATES_URL = "https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/"
BACKEND_DATA_DIR = Path(__file__).resolve().parent / "data"
SOIL_PROFILES_CSV = BACKEND_DATA_DIR / "perfiles_calidad_suelo.csv"
NASA_MONTHLY_CSV = BACKEND_DATA_DIR / "nasa_dashboard_mensual.csv"
LON_STEP = 0.625
LAT_STEP = 0.5
MAX_BLOCK_DEGREES = 9.0
BLOCK_OVERLAP_DEGREES = 1.0
CACHE_SECONDS = 6 * 60 * 60
NASA_TIMEOUT_SECONDS = 180

PARAMETERS = {
    "T2M": {"label": "Temperature at 2 m", "unit": "°C", "min": -80, "max": 60},
    "RH2M": {"label": "Relative humidity at 2 m", "unit": "%", "min": 0, "max": 100},
    "PRECTOTCORR": {"label": "Corrected precipitation", "unit": "mm", "min": 0, "max": 1000},
    "GWETPROF": {"label": "Profile soil wetness", "unit": "fraction", "min": 0, "max": 1},
}

ALIASES = {
    "coahuila de zaragoza": "coahuila",
    "michoacan de ocampo": "michoacan",
    "veracruz de ignacio de la llave": "veracruz",
    "veracruz llave": "veracruz",
    "estado de mexico": "mexico",
    "distrito federal": "ciudad de mexico",
    "cdmx": "ciudad de mexico",
}

PROJECTOR = Transformer.from_crs("EPSG:4326", "EPSG:6372", always_xy=True)
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Agroclimatic/1.0 (NASA POWER regional map)"})
app = FastAPI(
    title="Agroclimatic NASA POWER API",
    description="Area-weighted NASA POWER weather summaries for Mexican states.",
    version="1.0.0",
)

allowed_origins = {
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
}
allowed_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"https?://(localhost|127\.0\.0\.1)(:\d+)?")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_cache_lock = threading.Lock()


def normalize_name(value: str) -> str:
    import unicodedata

    text = "".join(
        char for char in unicodedata.normalize("NFD", str(value))
        if unicodedata.category(char) != "Mn"
    ).lower().strip()
    return ALIASES.get(" ".join(text.split()), " ".join(text.split()))


def polygon_parts(geometry: Any) -> list[Polygon]:
    if geometry is None or geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, (MultiPolygon, GeometryCollection)):
        return [part for item in geometry.geoms for part in polygon_parts(item)]
    return []


def repair_polygon(geometry: Any) -> Any:
    if geometry is None or geometry.is_empty:
        raise ValueError("An empty state or grid geometry was received.")
    repaired = make_valid(geometry) if not geometry.is_valid else geometry
    parts = polygon_parts(repaired)
    if not parts:
        raise ValueError("No polygon components were found in a geometry.")
    merged = unary_union(parts)
    if not merged.is_valid:
        merged = make_valid(merged)
        parts = polygon_parts(merged)
        if not parts:
            raise ValueError("A polygon geometry could not be repaired.")
        merged = unary_union(parts)
    if merged.is_empty or not merged.is_valid:
        raise ValueError("A polygon geometry remains invalid after repair.")
    return merged


@lru_cache(maxsize=1)
def load_state_geometries() -> dict[str, tuple[str, Any]]:
    """Load official state outlines from the same INEGI GeoJSON used by the map."""
    try:
        response = HTTP.get(INEGI_STATES_URL, timeout=45)
        response.raise_for_status()
        collection = response.json()
        features = collection.get("features", [])
        if collection.get("type") != "FeatureCollection" or len(features) < 30:
            raise ValueError("INEGI returned an unexpected state GeoJSON collection.")
        states: dict[str, tuple[str, Any]] = {}
        for feature in features:
            properties = feature.get("properties") or {}
            name = next(
                (properties[key] for key in ("nomgeo", "state_name", "name", "NOMGEO", "NAME_1") if properties.get(key)),
                None,
            )
            if not name or not feature.get("geometry"):
                continue
            states[normalize_name(name)] = (str(name), repair_polygon(shape(feature["geometry"])))
        if len(states) < 30:
            raise ValueError(f"Only {len(states)} state outlines could be read from INEGI.")
        return states
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        raise HTTPException(status_code=502, detail=f"Could not load state boundaries: {error}") from error


def intervals(minimum: float, maximum: float) -> list[tuple[float, float]]:
    output = []
    start = minimum
    while start < maximum:
        end = min(start + MAX_BLOCK_DEGREES, maximum)
        output.append((start, end))
        if end >= maximum:
            break
        start = end - BLOCK_OVERLAP_DEGREES
    return output


def request_period() -> tuple[str, str]:
    end = datetime.now(timezone.utc).date() - timedelta(days=3)
    start = end - timedelta(days=6)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def valid_value(value: Any, parameter: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    limits = PARAMETERS[parameter]
    if not math.isfinite(number) or number == -999 or not limits["min"] <= number <= limits["max"]:
        return None
    return number


def fetch_nasa_grid(parameter: str, start: str, end: str, states: dict[str, tuple[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
    geometries = [item[1] for item in states.values()]
    min_lon = min(geometry.bounds[0] for geometry in geometries) - LON_STEP / 2
    min_lat = min(geometry.bounds[1] for geometry in geometries) - LAT_STEP / 2
    max_lon = max(geometry.bounds[2] for geometry in geometries) + LON_STEP / 2
    max_lat = max(geometry.bounds[3] for geometry in geometries) + LAT_STEP / 2

    lon_blocks = intervals(min_lon, max_lon)
    lat_blocks = intervals(min_lat, max_lat)
    block_count = len(lon_blocks) * len(lat_blocks)
    centers: dict[tuple[float, float], dict[str, Any]] = {}

    for lat_min, lat_max in lat_blocks:
        for lon_min, lon_max in lon_blocks:
            params = {
                "latitude-min": lat_min,
                "latitude-max": lat_max,
                "longitude-min": lon_min,
                "longitude-max": lon_max,
                # POWER regional daily requests accept one parameter per call.
                "parameters": parameter,
                "community": "AG",
                "start": start,
                "end": end,
                "format": "JSON",
                "time-standard": "UTC",
            }
            try:
                response = HTTP.get(NASA_REGIONAL_URL, params=params, timeout=NASA_TIMEOUT_SECONDS)
                if not response.ok:
                    try:
                        detail = response.json()
                    except ValueError:
                        detail = response.text
                    raise HTTPException(
                        status_code=502,
                        detail=f"NASA POWER regional request returned HTTP {response.status_code}: {str(detail)[:1200]}",
                    )
                payload = response.json()
            except requests.RequestException as error:
                raise HTTPException(status_code=502, detail=f"NASA POWER request failed: {error}") from error
            except ValueError as error:
                raise HTTPException(status_code=502, detail=f"NASA POWER returned invalid JSON: {error}") from error

            features = payload.get("features")
            if not isinstance(features, list):
                raise HTTPException(status_code=502, detail="NASA POWER returned an unexpected regional response.")
            for feature in features:
                geometry = feature.get("geometry") or {}
                coordinates = geometry.get("coordinates") or []
                if geometry.get("type") != "Point" or len(coordinates) < 2:
                    continue
                try:
                    lon, lat = float(coordinates[0]), float(coordinates[1])
                except (TypeError, ValueError):
                    continue
                series = ((feature.get("properties") or {}).get("parameter") or {}).get(parameter)
                if not isinstance(series, dict):
                    continue
                key = (round(lon, 6), round(lat, 6))
                centers.setdefault(key, {"lon": lon, "lat": lat, "values": {}})["values"].update(series)

    if not centers:
        raise HTTPException(status_code=502, detail=f"NASA POWER returned no valid {parameter} grid centers.")

    # Validate that NASA's returned point centers share the nominal POWER grid
    # phase before reconstructing cell polygons for area-weighted aggregation.
    longitudes = sorted({center["lon"] for center in centers.values()})
    latitudes = sorted({center["lat"] for center in centers.values()})
    for coordinates, step, axis in (
        (longitudes, LON_STEP, "longitude"),
        (latitudes, LAT_STEP, "latitude"),
    ):
        if not coordinates:
            continue
        origin = coordinates[0]
        misaligned = [value for value in coordinates if abs((value - origin) / step - round((value - origin) / step)) > 1e-5]
        if misaligned:
            raise HTTPException(
                status_code=502,
                detail=f"NASA POWER returned {axis} centers that do not align to the expected {step}° grid.",
            )

    cells = []
    for center in centers.values():
        geographic_cell = box(
            center["lon"] - LON_STEP / 2,
            center["lat"] - LAT_STEP / 2,
            center["lon"] + LON_STEP / 2,
            center["lat"] + LAT_STEP / 2,
        )
        projected = repair_polygon(transform_geometry(PROJECTOR.transform, geographic_cell))
        values = {date: valid_value(value, parameter) for date, value in center["values"].items()}
        cells.append({"geometry": projected, "lon": center["lon"], "lat": center["lat"], "values": values})
    return cells, block_count, len(centers)


def summarize_states(parameter: str, start: str, end: str) -> dict[str, Any]:
    states = load_state_geometries()
    cells, block_count, center_count = fetch_nasa_grid(parameter, start, end, states)
    dates = sorted({date for cell in cells for date in cell["values"]})
    if not dates:
        raise HTTPException(status_code=502, detail=f"NASA POWER returned no valid dates for {parameter}.")

    state_results = []
    for _, (display_name, geographic_geometry) in states.items():
        try:
            state_geometry = repair_polygon(transform_geometry(PROJECTOR.transform, geographic_geometry))
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=502, detail=f"Could not project {display_name} geometry: {error}") from error
        state_area = state_geometry.area
        if state_area <= 0:
            continue

        overlaps = []
        for cell in cells:
            if not state_geometry.intersects(cell["geometry"]):
                continue
            area = state_geometry.intersection(cell["geometry"]).area
            if area > 0:
                overlaps.append((cell["values"], area))

        daily = []
        for date in dates:
            covered_area = 0.0
            weighted_sum = 0.0
            valid_cells = 0
            for values, area in overlaps:
                value = values.get(date)
                if value is None:
                    continue
                weighted_sum += value * area
                covered_area += area
                valid_cells += 1
            if covered_area <= 0:
                continue
            daily.append({
                "date": date,
                "value": round(weighted_sum / covered_area, 4),
                "coverage_pct": round(min(100.0, covered_area / state_area * 100), 2),
                "cells": valid_cells,
            })

        parameter_mean = (sum(day["value"] for day in daily) / len(daily)) if daily else None
        precipitation_total = sum(day["value"] for day in daily) if parameter == "PRECTOTCORR" and daily else None
        state_results.append({
            "state": display_name,
            "parameter": parameter,
            "mean_value": round(parameter_mean, 2) if parameter_mean is not None else None,
            "period_total": round(precipitation_total, 2) if precipitation_total is not None else None,
            "unit": PARAMETERS[parameter]["unit"],
            "area_km2": round(state_area / 1_000_000, 2),
            "coverage_pct": round(sum(day["coverage_pct"] for day in daily) / len(daily), 2) if daily else 0,
            "valid_days": len(daily),
            "cells": max((day["cells"] for day in daily), default=0),
            "daily": daily,
        })

    return {
        "source": "NASA POWER Daily Regional",
        "parameter": parameter,
        "label": PARAMETERS[parameter]["label"],
        "unit": PARAMETERS[parameter]["unit"],
        "community": "AG",
        "period": {"start": dates[0], "end": dates[-1], "days": len(dates)},
        "spatial_query": {
            "blocks": block_count,
            "max_block_degrees": MAX_BLOCK_DEGREES,
            "overlap_degrees": BLOCK_OVERLAP_DEGREES,
            "nasa_centers": center_count,
        },
        "method": {
            "type": "Area-weighted mean of grid-cell/state polygon intersections",
            "grid_resolution_degrees": {"longitude": LON_STEP, "latitude": LAT_STEP},
            "area_projection": "EPSG:6372",
            "cell_bounds": "Reconstructed from NASA centers and nominal grid spacing.",
        },
        "states": state_results,
    }


@app.get("/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/geo/estados")
def state_boundaries() -> dict[str, Any]:
    """Return the cached INEGI state outlines through the same-origin API."""
    states = load_state_geometries()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"nomgeo": display_name},
                "geometry": mapping(geometry),
            }
            for display_name, geometry in states.values()
        ],
    }


@lru_cache(maxsize=1)
def load_soil_profile_points() -> dict[str, Any]:
    """Aggregate historical INEGI profile records into coordinate markers."""
    if not SOIL_PROFILES_CSV.is_file():
        raise HTTPException(status_code=500, detail=f"Historical INEGI soil CSV was not found: {SOIL_PROFILES_CSV}")

    groups: dict[tuple[float, float], dict[str, Any]] = {}
    total_records = 0
    try:
        with SOIL_PROFILES_CSV.open("r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            required = {"latitud", "longitud", "cluster", "GPO_SUELO"}
            if not required.issubset(set(reader.fieldnames or [])):
                raise ValueError("The soil CSV does not have the required coordinate and cluster columns.")

            for row in reader:
                try:
                    latitude = float(row["latitud"])
                    longitude = float(row["longitud"])
                    cluster = int(row["cluster"])
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(latitude) or not math.isfinite(longitude) or cluster not in (0, 1, 2):
                    continue
                if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                    continue

                key = (round(longitude, 5), round(latitude, 5))
                point = groups.setdefault(key, {
                    "longitude": key[0],
                    "latitude": key[1],
                    "record_count": 0,
                    "cluster_counts": {0: 0, 1: 0, 2: 0},
                    "soil_groups": {},
                })
                point["record_count"] += 1
                point["cluster_counts"][cluster] += 1
                soil_group = (row.get("GPO_SUELO") or "Not specified").strip() or "Not specified"
                point["soil_groups"][soil_group] = point["soil_groups"].get(soil_group, 0) + 1
                total_records += 1
    except (OSError, csv.Error, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read historical INEGI soil profiles: {error}") from error

    features = []
    for point in groups.values():
        counts = point["cluster_counts"]
        dominant_cluster = max(counts, key=counts.get)
        dominant_soil_group = max(point["soil_groups"], key=point["soil_groups"].get)
        features.append({
            "type": "Feature",
            "properties": {
                "record_count": point["record_count"],
                "cluster": dominant_cluster,
                "cluster_counts": {str(key): value for key, value in counts.items() if value},
                "soil_group": dominant_soil_group,
            },
            "geometry": {"type": "Point", "coordinates": [point["longitude"], point["latitude"]]},
        })

    if not features:
        raise HTTPException(status_code=502, detail="The INEGI soil CSV did not contain usable geolocated records.")
    return {
        "type": "FeatureCollection",
        "source": "INEGI historical soil profile CSV",
        "record_count": total_records,
        "location_count": len(features),
        "classification": "Exploratory K-means chemical groups; not an official soil-quality rating.",
        "features": features,
    }


@app.get("/api/suelos/perfiles")
def historical_soil_profiles() -> dict[str, Any]:
    """Return cached, coordinate-aggregated INEGI historical soil profiles."""
    return load_soil_profile_points()


DASHBOARD_VARIABLES = {
    "T2M": {"unit": "°C", "minimum": -80, "maximum": 60, "aggregation": "mean"},
    "RH2M": {"unit": "%", "minimum": 0, "maximum": 100, "aggregation": "mean"},
    "PRECTOTCORR": {"unit": "mm", "minimum": 0, "maximum": 5000, "aggregation": "sum"},
    "GWETPROF": {"unit": "fraction", "minimum": 0, "maximum": 1, "aggregation": "mean"},
}


def dashboard_state_key(value: str) -> str:
    import unicodedata

    name = " ".join("".join(char for char in unicodedata.normalize("NFD", str(value)) if unicodedata.category(char) != "Mn").lower().split())
    aliases = {"michoacan de ocampo": "michoacan", "veracruz de ignacio de la llave": "veracruz", "coahuila de zaragoza": "coahuila"}
    return aliases.get(name, name)


@lru_cache(maxsize=1)
def load_nasa_monthly_history() -> dict[str, dict[str, dict[str, list[dict[str, Any]]]]]:
    """Load a compact monthly aggregation derived from the bundled NASA daily CSV."""
    if not NASA_MONTHLY_CSV.is_file():
        raise HTTPException(status_code=500, detail="The historical NASA monthly summary is missing; regenerate it from nasa_diario_por_estado.csv.")

    monthly: dict[str, dict[str, dict[str, list[dict[str, Any]]]]] = {}
    try:
        with NASA_MONTHLY_CSV.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                variable = str(row.get("variable", "")).upper()
                if variable not in DASHBOARD_VARIABLES:
                    continue
                state = str(row.get("estado", ""))
                try:
                    year = int(row.get("anio", ""))
                    month_index = int(row.get("mes", "")) - 1
                    value = float(row.get("valor", ""))
                    days = int(row.get("dias", ""))
                except (TypeError, ValueError):
                    continue
                bounds = DASHBOARD_VARIABLES[variable]
                if not state or not 0 <= month_index < 12 or days < 1 or not math.isfinite(value) or not bounds["minimum"] <= value <= bounds["maximum"]:
                    continue
                month = f"{year:04d}-{month_index + 1:02d}"
                entry = {"year": year, "month": month_index, "value": value, "days": days}
                monthly.setdefault(state, {}).setdefault(variable, {})[month] = entry
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Could not read the historical NASA monthly summary: {error}") from error
    return monthly


def linear_projection(points: list[tuple[float, float]], target_year: int) -> float | None:
    if not points:
        return None
    mean_x = sum(point[0] for point in points) / len(points)
    mean_y = sum(point[1] for point in points) / len(points)
    denominator = sum((x - mean_x) ** 2 for x, _ in points)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in points) / denominator if denominator else 0.0
    return mean_y + slope * (target_year - mean_x)


def dashboard_forecast(state: str, target_year: int = 2027) -> dict[str, Any]:
    history = load_nasa_monthly_history()
    state_key = dashboard_state_key(state)
    if state_key in {"mexico", "todo mexico", ""}:
        selected = [data for key, data in history.items()]
    else:
        selected = [history[state_key]] if state_key in history else []
    result: dict[str, list[dict[str, Any]]] = {}
    for variable, details in DASHBOARD_VARIABLES.items():
        month_predictions = []
        for month_index in range(12):
            by_year: dict[int, list[float]] = {}
            for state_data in selected:
                for month_key, entry in state_data.get(variable, {}).items():
                    if entry["month"] == month_index:
                        by_year.setdefault(entry["year"], []).append(entry["value"])
            points = [(year, sum(values) / len(values)) for year, values in sorted(by_year.items())]
            value = linear_projection(points, target_year)
            if value is not None:
                value = min(details["maximum"], max(details["minimum"], value))
            month_predictions.append({"month": month_index, "value": round(value, 2) if value is not None else None, "history_years": len(points)})
        result[variable] = month_predictions
    return result


def dashboard_historical_year(state: str, target_year: int) -> dict[str, list[dict[str, Any]]]:
    history = load_nasa_monthly_history()
    state_key = dashboard_state_key(state)
    selected = list(history.values()) if state_key in {"mexico", "todo mexico", ""} else ([history[state_key]] if state_key in history else [])
    result: dict[str, list[dict[str, Any]]] = {}
    for variable, details in DASHBOARD_VARIABLES.items():
        series = []
        for month_index in range(12):
            entries = [
                month_data[f"{target_year:04d}-{month_index + 1:02d}"]
                for state_data in selected
                if (month_data := state_data.get(variable, {})).get(f"{target_year:04d}-{month_index + 1:02d}")
            ]
            if not entries:
                series.append({"month": month_index, "value": None, "days": 0})
                continue
            values = [entry["value"] for entry in entries]
            value = sum(values) if details["aggregation"] == "sum" and len(selected) == 1 else sum(values) / len(values)
            series.append({"month": month_index, "value": round(value, 2), "days": max(entry["days"] for entry in entries)})
        result[variable] = series
    return result


@app.get("/api/dashboard/clima")
def dashboard_climate(
    state: str = Query(default="México", min_length=1, max_length=80),
    latitude: float = Query(default=23.6, ge=14, le=33.5),
    longitude: float = Query(default=-102.5, ge=-119, le=-85),
) -> dict[str, Any]:
    """Return current-year NASA POWER observations and CSV-based linear forecasts."""
    now = datetime.now(timezone.utc).date()
    current_year = now.year
    end_date = now - timedelta(days=3)
    historical = {str(year): dashboard_historical_year(state, year) for year in range(current_year - 3, current_year)}
    forecast = {str(year): dashboard_forecast(state, year) for year in range(current_year + 1, current_year + 4)}
    forecast_has_data = {year: any(entry["value"] is not None for series in data.values() for entry in series) for year, data in forecast.items()}
    observed: dict[str, Any] = {variable: {} for variable in DASHBOARD_VARIABLES}
    api_error = None
    if end_date.year == current_year:
        parameters = ",".join(DASHBOARD_VARIABLES)
        params = {
            "latitude": round(latitude, 3),
            "longitude": round(longitude, 3),
            "parameters": parameters,
            "community": "AG",
            "start": f"{current_year}0101",
            "end": end_date.strftime("%Y%m%d"),
            "format": "JSON",
            "time-standard": "UTC",
        }
        try:
            response = HTTP.get(NASA_POINT_URL, params=params, timeout=90)
            response.raise_for_status()
            payload = response.json()
            series = (payload.get("properties", {}).get("parameter", {}))
            for variable, daily_values in series.items():
                if variable not in DASHBOARD_VARIABLES or not isinstance(daily_values, dict):
                    continue
                for stamp, raw_value in daily_values.items():
                    try:
                        value = float(raw_value)
                    except (TypeError, ValueError):
                        continue
                    limits = DASHBOARD_VARIABLES[variable]
                    if not math.isfinite(value) or not limits["minimum"] <= value <= limits["maximum"]:
                        continue
                    month_index = int(stamp[4:6]) - 1
                    month_record = observed[variable].setdefault(month_index, {"sum": 0.0, "days": 0})
                    month_record["sum"] += value
                    month_record["days"] += 1
        except (requests.RequestException, ValueError, KeyError, TypeError) as error:
            api_error = f"NASA POWER current-year query failed: {error}"

    for variable, details in DASHBOARD_VARIABLES.items():
        for month_index, record in list(observed[variable].items()):
            value = record["sum"] if details["aggregation"] == "sum" else record["sum"] / max(record["days"], 1)
            record["value"] = round(value, 2)
            del record["sum"]

    return {
        "state": state,
        "current_year": current_year,
        "forecast_years": list(forecast),
        "source": "NASA POWER Daily Point API + historical NASA POWER CSV",
        "observed": observed,
        "historical": historical,
        "forecast": forecast,
        "forecast_has_data": forecast_has_data,
        "period": {"start": f"{current_year}-01-01", "end": end_date.isoformat()},
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "method": "Historical NASA POWER CSV monthly aggregates and per-calendar-month ordinary least squares regression on annual monthly means.",
        "history_period": "2023-11 to 2026-10",
        "limitation": "The historical NASA series spans nearly three years; forward estimates are exploratory trend projections, not seasonal forecasts.",
        "error": api_error,
    }


@app.get("/api/clima/nacional")
def national_climate(parameter: str = Query(default="T2M", alias="parameter")) -> dict[str, Any]:
    parameter = parameter.upper()
    if parameter not in PARAMETERS:
        raise HTTPException(status_code=422, detail=f"Unsupported NASA POWER parameter: {parameter}.")

    now = datetime.now(timezone.utc)
    with _cache_lock:
        cached = _cache.get(parameter)
        if cached and (now.timestamp() - cached[0]) < CACHE_SECONDS:
            return cached[1]

    start, end = request_period()
    result = summarize_states(parameter, start, end)
    result["updated_at"] = now.isoformat()
    with _cache_lock:
        _cache[parameter] = (now.timestamp(), result)
    return result
