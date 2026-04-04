/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration: 0001_initial_schema
 *
 * Creates the starter "items" collection as a concrete example.
 * Replace or extend with your own collections.
 *
 * Docs: https://pocketbase.io/docs/js-migrations/
 */
migrate(
  // ── UP ──────────────────────────────────────────────────────────────────
  (db) => {
    const collection = new Collection({
      name: "items",
      type: "base",
      listRule: "",   // anyone can list
      viewRule: "",   // anyone can view
      createRule: "",  // anyone can create (lock down as needed)
      updateRule: 'id = @request.auth.id',  // only owner can update
      deleteRule: 'id = @request.auth.id',  // only owner can delete

      schema: [
        {
          name: "name",
          type: "text",
          required: true,
          options: { min: 1, max: 255 },
        },
        {
          name: "description",
          type: "text",
          required: false,
          options: { max: 2000 },
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["active", "archived"],
          },
        },
        {
          name: "owner",
          type: "relation",
          required: false,
          options: {
            collectionId: "_pb_users_auth_",
            cascadeDelete: true,
            maxSelect: 1,
          },
        },
      ],

      indexes: [
        "CREATE INDEX idx_items_owner ON items (owner)",
        "CREATE INDEX idx_items_status ON items (status)",
      ],
    });

    return Dao(db).saveCollection(collection);
  },

  // ── DOWN ─────────────────────────────────────────────────────────────────
  (db) => {
    const collection = Dao(db).findCollectionByNameOrId("items");
    return Dao(db).deleteCollection(collection);
  }
);
