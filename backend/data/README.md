# Runtime data

These compact datasets are included with the FastAPI deployment:

- `nasa_dashboard_mensual.csv`: per-state monthly NASA POWER aggregates from the historical daily extracts.
- `perfiles_calidad_suelo.csv`: historical INEGI soil profiles used by `/api/suelos/perfiles`.

The much larger daily NASA CSV extracts are kept under `frontend/src/data/nasa_datos/` locally and ignored by Git. They are not needed for Vercel runtime. If you refresh the historical extracts, run `python backend/build_nasa_dashboard_monthly.py` from the repository root to regenerate this directory's monthly file.
