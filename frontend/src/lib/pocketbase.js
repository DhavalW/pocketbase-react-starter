import PocketBase from "pocketbase";

/**
 * Singleton PocketBase client.
 *
 * Import this everywhere you need to talk to the backend:
 *   import pb from "@/lib/pocketbase";
 *
 * The client automatically:
 *  - Persists auth state to localStorage
 *  - Cancels duplicate in-flight requests
 *  - Refreshes the auth token before it expires
 */
const pb = new PocketBase(import.meta.env.VITE_PB_URL || "http://127.0.0.1:8090");

export default pb;
