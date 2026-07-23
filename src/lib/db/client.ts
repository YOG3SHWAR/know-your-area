import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireEnv } from "@/lib/env";

import * as schema from "./schema";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// G-01-EXTRA-1: postgres.js must be told `prepare:false` (Supabase's
// transaction-mode pooler doesn't support server-side prepared statements —
// with `prepare` left at its default `true`, every query fails) and `ssl:
// "require"` for any hosted (non-local) Postgres host (Supabase requires
// TLS; plaintext local Postgres for contributor dev must stay unaffected).
// A URL that fails to parse defaults to `ssl: "require"` — production
// correctness takes priority since a well-formed local URL always parses.
export function buildClientOptions(url: string): {
  prepare: false;
  ssl: false | "require";
} {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { prepare: false, ssl: "require" };
  }

  const isLocal = LOCAL_HOSTS.has(hostname);
  return { prepare: false, ssl: isLocal ? false : "require" };
}

const databaseUrl = requireEnv("DATABASE_URL");
const queryClient = postgres(databaseUrl, buildClientOptions(databaseUrl));

export const db = drizzle(queryClient, { schema });
