# PocketBase Implementation Guide for AI Coding Agents

> **Audience:** AI coding agents (Claude Code, etc.) implementing features in this repository.
> **Goal:** produce correct, deployable PocketBase code on the **first attempt**.
> **Stack:** PocketBase (v0.23+ "modern" API; docs snapshot in this repo is **v0.36.7**) · JS hooks (`pb_hooks/`) · JS migrations (`pb_migrations/`) · React 18 + Vite (`frontend/` → builds to `pb_public/`) · JS SDK `pocketbase@^0.26` · Hosted on **PocketHost** (pockethost.io), deployed by `.github/workflows/deploy-pockethost.yml`.
>
> Authoritative references, in order: the PocketBase docs PDFs in `docs/` (v0.36.7), this guide, then https://pocketbase.io/docs. When in doubt, check `pb_data/types.d.ts` from a local PocketBase install — it is the ground truth for the hooks API.

---

## 0. The ten golden rules

1. **Use the modern (v0.23+) API only.** Most tutorials, StackOverflow answers, and LLM training data use the dead pre-v0.23 API. If you find yourself writing `Dao(...)`, `$app.dao()`, `schema:`, `new SchemaField(...)`, `onRecordBeforeCreateRequest`, or a `(db)` migration callback — **stop, it's wrong**. See §2 for the full mapping.
2. **Every hook handler must call `e.next()`.** Forgetting it silently blocks the operation (record never saves, request never completes).
3. **Migrations receive `app`, not `db`:** `migrate((app) => { ... }, (app) => { ... })`. Use the `app` argument inside — never `$app`.
4. **API rules: `null` ≠ `""`.** `null` = locked (superuser-only, the default). `""` = fully public. Always set all five rules explicitly on every collection you create.
5. **pb_hooks JS is synchronous ES5+ (Goja).** No `async/await`, no Promises, no `fetch`, no `setTimeout`, no Node APIs, no npm packages. Use `$http.send()` (blocking), `$os`, `$filesystem`, `$security`.
6. **Handlers are isolated programs.** A handler cannot see variables declared outside itself, even in the same file. Share code via ``require(`${__hooks}/lib.js`)`` called *inside* the handler.
7. **Never interpolate user input into filter strings.** Client: `pb.filter("x = {:v}", {v})`. Server: `findRecordsByFilter(..., "x = {:v}", ..., {v})` and `.bind({...})` for raw SQL.
8. **Schema changes ship as migration files, never as prod dashboard edits.** Edit collections in the *local* dashboard (automigrate writes the file), commit the generated file, deploy.
9. **`cronAdd` does not fire reliably on PocketHost** (instances hibernate after ~5s idle). Scheduled work = PocketHost Webhooks hitting a `routerAdd` endpoint (§10.3).
10. **A failing migration prevents the instance from booting.** On PocketHost that means the whole app 500s until the bad file is removed via FTP. Test every migration locally (`./pocketbase serve`) before deploying.

---

## 1. Repository layout and how code reaches production

```
frontend/            React + Vite SPA. `npm run build` outputs to ../pb_public/
pb_public/           Built frontend, served by PocketBase at /   (gitignored)
pb_hooks/            Server-side JS (*.pb.js), runs inside PocketBase's Goja VM
pb_migrations/       Schema/data migrations (*.js), auto-applied at startup
docs/                PocketBase v0.36.7 docs PDFs + this guide
.github/workflows/deploy-pockethost.yml   Manual deploy (test|live) via FTPS
```

Deploy flow (`deploy-pockethost.yml`, `workflow_dispatch` with `target: test|live`):
1. `npm ci && npm run build` in `frontend/` → writes `pb_public/`.
2. FTPS-syncs `pb_public/`, `pb_hooks/`, `pb_migrations/` to the PocketHost instance (SamKirkland/FTP-Deploy-Action, one sync-state file per directory: `.ftp-deploy-sync-state-*.json`).
3. PocketHost picks up the new files on the next instance (re)start — hibernation means the next request after a deploy runs a fresh process, which also **applies any new migrations**.

Implications for you:
- There is **no shell on PocketHost**. You cannot run `./pocketbase migrate`, `superuser create`, or any CLI there. Everything must work via files that take effect on startup (migrations, hooks) or via the dashboard.
- The sync is incremental. Never hand-edit files on the server out-of-band; it desyncs the deploy state. If a deploy looks wrong, deleting the relevant `.ftp-deploy-sync-state-*.json` on the server forces a full resync.
- Deploy `test` first; only deploy `live` after verifying on the test instance.

---

## 2. API epoch: banned legacy patterns → modern replacements

PocketBase v0.23.0 (Nov 2024) rewrote the extension API. Everything below **left = never emit**, **right = correct**:

| ❌ Legacy (pre-v0.23) | ✅ Modern (v0.23+ / v0.36) |
|---|---|
| `$app.dao().findRecordById(...)` / `Dao(db)` | `$app.findRecordById("col", id)` — DB methods live on the app |
| `$app.dao().saveRecord(r)` / `.deleteRecord(r)` | `$app.save(r)` / `$app.delete(r)` |
| `migrate((db) => { Dao(db)... })` | `migrate((app) => { app.save(...) }, (app) => {...})` |
| `collection.schema` + `new SchemaField({options: {...}})` | `collection.fields` + flat field objects or typed classes (`new TextField({...})`) |
| Field options nested under `options: {}` | Options at the **same level** as `name`/`type`: `{name, type, required, max, maxSelect, collectionId, cascadeDelete, ...}` |
| `onRecordBeforeCreateRequest` / `onRecordAfterCreateRequest` | `onRecordCreateRequest` — "before" = code before `e.next()`, "after" = code after |
| `onModelBeforeCreate` / `onModelAfterCreate` | `onRecordCreate` / `onRecordAfterCreateSuccess` (+ `...AfterCreateError`) |
| `onBeforeBootstrap` / `onAfterBootstrap` | `onBootstrap` (+ `e.next()`) |
| Handlers that proceed implicitly | **`e.next()` is mandatory** |
| Admins API: `/api/admins/*`, `findAdminByEmail` | `_superusers` auth collection: `$app.findAuthRecordByEmail("_superusers", email)` |
| `$apis.requireAdminAuth()` | `$apis.requireSuperuserAuth()` |
| Route handler `(c)` echo context, `/hello/:name`, `c.pathParam`, `c.json` | `(e)` RequestEvent, `/hello/{name}`, `e.request.pathValue("name")`, `e.json(200, {...})` |
| `$apis.requestInfo(c).data` | `e.requestInfo().body` |
| `$tokens.recordAuthToken($app, r)` | `record.newAuthToken()` |
| SDK: `pb.authStore.model`, `pb.admins.authWithPassword`, `pb.files.getUrl` | `pb.authStore.record`, `pb.collection("_superusers").authWithPassword`, `pb.files.getURL` |

`pb_migrations/0001_initial_schema.js` in this repo is written in the modern style and is a safe reference. If you ever encounter `Dao(db)`, `schema:`, or nested `options:` in a migration (older forks/tutorials), rewrite it per §4 instead of extending it.

Other v0.23 behavior changes to remember:
- Multi-`file` uploads now **replace** existing files; append with the `+` modifier (`"documents+": file`).
- Error JSON top-level field is `status` (was `code`); field errors stay under `data`.
- `Url→URL`, `Json→JSON`, `Ip→IP` casing in all bindings; trailing slashes on `/api/*` are no longer stripped.

---

## 3. Collections and fields

Three collection types:
- **base** — regular data.
- **auth** — base + system fields `email`, `emailVisibility`, `verified`, `password`, `tokenKey` (cannot be renamed/deleted). You can have many auth collections (users, staff, clients…). Extra rules: `authRule`, `manageRule`.
- **view** — read-only, backed by a SQL `SELECT`. **Must select an `id` column.** No create/update/delete, **no realtime events**. Expression columns come back as JSON-typed; `CAST(x AS TEXT)` to control types.

Field types (v0.36): `bool`, `number`, `text`, `email`, `url`, `editor`, `date`, `autodate`, `select`, `file`, `relation`, `json`, `geoPoint`.

Semantics that shape your code:
- All fields except `json` are **non-nullable with zero-defaults** ("" / 0 / false / []).
- `select`, `relation`, `file` with `maxSelect: 1` store/return a **string**; `maxSelect >= 2` return an **array**. Changing maxSelect across that boundary changes the JSON shape the frontend sees.
- `json` fields: only nullable type; default `maxSize` 1MB; in hooks always access via `record.get()` / `record.set()`.
- Dates are UTC strings `"2026-01-10 18:45:27.123Z"` — **space separator, not `T`**.
- Record ids: 15-char lowercase alphanumeric by default; custom ids must match `^[a-z0-9]+$` and length 15 unless the id field options are changed.
- Reserved names: `id`, `collectionId`, `collectionName`, `expand` (+ auth system fields). Names starting with `_` are system-reserved.
- `autodate`: `{onCreate: true}` for `created`, `{onCreate: true, onUpdate: true}` for `updated`.
- Fields marked **hidden** are readable/filterable/writable by superusers only. For per-request conditional hiding use `onRecordEnrich` + `e.record.hide("field")`.

---

## 4. Migrations (`pb_migrations/`)

### 4.1 Canonical skeleton

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // UP — runs in a transaction; `app` is the transactional instance
}, (app) => {
  // DOWN (optional) — best-effort revert
});
```

- Filename: `<unix-timestamp>_snake_case_description.js` (e.g. `1750000000_add_projects.js`). Files run in **filename sort order** — a new migration's timestamp must be greater than all existing ones.
- Applied automatically, each in its own transaction, on `serve` startup (this is how they run on PocketHost). Applied filenames are tracked in the internal `_migrations` table — **never rename or edit an already-deployed migration**; write a new one.
- Throwing inside the up-callback aborts the transaction **and prevents the server from starting**. Test locally first, always.

### 4.2 Creating a collection

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users"); // resolve relation targets dynamically

  const collection = new Collection({
    type: "base",
    name: "projects",
    // ALWAYS set all five rules explicitly. null = superuser-only, "" = public.
    listRule:   "@request.auth.id != '' && owner = @request.auth.id",
    viewRule:   "@request.auth.id != '' && owner = @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "@request.auth.id != '' && owner = @request.auth.id",
    deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
    fields: [
      // flat option keys — no nested `options` object
      { name: "name",   type: "text",   required: true, min: 1, max: 255 },
      { name: "notes",  type: "editor" },
      { name: "status", type: "select", required: true, maxSelect: 1,
        values: ["active", "archived"] },
      { name: "owner",  type: "relation", required: true, maxSelect: 1,
        collectionId: users.id, cascadeDelete: true },
      { name: "attachments", type: "file", maxSelect: 5, maxSize: 5242880,
        mimeTypes: ["image/png", "image/jpeg", "application/pdf"] },
      { name: "meta",    type: "json", maxSize: 100000 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_projects_owner ON projects (owner)",
      "CREATE UNIQUE INDEX idx_projects_owner_name ON projects (owner, name)",
    ],
  });

  app.save(collection);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("projects"));
});
```

Notes:
- Missing defaults and system fields (`id`, and for auth collections `email` etc.) are merged in automatically.
- Auth collection extras go top-level too: `passwordAuth: {enabled: true}`, `otp: {enabled: false}`, `manageRule`, `authRule`.
- Add an index for every field you filter or sort on in list views.

### 4.3 Updating a collection

```js
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects");
  collection.fields.add(new BoolField({ name: "pinned" }));
  const nameField = collection.fields.getByName("name"); // returned by reference
  nameField.max = 500;
  collection.addIndex("idx_projects_pinned", false, "pinned", "");
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects");
  collection.fields.removeByName("pinned");
  app.save(collection);
});
```

### 4.4 Data/settings/seed migrations

```js
// raw SQL (no hooks fired)
migrate((app) => {
  app.db().newQuery("UPDATE projects SET status = {:s} WHERE status = ''")
    .bind({ s: "active" })
    .execute();
});

// settings
migrate((app) => {
  const settings = app.settings();
  settings.meta.appName = "My App";
  app.save(settings);
});

// seed records
migrate((app) => {
  const col = app.findCollectionByNameOrId("projects");
  const r = new Record(col);
  r.set("name", "Welcome project");
  app.save(r);
});
```

### 4.5 Schema workflow (keep schema in git)

1. Run PocketBase locally (`./pocketbase serve`, same minor version as the PocketHost instance).
2. Either write the migration by hand (preferred for review), or edit collections in the local dashboard — `--automigrate` (on by default) writes the migration file into `pb_migrations/` for you.
3. Inspect the generated file, commit it, deploy. Migrations apply on the instance's next start.
4. **Never** change schema through the production dashboard: it generates server-side migration files that aren't in git and will conflict with your next deploy.
5. Squashing dev history: `./pocketbase migrate collections` writes a full snapshot; then delete the old files and run `./pocketbase migrate history-sync` locally.

---

## 5. API rules and the filter language

Rules are per-collection: `listRule`, `viewRule`, `createRule`, `updateRule`, `deleteRule` (+ auth: `manageRule`, `authRule`). Each is `null` (locked/superuser-only — the default), `""` (anyone), or a filter expression. **A rule is both an authorization check and a row filter.**

Response semantics (write frontend code accordingly):
- unsatisfied `listRule` → **200 with empty items** (not 403)
- unsatisfied `createRule` → 400 · unsatisfied `view/update/deleteRule` → **404** · locked rule for non-superuser → 403
- **Superusers bypass all rules.** Testing while logged into the dashboard proves nothing — use the dashboard's rule-preview or a normal user token.

Operands: schema fields (incl. dotted relation paths, ≤6 levels), `@request.auth.*`, `@request.body.*` (excludes uploaded files), `@request.query.*`, `@request.headers.*` (lowercased, `-`→`_`), `@request.method`, `@request.context` (`default|oauth2|otp|password|realtime|protectedFile`), and cross-collection `@collection.name.*` (alias for multiple joins: `@collection.name:alias.*`).

Operators: `= != > >= < <= ~ !~` plus any-of variants `?= ?!= ?> ?>= ?< ?<= ?~ ?!~`. `~` is SQL LIKE, auto-wrapped in `%...%` (literal `%`/`_` in values act as wildcards). Combine with `&& || ()`; `//` comments allowed.

**Multi-value gotcha:** conditions on multi-relations/selects apply *match-all* by default. To check membership use the `?` variants: `allowed_users.id ?= @request.auth.id`.

Modifiers: `:isset` (was the key submitted — `@request.*` only), `:changed` (submitted AND different — `@request.body.*` only), `:length`, `:each` (multi select/file/relation), `:lower`. None support uploaded files.

Datetime macros (UTC): `@now @todayStart @todayEnd @monthStart @monthEnd @yearStart @yearEnd @second @minute @hour @weekday @day @month @year @yesterday @tomorrow`.

Recipes:

```text
Owner-only access:        @request.auth.id != "" && owner = @request.auth.id
Role gate:                @request.auth.role = "staff"
Member of multi-relation: @request.auth.id != "" && members.id ?= @request.auth.id
Client can't set a field: @request.body.role:isset = false
Field is immutable:       @request.body.slug:changed = false
Create stamped as self:   @request.auth.id != "" && owner = @request.auth.id   (createRule checks the NEW record's values)
Back-relation condition:  comments_via_post.author ?= @request.auth.id
```

Prefer enforcing invariants in rules; use hooks (§6) only for what rules can't express (side effects, derived values, external calls).

---

## 6. Server-side hooks (`pb_hooks/`)

### 6.1 Runtime constraints (Goja) — recite before writing any hook

- Files: `pb_hooks/*.pb.js`, loaded in filename order. Start each with `/// <reference path="../pb_data/types.d.ts" />`.
- **Synchronous only.** No event loop, no `setTimeout`/`setInterval`, no Promises/`async`/`await` (they hang or never resolve). ES6-ish syntax (arrow fns, classes, template literals, destructuring, optional chaining) is fine.
- **No Node/browser APIs, no npm.** No `fetch` → `$http.send`. No `fs` → `$filesystem`/`$os`. No `Buffer`, no `window`.
- **Handler isolation:** every handler (hook, route, middleware, cron) is serialized and runs as its own program. Top-level variables in the same file are **not visible** inside handlers:

```js
const config = { limit: 10 };          // ❌ invisible inside the handler below
onRecordCreateRequest((e) => {
  const { limit } = require(`${__hooks}/lib/config.js`);  // ✅ require INSIDE the handler
  e.next();
}, "posts");
```

- `require()` is CommonJS-only, for your own local files (share via `pb_hooks/lib/*.js` — note: only `*.pb.js` files are auto-loaded as hooks, so plain `.js` libs won't double-register). The module registry is shared across VMs — **never mutate module state**.
- Relative paths resolve against the process CWD; always build absolute paths with `` `${__hooks}/...` ``.
- Globals: `$app`, `$apis`, `$os`, `$http`, `$security`, `$filesystem`, `$template`, `$dbx`, `__hooks`, plus constructors (`Record`, `Collection`, `DynamicModel`, `MailerMessage`, ...) and `cronAdd`/`cronRemove`.
- Which app instance to use where:

| Context | Use |
|---|---|
| Top level of a `.pb.js` file | `$app` |
| Inside any hook/route/middleware handler | **`e.app`** (the hook may run inside a transaction; `$app` risks deadlock) |
| Inside `migrate((app) => ...)` | the `app` argument |
| Inside `runInTransaction((txApp) => ...)` | **`txApp` only** |
| Cron / console command handlers | `$app` |

### 6.2 Record hooks

Two families — pick deliberately:
- **Request hooks** (`onRecordCreateRequest`, `onRecordUpdateRequest`, `onRecordDeleteRequest`, `onRecordsListRequest`, `onRecordViewRequest`, auth-flow variants) — fire only via the REST API; have `e.auth`, `e.hasSuperuserAuth()`, `e.requestInfo()`. Use for anything involving the caller's identity or input.
- **Model hooks** (`onRecordCreate`, `onRecordUpdate`, `onRecordDelete`, `onRecordValidate`, `onRecordAfterCreateSuccess`, `onRecordAfterCreateError`, ... and `onRecordEnrich`) — fire on *every* save from anywhere (hooks, migrations, seeds, dashboard). **No request context.** Use for invariants and derived fields.

```js
/// <reference path="../pb_data/types.d.ts" />

// stamp ownership + enforce input, server-side
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set("owner", e.auth?.id);   // BEFORE e.next() = before validation/persist
    e.record.set("status", "pending");
  }
  e.next();                              // persist happens inside next()
  // AFTER e.next() = record saved; safe for side effects
}, "projects");

// side effect after commit — use AfterSuccess, never the pre-save hook
onRecordAfterCreateSuccess((e) => {
  e.next();
  try {
    $http.send({ url: "https://hooks.example.com/notify", method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: e.record.id }), timeout: 10 });
  } catch (err) {
    e.app.logger().error("notify failed", "error", err);
  }
}, "projects");
```

Rules of thumb:
- Validation rejection = `throw new BadRequestError("message")` **before** `e.next()`.
- Old-vs-new comparison in update hooks: `e.record.original()`.
- Keep slow work (email, `$http.send`) **after** `e.next()` and out of transactions.
- Hook tags (the trailing `"projects"`) restrict to collections; omit to run for all.

### 6.3 Custom routes

```js
routerAdd("POST", "/api/myapp/checkout", (e) => {
  const data = new DynamicModel({ plan: "", seats: 0 });
  e.bindBody(data);

  if (!["basic", "pro"].includes(data.plan)) {
    throw new BadRequestError("Unknown plan");
  }

  let result;
  e.app.runInTransaction((txApp) => {
    const sub = txApp.findFirstRecordByFilter(
      "subscriptions", "user = {:user}", { user: e.auth.id });
    sub.set("plan", data.plan);
    txApp.save(sub);
    result = sub;
  });

  return e.json(200, { ok: true, id: result.id });
}, $apis.requireAuth());       // or requireAuth("users"), requireSuperuserAuth(), requireGuestOnly()
```

- Namespace custom APIs under `/api/<appname>/...` to avoid clashing with system routes.
- Path params: `{name}` → `e.request.pathValue("name")`; wildcards `{path...}`; exact-end `{$}`.
- Query: `e.requestInfo().query["q"]`. Headers: normalized keys via `e.requestInfo().headers["x_token"]`, raw via `e.request.header.get("X-Token")`.
- Responses: `e.json(code, obj)`, `e.string`, `e.html`, `e.noContent(204)`, `e.redirect(307, url)`, `e.blob`, `e.fileFS`.
- Errors: `throw new BadRequestError|UnauthorizedError|ForbiddenError|NotFoundError|TooManyRequestsError|InternalServerError(msg, optData)`. Raw error details are hidden from clients (visible in Logs / `--dev`); `data` is only returned if it's a map of `ValidationError`s.
- Reuse collection rules in custom routes: `e.app.canAccessRecord(record, e.requestInfo(), record.collection().viewRule)`.
- Returning records? Run `$apis.enrichRecords(e, records, "someDefaultExpand")` so `?expand`, email-visibility, and `onRecordEnrich` apply.
- Custom auth route → finish with `return $apis.recordAuthResponse(e, record, "methodName")`; on bad credentials throw a **generic** `BadRequestError("Invalid credentials")` (enumeration protection).
- Frontend calls custom routes via `pb.send("/api/myapp/checkout", { method: "POST", body: {...} })`.

### 6.4 DB access from hooks

```js
// finders (single-record finders THROW when not found — wrap in try/catch)
const rec  = e.app.findRecordById("projects", id);
const one  = e.app.findFirstRecordByFilter("projects", "slug = {:slug}", { slug });
const many = e.app.findRecordsByFilter("projects",
  "status = {:s}", "-created", 20, 0, { s: "active" }); // filter, sort, limit, offset, params

// create
const col = e.app.findCollectionByNameOrId("projects");
const r = new Record(col);
r.set("name", "X");
e.app.save(r);   // validates; saveNoValidate() skips

// raw SQL — always bind params
const rows = arrayOf(new DynamicModel({ id: "", total: 0 }));
e.app.db()
  .newQuery("SELECT owner as id, COUNT(*) as total FROM projects WHERE status = {:s} GROUP BY owner")
  .bind({ s: "active" })
  .all(rows);
```

- Transactions: `app.runInTransaction((txApp) => { ... })` — commits only if nothing throws; use `txApp` exclusively inside; SQLite allows **one writer at a time**, so keep transactions short and never call out to the network inside one.
- Multi-record finders return `[]` when empty; single-record finders **throw**.
- Programmatic expand: `e.app.expandRecord(record, ["owner"], null)` then `record.expandedOne("owner")`.

### 6.5 Files, email, templates, HTTP

```js
// attach files server-side
r.set("attachments", [$filesystem.fileFromURL("https://..."),
                      $filesystem.fileFromBytes("hello", "hello.txt")]);
// remove one file / clear field
r.set("attachments-", ["old_ab12cd34ef.pdf"]);
r.set("attachments", null);

// email
const msg = new MailerMessage({
  from: { address: e.app.settings().meta.senderAddress, name: e.app.settings().meta.senderName },
  to: [{ address: user.email() }],
  subject: "Welcome",
  html: "<p>Hi!</p>",
});
e.app.newMailClient().send(msg);

// outbound HTTP — BLOCKING; non-2xx does NOT throw, check statusCode
const res = $http.send({ url, method: "POST", headers: {...}, body: JSON.stringify(x), timeout: 30 });
if (res.statusCode >= 400) { /* handle */ }
const data = res.json;
```

Secrets (API keys etc.): store as PocketHost instance **Secrets** (dashboard), read with `$os.getenv("MY_KEY")` inside the handler. Never hardcode.

---

## 7. Frontend (React + JS SDK)

The client singleton lives at `frontend/src/lib/pocketbase.js` (`import pb from "@/lib/pocketbase"`). Vite dev server proxies `/api/*` to local PocketBase — no CORS in dev.

### 7.1 Auth

```jsx
// login / logout
await pb.collection("users").authWithPassword(email, password);
pb.authStore.clear();                       // logout is client-side only (stateless JWTs)

// boot-time restore + React binding
useEffect(() => {
  if (pb.authStore.isValid) {
    pb.collection("users").authRefresh().catch(() => pb.authStore.clear());
  }
  return pb.authStore.onChange((token, record) => setUser(record), true);
}, []);
```

- Use `pb.authStore.record` (not `.model` — renamed). Persisted in localStorage, synced across tabs.
- There is no server-side logout/revocation; password change rotates `tokenKey` and invalidates that user's tokens.
- OAuth2: `pb.collection("users").authWithOAuth2({ provider: "google" })` — opens a popup and requires a working realtime (SSE) connection; don't wrap the click handler in async/await (Safari blocks the popup).

### 7.2 Queries, auto-cancellation, StrictMode

```jsx
useEffect(() => {
  pb.collection("projects")
    .getList(1, 30, {
      filter: pb.filter("status = {:s} && name ~ {:q}", { s: "active", q: search }),
      sort: "-created",
      expand: "owner",
      requestKey: null,          // avoid StrictMode double-mount auto-cancel noise
    })
    .then((res) => setItems(res.items))
    .catch((err) => { if (!err.isAbort) console.error(err); });
}, [search]);
```

- The SDK auto-cancels duplicate pending requests (same method+path). In React 18 StrictMode dev, effects run twice → the first request aborts with `ClientResponseError {isAbort: true, status: 0}`. Fix per-request with `requestKey: null` (or a unique key); **don't** disable auto-cancellation globally.
- **Always** build dynamic filters with `pb.filter()` — never template literals (filter injection).
- `getFirstListItem()` **throws a 404** when nothing matches; `getFullList()` fetches everything in 1000-item batches (avoid on large collections); `getList(p, n, {skipTotal: true})` skips the COUNT for faster pagination (`totalItems` becomes -1). `perPage` max is 1000.
- Error shape: `err.status`, `err.response` (API body), field errors under `err.response.data.<field>.{code,message}`, `err.isAbort`.

### 7.3 Realtime

```jsx
useEffect(() => {
  const sub = pb.collection("projects").subscribe("*", (ev) => {
    // ev.action: "create" | "update" | "delete"; ev.record
  }, { filter: pb.filter("owner = {:id}", { id: pb.authStore.record?.id }) });
  return () => { sub.then((unsub) => unsub()); };   // subscribe() resolves to an unsubscribe fn
}, []);
```

- Subscribing to `"*"` is gated by **listRule**; to a record id by **viewRule**. View collections emit no events.
- Realtime is SSE. Idle connections recycle (~5 min; SDK auto-reconnects). **On PocketHost, instance hibernation can drop SSE silently** — treat realtime as best-effort: refetch on visibility change or poll as fallback for critical data.
- An open subscription keeps the PocketHost instance awake (billing/idle implications) — unsubscribe when unused.

### 7.4 Files

```js
const url = pb.files.getURL(record, record.avatar, { thumb: "100x100" });
// protected file fields additionally need a short-lived (~2 min) token:
const token = await pb.files.getToken();
const purl  = pb.files.getURL(record, record.contract, { token });
```

Upload via `FormData` or plain object with `File`/`Blob` values; append to multi-file fields with `"documents+": file`; delete with `"documents-": ["name.pdf"]` or `"documents": []`. Thumb formats: `WxH`, `WxHt`, `WxHb`, `WxHf`, `0xH`, `Wx0` (jpg/png/gif-first-frame/partial webp only).

### 7.5 Batch

`pb.createBatch()` → `.collection("x").create/update/upsert/delete(...)` → `.send()` — runs in one transaction, but is **disabled by default**; enable in Dashboard → Settings → Application (or via a settings migration) before relying on it.

---

## 8. Relations and expand

- Set relations by id (`maxSelect: 1`) or id array; append/remove with `+`/`-` modifiers.
- `?expand=owner,post.tags` — dot-notation up to **6 levels**. Expansion is silently skipped for relations whose collection viewRule the requester fails — always guard: `record.expand?.owner`.
- Back-relations: `comments_via_post` (i.e. `<collection>_via_<relationField>`) in filter/sort/expand. They resolve as **arrays** unless the relation field has a UNIQUE index, and back-relation expand caps at **1000 records** — paginate the child collection directly beyond that.
- Avoid N+1: use `expand` for detail views; for aggregations (counts, sums, joins) create a **view collection** with the SQL, and remember views have no realtime.

---

## 9. Auth model details worth knowing

- Stateless HS256 JWTs; nothing stored server-side. Token durations per type are collection options (`authToken`, `passwordResetToken`, `verificationToken`, `emailChangeToken`, `fileToken`).
- Superusers live in the `_superusers` auth collection; **OAuth2 is not available for it**; superusers bypass all API rules.
- "API keys" = non-renewable superuser impersonation tokens (`pb.collection("users").impersonate(id, durationSec)` returns a standalone client). Server-to-server only; treat like root credentials.
- OTP: request returns an `otpId` even for nonexistent emails (enumeration-safe); successful OTP auth marks email verified.
- MFA (optional, per collection): first method returns 401 + `mfaId`; retry second method passing `mfaId`.
- Custom identity fields (e.g. username, phone) need a UNIQUE index and the field listed in the collection's password-auth identity fields.

---

## 10. PocketHost: the hosting rules this app lives under

PocketHost runs each instance as an on-demand container. This changes several defaults you'd assume on a VPS:

### 10.1 Lifecycle
- **Hibernates after ~5 seconds idle**; wakes on the next HTTP request (~0.5–1s cold start; requests are held, not dropped). In-memory state in hooks (`$app.store()`, module-level caches) is ephemeral — persist anything that matters to a collection.
- Migrations apply on wake/start. **A throwing migration = the instance fails to boot and the app 500s**; recovery is deleting the bad file via FTP and restarting. This is why local migration testing is non-negotiable.
- Power off/on from the pockethost.io dashboard is the deterministic way to force a restart (e.g. after changing Secrets or the PB version).
- `pb_data` is only writable over FTP while the instance is **powered off**. Don't attempt live edits to it; use the admin UI backup/restore instead.

### 10.2 Access & platform
- Admin UI: `https://<instance>.pockethost.io/_/`. **Admin Sync** (on by default) injects a superuser matching the PocketHost account credentials at every boot — that's how you log in to a fresh instance (no CLI needed). Alternatively seed a superuser via a migration reading `$os.getenv(...)`.
- No shell, no custom Go builds — JS hooks are the only extension surface.
- PocketBase version is chosen per instance in the dashboard (semver range; patches auto-apply). Keep local dev pinned to the same minor.
- Secrets: dashboard → instance → Secrets (`^[A-Z][A-Z0-9_]*$` names) → `$os.getenv("KEY")` in hooks. `PH_APP_NAME` and `PH_INSTANCE_URL` are injected automatically.
- SMTP is not provided; configure a real provider (e.g. SES) in Settings → Mail or emails won't send.
- Rate limits (approx.): 1,000 req/hr and 15 concurrent per client IP; 10,000 req/hr and 250 concurrent per instance; `/api/files/*` is much cheaper than API calls; 429s carry `Retry-After`. Consequences: **talk to PocketBase from the browser, not through your own server-side proxy** (a single egress IP burns the per-IP budget), and throttle seed/bulk scripts.

### 10.3 Scheduled work
`cronAdd` only ticks while the instance is awake — with hibernation it will silently miss schedules. Pattern that works:

1. Implement the job as a route: `routerAdd("GET", "/api/myapp/tasks/daily-cleanup", handler)`.
2. Protect it: compare `e.requestInfo().query["token"]` (or a header) against `$os.getenv("CRON_TOKEN")` and throw `ForbiddenError` on mismatch.
3. Register a **PocketHost Webhook** (dashboard) with a cron expression (UTC) pointing at that path — PocketHost's scheduler wakes the instance and calls it.

Keep `cronAdd` only for best-effort work that's fine to skip while asleep.

### 10.4 Realtime caveat
Hibernation/instance cycling can kill SSE connections without the SDK noticing. For anything user-critical, pair subscriptions with a refetch-on-focus or periodic reconciliation fetch.

---

## 11. Local development loop

```bash
# one-time: download the PocketBase binary (match the instance's minor version)
./pocketbase serve            # API + admin on http://127.0.0.1:8090, applies pb_migrations/
cd frontend && npm run dev    # Vite on http://localhost:5173, proxies /api → 8090
```

- First local run: create a superuser via the installer link or `./pocketbase superuser create EMAIL PASS`.
- `pb_hooks` hot-reloads on save (UNIX); migrations need a restart (or were applied at start).
- `pb_data/` is local state — gitignored; never commit, never copy to prod.
- Get `pb_data/types.d.ts` from the local instance for editor type-checking of hooks.
- Verify a change end-to-end locally: run the migration from scratch (`rm -rf pb_data` for a clean slate if needed), exercise the API as a **non-superuser** user, check the rules behave, then build the frontend and confirm `pb_public/` serves.

---

## 12. Pre-flight checklist (run before declaring any PocketBase task done)

**Migrations**
- [ ] `migrate((app) => ..., (app) => ...)` signature; no `Dao`, no `db`, no `schema:`, no nested `options:`
- [ ] Timestamp filename greater than all existing migrations; never edited a deployed migration
- [ ] All five rules set explicitly on new collections (no accidental `null`/locked or `""`/public)
- [ ] Relation `collectionId` resolved via `app.findCollectionByNameOrId(...)`, not hardcoded
- [ ] Indexes for filtered/sorted fields; UNIQUE where the model implies it
- [ ] Down migration provided; migration boots cleanly on a fresh local `pb_data`

**Hooks**
- [ ] `e.next()` in every handler; validation throws before it, side effects after it
- [ ] No async/await/Promises/setTimeout/fetch/Node APIs; `$http.send` for HTTP
- [ ] No closure over top-level variables; `require()` inside handlers; `${__hooks}` paths
- [ ] `e.app` (not `$app`) inside handlers; `txApp` inside transactions
- [ ] All filter params bound via `{:param}`; all SQL params via `.bind()`
- [ ] Request-context logic in `*Request` hooks, invariants in model hooks
- [ ] Secrets via `$os.getenv`, never hardcoded

**Frontend**
- [ ] `pb.filter()` for every dynamic filter
- [ ] `requestKey`/`isAbort` handling on effect-driven fetches
- [ ] Realtime subscriptions cleaned up (`sub.then(unsub => unsub())`) and resilient to drops
- [ ] `maxSelect: 1` fields treated as strings, multi as arrays; `expand` accessed defensively
- [ ] Auth restored with `authRefresh()` + `authStore.onChange`; `.record` not `.model`

**Security**
- [ ] Rules verified as a normal user (superuser bypasses everything)
- [ ] Client-controlled fields locked with `:isset`/`:changed` or overwritten server-side
- [ ] Custom routes namespaced under `/api/<app>/` and wrapped in `$apis.require*` middleware
- [ ] Cron-style endpoints token-protected

**Deploy (PocketHost)**
- [ ] Scheduled work uses PocketHost Webhooks, not bare `cronAdd`
- [ ] No reliance on in-memory state across requests
- [ ] Deployed to `test` target and verified before `live`

---

## 13. Common failure modes → causes

| Symptom | Likely cause |
|---|---|
| Record never saves / request hangs after hook added | Missing `e.next()` |
| `Dao is not defined` / `app.dao is not a function` | Legacy pre-v0.23 code (see §2) |
| Instance 500s after deploy, admin UI dead | A migration throws at startup — check dashboard logs, remove the file via FTP |
| "The request was autocancelled" in dev | React StrictMode + SDK auto-cancellation — `requestKey: null` |
| Empty list but records exist | listRule not satisfied (returns 200 + empty, not an error) |
| 404 on update/delete of an existing record | updateRule/deleteRule not satisfied |
| Works in dashboard, fails in app | Superuser bypasses rules; test as a normal user |
| `expand` missing from response | Requester fails the related collection's viewRule (silently skipped) |
| Filter matches everything with `%` in input | `~` is LIKE; user input had wildcards — still use `pb.filter`, and use `=` when exact |
| Variable `undefined` inside a hook | Handler isolation — top-level vars invisible; `require()` inside the handler |
| Scheduled job never runs in prod | `cronAdd` + PocketHost hibernation — use PocketHost Webhooks |
| Realtime stops after a while in prod | SSE dropped on hibernation/idle recycle — reconnect/refetch logic |
| Emails silently not delivered | No SMTP configured on the instance |
| 429s hammering one IP | Server-side proxying or bulk scripts against per-IP rate limits |
| Multi-file upload wiped older files | v0.23+ replaces by default — use the `"field+"` append modifier |
