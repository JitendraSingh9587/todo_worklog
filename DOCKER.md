# Docker — TimeSheet

Commands to build, run, and update the app with Docker Compose. Run these from the **project root** (`TimeSheet/`).

## Prerequisites

- Docker Engine + Docker Compose v2
- `backend/.env` present (copy from `backend/.env.example` if needed)

Port mapping (dev / default API service):

| Host | Container | Service |
|------|-----------|---------|
| `3333` | `3334` (`PORT` in `.env`) | API + built UI |
| `5173` | `5173` | Vite HMR (optional `frontend` profile) |

App URL (API + static UI): **http://localhost:3333**

---

## First-time setup

```bash
cp backend/.env.example backend/.env
# Edit backend/.env if needed (PORT, HOLIDAYS_REGION, etc.)

npm run build:client   # build React UI into client/dist (mounted into the API container)
docker compose up -d --build api
```

---

## Common commands

### Start API (development image)

```bash
docker compose up -d api
```

### Rebuild and recreate API (after code or `.env` changes)

`.env` is loaded at container **create** time. Recreate after changing env vars:

```bash
npm run build:client   # if UI changed
docker compose up -d --build --force-recreate api
```

### Rebuild image only

```bash
docker compose build api
docker compose up -d api
```

### Stop / start / restart

```bash
docker compose stop api
docker compose start api
docker compose restart api
```

### Stop and remove containers

```bash
docker compose down
```

Remove containers **and** named volumes (e.g. frontend `node_modules` volume):

```bash
docker compose down -v
```

---

## Optional: Vite frontend (HMR)

Runs the React dev server on **http://localhost:5173** (proxies `/api` to the API service):

```bash
docker compose --profile frontend up -d
```

API + Vite together:

```bash
docker compose --profile frontend up -d --build
```

Stop the Vite service only:

```bash
docker compose stop client
```

---

## Production profile

Uses the `production` Dockerfile target (no nodemon; serves built client from the image):

```bash
npm run build:client   # baked into image on build; keep in sync before --build
docker compose --profile production up -d --build production
```

Stop production service:

```bash
docker compose --profile production stop production
```

---

## Status & logs

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f --tail=100 api
```

---

## Updating the UI when using the API container

The `api` service mounts `./client/dist`. After frontend changes:

```bash
npm run build:client
# No recreate needed for static files; hard-refresh the browser.
# Recreate only if you also changed backend/.env or need a fresh container:
docker compose up -d --force-recreate api
```

Backend `src` is bind-mounted; nodemon reloads on file changes. **Env file changes still need recreate.**

---

## Useful one-liners

```bash
# Full refresh: rebuild client + API image + recreate
npm run build:client && docker compose up -d --build --force-recreate api

# Shell into the API container
docker compose exec api sh

# Check holidays env inside container
docker compose exec api printenv | grep HOLIDAY
```

---

## Data persistence

Calendar / catalog JSON lives in `./backend/data` and is mounted into the container. `docker compose down` does **not** delete that folder.
