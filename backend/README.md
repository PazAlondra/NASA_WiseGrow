# NASA POWER map API

The map frontend calls this API instead of calling NASA POWER from the browser.
The API queries one NASA POWER Daily Regional parameter at a time, as in the
provided working example, then joins the grid to state boundaries and calculates
area-weighted state summaries using polygon intersections.

## Start the API

From the project root, create and activate a Python virtual environment, then run:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The frontend defaults to `http://127.0.0.1:8000`. Set `VITE_API_URL` in
`frontend/.env.local` if the API runs at a different address, for example:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

The service exposes `/healthz`, `/api/geo/estados`,
`/api/clima/nacional?parameter=T2M`, `/api/suelos/perfiles`, and
`/api/dashboard/clima?state=Puebla&latitude=19.0&longitude=-98.2`.
Supported map parameters are `T2M`, `RH2M`, and `PRECTOTCORR`. Results are
cached for six hours. Mexican state outlines are loaded from INEGI; environmental
values come from NASA POWER. The soil profile endpoint reads the bundled
`backend/data/perfiles_calidad_suelo.csv`, aggregates historical
INEGI records by coordinate, and returns exploratory K-means group labels. Those
groups are not an official soil-quality rating. Satellite imagery continues to
load through NASA GIBS.

The dashboard endpoint returns current-year NASA POWER Daily Point observations
for the selected state's representative coordinates, three historical years,
and three forward projection years. Projections for 2027–2029 use ordinary least
squares regression from `backend/data/nasa_dashboard_mensual.csv`, a compact
monthly aggregation of NASA POWER daily data from November 2023 through October
2026. The first historical year is partial. These are exploratory trends, not
seasonal forecasts.

The backend's runtime data is kept inside `backend/data/` so Vercel can deploy
the API with Root Directory `backend`. The original daily extracts are excluded
from Git because one exceeds GitHub's regular per-file limit; they are only
needed when rebuilding the monthly series. From the repository root, run
`python backend/build_nasa_dashboard_monthly.py` after placing both source
extracts in `frontend/src/data/nasa_datos/`. To download the supplemental
November 2023–October 2024 extract, run `python backend/download_nasa_history.py`.

For Vercel, create a project with Root Directory `backend`, set `CORS_ORIGINS`
to the frontend's deployed origin, and deploy. The FastAPI entrypoint and
function duration are specified in `pyproject.toml` and `vercel.json`.
