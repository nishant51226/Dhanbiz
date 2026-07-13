# Dhanbiz Help (Docusaurus)

User guide for administrators, staff, and the customer portal.

## Installation

```bash
npm install
```

## Local Development

**Use `npm start` (port 3456)** — not `npm run docusaurus start` (that defaults to port 3000 and breaks the Vite proxy).

From repo root:

```bash
npm run help:dev
```

Or from this folder:

```bash
npm start
```

Runs at [http://localhost:3456/document/](http://localhost:3456/document/). The React app (`frontend`) proxies `/document` here when you use `npm run dev` there.

Direct URL via Vite: [http://localhost:5173/document/docs/intro](http://localhost:5173/document/docs/intro)

## Build

```bash
npm run build
```

Output goes to `build/`. In Docker production, nginx serves this at **`/document/`** on the same host as the main app.

The navbar and favicon use `static/img/brand-logo.png` (copied from `frontend/public/brand-logo.png`). Re-copy that file if the app logo changes.

Root `.dockerignore` excludes `**/*.md` globally but **must** un-ignore `backend/help/docs/**` so Jenkins/Docker builds include Docusaurus content.

## Deployment

The user guide is built into the **nginx `web` image** (`docker/nginx/Dockerfile`) and served as static files at `/document/`. It does not run as a separate container and is not served by the Nest API process.

Production URL: `https://your-domain/document/`

Rebuild after doc changes:

```bash
docker compose up -d --build web
```

For local dev, run `npm start` here (port 3456) and use the frontend Vite proxy at `/document`.
