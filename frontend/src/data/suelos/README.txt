
PAQUETE DE DATOS DE SUELOS - INEGI
===================================

Contenido:
- perfiles_calidad_suelo.csv
- contexto_ambiental.csv
- resumen_clusters.csv
- centros_clusters.csv
- diccionario_variables.csv
- registros_excluidos.csv

RESUMEN DEL PROCESAMIENTO
-------------------------

Registros originales: 16820
Registros conservados: 14350
Registros excluidos: 2470

Criterio de exclusión:
Se excluyeron perfiles que tienen valor cero simultáneamente
en las ocho variables químicas utilizadas para K-Means:
PH, CO, CIC, CE, K, CA, MG, NA.

Los registros excluidos se conservan en registros_excluidos.csv
para mantener la trazabilidad del procesamiento.

MINERÍA DE DATOS
----------------

Se aplicó K-Means con tres grupos sobre las variables:
PH, CO, CIC, CE, K, CA, MG, NA.

Se realizó estandarización mediante media y desviación estándar.
La agrupación es exploratoria y no representa una clasificación
oficial del suelo ni una evaluación de fertilidad.

CONSIDERACIONES
---------------

- Los datos proceden de registros históricos de INEGI.
- No representan mediciones actuales.
- Los valores extremos se conservaron.
- Los valores cero individuales se conservaron.
- Las fechas inválidas se mantienen como fechas vacías.
- Las unidades deben verificarse antes de realizar
  interpretaciones agronómicas o recomendaciones.
- Los grupos A, B y C son etiquetas exploratorias.

Los archivos CSV pueden utilizarse desde Python, R o JavaScript.
Para Vercel, los archivos necesarios pueden colocarse en
la carpeta public/datos/ del proyecto web.
