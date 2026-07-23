import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible client pointed at Cloudflare R2 (RESEARCH.md Pattern 1).
// Photo bytes always flow browser -> R2 directly via a presigned PUT; this
// server-side client only ever mints the signed URL, never touches the
// bytes (Vercel's 4.5MB body limit — RESEARCH.md Pitfall 1).
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// `key` and `contentType` must always be derived server-side by the caller
// (never a client-supplied value) — T-01-02/T-01-03 in the phase threat
// model. ContentType is pinned into the signed request so R2 rejects a
// mismatched upload (RESEARCH.md Pitfall 6).
export async function presignPhotoUpload(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: 60 });
}
