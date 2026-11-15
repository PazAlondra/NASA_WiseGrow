# Agroclimatic frontend

React + Vite single-page application. The frontend is deployed as a static Vercel project with Root Directory `frontend`.

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_API_URL` in `.env.local` to the FastAPI service URL. During local development it defaults to `http://127.0.0.1:8000`.

## Vercel

Set `VITE_API_URL` in the Vercel project's Production and Preview environments to the deployed backend origin, then redeploy. Vite embeds this value during the build. `vercel.json` keeps client-side routes such as `/mapa` and `/dashboard` working on refresh.
