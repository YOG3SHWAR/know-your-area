import { cookies } from "next/headers";

const COOKIE_NAME = "kya_device_id";
const TWO_YEARS_SECONDS = 60 * 60 * 24 * 365 * 2;

// Stub identity for Phase 1 (D-05): a per-browser anonymous device ID set on
// first visit. Every write path attaches this as `submitter_id` so Phase 2
// can swap it for a real OAuth/OTP `user_id` without a schema migration.
// The cookie value must come from a CSPRNG (`crypto.randomUUID()`), never
// `Math.random()` (RESEARCH.md Security Domain V6).
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: TWO_YEARS_SECONDS,
  });
  return id;
}
