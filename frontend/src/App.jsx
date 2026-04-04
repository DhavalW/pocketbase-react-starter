import { useEffect, useState } from "react";
import pb from "./lib/pocketbase";

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    pb.collection("items")
      .getList(1, 20, { sort: "-created" })
      .then((result) => setItems(result.items))
      .catch((err) => {
        // Collection may not exist yet — that's fine in a fresh project
        if (err.status !== 404) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">PocketBase Starter</h1>
          <p className="mt-2 text-gray-500">
            Edit <code className="bg-gray-100 px-1 rounded">src/App.jsx</code> to get started.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-700">Items collection</h2>

          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-gray-400">
              No items yet. Create the <strong>items</strong> collection in the{" "}
              <a
                href="http://127.0.0.1:8090/_/"
                className="text-blue-600 underline"
                target="_blank"
                rel="noreferrer"
              >
                PocketBase admin UI
              </a>{" "}
              or run the migration.
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id} className="py-2 text-sm text-gray-700">
                {item.name ?? item.id}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-xs text-gray-400">
          Connected to PocketBase at{" "}
          <code className="bg-gray-100 px-1 rounded">{import.meta.env.VITE_PB_URL || "http://127.0.0.1:8090"}</code>
        </p>
      </div>
    </div>
  );
}
