# Claude Code instructions for this repo

**Before implementing anything touching PocketBase (schema, hooks, rules, SDK usage, deploy), read `docs/POCKETBASE_AI_AGENT_GUIDE.md`.** It encodes the current (v0.23+/v0.36) API, the Goja hook runtime limits, API-rule semantics, and the PocketHost hosting constraints this app runs under. The full official docs (v0.36.7) are the PDFs in `docs/`.

Stack: PocketBase (JS hooks in `pb_hooks/`, migrations in `pb_migrations/`) + React 18/Vite in `frontend/` (builds to `pb_public/`) + JS SDK. Deployed to PocketHost via `.github/workflows/deploy-pockethost.yml` (manual dispatch, `test`|`live`).

Non-negotiables (details and rationale in the guide):

- Modern API only — never `Dao(...)`, `$app.dao()`, `schema:`/`options:` field shape, `onRecordBefore*`/`onRecordAfter*Request` hook names, or `migrate((db) => ...)`. (`pb_migrations/0001_initial_schema.js` is legacy-style — do not copy it.)
- Every hook handler calls `e.next()`; use `e.app` inside handlers, `app` inside migrations, `txApp` inside transactions.
- `pb_hooks` JS is synchronous Goja: no async/await, fetch, setTimeout, Node APIs, or npm. Handlers can't see top-level variables — `require()` inside the handler.
- Set all five API rules explicitly on new collections (`null` = superuser-only, `""` = public); verify rules as a non-superuser.
- Bind all dynamic filter/SQL params (`pb.filter()` client-side, `{:param}` server-side).
- PocketHost: instance hibernates after ~5s idle — no bare `cronAdd` for scheduled work (use PocketHost Webhooks → token-protected route), no in-memory state across requests, failing migrations brick the instance (test locally first).
- Run the pre-flight checklist in the guide (§12) before declaring a task done.
