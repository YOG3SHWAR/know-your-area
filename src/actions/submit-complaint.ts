"use server";

import { sql } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { complaints } from "@/lib/db/schema";
import { generatePublicId } from "@/lib/ids";
import { photoExists } from "@/lib/r2";
import { sanitizeError } from "@/lib/sanitize-error";
import { submissionSchema, type SubmissionInput } from "@/types/complaint";

const MAX_ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION_CODE = "23505";
// G-01-CR-01: the one sanitized message the client ever sees for a publish
// failure (matches capture/page.tsx's prior fallback string exactly).
const SANITIZED_PUBLISH_MESSAGE =
  "Couldn't publish your report. Check your connection and try again.";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

// Server Action: zod-validate -> session identity -> opaque-id retry loop ->
// geometry insert (RESEARCH.md Pattern 2/3/4/5). The DB's UNIQUE constraint
// on `public_id` is the actual correctness guarantee; this loop regenerates
// and retries on conflict, bounded to 5 attempts so a first-ever insert into
// an empty table never depends on any existing row.
//
// This Server Action is independently reachable (replayed request, direct
// devtools invocation) regardless of the /capture page's Server Component
// gate, so it calls auth.api.getSession() itself and rejects before any
// work when no valid session is present — defense-in-depth, never reliance
// on the route-level gate alone (RESEARCH.md Pitfall 3).
export async function submitComplaint(input: SubmissionInput): Promise<{ publicId: string }> {
  const parsed = submissionSchema.parse(input);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("You must be signed in to submit a report.");
  }
  const submitterId = session.user.id;

  // CR-01: `submissionSchema.photoKey` only checks the string *shape* via
  // regex — it never proves the object was actually uploaded to R2. Without
  // this check, any caller invoking this Server Action directly (bypassing
  // CameraCapture/PermissionGate entirely) could forge a plausible-looking
  // key and publish a "photo-verified" complaint with no real photo behind
  // it. Reject up front with a clear validation error rather than letting a
  // fake row reach the DB. Runs after the session check so an unauthenticated
  // caller can never trigger this real R2 HeadObject call.
  if (!(await photoExists(parsed.photoKey))) {
    throw new Error("Photo not found — please retake and upload the photo before submitting.");
  }

  // Location is always read live from the browser's Geolocation API at
  // submit time (never image EXIF) and inserted as a real SRID-4326 point
  // via raw sql — never a bare {x,y} pair that would default to SRID 0.
  const point = sql`ST_SetSRID(ST_MakePoint(${parsed.lng}, ${parsed.lat}), 4326)`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const publicId = generatePublicId();
    try {
      const [row] = await db
        .insert(complaints)
        .values({
          publicId,
          submitterId,
          category: parsed.category,
          location: point,
          accuracyM: Math.round(parsed.accuracy),
          photoKey: parsed.photoKey,
        })
        .returning({ publicId: complaints.publicId });

      return row;
    } catch (err) {
      lastError = err;
      if (isUniqueViolation(err) && attempt < MAX_ID_ATTEMPTS - 1) continue;
      // G-01-CR-01: never rethrow the raw DB/driver error across the Server
      // Action boundary — log the real detail server-side and throw only
      // the fixed sanitized message.
      throw new Error(
        sanitizeError(err, SANITIZED_PUBLISH_MESSAGE, "submitComplaint insert failed"),
      );
    }
  }

  throw new Error(
    sanitizeError(lastError, SANITIZED_PUBLISH_MESSAGE, "submitComplaint exhausted id attempts"),
  );
}
