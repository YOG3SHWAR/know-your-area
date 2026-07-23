import { NextResponse } from "next/server";
import { z } from "zod";

import { generatePublicId } from "@/lib/ids";
import { presignPhotoUpload } from "@/lib/r2";

const CONTENT_TYPE_BY_EXT = {
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;

const bodySchema = z.object({
  ext: z.enum(["jpg", "webp"]),
});

// Mints a short-lived presigned PUT URL for a direct browser -> R2 photo
// upload. The object key and Content-Type are always derived here from a
// server-generated opaque ID and the validated `ext` enum — a client body
// containing a `key` or `contentType` field is ignored entirely (T-01-02 /
// T-01-03 in the phase threat model; RESEARCH.md Pitfall 6).
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid ext" }, { status: 400 });
  }

  const { ext } = parsed.data;
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  const key = `complaints/${generatePublicId()}.${ext}`;
  const url = await presignPhotoUpload(key, contentType);

  return NextResponse.json({ url, key });
}
