# Agroclimatic · NASA

Web application for exploring NASA POWER climate data by Mexican state and reviewing historical soil profiles from INEGI.

## Project layout

- `frontend/`: React + Vite single-page application.
- `backend/`: FastAPI service for NASA POWER queries, state boundaries, soil profiles, and dashboard projections.
- `backend/data/`: small runtime datasets included with the API deployment.
- `frontend/src/data/nasa_datos/`: project data notes and monthly dashboard source copy. Raw NASA extracts over GitHub's per-file limit are intentionally excluded from Git; they are not needed at runtime.
- `mexico_agroclimatico_starter/`: an earlier prototype retained for reference.

## Run locally

Terminal 1, from the project root:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open the Vite URL shown in the terminal. The development proxy sends `/api` requests to `127.0.0.1:8000`.

## Deploy from Git to Vercel

The root `vercel.json` configures the active frontend and FastAPI backend as two Vercel Services in one project. `/api/*` is routed to FastAPI and all other paths to the Vite app. The older `mexico_agroclimatico_starter/` prototype is not part of this deployment.

1. Push this project to a Git provider supported by Vercel. Large daily NASA extracts, local build output, dependency folders, and secrets are excluded by `.gitignore`.
2. Import the repository in Vercel with the repository root as the project root. Set the project framework to **Services** if Vercel does not select it automatically.
3. Deploy. Both services share one domain, so the frontend can call `/api/...` without setting `VITE_API_URL`.
4. If using a custom domain or separate preview setup, configure `CORS_ORIGINS` on the backend as needed.

Environment variable templates are in `frontend/.env.example` and `backend/.env.example`. Never commit `.env.local`, tokens, or credentials.

## Data and model notes

- Current-year climate values are requested from NASA POWER at a representative coordinate for the selected state.
- Historical monthly values and the 2027–2029 linear projections are served from `backend/data/nasa_dashboard_mensual.csv`.
- Soil profile locations are read from `backend/data/perfiles_calidad_suelo.csv`.
- NASA source data span November 2023 through October 2026. The earliest year is partial. Linear regression extrapolations are exploratory trends, not seasonal forecasts.
- The full raw daily NASA CSV files are too large for a regular GitHub push and are not required to build or run the deployed app. The compact monthly series is tracked in Git.

To refresh the monthly series locally, place the daily NASA source extracts in `frontend/src/data/nasa_datos/` and run:

```powershell
python backend/build_nasa_dashboard_monthly.py
```

## Git setup

If this folder is not already a Git repository:

```powershell
git init
git branch -M main
git add .
git status --short
git commit -m "Prepare NASA agriculture dashboard"
```

Then create an empty remote repository and run:

```powershell
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```
