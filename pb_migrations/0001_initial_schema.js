/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: 0001_initial_schema
 *
 * Creates the starter "items" collection as a concrete example.
 * Replace or extend with your own collections.
 *
 * Written for the modern (v0.23+) PocketBase API — see
 * docs/POCKETBASE_AI_AGENT_GUIDE.md §4 before editing.
 */
migrate(
  // ── UP ──────────────────────────────────────────────────────────────────
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "items",

      // null = superuser-only, "" = public, string = filter expression
      listRule: "", // anyone can list
      viewRule: "", // anyone can view
      createRule: "@request.auth.id != '' && owner = @request.auth.id", // authed users create as themselves
      updateRule: "@request.auth.id != '' && owner = @request.auth.id", // only owner can update
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id", // only owner can delete

      fields: [
        { name: "name", type: "text", required: true, min: 1, max: 255 },
        { name: "description", type: "text", max: 2000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "archived"],
        },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],

      indexes: [
        "CREATE INDEX idx_items_owner ON items (owner)",
        "CREATE INDEX idx_items_status ON items (status)",
      ],
    });

    app.save(collection);
  },

  // ── DOWN ─────────────────────────────────────────────────────────────────
  (app) => {
    app.delete(app.findCollectionByNameOrId("items"));
  }
);
