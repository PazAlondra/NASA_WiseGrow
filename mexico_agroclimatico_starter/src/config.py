from pathlib import Path

# Extensión rectangular de consulta. NO equivale a un límite político exacto de México.
# Se usa inicialmente para solicitar la región que contiene el territorio mexicano.
LAT_MIN = 14.0
LAT_MAX = 33.5
LON_MIN = -119.0
LON_MAX = -86.0

POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/regional"
POWER_COMMUNITY = "AG"
POWER_TIME_STANDARD = "UTC"

# Una variable por solicitud: la API regional diaria de POWER limita cada solicitud
# regional a un parámetro.
CORE_PARAMETERS = {
    "PRECTOTCORR": "precipitación corregida (mm/día)",
    "T2M": "temperatura media a 2 m (°C)",
    "T2M_MAX": "temperatura máxima a 2 m (°C)",
    "T2M_MIN": "temperatura mínima a 2 m (°C)",
}

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_POWER_DIR = PROJECT_ROOT / "data" / "raw" / "power"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
