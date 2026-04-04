# PocketBase React Starter Template 
## with one-click staged deploy github action

A batteries-included GitHub template for building full-stack apps with:

- **PocketBase** – backend, auth, database, file storage, realtime subscriptions
- **React 18** – UI library
- **Vite 6** – fast dev server and bundler (outputs to `pb_public/` served by PocketBase)
- **Tailwind CSS v3** – utility-first styling
- **PocketBase JS SDK** – typed client, auto-cancellation, realtime hooks
- **GitHub Actions** – one-command deploy to [PocketHost](https://pockethost.io) via FTP

---

## Project Structure

```
pocketbase-starter/
├── .env.example                 # Copy to .env and fill in values
├── .github/
│   └── workflows/
│       └── deploy-pockethost.yml  # Deploy frontend + hooks + migrations
├── frontend/                    # React / Vite SPA
│   ├── src/
│   │   ├── App.jsx              # Root component
│   │   ├── main.jsx             # Entry point
│   │   └── lib/
│   │       └── pocketbase.js    # PocketBase client singleton
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js           # Builds into ../pb_public/
│   ├── tailwind.config.js
│   └── postcss.config.js
├── pb_hooks/                    # Server-side JS hooks (run inside PocketBase)
│   └── main.pb.js               # Example hook: request logger + custom route
├── pb_migrations/               # Schema migrations (run automatically on startup)
│   └── 0001_initial_schema.js   # Example: creates an "items" collection
└── pb_public/                   # Built frontend — gitignored, served by PocketBase
```

---

## Quick Start

### 1. Use this template

Click **"Use this template"** on GitHub, or clone directly:

```bash
git clone https://github.com/<you>/pocketbase-starter.git my-app
cd my-app
```

### 2. Download PocketBase

```bash
# macOS (arm64)
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_*_darwin_arm64.zip -o pb.zip
unzip pb.zip pocketbase && rm pb.zip

# Linux (amd64)
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_*_linux_amd64.zip -o pb.zip
unzip pb.zip pocketbase && rm pb.zip
```

Or download manually from [pocketbase.io/docs](https://pocketbase.io/docs).

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (default URL is http://127.0.0.1:8090)
```

### 4. Install frontend dependencies

```bash
cd frontend && npm install && cd ..
```

### 5. Start PocketBase

```bash
./pocketbase serve
# Admin UI → http://127.0.0.1:8090/_/
```

### 6. Start the frontend dev server

In a second terminal:

```bash
cd frontend && npm run dev
# App → http://localhost:5173
```

The Vite dev server proxies `/api/*` to PocketBase, so CORS is never an issue during development.

---

## Building for Production

```bash
cd frontend && npm run build
```

This outputs the compiled app into `pb_public/`. PocketBase automatically serves everything in that directory at the root URL.

---

## Deploying to PocketHost

This template includes a GitHub Actions workflow that deploys to [PocketHost](https://pockethost.io).

### Required secrets

Add these in your GitHub repo → Settings → Secrets → Actions:

| Secret | Description |
|---|---|
| `POCKETHOST_INSTANCE_TEST` | PocketHost instance name (test/staging) |
| `POCKETHOST_INSTANCE_LIVE` | PocketHost instance name (production) |
| `POCKETHOST_FTP_PASSWORD_TEST` | FTP password for test instance |
| `POCKETHOST_FTP_PASSWORD_LIVE` | FTP password for live instance |

### Triggering a deploy

Go to **Actions → Deploy to PocketHost → Run workflow** and choose `test` or `live`.

The workflow will:
1. Build the frontend (`npm run build`)
2. Upload `pb_public/` (static app) via FTP
3. Upload `pb_hooks/` (server-side logic) via FTP
4. Upload `pb_migrations/` (schema changes) via FTP

---

## PocketBase Hooks

Hooks live in `pb_hooks/` and are plain JavaScript files executed inside PocketBase's Goja runtime.

```js
// pb_hooks/main.pb.js
onBeforeBootstrap((e) => {
  console.log("PocketBase is starting up")
})

routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, { message: "Hello from a custom route!" })
})
```

See the [PocketBase JS hooks docs](https://pocketbase.io/docs/js-overview/) for the full API.

---

## Database Migrations

Migration files in `pb_migrations/` run automatically on `pocketbase serve` or `pocketbase migrate`. They are plain JS and use the PocketBase collections API.

```js
// pb_migrations/0001_initial_schema.js
migrate(
  (db) => { /* up — create/alter collections */ },
  (db) => { /* down — revert changes */ }
)
```

---

## Tech Stack Rationale

| Choice | Why |
|---|---|
| PocketBase | Single binary: DB + auth + files + realtime. Zero infra overhead. |
| React + Vite | Fast HMR, small bundles, `@` path alias out of the box. |
| Tailwind CSS | Utility classes keep styles co-located with components. |
| PocketBase JS SDK | Official SDK with TypeScript types, auto-cancellation, realtime. |
| PocketHost | Managed PocketBase hosting with free tier. FTP deploy keeps CI simple. |
