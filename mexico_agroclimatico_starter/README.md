# Dataset agroclimático de México — inicio

Primera etapa: prueba de descarga regional NASA POWER y construcción de la cuadrícula
a partir de las coordenadas reales entregadas por el NetCDF.

## Alcance de esta versión

- Descarga regional diaria de NASA POWER.
- Parámetros iniciales: `PRECTOTCORR`, `T2M`, `T2M_MAX`, `T2M_MIN`.
- Formato original: NetCDF.
- Tiempo: UTC.
- Construcción de celdas a partir de las coordenadas presentes en el archivo descargado.
- Exportación de la cuadrícula a GeoPackage y CSV.

## Nota geográfica importante

La extensión configurada es un rectángulo de consulta que contiene México, no una frontera
política oficial. Como el proyecto restringe las fuentes a NASA, esta primera versión no
recorta las celdas al límite nacional: hacerlo con precisión requiere una geometría de
frontera. No etiquetes todas las celdas del rectángulo como territorio mexicano.

Además, la cuadrícula se construye desde las coordenadas del NetCDF de POWER, no desde
centros inventados. Verifica la resolución que imprime el script antes de continuar.

## 1. Crear entorno virtual (Windows PowerShell)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Si `py -3.12` no está instalado, usa una versión de Python compatible disponible en tu equipo.

## 2. Prueba pequeña de NASA POWER

Primero descarga una semana y una sola variable:

```powershell
python -m src.download_power --start 20240101 --end 20240107 --parameter T2M
```

Si funciona, descarga los cuatro parámetros principales para esa misma semana:

```powershell
python -m src.download_power --start 20240101 --end 20240107 --all-core
```

## 3. Construir la cuadrícula desde el NetCDF

```powershell
python -m src.build_grid data/raw/power/power_daily_T2M_20240101_20240107.nc
```

Se crearán:

- `data/processed/power_grid_candidate.gpkg`
- `data/processed/power_grid_candidate.csv`

## 4. Descarga histórica

No descargues todavía todo el periodo histórico ni ejecutes miles de solicitudes puntuales.
Primero valida el NetCDF regional, sus coordenadas, unidades, valores faltantes y cobertura.
Después se definirá la estrategia de descarga por bloques temporales y parámetros.

## Fuentes oficiales

- NASA POWER Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA POWER API tutorial: https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/

## Parámetros iniciales

| Código | Descripción | Unidad esperada |
|---|---|---|
| PRECTOTCORR | Precipitación corregida | mm/day |
| T2M | Temperatura media a 2 m | °C |
| T2M_MAX | Temperatura máxima a 2 m | °C |
| T2M_MIN | Temperatura mínima a 2 m | °C |

Consulta los metadatos de cada respuesta y confirma unidades y disponibilidad antes de
integrar datos de otras fuentes.
