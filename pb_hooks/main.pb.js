/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase server-side hooks.
 *
 * These run inside PocketBase's embedded Goja (ES2020) JavaScript runtime.
 * No npm — use only the globals PocketBase exposes (see JSDoc types above).
 *
 * Docs: https://pocketbase.io/docs/js-overview/
 *
 * ─────────────────────────────────────────────
 *  Lifecycle hooks
 * ─────────────────────────────────────────────
 */

// Runs once on every startup — good place for sanity checks / logging.
onBootstrap((e) => {
  console.log("[main.pb.js] PocketBase started ✓");
  e.next();
});

/**
 * ─────────────────────────────────────────────
 *  Custom REST routes
 * ─────────────────────────────────────────────
 *
 * routerAdd(method, path, handler, ...middlewares)
 *
 * The handler receives a core.RequestEvent (e).
 * Return e.json(statusCode, payload) to send a JSON response.
 * Namespace custom routes (e.g. /api/myapp/...) to avoid system-route clashes.
 */
routerAdd("GET", "/api/myapp/ping", (e) => {
  return e.json(200, { ok: true, ts: new Date().toISOString() });
});

/**
 * ─────────────────────────────────────────────
 *  Collection record hooks
 * ─────────────────────────────────────────────
 *
 * Use the *Request hooks (onRecordCreateRequest / onRecordUpdateRequest /
 * onRecordDeleteRequest) for API-level checks with request context, and the
 * model hooks (onRecordCreate / onRecordAfterCreateSuccess / ...) for
 * invariants that must hold no matter where the write comes from.
 * Code before e.next() runs before the operation, code after it runs after.
 *
 * Example: prevent creating an item with a blank name.
 */
onRecordCreateRequest((e) => {
  const name = e.record.get("name");
  if (typeof name === "string" && name.trim() === "") {
    throw new BadRequestError("name must not be blank");
  }
  e.next();
}, "items");

/**
 * ─────────────────────────────────────────────
 *  Cron jobs (optional)
 * ─────────────────────────────────────────────
 *
 * cronAdd(id, expression, handler)
 *
 * Expressions follow standard cron syntax (UTC).
 *
 * ⚠ On PocketHost, instances hibernate after ~5s idle, so cronAdd jobs
 * silently miss their schedule. For reliable scheduled work, expose a
 * token-protected route and trigger it via PocketHost Webhooks — see
 * docs/POCKETBASE_AI_AGENT_GUIDE.md §10.3.
 */

// cronAdd("daily-cleanup", "0 2 * * *", () => {
//   console.log("[cron] running daily cleanup");
//   $app.runInTransaction((txApp) => {
//     // txApp.db().newQuery("DELETE FROM ... WHERE ...").execute()
//   });
// });
