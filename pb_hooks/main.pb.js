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
 * The handler receives a standard echo.Context (c).
 * Return c.json(statusCode, payload) to send a JSON response.
 */
routerAdd("GET", "/api/ping", (c) => {
  return c.json(200, { ok: true, ts: new Date().toISOString() });
});

/**
 * ─────────────────────────────────────────────
 *  Collection record hooks
 * ─────────────────────────────────────────────
 *
 * Use onRecordCreate / onRecordUpdate / onRecordDelete (and their *Before
 * and *After variants) to enforce business rules server-side.
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
 * Uncomment and adapt as needed.
 */

// cronAdd("daily-cleanup", "0 2 * * *", () => {
//   console.log("[cron] running daily cleanup");
//   // $app.dao().runInTransaction(...)
// });
