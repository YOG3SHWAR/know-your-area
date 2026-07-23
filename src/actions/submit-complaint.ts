"use server";

import { sql } from "drizzle-orm";

import { getOrCreateDeviceId } from "@/lib/device-id";
import { db } from "@/lib/db/client";
import { complaints } from "@/lib/db/schema";
import { generatePublicId } from "@/lib/ids";
import { submissionSchema, type SubmissionInput } from "@/types/complaint";

const MAX_ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION_CODE = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

// Server Action: zod-validate -> device-id -> opaque-id retry loop ->
// geometry insert (RESEARCH.md Pattern 2/3/4). The DB's UNIQUE constraint on
// `public_id` is the actual correctness guarantee; this loop regenerates and
// retries on conflict, bounded to 5 attempts so a first-ever insert into an
// empty table never depends on any existing row.
export async function submitComplaint(input: SubmissionInput): Promise<{ publicId: string }> {
  const parsed = submissionSchema.parse(input);
  const submitterId = await getOrCreateDeviceId();

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
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("failed to generate a unique complaint id");
}
