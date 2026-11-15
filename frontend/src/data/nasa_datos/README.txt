PAQUETE DE DATOS NASA POWER - MEXICO

ARCHIVOS:

1. nasa_diario_por_estado.csv
   Datos diarios por coordenada, fecha, entidad y variable
   (2024-11-01 a 2026-10-31).

2. nasa_diario_por_estado_2023_2024.csv
   Extension NASA POWER para completar el periodo 2023-11-01
   a 2024-10-31. Se genera con backend/download_nasa_history.py.

3. nasa_dashboard_mensual.csv
   Agregación mensual de los CSV diarios, usada por el dashboard
   para el histórico y las proyecciones lineales.

4. nasa_resumen_espacial.geojson
   Puntos geograficos con promedios, minimos y maximos
   de cada variable durante el periodo.

5. nasa_metadatos.json
   Informacion de las variables, unidades, fechas y fuente.

VARIABLES:

T2M                  Temperatura a 2 metros (C)
T2M_MAX              Temperatura maxima (C)
T2M_MIN              Temperatura minima (C)
PRECTOTCORR          Precipitacion corregida (mm/day)
GWETPROF             Humedad estimada del perfil del suelo
ALLSKY_SFC_SW_DWN    Radiacion solar (MJ/m^2/day)
RH2M                 Humedad relativa (%)

PERIODO COMBINADO:
2023-11-01 a 2026-10-31 (aproximadamente tres años)

IMPORTANTE:

- Las variables pueden tener distintas resoluciones espaciales.
- Los valores -999 de NASA se omiten del CSV.
- Las coordenadas se recortan al territorio de Mexico.
- Los datos representan estimaciones ambientales.
- No deben interpretarse como mediciones directas de laboratorio.
- El tiempo utilizado es LST (Local Solar Time).
